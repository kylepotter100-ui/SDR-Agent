import { NextResponse } from "next/server";

import { enrichSignals } from "@/lib/agent/signals";
import { requireCronAuth } from "@/lib/cron-auth";

/**
 * Manual run endpoint for the signals stage alone.
 *
 * Exists to drain the signals backfill over the historical prospect
 * pool without invoking the rest of the prepare pipeline (apollo has
 * no active subscription; personalise drafts are due a clear-down).
 * Call repeatedly until the summary reports processed: 0 — the stage
 * caps each run at MAX_SIGNALS_PER_RUN.
 *
 * Bearer-authed against CRON_SECRET — same pattern as the other
 * /api/dev/* routes.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// A full backfill batch makes up to 3 sequential CH calls per row
// (PSC + officer-ID resolution + appointments) plus the within-pool
// pass — comfortably over the default function window.
export const maxDuration = 300;

export async function POST(request: Request) {
  const denied = requireCronAuth(request);
  if (denied) return denied;

  try {
    const summary = await enrichSignals();
    return NextResponse.json(summary);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[signals-run] failed", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
