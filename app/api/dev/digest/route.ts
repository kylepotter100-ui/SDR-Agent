import { NextResponse } from "next/server";

import { digest } from "@/lib/agent/digest";
import { requireCronAuth } from "@/lib/cron-auth";

/**
 * Manual spot-check endpoint for the weekly digest.
 *
 * Bearer-authed against CRON_SECRET, same pattern as the other
 * /api/dev/* routes. Accepts an optional `{ "dryRun": true }` body for
 * iterating on layout without sending mail or marking prospects
 * surfaced; default is a live send to DIGEST_RECIPIENT_EMAIL with
 * full state changes.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request) {
  const denied = requireCronAuth(request);
  if (denied) return denied;

  let dryRun = false;
  try {
    const raw = await request.text();
    if (raw.trim().length > 0) {
      const body = JSON.parse(raw) as { dryRun?: unknown };
      dryRun = body.dryRun === true;
    }
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  try {
    const summary = await digest({ dryRun });
    return NextResponse.json(summary);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[digest] failed", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
