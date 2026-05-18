import { NextResponse } from "next/server";

import { requireCronAuth } from "@/lib/cron-auth";
import { runPrepare } from "@/lib/agent/pipeline";

/**
 * Weekly prepare cron endpoint.
 *
 * Hit by Vercel Cron at 06:30 UTC every Monday — 30 minutes before
 * the digest cron. Runs the discover -> enrich -> apollo ->
 * personalise stages of the pipeline and writes a cron_runs row so
 * the digest cron can read its outputs to compose the email footer.
 *
 * Vercel Cron sends GET; we accept both GET and POST so the manual
 * curl pattern works too.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

async function handle(request: Request) {
  const denied = requireCronAuth(request);
  if (denied) return denied;
  try {
    const result = await runPrepare();
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[cron/prepare] failed", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(request: Request) {
  return handle(request);
}

export async function POST(request: Request) {
  return handle(request);
}
