/**
 * Ranking agent.
 *
 * Selects all prospects not yet surfaced in a digest, scores them via
 * Opus 4.7, persists each score + reasoning, and returns the top 15
 * (review sample) for the digest layer to consume.
 *
 * Why this is batched: a single Opus call over the full unsurfaced pool
 * exceeds the 300s function ceiling — Opus emits ~70 reasoning tokens
 * per prospect sequentially within one response, so wall-clock scales
 * with total output. We partition the pool into chunks of CHUNK_SIZE
 * and run them as INDEPENDENT CONCURRENT requests, so wall-clock
 * collapses to ≈ max(chunk) rather than the sum. The ranker scores
 * each prospect on an ABSOLUTE rubric (signal class + SIC tier +
 * recency + director known), not relative to other prospects in the
 * call — so partitioning is semantically lossless. Top-15 selection
 * runs once over the merged set after all chunks return.
 *
 * Scores are clamped 0-100. Website-found prospects are NOT capped —
 * the prompt scores them in a 45-70 band.
 */

import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";

import { db } from "@/lib/db";
import { claude, OPUS_MODEL_ID } from "@/lib/anthropic";
import {
  RANKING_SYSTEM_PROMPT,
  rankUserPrompt,
  type RankCandidate,
} from "@/lib/prompts/rank";
import {
  fitWeightForCode,
  POSTCODE_PREFIXES,
  type PostcodePrefix,
} from "@/lib/config";

const MAX_OUTPUT_TOKENS = 16000;
// Preview-only: size of the `top15` review sample on RankSummary. NOT
// the surfacing cap — digest selection uses MAX_SURFACED_PER_WEEK
// (lib/config.ts) and applies MIN_SURFACING_SCORE as a floor.
const TOP_N = 15;

// Step 0 empirical: 56-chunk @ effort medium ≈ 107s end-to-end. Three
// concurrent chunks fit comfortably inside the 300s ceiling with ~190s
// margin. If chunk timing degrades materially, shrink this first.
const CHUNK_SIZE = 56;

// Bounded in-flight cap so a future large pool (≥336 prospects =
// 6 chunks) can't fire enough concurrent Anthropic requests to trip
// rate limits. At current volume (~167, 3 chunks) the cap never binds.
const MAX_CONCURRENCY = 6;

// Opus 4.7 list pricing — USD per million tokens.
const PRICE_USD_PER_M_INPUT = 5;
const PRICE_USD_PER_M_CACHE_READ = 0.5;
const PRICE_USD_PER_M_CACHE_WRITE = 6.25;
const PRICE_USD_PER_M_OUTPUT = 25;
const USD_TO_GBP = 0.79;

const RankingSchema = z.object({
  rankings: z.array(
    z.object({
      // Deliberately NOT .uuid(). messages.parse validates the whole
      // rankings array atomically, so a single malformed id would throw
      // out every ranking in the chunk (observed: Opus emitted one bad
      // id and we lost all 56). The .uuid() format constraint isn't
      // reliably enforced at generation anyway. The real guard is the
      // byId membership check in the scoring loop below, which buckets a
      // bad/hallucinated id as a single "validation" error and skips
      // only that row.
      prospect_id: z.string().min(1),
      score: z.number(),
      reasoning: z.string().min(1),
    }),
  ),
});

interface RankErrorRecord {
  stage: "anthropic" | "validation" | "db_update";
  prospect_id?: string;
  company_name?: string;
  status?: number;
  message: string;
}

export interface RankSummary {
  considered: number;
  ranked: number;
  limitApplied: number | null;
  tokens: {
    input: number;
    cacheRead: number;
    cacheCreation: number;
    output: number;
  };
  estimatedCostGbp: number;
  errors: {
    byBucket: Record<string, number>;
    examples: RankErrorRecord[];
  };
  top15: Array<{
    prospect_id: string;
    company_name: string;
    score: number;
    reasoning: string;
    observable_signal: string | null;
    has_website: boolean | null;
    sic_tier: number;
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

// Deterministic ordering used both to slice the dev ?limit subset AND
// to partition the production pool into chunks. Stable across re-runs:
// fit weight desc → incorporation date desc (newer first) → id asc.
function byFitThenRecencyThenId(a: RankCandidate, b: RankCandidate): number {
  const fa = fitWeightForCode(a.sic_code) ?? 0;
  const fb = fitWeightForCode(b.sic_code) ?? 0;
  if (fb !== fa) return fb - fa;
  const da = a.incorporated_on ?? "";
  const db_ = b.incorporated_on ?? "";
  if (da !== db_) return db_.localeCompare(da);
  return a.prospect_id.localeCompare(b.prospect_id);
}

function chunkArray<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

// Bounded-concurrency runner over Promise.allSettled semantics: never
// throws; preserves input order; caps in-flight work at `concurrency`.
async function runWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = new Array(items.length);
  let next = 0;
  const run = async () => {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      try {
        results[i] = { status: "fulfilled", value: await worker(items[i], i) };
      } catch (err) {
        results[i] = { status: "rejected", reason: err };
      }
    }
  };
  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    run,
  );
  await Promise.all(workers);
  return results;
}

