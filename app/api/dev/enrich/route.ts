import { NextResponse } from "next/server";

import { enrich } from "@/lib/agent/enrich";

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
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return NextResponse.json(
      { error: "Server misconfigured: CRON_SECRET not set" },
      { status: 500 },
    );
  }
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const summary = await enrich();
    return NextResponse.json(summary);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[enrich] failed", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
