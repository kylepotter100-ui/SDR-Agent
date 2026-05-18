/**
 * Apollo enrichment.
 *
 * Two stages per prospect:
 *   A. Companies House officers lookup to populate director_name from
 *      the first active director (officer_role === "director",
 *      resigned_on null, earliest appointed_on).
 *   B. Apollo /people/match with the director name and organisation
 *      name to populate director_email. The negative-match result is
 *      cached via apollo_attempted_at so the same prospect isn't
 *      re-queried every run.
 *
 * Failures upstream of Apollo (CH officers fetch, network) leave
 * apollo_attempted_at null so they're retried next run. Apollo
 * failures (HTTP error) likewise — only a completed Apollo call (with
 * or without an email) sets the timestamp.
 *
 * MAX_APOLLO_PER_RUN is conservative against the free plan's 75
 * credits and CLAUDE.md's £2/run alarm threshold.
 */

import { db } from "@/lib/db";
import { fetchOfficers, CompaniesHouseError } from "@/lib/companies-house";
import { POSTCODE_PREFIXES, type PostcodePrefix } from "@/lib/config";

const APOLLO_URL = "https://api.apollo.io/api/v1/people/match";
const MAX_APOLLO_PER_RUN = 50;
const COST_PER_LOOKUP_GBP = 0.031;

interface ApolloPerson {
  email?: string | null;
  email_status?: string | null;
}

interface ApolloMatchResponse {
  person?: ApolloPerson | null;
}

interface ApolloErrorRecord {
  stage: "ch_officers" | "apollo" | "db_update";
  company_number: string;
  company_name: string;
  status?: number;
  message: string;
}

class ApolloError extends Error {
  status: number;
  bodySnippet: string;
  constructor(status: number, statusText: string, bodySnippet: string) {
    super(`Apollo ${status} ${statusText}: ${bodySnippet}`);
    this.name = "ApolloError";
    this.status = status;
    this.bodySnippet = bodySnippet;
  }
}

