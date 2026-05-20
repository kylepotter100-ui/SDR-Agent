/**
 * Session-scoped Supabase client for the dashboard (server side).
 *
 * Uses the anon key + the user's session cookie, so RLS applies — this
 * is deliberately NOT the agent's service-role client in lib/db.ts
 * (which bypasses RLS). Server components, route handlers, and server
 * actions in the dashboard use this.
 */

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Called from a Server Component — safe to ignore; the
            // middleware refreshes the session cookie on each request.
          }
        },
      },
    },
  );
}
