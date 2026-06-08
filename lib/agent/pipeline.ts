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
import { enrichSignals } from "@/lib/agent/signals";
import { personalise } from "@/lib/agent/personalise";
import { rank } from "@/lib/agent/rank";
import { digest, type PipelineContext } from "@/lib/agent/digest";

export type StageName =
  | "discover"
  | "enrich"
  | "apollo"
  | "signals"
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

/**
 * Fetch the most recent prepare cron_runs row within the lookback
 * window. Used by the digest stage so the emailed pipeline summary
 * can reflect discover / enrich / apollo / personalise counts.
 */
async function loadRecentPrepareSummary(
  withinMs: number = 60 * 60 * 1000,
): Promise<unknown> {
  const since = new Date(Date.now() - withinMs).toISOString();
  const result = await db()
    .from("cron_runs")
    .select("summary")
    .eq("kind", "prepare")
    .gt("started_at", since)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (result.error || !result.data) return null;
  return result.data.summary;
}

function readStageSummary(
  prepareSummary: unknown,
  name: StageName,
): unknown {
  if (!isRecord(prepareSummary)) return undefined;
  const stages = prepareSummary.stages;
  if (!Array.isArray(stages)) return undefined;
  const entry = stages.find(
    (s): s is { name: string; summary: unknown } =>
      isRecord(s) && s.name === name,
  );
  return entry?.summary;
}

async function runStage(
  name: StageName,
  priorStages: StageResult[],
  kind: CronKind,
): Promise<StageResult> {
  const startedAt = Date.now();
  try {
    let summary: unknown;
    switch (name) {
      case "discover":
        summary = await discover();
        break;
      case "enrich":
        summary = await enrich();
        break;
      case "apollo":
        summary = await enrichWithApollo();
        break;
      case "signals":
        summary = await enrichSignals();
        break;
      case "personalise":
        summary = await personalise();
        break;
      case "rank":
        summary = await rank();
        break;
      case "digest": {
        const rankResult = priorStages.find((s) => s.name === "rank");
        // In the manual / full pipeline, prepare-equivalent stages
        // ran in-process and we read their summaries from
        // priorStages. In the digest cron, prepare ran in a separate
        // function invocation; fetch its row from cron_runs.
        const prepareInline =
          kind === "manual"
            ? priorStages.reduce<Record<string, unknown>>((acc, s) => {
                if (
                  s.name === "discover" ||
                  s.name === "enrich" ||
                  s.name === "apollo" ||
                  s.name === "signals" ||
                  s.name === "personalise"
                ) {
                  acc[s.name] = s.summary;
                }
                return acc;
              }, {})
            : null;
        const prepareFromDb =
          prepareInline === null ? await loadRecentPrepareSummary() : null;
        const prepare = prepareInline ?? {
          discover: readStageSummary(prepareFromDb, "discover"),
          enrich: readStageSummary(prepareFromDb, "enrich"),
          apollo: readStageSummary(prepareFromDb, "apollo"),
          signals: readStageSummary(prepareFromDb, "signals"),
          personalise: readStageSummary(prepareFromDb, "personalise"),
        };
        const failedStages = priorStages
          .filter((s) => s.status === "failed")
          .map((s) => s.name);
        const totalCostGbp = Number(
          (
            priorStages.reduce(
              (acc, s) => acc + extractCostGbp(s.summary),
              0,
            ) +
            (isRecord(prepareFromDb) &&
            typeof prepareFromDb.totalCostGbp === "number"
              ? prepareFromDb.totalCostGbp
              : 0)
          ).toFixed(4),
        );
        const pipelineContext: PipelineContext = {
          prepare,
          rank: rankResult?.summary,
          totalCostGbp,
          failedStages,
        };
        summary = await digest({ dryRun: false, pipelineContext });
        break;
      }
    }
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
    const result = await runStage(name, results, kind);
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
    "signals",
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
    "signals",
    "personalise",
    "rank",
    "digest",
  ] as const);
}
