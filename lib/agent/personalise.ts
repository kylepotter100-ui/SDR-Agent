/**
 * Personalisation agent.
 *
 * Selects prospects without a personalised email, calls Sonnet 4.6
 * with the v0 prompt from lib/prompts/personalise.ts, parses the
 * JSON {subject, body} response, and persists it on the prospect.
 *
 * MAX_PERSONALISE_PER_RUN is deliberately small for Checkpoint 6 so
 * Kyle can read every generated email in the spot-check. The brief
 * sets a high quality bar; the human review is the actual gate, not
 * the PR merge.
 *
 * Failures (Anthropic HTTP error, JSON parse error, db error) are
 * bucketed and surfaced. Soft constraints (word count drift, banned
 * phrases) are logged but not rejected on first pass — the human
 * review collects the data for prompt iteration.
 */

import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";

import { db } from "@/lib/db";
import { claude, SONNET_MODEL_ID } from "@/lib/anthropic";
import {
  PERSONALISATION_SYSTEM_PROMPT,
  personalisationUserPrompt,
  type PersonalisationContext,
} from "@/lib/prompts/personalise";
import { POSTCODE_PREFIXES, type PostcodePrefix } from "@/lib/config";
import {
  getSuppressedEmails,
  isSuppressed,
  STATUS_EXCLUDED_FILTER,
} from "@/lib/agent/suppression";

const MAX_PERSONALISE_PER_RUN = 25;
const MAX_OUTPUT_TOKENS = 1024;

const PersonalisedEmailSchema = z.object({
  subject: z.string().min(1),
  body: z.string().min(1),
});

// Sonnet 4.6 list pricing — USD per million tokens.
const PRICE_USD_PER_M_INPUT = 3;
const PRICE_USD_PER_M_CACHE_READ = 0.3;
const PRICE_USD_PER_M_CACHE_WRITE = 3.75;
const PRICE_USD_PER_M_OUTPUT = 15;
const USD_TO_GBP = 0.79;

interface PersonalisationErrorRecord {
  stage: "anthropic" | "db_update";
  company_number: string;
  company_name: string;
  status?: number;
  message: string;
}

export interface PersonalisationSummary {
  considered: number;
  processed: number;
  failedAnthropic: number;
  failedDb: number;
  hitCap: boolean;
  byPostcode: Record<string, number>;
  tokens: {
    input: number;
    cacheRead: number;
    cacheCreation: number;
    output: number;
  };
  estimatedCostGbp: number;
  errors: {
    byBucket: Record<string, number>;
    examples: PersonalisationErrorRecord[];
  };
  sample: Array<{
    company_number: string;
    company_name: string;
    director_name: string | null;
    observable_signal: string | null;
    subject: string;
    body: string;
  }>;
}

function extractPrefix(
  postcode: string | null | undefined,
): PostcodePrefix | null {
  if (!postcode) return null;
  const match = postcode.toUpperCase().match(/^([A-Z]+)/);
  if (!match) return null;
  const prefix = match[1];
  return (POSTCODE_PREFIXES as readonly string[]).includes(prefix)
    ? (prefix as PostcodePrefix)
    : null;
}

const SIGN_OFF = "Kyle Potter - KP Solutions";
const TITLE = "Founder";
const WEBSITE_LINE = "w: https://kpsolutions.io";
const UNSUBSCRIBE_EMAIL = "unsubscribe@kpsolutions.io";

