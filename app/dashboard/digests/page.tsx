import Link from "next/link";

import { createClient } from "@/lib/supabase/server";
import { StatusPill } from "@/components/ui/badge";
import type { ProspectStatus } from "@/lib/db.types";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default async function DigestsPage() {
  const supabase = await createClient();

  const [digestsRes, prospectsRes] = await Promise.all([
    supabase
      .from("digests")
      .select("id, sent_at, prospect_ids, candidate_count, delivered_to")
      .order("sent_at", { ascending: false }),
    supabase.from("prospects").select("id, company_name, status").limit(5000),
  ]);

  if (digestsRes.error) {
    return (
      <div className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">
        Failed to load digests: {digestsRes.error.message}
      </div>
    );
  }

  const prospectMap = new Map<
    string,
    { company_name: string; status: ProspectStatus }
  >();
  for (const p of prospectsRes.data ?? []) {
    prospectMap.set(p.id, { company_name: p.company_name, status: p.status });
  }

  const digests = digestsRes.data ?? [];

  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-serif text-2xl tracking-tight text-brand-near-black">
        Digest history
      </h1>

      {digests.length === 0 ? (
        <p className="text-sm text-brand-near-black/55">No digests sent yet.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {digests.map((d) => (
            <li
              key={d.id}
              className="rounded-lg border border-brand-near-black/10 bg-white/60"
            >
              <details>
                <summary className="cursor-pointer list-none px-4 py-3">
                  <span className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-mono text-sm text-brand-near-black">
                      {formatDate(d.sent_at)}
                    </span>
                    <span className="font-mono text-xs text-brand-near-black/55">
                      {d.prospect_ids.length} sent · {d.candidate_count}{" "}
                      considered · {d.delivered_to}
                    </span>
                  </span>
                </summary>
                <ul className="flex flex-col divide-y divide-brand-near-black/5 border-t border-brand-near-black/10">
                  {d.prospect_ids.map((pid: string) => {
                    const p = prospectMap.get(pid);
                    return (
                      <li
                        key={pid}
                        className="flex items-center justify-between gap-2 px-4 py-2"
                      >
                        {p ? (
                          <Link
                            href={`/dashboard/prospects/${pid}`}
                            className="truncate text-sm text-brand-near-black hover:underline"
                          >
                            {p.company_name}
                          </Link>
                        ) : (
                          <span className="truncate text-sm text-brand-near-black/40">
                            (prospect removed)
                          </span>
                        )}
                        {p && <StatusPill status={p.status} />}
                      </li>
                    );
                  })}
                </ul>
              </details>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
