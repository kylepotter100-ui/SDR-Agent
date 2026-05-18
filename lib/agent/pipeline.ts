/**
 * Pipeline orchestrator.
 *
 * Composes the individual stage functions into prepare / digest / full
 * sequences. Per-stage error policy is documented in the brief's
 * Checkpoint 9 review:
 *
 *  - discover / enrich / apollo / personalise / rank-stage-of-digest
 *    failures are logged and skipped; the pipeline continues.
 *  - rank failure aborts the digest send. The cron writes a "failed"
 *    cron_runs row and the digest is not delivered that week.
 *  - digest send failure is logged; no fresh state changes if the
 *    send didn't succeed.
 *
 * Each stage's existing per-prospect error handling is preserved
 * inside the stage function; the orchestrator only handles
 * stage-level failure (a thrown error from the stage function).
 *
 * Per stage we capture { name, status, summary, durationMs }. The
 * combined object lands in cron_runs.summary and feeds the digest
 * email's pipeline-summary block.
 */

import { db } from "@/lib/db";
import { discover } from "@/lib/agent/discover";
import { enrich } from "@/lib/agent/enrich";
import { enrichWithApollo } from "@/lib/agent/apollo";
import { personalise } from "@/lib/agent/personalise";
import { rank } from "@/lib/agent/rank";
import { digest } from "@/lib/agent/digest";

export type StageName =
  | "discover"
  | "enrich"
  | "apollo"
  | "personalise"
  | "rank"
  | "digest";

export type StageStatus = "ok" | "failed" | "skipped";

export type CronKind = "prepare" | "digest" | "manual";

export interface StageResult {
  name: StageName;
  status: StageStatus;
  durationMs: number;
  summary: unknown;
  error?: string;
}

export interface PipelineResult {
  kind: CronKind;
  status: "ok" | "partial" | "failed";
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  stages: StageResult[];
  totalCostGbp: number;
  cronRunId: string | null;
}

const STAGE_RUNNERS: Record<StageName, () => Promise<unknown>> = {
  discover,
  enrich,
  apollo: enrichWithApollo,
  personalise,
  rank,
  digest: async () => digest({ dryRun: false }),
};

/**
 * Stages that abort the whole pipeline on failure. Rank failure means
 * we can't usefully send a digest, so we skip the rest.
 */
const HARD_ABORT_ON_FAIL: ReadonlySet<StageName> = new Set(["rank"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function extractCostGbp(summary: unknown): number {
  if (!isRecord(summary)) return 0;
  const v = summary.estimatedCostGbp;
  return typeof v === "number" ? v : 0;
}

async function runStage(name: StageName): Promise<StageResult> {
  const startedAt = Date.now();
  try {
    const summary = await STAGE_RUNNERS[name]();
    const durationMs = Date.now() - startedAt;
    console.log(
      `[pipeline] ${name} ok (${durationMs}ms, cost £${extractCostGbp(summary).toFixed(3)})`,
    );
    return { name, status: "ok", durationMs, summary };
  } catch (err) {
    const durationMs = Date.now() - startedAt;
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[pipeline] ${name} failed (${durationMs}ms) — ${message}`);
    return {
      name,
      status: "failed",
      durationMs,
      summary: null,
      error: message,
    };
  }
}

async function writeCronRun(
  kind: CronKind,
  startedAt: string,
  result: {
    status: "ok" | "partial" | "failed";
    stages: StageResult[];
    totalCostGbp: number;
    durationMs: number;
  },
): Promise<string | null> {
  const errors = result.stages
    .filter((s) => s.status === "failed" && s.error)
    .map((s) => ({ stage: s.name, error: s.error }));
  const insert = await db()
    .from("cron_runs")
    .insert({
      started_at: startedAt,
      finished_at: new Date().toISOString(),
      kind,
      status: result.status,
      summary: {
        stages: result.stages.map((s) => ({
          name: s.name,
          status: s.status,
          durationMs: s.durationMs,
          summary: s.summary,
        })),
        totalCostGbp: result.totalCostGbp,
      } as unknown as never,
      errors: errors.length > 0 ? (errors as unknown as never) : null,
      duration_ms: result.durationMs,
    })
    .select("id")
    .single();
  if (insert.error) {
    console.warn(
      `[pipeline] cron_runs insert failed — ${insert.error.message}`,
    );
    return null;
  }
  return insert.data?.id ?? null;
}

async function runStages(
  kind: CronKind,
  stages: readonly StageName[],
): Promise<PipelineResult> {
  const startedAtMs = Date.now();
  const startedAt = new Date(startedAtMs).toISOString();
  const results: StageResult[] = [];

  for (const name of stages) {
    const result = await runStage(name);
    results.push(result);
    if (result.status === "failed" && HARD_ABORT_ON_FAIL.has(name)) {
      console.error(
        `[pipeline] aborting after ${name} failure — remaining stages skipped`,
      );
      for (const remaining of stages.slice(stages.indexOf(name) + 1)) {
        results.push({
          name: remaining,
          status: "skipped",
          durationMs: 0,
          summary: null,
          error: `Skipped after ${name} failed`,
        });
      }
      break;
    }
  }

  const finishedAtMs = Date.now();
  const durationMs = finishedAtMs - startedAtMs;
  const finishedAt = new Date(finishedAtMs).toISOString();
  const totalCostGbp = Number(
    results
      .reduce((acc, s) => acc + extractCostGbp(s.summary), 0)
      .toFixed(4),
  );

  const anyFailed = results.some((s) => s.status === "failed");
  const allOk = results.every((s) => s.status === "ok");
  const status: "ok" | "partial" | "failed" = allOk
    ? "ok"
    : results.find((s) => HARD_ABORT_ON_FAIL.has(s.name))?.status === "failed"
    ? "failed"
    : anyFailed
    ? "partial"
    : "ok";

  const cronRunId = await writeCronRun(kind, startedAt, {
    status,
    stages: results,
    totalCostGbp,
    durationMs,
  });

  return {
    kind,
    status,
    startedAt,
    finishedAt,
    durationMs,
    stages: results,
    totalCostGbp,
    cronRunId,
  };
}

export function runPrepare(): Promise<PipelineResult> {
  return runStages("prepare", [
    "discover",
    "enrich",
    "apollo",
    "personalise",
  ] as const);
}

export function runDigest(): Promise<PipelineResult> {
  return runStages("digest", ["rank", "digest"] as const);
}

export function runManual(): Promise<PipelineResult> {
  return runStages("manual", [
    "discover",
    "enrich",
    "apollo",
    "personalise",
    "rank",
    "digest",
  ] as const);
}
