import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

/**
 * Magic-link callback. Exchanges the PKCE code for a session and
 * redirects to the originally-requested path (or /dashboard).
 */

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const from = searchParams.get("from") ?? "/dashboard";
  const safeFrom = from.startsWith("/") ? from : "/dashboard";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${safeFrom}`);
    }
  }
  return NextResponse.redirect(`${origin}/login?error=auth`);
}