// Match the sign-off line. The [—–-] class covers em-dash, en-dash and
// hyphen, so this strips BOTH the legacy v5 em-dash form and the v6
// hyphen form. Optional trailing period, optional surrounding whitespace.
const SIGN_OFF_LINE = /^[ \t]*Kyle Potter\s*[—–-]\s*KP Solutions\.?[ \t]*\r?\n?/gm;
// Match the standalone "Founder" title line (v6 signature).
const TITLE_LINE = /^[ \t]*Founder[ \t]*\r?\n?/gm;
// Match any model-written opt-out/unsubscribe line so we don't
// duplicate the canonical one we append. Covers "Reply STOP..." and any
// line mentioning unsubscribe — including both the legacy "...from
// us?..." and the v6 "...from me?..." opt-out.
const OPT_OUT_LINE = /^[ \t]*(?:Reply STOP|.*\bunsubscrib)[^\n]*\r?\n?/gim;
// Match a previously-appended website/signature URL line so re-runs
// don't orphan or duplicate it. Tolerates an optional "w:" prefix (v6
// form) as well as a bare URL (legacy form). http/https, optional www,
// optional trailing slash.
const SIGNATURE_URL_LINE = /^[ \t]*(?:w:\s*)?https?:\/\/(?:www\.)?kpsolutions\.io\/?[ \t]*\r?\n?/gim;

/**
 * Sole owner of the email's closing. The model is told not to write an
 * opt-out or sign-off of its own, but enforce it anyway: strip any
 * sign-off, title, website and opt-out lines the model (or a prior run)
 * emitted, then append the canonical v6 closing — signature block first
 * (name, title, website), then a blank line, then the opt-out at the
 * very bottom:
 *
 *   Kyle Potter - KP Solutions
 *   Founder
 *   w: https://kpsolutions.io
 *
 *   Prefer not to hear from me? Email unsubscribe@kpsolutions.io
 *
 * Idempotent: every line of the appended block is matched by one of the
 * four strips above, and trimEnd clears trailing blanks before
 * re-appending, so re-running yields one signature block + one opt-out.
 *
 * The unsubscribe is a bare email address (not an HTML <a> tag) so it
 * survives the Phase 1 copy-paste-into-Outlook workflow: Outlook and
 * most clients auto-linkify a bare address into a clickable mailto on
 * both the digest and the sent message. Phase 3 send-from-app can
 * upgrade to a styled link.
 */
export function ensureClosing(body: string): string {
  const stripped = body
    .replace(SIGN_OFF_LINE, "")
    .replace(TITLE_LINE, "")
    .replace(SIGNATURE_URL_LINE, "")
    .replace(OPT_OUT_LINE, "")
    .trimEnd();
  const optOut = `Prefer not to hear from me? Email ${UNSUBSCRIBE_EMAIL}`;
  return `${stripped}\n\n${SIGN_OFF}\n${TITLE}\n${WEBSITE_LINE}\n\n${optOut}`;
}

// Honorific/title tokens to skip when scanning for a forename. Trailing
// periods are stripped before lookup ("Dr." -> "dr").
const NAME_TITLES = new Set([
  "dr",
  "mr",
  "mrs",
  "ms",
  "miss",
  "mx",
  "prof",
  "professor",
  "sir",
  "dame",
  "lord",
  "lady",
  "rev",
  "reverend",
  "capt",
  "captain",
  "major",
  "col",
  "colonel",
]);

// A greeting line the model may have written despite instructions. Anchored
// to the first line and required to end in a comma, so a hook sentence that
// merely begins with one of these words is not mistaken for a salutation.
const LEADING_GREETING = /^[ \t]*(?:Hi|Hello|Hey|Dear)\b[^\n]*,[ \t]*\r?\n+/i;

/**
 * Deterministic first-name extraction for the greeting. The greeting is the
 * highest-risk element: the model writes excellent forenames but will not
 * reliably DROP on ambiguous input, so we own it in code rather than trust
 * the prompt.
 *
 * Exploits the Companies House convention that a forename is mixed-case
 * (contains a lowercase letter) while a surname is ALL CAPS. We return the
 * first token that contains a lowercase letter and is not an honorific —
 * comma-ordered ("SMITH, Jonathan"), space-ordered ("Sarah Jane WHITMORE"),
 * title-noised ("Alexey, Dr PETERNEV" -> "Alexey") and single-token
 * ("Mxolisi") names all resolve. When no token qualifies — an all-caps pair
 * like "ZHANG WEI", or a null/blank name — we return null and the greeting
 * is dropped. We never guess.
 */
