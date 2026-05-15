import { NextResponse } from "next/server";

/**
 * Weekly digest cron endpoint.
 *
 * Hit by Vercel Cron at 07:00 UTC every Monday (08:00 BST).
 * Pipeline orchestrator lands at Checkpoint 9. Auth via CRON_SECRET
 * header check is wired in at the same time.
 */
export async function GET() {
  return NextResponse.json(
    { error: "Not implemented. Pipeline orchestrator lands at Checkpoint 9." },
    { status: 501 },
  );
}
