import { NextResponse } from "next/server";

/**
 * Shared Bearer auth check for /api/cron/* and /api/dev/* routes.
 *
 * Vercel Cron sends Authorization: Bearer ${CRON_SECRET} on each
 * scheduled invocation; manual /api/dev/* curls use the same header.
 * Returns a NextResponse on failure (so the caller can `return` it
 * directly) or null on pass.
 */
export function requireCronAuth(request: Request): NextResponse | null {
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
  return null;
}
