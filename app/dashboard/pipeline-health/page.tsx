import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

interface StageView {
  name: string;
  status: string;
  durationMs: number;
}

function parseStages(summary: unknown): StageView[] {
  if (!isRecord(summary) || !Array.isArray(summary.stages)) return [];
  return summary.stages
    .filter(isRecord)
    .map((s) => ({
      name: typeof s.name === "string" ? s.name : "?",
      status: typeof s.status === "string" ? s.status : "?",
      durationMs: typeof s.durationMs === "number" ? s.durationMs : 0,
    }));
}

function parseCost(summary: unknown): number | null {
  if (!isRecord(summary)) return null;
  return typeof summary.totalCostGbp === "number" ? summary.totalCostGbp : null;
}

const RUN_STATUS_STYLE: Record<string, string> = {
  ok: "bg-green-100 text-green-800",
  partial: "bg-amber-100 text-amber-800",
  failed: "bg-red-100 text-red-800",
};

const STAGE_STATUS_STYLE: Record<string, string> = {
  ok: "text-green-700",
  failed: "text-red-700",
  skipped: "text-neutral-400",
};

export default async function PipelineHealthPage() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("cron_runs")
    .select("id, kind, status, started_at, duration_ms, summary, errors")
    .order("started_at", { ascending: false })
    .limit(30);

  if (error) {
    return (
      <div className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">
        Failed to load runs: {error.message}
      </div>
    );
  }
  const runs = data ?? [];

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-lg font-semibold text-neutral-900">Pipeline health</h1>

      {runs.length === 0 ? (
        <p className="text-sm text-neutral-500">No cron runs recorded yet.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {runs.map((run) => {
            const stages = parseStages(run.summary);
            const cost = parseCost(run.summary);
            return (
              <li
                key={run.id}
                className="rounded-lg border border-neutral-200 bg-white p-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="flex items-center gap-2">
                    <span className="text-sm font-medium capitalize text-neutral-900">
                      {run.kind}
                    </span>
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-xs font-medium",
                        RUN_STATUS_STYLE[run.status] ??
                          "bg-neutral-100 text-neutral-600",
                      )}
                    >
                      {run.status}
                    </span>
                  </span>
                  <span className="text-xs text-neutral-500">
                    {formatTimestamp(run.started_at)}
                    {run.duration_ms != null
                      ? ` · ${Math.round(run.duration_ms / 1000)}s`
                      : ""}
                    {cost != null ? ` · £${cost.toFixed(2)}` : ""}
                  </span>
                </div>
                {stages.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
                    {stages.map((s) => (
                      <span
                        key={s.name}
                        className={cn(
                          STAGE_STATUS_STYLE[s.status] ?? "text-neutral-500",
                        )}
                      >
                        {s.name} {s.status} ({Math.round(s.durationMs / 1000)}s)
                      </span>
                    ))}
                  </div>
                )}
                {run.errors != null && (
                  <pre className="mt-2 overflow-x-auto rounded bg-red-50 p-2 text-xs text-red-700">
                    {JSON.stringify(run.errors, null, 2)}
                  </pre>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
