import Link from "next/link";

import { StatusPill } from "@/components/ui/badge";
import type { ProspectStatus } from "@/lib/db.types";

export interface FocusRow {
  id: string;
  company_name: string;
  postcode: string;
  status: ProspectStatus;
  observable_signal: string | null;
  last_action_at: string | null;
  ranking_score?: number | null;
  director_email?: string | null;
}

function relativeTime(iso: string | null): string {
  if (!iso) return "—";
  const diffMs = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diffMs / (24 * 3600 * 1000));
  if (days >= 1) return `${days}d ago`;
  const hours = Math.floor(diffMs / (3600 * 1000));
  if (hours >= 1) return `${hours}h ago`;
  const mins = Math.floor(diffMs / (60 * 1000));
  return mins >= 1 ? `${mins}m ago` : "just now";
}

export function FocusList({
  title,
  rows,
  empty,
  showRank = false,
}: {
  title: string;
  rows: FocusRow[];
  empty: string;
  showRank?: boolean;
}) {
  return (
    <section className="flex flex-col gap-2 rounded-lg border border-brand-near-black/10 bg-white/60 p-4">
      <div className="flex items-center justify-between">
        <h2 className="font-mono text-xs uppercase tracking-wide text-brand-near-black/60">
          {title}
        </h2>
        <span className="font-mono text-xs text-brand-near-black/40">
          {rows.length}
        </span>
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-brand-near-black/50">{empty}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-brand-near-black/5">
          {rows.map((r) => {
            const hasEmail = Boolean(r.director_email);
            return (
              <li key={r.id}>
                <Link
                  href={`/dashboard/prospects/${r.id}`}
                  className="flex items-center justify-between gap-3 py-2 transition-opacity hover:opacity-70"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-brand-near-black">
                      {r.company_name}
                    </span>
                    <span className="block truncate text-xs text-brand-near-black/55">
                      {r.postcode}
                      {r.observable_signal ? ` · ${r.observable_signal}` : ""}
                      {showRank ? (
                        <>
                          {" · "}
                          <span className="font-mono">
                            R:{" "}
                            {r.ranking_score != null
                              ? Math.round(r.ranking_score)
                              : "—"}
                          </span>
                          {" · "}
                          <span
                            className={
                              hasEmail
                                ? "text-emerald-700"
                                : "text-amber-700"
                            }
                          >
                            {hasEmail ? "Email ready" : "Awaiting email"}
                          </span>
                        </>
                      ) : null}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <StatusPill status={r.status} />
                    <span className="w-14 text-right font-mono text-xs text-brand-near-black/40">
                      {relativeTime(r.last_action_at)}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
