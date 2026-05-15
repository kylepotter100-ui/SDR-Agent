import { NextResponse } from "next/server";

/**
 * Manual digest trigger.
 *
 * Same pipeline as weekly-digest, no schedule. Used for ad-hoc test
 * runs from a developer machine. Auth via CRON_SECRET header check is
 * wired in at Checkpoint 9.
 */
export async function POST() {
  return NextResponse.json(
    { error: "Not implemented. Pipeline orchestrator lands at Checkpoint 9." },
    { status: 501 },
  );
}
