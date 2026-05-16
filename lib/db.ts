/**
 * Supabase client wrapper.
 *
 * All database access in the agent goes through this single module —
 * never import @supabase/supabase-js elsewhere.
 *
 * Server-side only. Uses the service role key, which bypasses RLS.
 * Do not import this from any client component.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "./db.types";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

let client: SupabaseClient<Database> | undefined;

export function db(): SupabaseClient<Database> {
  if (!client) {
    client = createClient<Database>(
      requireEnv("SUPABASE_URL"),
      requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      },
    );
  }
  return client;
}
