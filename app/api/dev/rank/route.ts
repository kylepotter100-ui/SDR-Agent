import { NextResponse } from "next/server";

import { rank } from "@/lib/agent/rank";
import { requireCronAuth } from "@/lib/cron-auth";

/**
 * Manual spot-check endpoint for the ranking module.
 *
 * Bearer-authed against CRON_SECRET — same pattern as the other
 * /api/dev/* routes and the eventual Checkpoint 9 cron routes.
 * maxDuration raised to 300s because the single Opus 4.7 call with
 * the full unsurfaced pool can take a minute or more at effort: "high".
 *
 * Optional ?limit=N query param: rank only the top-N prospects by fit
 * weight (then recency, then id) for spot-check review without waiting
 * on — or timing out against — the full pool. Dev convenience only;
 * the production cron calls rank() with no limit. Note this trim is a
 * review aid, not the durable answer to the full-pool timeout — that
 * is batching, tracked as a pre-launch item in the deferred-items log.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(request: Request) {
  const denied = requireCronAuth(request);
  if (denied) return denied;

  const limitParam = new URL(request.url).searchParams.get("limit");
  const limit =
    limitParam !== null && /^\d+$/.test(limitParam)
      ? Number(limitParam)
      : undefined;

  try {
    const summary = await rank(limit !== undefined ? { limit } : {});
    return NextResponse.json(summary);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[rank] failed", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