export function extractForename(directorName: string | null): string | null {
  if (!directorName) return null;
  const tokens = directorName.split(/[\s,]+/).filter(Boolean);
  for (const token of tokens) {
    const bare = token.replace(/\.$/, "").toLowerCase();
    if (NAME_TITLES.has(bare)) continue;
    // Mixed-case (has a lowercase letter) and starts with a letter: a
    // forename by CH convention. ALL-CAPS surnames are skipped.
    if (/^[A-Za-z]/.test(token) && /[a-z]/.test(token)) return token;
  }
  return null;
}

/**
 * Prepend the deterministic greeting (or none) to the model body. Strips any
 * salutation the model emitted first, so the code is the sole owner of the
 * greeting just as ensureClosing owns the closing.
 */
export function prependGreeting(
  forename: string | null,
  body: string,
): string {
  const stripped = body.replace(LEADING_GREETING, "").replace(/^\s+/, "");
  return forename ? `Hi ${forename},\n\n${stripped}` : stripped;
}

function logSoftConstraints(
  companyNumber: string,
  subject: string,
  body: string,
): void {
  // v6 targets ~120-150 words. Warn outside 115-155 — a small slack so
  // borderline-but-fine emails don't spam the log, while thin copy
  // (<115) and ballooning (>155) still flag for the spot-check.
  const wordCount = body.trim().split(/\s+/).filter(Boolean).length;
  if (wordCount < 115 || wordCount > 155) {
    console.warn(
      `[personalise] ${companyNumber}: body word count ${wordCount} outside 115-155`,
    );
  }
  if (subject.split(/\s+/).filter(Boolean).length > 7) {
    console.warn(
      `[personalise] ${companyNumber}: subject longer than 7 words: "${subject}"`,
    );
  }
  if (/[*_#`]/.test(body) || /[*_#`]/.test(subject)) {
    console.warn(
      `[personalise] ${companyNumber}: markdown-style characters detected`,
    );
  }
}

export async function personalise(): Promise<PersonalisationSummary> {
  const candidates = await db()
    .from("prospects")
    .select(
      "id, company_number, company_name, postcode, sic_description, director_name, director_email, observable_signal, has_website, website_url, facebook_url, incorporated_on, fit_weight, sic_tier, created_at",
    )
    .is("personalised_email_subject", null)
    .is("personalised_email_body", null)
    .not("status", "in", STATUS_EXCLUDED_FILTER)
    .order("fit_weight", { ascending: false })
    .order("sic_tier", { ascending: true })
    .order("created_at", { ascending: true });
  if (candidates.error) throw candidates.error;

  // Exclude suppressed addresses in JS (arbitrary email strings — avoids
  // PostgREST filter-grammar quoting). Triaged statuses are already
  // excluded at the query level above.
  const suppressed = await getSuppressedEmails();
  const all = (candidates.data ?? []).filter(
    (p) => !isSuppressed(p.director_email, suppressed),
  );
  const considered = all.length;
  const batch = all.slice(0, MAX_PERSONALISE_PER_RUN);
  const hitCap = considered > MAX_PERSONALISE_PER_RUN;

  let processed = 0;
  let failedAnthropic = 0;
  let failedDb = 0;
  let inputTokens = 0;
  let cacheReadTokens = 0;
  let cacheCreationTokens = 0;
  let outputTokens = 0;

  const byPostcode: Record<string, number> = Object.fromEntries(
    POSTCODE_PREFIXES.map((p) => [p, 0]),
  );
  const errorsByBucket: Record<string, number> = {};
  const errorExamples: PersonalisationErrorRecord[] = [];
  const sample: PersonalisationSummary["sample"] = [];

  const recordError = (record: PersonalisationErrorRecord) => {
    const bucket =
      record.stage === "anthropic"
        ? record.status !== undefined
          ? `anthropic_${record.status}`
          : "network"
        : "db_update";
    errorsByBucket[bucket] = (errorsByBucket[bucket] ?? 0) + 1;
    if (errorExamples.length < 5) errorExamples.push(record);
  };

  for (const prospect of batch) {
    const prefix = extractPrefix(prospect.postcode);
    const ctx: PersonalisationContext = {
      company_name: prospect.company_name,
      postcode: prospect.postcode,
      postcode_prefix: prefix,
      sic_description: prospect.sic_description,
      director_name: prospect.director_name,
      observable_signal: prospect.observable_signal,
      has_website: prospect.has_website,
      website_url: prospect.website_url,
      facebook_url: prospect.facebook_url,
      incorporated_on: prospect.incorporated_on,
    };

    let subject: string;
    let body: string;
    try {
      const response = await claude().messages.parse({
        model: SONNET_MODEL_ID,
        max_tokens: MAX_OUTPUT_TOKENS,
        thinking: { type: "disabled" },
        output_config: {
          effort: "medium",
          format: zodOutputFormat(PersonalisedEmailSchema),
        },
        system: [
          {
            type: "text",
            text: PERSONALISATION_SYSTEM_PROMPT,
            cache_control: { type: "ephemeral" },
          },
        ],
        messages: [
          {
            role: "user",
            content: personalisationUserPrompt(ctx),
          },
        ],
      });
      inputTokens += response.usage.input_tokens;
      cacheReadTokens += response.usage.cache_read_input_tokens ?? 0;
      cacheCreationTokens += response.usage.cache_creation_input_tokens ?? 0;
      outputTokens += response.usage.output_tokens;

      if (!response.parsed_output) {
        throw new Error(
          `Structured output unavailable (stop_reason=${response.stop_reason})`,
        );
      }
      ({ subject, body } = response.parsed_output);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const status =
        err instanceof Anthropic.APIError ? err.status : undefined;
      console.warn(
        `[personalise] skip ${prospect.company_number} (${prospect.company_name}): ${message}`,
      );
      recordError({
        stage: "anthropic",
        company_number: prospect.company_number,
        company_name: prospect.company_name,
        status,
        message,
      });
      failedAnthropic++;
      continue;
    }

    // Word budget (120-150) is measured on the model body, before the
    // deterministic greeting and closing the system owns are attached.
    logSoftConstraints(prospect.company_number, subject, body);
    const forename = extractForename(prospect.director_name);
    body = ensureClosing(prependGreeting(forename, body));

    const upd = await db()
      .from("prospects")
      .update({
        personalised_email_subject: subject,
        personalised_email_body: body,
      })
      .eq("id", prospect.id);
    if (upd.error) {
      console.warn(
        `[personalise] skip ${prospect.company_number}: update failed — ${upd.error.message}`,
      );
      recordError({
        stage: "db_update",
        company_number: prospect.company_number,
        company_name: prospect.company_name,
        message: upd.error.message,
      });
      failedDb++;
      continue;
    }

    processed++;
    if (prefix) byPostcode[prefix]++;
    sample.push({
      company_number: prospect.company_number,
      company_name: prospect.company_name,
      director_name: prospect.director_name,
      observable_signal: prospect.observable_signal,
      subject,
      body,
    });
  }

  const costGbp =
    ((inputTokens / 1_000_000) * PRICE_USD_PER_M_INPUT +
      (cacheReadTokens / 1_000_000) * PRICE_USD_PER_M_CACHE_READ +
      (cacheCreationTokens / 1_000_000) * PRICE_USD_PER_M_CACHE_WRITE +
      (outputTokens / 1_000_000) * PRICE_USD_PER_M_OUTPUT) *
    USD_TO_GBP;

  const summary: PersonalisationSummary = {
    considered,
    processed,
    failedAnthropic,
    failedDb,
    hitCap,
    byPostcode,
    tokens: {
      input: inputTokens,
      cacheRead: cacheReadTokens,
      cacheCreation: cacheCreationTokens,
      output: outputTokens,
    },
    estimatedCostGbp: Number(costGbp.toFixed(4)),
    errors: {
      byBucket: errorsByBucket,
      examples: errorExamples,
    },
    sample,
  };

  console.log("[personalise] summary", {
    considered: summary.considered,
    processed: summary.processed,
    tokens: summary.tokens,
    estimatedCostGbp: summary.estimatedCostGbp,
  });
  return summary;
}
