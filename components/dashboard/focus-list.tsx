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
}: {
  title: string;
  rows: FocusRow[];
  empty: string;
}) {
  return (
    <section className="flex flex-col gap-2 rounded-lg border border-neutral-200 bg-white p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-neutral-900">{title}</h2>
        <span className="text-xs text-neutral-400">{rows.length}</span>
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-neutral-500">{empty}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-neutral-100">
          {rows.map((r) => (
            <li key={r.id}>
              <Link
                href={`/dashboard/prospects/${r.id}`}
                className="flex items-center justify-between gap-3 py-2 hover:opacity-70"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-neutral-900">
                    {r.company_name}
                  </span>
                  <span className="block truncate text-xs text-neutral-500">
                    {r.postcode}
                    {r.observable_signal ? ` · ${r.observable_signal}` : ""}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  <StatusPill status={r.status} />
                  <span className="w-14 text-right text-xs text-neutral-400">
                    {relativeTime(r.last_action_at)}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
