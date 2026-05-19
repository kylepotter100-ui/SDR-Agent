import { NextResponse } from "next/server";

import { enrich } from "@/lib/agent/enrich";
import { requireCronAuth } from "@/lib/cron-auth";

/**
 * Manual spot-check endpoint for the Google Places enrichment module.
 *
 * Bearer-authed against CRON_SECRET — same pattern as /api/dev/discover
 * and the eventual Checkpoint 9 cron routes. Lives under /api/dev/ so
 * Vercel Cron won't pick it up. Not part of the weekly pipeline.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const denied = requireCronAuth(request);
  if (denied) return denied;

  try {
    const summary = await enrich();
    return NextResponse.json(summary);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[enrich] failed", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