interface ChunkResult {
  rankings: Array<{
    prospect_id: string;
    score: number;
    reasoning: string;
  }>;
  usage: {
    input: number;
    cacheRead: number;
    cacheCreation: number;
    output: number;
  };
}

// Single Opus call over one chunk. Throws on API error or missing
// parsed_output so the caller's allSettled wrapper buckets the failure.
async function rankChunk(
  candidates: RankCandidate[],
): Promise<ChunkResult> {
  const response = await claude().messages.parse({
    model: OPUS_MODEL_ID,
    max_tokens: MAX_OUTPUT_TOKENS,
    thinking: { type: "disabled" },
    output_config: {
      effort: "medium",
      format: zodOutputFormat(RankingSchema),
    },
    system: [
      {
        type: "text",
        text: RANKING_SYSTEM_PROMPT,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [{ role: "user", content: rankUserPrompt(candidates) }],
  });

  if (!response.parsed_output) {
    throw new Error(
      `Structured output unavailable (stop_reason=${response.stop_reason})`,
    );
  }

  return {
    rankings: response.parsed_output.rankings,
    usage: {
      input: response.usage.input_tokens,
      cacheRead: response.usage.cache_read_input_tokens ?? 0,
      cacheCreation: response.usage.cache_creation_input_tokens ?? 0,
      output: response.usage.output_tokens,
    },
  };
}

/**
 * Rank unsurfaced prospects.
 *
 * @param options.limit  Dev spot-check aid only. When set, the candidate
 *   pool is deterministically pre-trimmed to the top-N (by fit weight,
 *   then recency, then id) BEFORE chunking. Production calls rank() with
 *   no limit and ranks the full pool — every prospect lands in exactly
 *   one chunk, no overlap, no gap, nobody dropped.
 */
export async function rank(
  options: { limit?: number } = {},
): Promise<RankSummary> {
  const limit =
    options.limit !== undefined &&
    Number.isFinite(options.limit) &&
    options.limit > 0
      ? Math.floor(options.limit)
      : null;

  const candidatesResult = await db()
    .from("prospects")
    .select(
      "id, company_number, company_name, postcode, sic_code, sic_description, sic_tier, observable_signal, has_website, website_url, facebook_url, director_name, incorporated_on",
    )
    .is("surfaced_in_digest_at", null);
  if (candidatesResult.error) throw candidatesResult.error;
  const rows = candidatesResult.data ?? [];

  // Sort the full pool deterministically. Used both for the dev limit
  // slice and for chunk boundaries — partition reproducibility matters
  // for debugging, even though scoring is order-independent.
  let candidates: RankCandidate[] = rows
    .map((r) => ({
      prospect_id: r.id,
      company_name: r.company_name,
      postcode: r.postcode,
      postcode_prefix: extractPrefix(r.postcode),
      sic_code: r.sic_code,
      sic_description: r.sic_description,
      sic_tier: r.sic_tier,
      observable_signal: r.observable_signal,
      has_website: r.has_website,
      website_url: r.website_url,
      facebook_url: r.facebook_url,
      director_name: r.director_name,
      incorporated_on: r.incorporated_on,
    }))
    .sort(byFitThenRecencyThenId);

  if (limit !== null && candidates.length > limit) {
    candidates = candidates.slice(0, limit);
  }

  const errorsByBucket: Record<string, number> = {};
  const errorExamples: RankErrorRecord[] = [];
  const recordError = (record: RankErrorRecord) => {
    const bucket =
      record.stage === "anthropic"
        ? record.status !== undefined
          ? `anthropic_${record.status}`
          : "network"
        : record.stage;
    errorsByBucket[bucket] = (errorsByBucket[bucket] ?? 0) + 1;
    if (errorExamples.length < 5) errorExamples.push(record);
  };

  if (candidates.length === 0) {
    return {
      considered: 0,
      ranked: 0,
      limitApplied: limit,
      tokens: { input: 0, cacheRead: 0, cacheCreation: 0, output: 0 },
      estimatedCostGbp: 0,
      errors: { byBucket: errorsByBucket, examples: errorExamples },
      top15: [],
    };
  }

  // Clean partition of the full sorted pool.
  const chunks = chunkArray(candidates, CHUNK_SIZE);

  const settled = await runWithConcurrency(
    chunks,
    MAX_CONCURRENCY,
    (chunk) => rankChunk(chunk),
  );

  let inputTokens = 0;
  let cacheReadTokens = 0;
  let cacheCreationTokens = 0;
  let outputTokens = 0;
  const rankings: Array<{
    prospect_id: string;
    score: number;
    reasoning: string;
  }> = [];
  let chunksFailed = 0;

  settled.forEach((result, chunkIndex) => {
    if (result.status === "fulfilled") {
      inputTokens += result.value.usage.input;
      cacheReadTokens += result.value.usage.cacheRead;
      cacheCreationTokens += result.value.usage.cacheCreation;
      outputTokens += result.value.usage.output;
      rankings.push(...result.value.rankings);
      return;
    }
    chunksFailed++;
    const err = result.reason;
    const message = err instanceof Error ? err.message : String(err);
    console.error(
      `[rank] chunk ${chunkIndex + 1}/${chunks.length} failed — ${message}`,
    );
    if (err instanceof Anthropic.APIError) {
      // Genuine transport/API failure. APIConnectionError carries no
      // status → buckets as "network"; HTTP errors → anthropic_<status>.
      recordError({ stage: "anthropic", status: err.status, message });
    } else {
      // Structured-output parse failure (or missing parsed_output) — an
      // output problem, not a transport one. Don't mislabel it "network".
      recordError({ stage: "validation", message });
    }
  });

  const byId = new Map(candidates.map((c) => [c.prospect_id, c]));

  type Scored = {
    prospect_id: string;
    company_name: string;
    score: number;
    reasoning: string;
    observable_signal: string | null;
    has_website: boolean | null;
    sic_tier: number;
    fit_weight: number;
    created_at_order: number;
  };
  const scored: Scored[] = [];
  let createdOrder = 0;

  for (const r of rankings) {
    const prospect = byId.get(r.prospect_id);
    if (!prospect) {
      recordError({
        stage: "validation",
        prospect_id: r.prospect_id,
        message: `Model returned prospect_id not in input set`,
      });
      continue;
    }
    const score = Math.max(0, Math.min(100, Math.round(r.score)));
    scored.push({
      prospect_id: r.prospect_id,
      company_name: prospect.company_name,
      score,
      reasoning: r.reasoning,
      observable_signal: prospect.observable_signal,
      has_website: prospect.has_website,
      sic_tier: prospect.sic_tier,
      fit_weight: fitWeightForCode(prospect.sic_code) ?? 0,
      created_at_order: createdOrder++,
    });
  }

  let ranked = 0;
  for (const s of scored) {
    const upd = await db()
      .from("prospects")
      .update({ ranking_score: s.score, ranking_reasoning: s.reasoning })
      .eq("id", s.prospect_id);
    if (upd.error) {
      recordError({
        stage: "db_update",
        prospect_id: s.prospect_id,
        company_name: s.company_name,
        message: upd.error.message,
      });
      continue;
    }
    ranked++;
  }

  const top15 = [...scored]
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (b.fit_weight !== a.fit_weight) return b.fit_weight - a.fit_weight;
      return a.created_at_order - b.created_at_order;
    })
    .slice(0, TOP_N)
    .map((s) => ({
      prospect_id: s.prospect_id,
      company_name: s.company_name,
      score: s.score,
      reasoning: s.reasoning,
      observable_signal: s.observable_signal,
      has_website: s.has_website,
      sic_tier: s.sic_tier,
    }));

  const costGbp =
    ((inputTokens / 1_000_000) * PRICE_USD_PER_M_INPUT +
      (cacheReadTokens / 1_000_000) * PRICE_USD_PER_M_CACHE_READ +
      (cacheCreationTokens / 1_000_000) * PRICE_USD_PER_M_CACHE_WRITE +
      (outputTokens / 1_000_000) * PRICE_USD_PER_M_OUTPUT) *
    USD_TO_GBP;

  const summary: RankSummary = {
    considered: candidates.length,
    ranked,
    limitApplied: limit,
    tokens: {
      input: inputTokens,
      cacheRead: cacheReadTokens,
      cacheCreation: cacheCreationTokens,
      output: outputTokens,
    },
    estimatedCostGbp: Number(costGbp.toFixed(4)),
    errors: { byBucket: errorsByBucket, examples: errorExamples },
    top15,
  };

  console.log("[rank] summary", {
    considered: summary.considered,
    ranked: summary.ranked,
    limitApplied: summary.limitApplied,
    chunks: chunks.length,
    chunksFailed,
    tokens: summary.tokens,
    estimatedCostGbp: summary.estimatedCostGbp,
  });
  return summary;
}
