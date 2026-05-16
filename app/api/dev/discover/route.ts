import { NextResponse } from "next/server";

import { discover } from "@/lib/agent/discover";

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
    const summary = await discover();
    return NextResponse.json(summary);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[discover] failed", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
