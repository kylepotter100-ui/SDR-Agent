import { NextResponse } from "next/server";

import { discover } from "@/lib/agent/discover";
import { requireCronAuth } from "@/lib/cron-auth";

/**
 * Manual spot-check endpoint for the Companies House discovery module.
 *
 * Bearer-authed against CRON_SECRET so the same auth pattern applies as
 * the Checkpoint 9 cron routes. Lives under /api/dev/ rather than
 * /api/cron/ so Vercel Cron won't pick it up accidentally. Not part of
 * the weekly pipeline — purely for human-run spot-checks during
 * Checkpoint 3 review.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const denied = requireCronAuth(request);
  if (denied) return denied;

  try {
    const summary = await discover();
    return NextResponse.json(summary);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[discover] failed", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
