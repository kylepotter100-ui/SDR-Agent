/**
 * Ranking agent.
 *
 * Selects all prospects not yet surfaced in a digest, calls Opus 4.7
 * once with the full list and the rubric from lib/prompts/rank.ts,
 * parses the JSON {prospect_id, score, reasoning} array via Zod,
 * persists each score + reasoning on the prospect, and returns the
 * top 15 by score for the digest layer to consume.
 *
 * Scores are clamped 0-100. Website-found prospects are NOT capped
 * any more — the prompt now scores them in a 45-70 band (deliberately
 * below the no-website classes but reachable), because the personaliser
 * has a tailored pitch for them.
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
const TOP_N = 15;

// Opus 4.7 list pricing — USD per million tokens.
const PRICE_USD_PER_M_INPUT = 5;
const PRICE_USD_PER_M_CACHE_READ = 0.5;
const PRICE_USD_PER_M_CACHE_WRITE = 6.25;
const PRICE_USD_PER_M_OUTPUT = 25;
const USD_TO_GBP = 0.79;

const RankingSchema = z.object({
  rankings: z.array(
    z.object({
      prospect_id: z.string().uuid(),
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

export async function rank(): Promise<RankSummary> {
  const candidatesResult = await db()
    .from("prospects")
    .select(
      "id, company_number, company_name, postcode, sic_code, sic_description, sic_tier, observable_signal, has_website, website_url, facebook_url, director_name, incorporated_on",
    )
    .is("surfaced_in_digest_at", null);
  if (candidatesResult.error) throw candidatesResult.error;
  const rows = candidatesResult.data ?? [];

  const candidates: RankCandidate[] = rows.map((r) => ({
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
  }));

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
      tokens: { input: 0, cacheRead: 0, cacheCreation: 0, output: 0 },
      estimatedCostGbp: 0,
      errors: { byBucket: errorsByBucket, examples: errorExamples },
      top15: [],
    };
  }

  let inputTokens = 0;
  let cacheReadTokens = 0;
  let cacheCreationTokens = 0;
  let outputTokens = 0;
  let rankings: Array<{
    prospect_id: string;
    score: number;
    reasoning: string;
  }> = [];

  try {
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
      messages: [
        { role: "user", content: rankUserPrompt(candidates) },
      ],
    });
    inputTokens = response.usage.input_tokens;
    cacheReadTokens = response.usage.cache_read_input_tokens ?? 0;
    cacheCreationTokens = response.usage.cache_creation_input_tokens ?? 0;
    outputTokens = response.usage.output_tokens;

    if (!response.parsed_output) {
      throw new Error(
        `Structured output unavailable (stop_reason=${response.stop_reason})`,
      );
    }
    rankings = response.parsed_output.rankings;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const status =
      err instanceof Anthropic.APIError ? err.status : undefined;
    console.error(`[rank] anthropic call failed — ${message}`);
    recordError({ stage: "anthropic", status, message });
    return {
      considered: candidates.length,
      ranked: 0,
      tokens: {
        input: inputTokens,
        cacheRead: cacheReadTokens,
        cacheCreation: cacheCreationTokens,
        output: outputTokens,
      },
      estimatedCostGbp: 0,
      errors: { byBucket: errorsByBucket, examples: errorExamples },
      top15: [],
    };
  }

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
      // Real fit weight — tier numbers are NOT in fit-weight order
      // (Tier 5 = 0.8 outranks Tiers 3/4). Sorting by -sic_tier would
      // bury Tier 5; fitWeightForCode reads the authoritative weight.
      fit_weight: fitWeightForCode(prospect.sic_code) ?? 0,
      created_at_order: createdOrder++,
    });
  }

  // Persist scores in parallel — small set, single round-trip-ish.
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
    tokens: summary.tokens,
    estimatedCostGbp: summary.estimatedCostGbp,
  });
  return summary;
}