export interface ApolloSummary {
  considered: number;
  processed: number;
  directorFound: number;
  directorMissing: number;
  emailFound: number;
  emailMissing: number;
  hitCap: boolean;
  byPostcode: Record<string, number>;
  apolloCalls: number;
  estimatedCostGbp: number;
  errors: {
    byBucket: Record<string, number>;
    examples: ApolloErrorRecord[];
  };
  sample: Array<{
    company_number: string;
    company_name: string;
    director_name: string | null;
    director_email: string | null;
    email_status: string | null;
  }>;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function extractPrefix(postcode: string | null | undefined): PostcodePrefix | null {
  if (!postcode) return null;
  const match = postcode.toUpperCase().match(/^([A-Z]+)/);
  if (!match) return null;
  const prefix = match[1];
  return (POSTCODE_PREFIXES as readonly string[]).includes(prefix)
    ? (prefix as PostcodePrefix)
    : null;
}

/**
 * Companies House returns officer names as "SURNAME, Forename Middle".
 * Flip the order for natural use. If there's no comma, return the
 * input unchanged.
 */
function flipName(chName: string): string {
  const idx = chName.indexOf(",");
  if (idx === -1) return chName.trim();
  const surname = chName.slice(0, idx).trim();
  const rest = chName.slice(idx + 1).trim();
  if (!surname || !rest) return chName.trim();
  return `${rest} ${surname}`;
}

function pickDirector(
  officers: Awaited<ReturnType<typeof fetchOfficers>>,
): { raw: string; flipped: string } | null {
  const candidates = officers
    .filter((o) => o.officer_role === "director" && !o.resigned_on && o.name)
    .sort((a, b) => {
      const aDate = a.appointed_on ?? "";
      const bDate = b.appointed_on ?? "";
      return aDate.localeCompare(bDate);
    });
  const first = candidates[0];
  if (!first) return null;
  return { raw: first.name, flipped: flipName(first.name) };
}

async function apolloMatch(
  name: string,
  organizationName: string,
): Promise<ApolloPerson | null> {
  const apiKey = requireEnv("APOLLO_API_KEY");
  const headers = {
    "Cache-Control": "no-cache",
    "Content-Type": "application/json",
    "X-Api-Key": apiKey,
  };
  const body = JSON.stringify({ name, organization_name: organizationName });

  let res = await fetch(APOLLO_URL, { method: "POST", headers, body });
  if (res.status === 429 || res.status === 500) {
    const retryAfter = Number(res.headers.get("retry-after") ?? "1");
    await new Promise((r) => setTimeout(r, Math.max(retryAfter, 1) * 1000));
    res = await fetch(APOLLO_URL, { method: "POST", headers, body });
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new ApolloError(res.status, res.statusText, text.slice(0, 500));
  }
  const json = (await res.json()) as ApolloMatchResponse;
  return json.person ?? null;
}

export async function enrichWithApollo(): Promise<ApolloSummary> {
  const candidates = await db()
    .from("prospects")
    .select(
      "id, company_number, company_name, postcode, director_name, director_email, apollo_attempted_at",
    )
    .is("director_email", null)
    .is("apollo_attempted_at", null);
  if (candidates.error) throw candidates.error;

  const all = candidates.data ?? [];
  const considered = all.length;
  const batch = all.slice(0, MAX_APOLLO_PER_RUN);
  const hitCap = considered > MAX_APOLLO_PER_RUN;

  let processed = 0;
  let directorFound = 0;
  let directorMissing = 0;
  let emailFound = 0;
  let emailMissing = 0;
  let apolloCalls = 0;

  const byPostcode: Record<string, number> = Object.fromEntries(
    POSTCODE_PREFIXES.map((p) => [p, 0]),
  );
  const errorsByBucket: Record<string, number> = {};
  const errorExamples: ApolloErrorRecord[] = [];
  const sample: ApolloSummary["sample"] = [];

  const recordError = (record: ApolloErrorRecord) => {
    const bucket =
      record.stage === "ch_officers"
        ? record.status !== undefined
          ? `ch_officers_${record.status}`
          : "network"
        : record.stage === "apollo"
        ? record.status !== undefined
          ? `apollo_${record.status}`
          : "network"
        : "db_update";
    errorsByBucket[bucket] = (errorsByBucket[bucket] ?? 0) + 1;
    if (errorExamples.length < 5) errorExamples.push(record);
  };

  for (const prospect of batch) {
    let directorName = prospect.director_name;

    // Stage A — populate director_name if missing.
    if (!directorName) {
      try {
        const officers = await fetchOfficers(prospect.company_number);
        const picked = pickDirector(officers);
        if (!picked) {
          directorMissing++;
          // Mark Apollo as "attempted" so we don't keep trying when
          // CH has no director on file (e.g. dormant or LLP-only).
          const upd = await db()
            .from("prospects")
            .update({ apollo_attempted_at: new Date().toISOString() })
            .eq("id", prospect.id);
          if (upd.error) {
            recordError({
              stage: "db_update",
              company_number: prospect.company_number,
              company_name: prospect.company_name,
              message: upd.error.message,
            });
          }
          continue;
        }
        directorName = picked.flipped;
        console.info(
          `[apollo] director ${prospect.company_number}: raw="${picked.raw}" -> stored="${picked.flipped}"`,
        );
        const upd = await db()
          .from("prospects")
          .update({ director_name: directorName })
          .eq("id", prospect.id);
        if (upd.error) {
          recordError({
            stage: "db_update",
            company_number: prospect.company_number,
            company_name: prospect.company_name,
            message: upd.error.message,
          });
          continue;
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const status =
          err instanceof CompaniesHouseError ? err.status : undefined;
        console.warn(
          `[apollo] skip ${prospect.company_number}: officers fetch failed — ${message}`,
        );
        recordError({
          stage: "ch_officers",
          company_number: prospect.company_number,
          company_name: prospect.company_name,
          status,
          message,
        });
        continue;
      }
    }
    directorFound++;

    // Stage B — Apollo match.
    let person: ApolloPerson | null;
    try {
      apolloCalls++;
      person = await apolloMatch(directorName!, prospect.company_name);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const status = err instanceof ApolloError ? err.status : undefined;
      console.warn(
        `[apollo] skip ${prospect.company_number} (${prospect.company_name}): ${message}`,
      );
      recordError({
        stage: "apollo",
        company_number: prospect.company_number,
        company_name: prospect.company_name,
        status,
        message,
      });
      continue;
    }

    const email = person?.email ?? null;
    const emailStatus = person?.email_status ?? null;
    const upd = await db()
      .from("prospects")
      .update({
        director_email: email,
        apollo_attempted_at: new Date().toISOString(),
      })
      .eq("id", prospect.id);
    if (upd.error) {
      recordError({
        stage: "db_update",
        company_number: prospect.company_number,
        company_name: prospect.company_name,
        message: upd.error.message,
      });
      continue;
    }

    processed++;
    if (email) emailFound++;
    else emailMissing++;

    const prefix = extractPrefix(prospect.postcode);
    if (prefix) byPostcode[prefix]++;

    if (sample.length < 5) {
      sample.push({
        company_number: prospect.company_number,
        company_name: prospect.company_name,
        director_name: directorName ?? null,
        director_email: email,
        email_status: emailStatus,
      });
    }
  }

  const summary: ApolloSummary = {
    considered,
    processed,
    directorFound,
    directorMissing,
    emailFound,
    emailMissing,
    hitCap,
    byPostcode,
    apolloCalls,
    estimatedCostGbp: Number((apolloCalls * COST_PER_LOOKUP_GBP).toFixed(3)),
    errors: {
      byBucket: errorsByBucket,
      examples: errorExamples,
    },
    sample,
  };

  console.log("[apollo] summary", summary);
  return summary;
}
