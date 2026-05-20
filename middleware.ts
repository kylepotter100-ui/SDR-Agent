import { type NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

/**
 * Gates /dashboard/* against a valid Supabase session whose email
 * matches DASHBOARD_ALLOWED_EMAIL. Refreshes the session cookie on
 * each request (the standard @supabase/ssr middleware pattern).
 *
 * The matcher below scopes this to /dashboard/* ONLY — /api/cron/*
 * and /api/dev/* are never matched, so the Bearer-token-authed agent
 * routes are never session-gated.
 */
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    // Misconfiguration — fail closed: send to login rather than expose
    // the dashboard without an auth backend.
    const redirect = request.nextUrl.clone();
    redirect.pathname = "/login";
    return NextResponse.redirect(redirect);
  }

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        );
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const allowed = process.env.DASHBOARD_ALLOWED_EMAIL;
  const authorised = Boolean(user) && (!allowed || user!.email === allowed);

  if (!authorised) {
    const redirect = request.nextUrl.clone();
    redirect.pathname = "/login";
    redirect.searchParams.set("from", request.nextUrl.pathname);
    return NextResponse.redirect(redirect);
  }

  return response;
}

export const config = {
  matcher: ["/dashboard/:path*"],
};
