import { NextResponse } from "next/server";

import { requireCronAuth } from "@/lib/cron-auth";
import { runManual } from "@/lib/agent/pipeline";

/**
 * Manual full-pipeline trigger.
 *
 * Runs discover -> enrich -> apollo -> personalise -> rank -> digest
 * in a single function invocation. Same auth pattern as the scheduled
 * crons. For Sunday-impatient or debugging.
 *
 * If the full run exceeds maxDuration, switch to firing the prepare
 * cron and digest cron separately, or hit the individual /api/dev/*
 * endpoints for granular control.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

async function handle(request: Request) {
  const denied = requireCronAuth(request);
  if (denied) return denied;
  try {
    const result = await runManual();
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[cron/manual-trigger] failed", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(request: Request) {
  return handle(request);
}

export async function POST(request: Request) {
  return handle(request);
}
