/**
 * Suppression enforcement for the agent pipeline.
 *
 * The dashboard (Phase 2) lets Kyle add addresses to suppression_list.
 * The personalise and digest stages call getSuppressedEmails() and
 * filter out any candidate whose director_email is a member — in JS,
 * not via a PostgREST `not in` filter, because suppression entries are
 * arbitrary email strings and JS-set membership avoids any
 * filter-grammar quoting/injection risk.
 *
 * STATUS_EXCLUDED is the companion: prospects Kyle has triaged out
 * (opted_out / ignored / dead) are excluded from personalisation and
 * the digest at the query level, so manual triage actually influences
 * the pipeline rather than being cosmetic.
 */

import { db } from "@/lib/db";
import type { ProspectStatus } from "@/lib/db.types";

export const STATUS_EXCLUDED: ProspectStatus[] = [
  "opted_out",
  "ignored",
  "dead",
];

// PostgREST `in` value list — safe because these are fixed enum
// identifiers with no special characters.
export const STATUS_EXCLUDED_FILTER = `(${STATUS_EXCLUDED.join(",")})`;

export async function getSuppressedEmails(): Promise<Set<string>> {
  const result = await db().from("suppression_list").select("email");
  if (result.error) throw result.error;
  return new Set((result.data ?? []).map((r) => r.email));
}

export function isSuppressed(
  email: string | null,
  suppressed: Set<string>,
): boolean {
  return email !== null && suppressed.has(email);
}
