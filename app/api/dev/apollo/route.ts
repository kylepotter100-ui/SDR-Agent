import { NextResponse } from "next/server";

import { enrichWithApollo } from "@/lib/agent/apollo";

/**
 * Manual spot-check endpoint for the Apollo enrichment module.
 *
 * Bearer-authed against CRON_SECRET — same pattern as the other
 * /api/dev/* routes and the eventual Checkpoint 9 cron routes.
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
    const summary = await enrichWithApollo();
    return NextResponse.json(summary);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[apollo] failed", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
