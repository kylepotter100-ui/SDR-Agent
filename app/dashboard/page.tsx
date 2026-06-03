import Link from "next/link";

import { createClient } from "@/lib/supabase/server";
import { StatusPill } from "@/components/ui/badge";
import { FocusList, type FocusRow } from "@/components/dashboard/focus-list";
import { PROSPECT_STATUSES } from "@/lib/dashboard/filters";
import type { ProspectStatus } from "@/lib/db.types";

const FOCUS_SELECT =
  "id, company_name, postcode, status, observable_signal, last_action_at, ranking_score, director_email";

function windowBounds() {
  const now = Date.now();
  return {
    fourDaysAgo: new Date(now - 4 * 24 * 3600 * 1000).toISOString(),
    fortyEightHrAgo: new Date(now - 48 * 3600 * 1000).toISOString(),
  };
}

export default async function DashboardHome() {
  const supabase = await createClient();
  const { fourDaysAgo, fortyEightHrAgo } = windowBounds();

  const [statusRes, surfacedRes, awaitingRes, recentRes] = await Promise.all([
    supabase.from("prospects").select("status").limit(5000),
    // Actionable queue — best-rank first (nullsLast so unranked rows still
    // appear but sink), surfaced_in_digest_at desc as tiebreak.
    supabase
      .from("prospects")
      .select(FOCUS_SELECT)
      .not("surfaced_in_digest_at", "is", null)
      .in("status", ["new", "surfaced"])
      .order("ranking_score", { ascending: false, nullsFirst: false })
      .order("surfaced_in_digest_at", { ascending: false })
      .limit(50),
    supabase
      .from("prospects")
      .select(FOCUS_SELECT)
      .eq("status", "sent")
      .lt("last_action_at", fourDaysAgo)
      .order("last_action_at", { ascending: true })
      .limit(50),
    supabase
      .from("prospects")
      .select(FOCUS_SELECT)
      .gt("last_action_at", fortyEightHrAgo)
      .order("last_action_at", { ascending: false })
      .limit(50),
  ]);

  const counts: Record<string, number> = {};
  for (const row of statusRes.data ?? []) {
    counts[row.status] = (counts[row.status] ?? 0) + 1;
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-baseline justify-between">
        <h1 className="font-serif text-2xl tracking-tight text-brand-near-black">
          Pipeline
        </h1>
        <span className="font-mono text-xs uppercase tracking-wide text-brand-near-black/50">
          Overview
        </span>
      </div>

      {/* Actionable now — promoted to the headline. Best-rank first. */}
      <FocusList
        title="Actionable now"
        rows={(surfacedRes.data ?? []) as FocusRow[]}
        empty="Nothing waiting — surfaced prospects have all been actioned."
        showRank
      />

      {/* Counter strip — every status, filtered link-through. */}
      <div className="flex flex-wrap gap-2">
        {PROSPECT_STATUSES.map((s: ProspectStatus) => (
          <Link
            key={s}
            href={`/dashboard/prospects?status=${s}`}
            className="flex items-center gap-2 rounded-md border border-brand-near-black/10 bg-white/60 px-3 py-2 transition-colors hover:bg-white"
          >
            <StatusPill status={s} />
            <span className="font-mono text-sm font-semibold text-brand-near-black">
              {counts[s] ?? 0}
            </span>
          </Link>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <FocusList
          title="Awaiting reply"
          rows={(awaitingRes.data ?? []) as FocusRow[]}
          empty="No sends are overdue a follow-up."
        />
        <FocusList
          title="Recently changed"
          rows={(recentRes.data ?? []) as FocusRow[]}
          empty="No activity in the last 48 hours."
        />
      </div>
    </div>
  );
}
