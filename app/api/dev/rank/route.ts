import { NextResponse } from "next/server";

import { rank } from "@/lib/agent/rank";
import { requireCronAuth } from "@/lib/cron-auth";

/**
 * Manual spot-check endpoint for the ranking module.
 *
 * Bearer-authed against CRON_SECRET — same pattern as the other
 * /api/dev/* routes and the eventual Checkpoint 9 cron routes.
 * maxDuration raised to 300s because the single Opus 4.7 call with
 * ~138 prospects can take a minute or more at effort: "high".
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(request: Request) {
  const denied = requireCronAuth(request);
  if (denied) return denied;

  try {
    const summary = await rank();
    return NextResponse.json(summary);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[rank] failed", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
