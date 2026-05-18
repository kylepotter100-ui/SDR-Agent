import { NextResponse } from "next/server";

import { personalise } from "@/lib/agent/personalise";
import { requireCronAuth } from "@/lib/cron-auth";

/**
 * Manual spot-check endpoint for the personalisation module.
 *
 * Bearer-authed against CRON_SECRET — same pattern as the other
 * /api/dev/* routes and the eventual Checkpoint 9 cron routes.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(request: Request) {
  const denied = requireCronAuth(request);
  if (denied) return denied;

  try {
    const summary = await personalise();
    return NextResponse.json(summary);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[personalise] failed", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
