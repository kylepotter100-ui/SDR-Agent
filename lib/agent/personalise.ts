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

const SIGN_OFF = "Kyle Potter — KP Solutions";
const SIGN_OFF_PATTERN = /Kyle Potter\s*[—–-]\s*KP Solutions\.?\s*$/;

/**
 * Belt-and-braces with the prompt's hard constraint. If Sonnet drops
 * the sign-off (observed in 3 of 6 emails on the v0 prompt), append
 * the canonical form. Recognises common variants — em/en/hyphen,
 * trailing period — so we don't duplicate.
 */
function ensureSignOff(body: string): string {
  const trimmed = body.trimEnd();
  if (SIGN_OFF_PATTERN.test(trimmed)) return trimmed;
  return `${trimmed}\n\n${SIGN_OFF}`;
}

function logSoftConstraints(
  companyNumber: string,
  subject: string,
  body: string,
): void {
  const wordCount = body.trim().split(/\s+/).filter(Boolean).length;
  if (wordCount < 60 || wordCount > 120) {
    console.warn(
      `[personalise] ${companyNumber}: body word count ${wordCount} outside 60-120`,
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
      "id, company_number, company_name, postcode, sic_description, director_name, observable_signal, has_website, website_url, facebook_url, incorporated_on, fit_weight, sic_tier, created_at",
    )
    .is("personalised_email_subject", null)
    .is("personalised_email_body", null)
    .order("fit_weight", { ascending: false })
    .order("sic_tier", { ascending: true })
    .order("created_at", { ascending: true });
  if (candidates.error) throw candidates.error;

  const all = candidates.data ?? [];
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

    logSoftConstraints(prospect.company_number, subject, body);
    body = ensureSignOff(body);

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
