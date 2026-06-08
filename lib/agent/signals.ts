/**
 * Greenfield-signal enrichment.
 *
 * Three signals per prospect, all from Companies House (free):
 *   1. persons-with-significant-control → corporate-PSC count flags
 *      group_subsidiary candidates (the Assembly Rooms case).
 *   2. officer-appointments for the picked director → flags
 *      serial / portfolio operators.
 *   3. within-pool director-name collisions (computed in one SQL
 *      group-by after the per-prospect loop) → flags duplicate
 *      operators across the discovered pool.
 *
 * For backfill rows (director_name populated but director_officer_id
 * null because they pre-date PR 2), the stage resolves the officer ID
 * via a fresh officers fetch and persists it. New rows landing after
 * PR 2 ships get the officer ID written at apollo time, so the
 * appointments call is the only extra CH fetch — sequential, free.
 *
 * Soft-fail per prospect AND at the stage level: a transport failure
 * leaves signals_attempted_at null so the row retries next run, and
 * unfilled signal columns are read as "unknown" by the ranker rather
 * than mislabelling as ideal greenfield.
 *
 * derived greenfield_flag values: see deriveGreenfieldFlag below.
 */

import { db } from "@/lib/db";
import {
  fetchOfficersWithLinks,
  fetchPsc,
  countActiveAppointments,
  CompaniesHouseError,
  type PscSummary,
} from "@/lib/companies-house";
import { pickDirector } from "@/lib/agent/apollo";
import {
  MAX_SIGNALS_PER_RUN,
  POSTCODE_PREFIXES,
  SERIAL_OPERATOR_APPOINTMENT_THRESHOLD,
  type PostcodePrefix,
} from "@/lib/config";
import type { GreenfieldFlag, PscStatus } from "@/lib/db.types";

interface SignalErrorRecord {
  stage: "ch_psc" | "ch_officers" | "ch_appointments" | "db_update";
  company_number: string;
  company_name: string;
  status?: number;
  message: string;
}

export interface SignalsSummary {
  considered: number;
  processed: number;
  hitCap: boolean;
  pscPresent: number;
  pscNoneFiled: number;
  groupSubsidiary: number;
  serialOperator: number;
  soleIndependent: number;
  standard: number;
  unknown: number;
  withinPoolUpdates: number;
  officerIdResolved: number;
  officerIdMissing: number;
  byPostcode: Record<string, number>;
  errors: {
    byBucket: Record<string, number>;
    examples: SignalErrorRecord[];
  };
  sample: Array<{
    company_number: string;
    company_name: string;
    director_name: string | null;
    psc_status: PscStatus | null;
    psc_corporate_count: number | null;
    psc_individual_count: number | null;
    director_active_appointments: number | null;
    greenfield_flag: GreenfieldFlag;
  }>;
}

interface SignalRow {
  psc_status: PscStatus | null;
  psc_corporate_count: number | null;
  psc_individual_count: number | null;
  director_active_appointments: number | null;
  within_pool_director_count: number | null;
}

function extractPrefix(
  postcode: string | null | undefined,
): PostcodePrefix | null {
  if (!postcode) return null;
  const match = postcode.toUpperCase().match(/^([A-Z]+)/);
  if (!match) return null;
  const prefix = match[1];
  return (POSTCODE_PREFIXES as readonly string[]).includes(prefix)
    ? (prefix as PostcodePrefix)
    : null;
}

/**
 * Deterministic flag derivation. Precedence:
 *   1. group_subsidiary  — any corporate PSC. Hard fact.
 *   2. serial_operator   — director_active_appointments >= threshold.
 *   3. sole_independent  — single individual PSC + director on no
 *                          other boards + no within-pool collision.
 *                          Requires director_active_appointments to be
 *                          EXPLICITLY non-null: null means we couldn't
 *                          fetch and must not award the boost.
 *   4. unknown           — no PSC filed AND no appointments resolved.
 *   5. standard          — everything else.
 */
export function deriveGreenfieldFlag(s: SignalRow): GreenfieldFlag {
  if ((s.psc_corporate_count ?? 0) > 0) return "group_subsidiary";

  if (
    (s.director_active_appointments ?? 0) >=
    SERIAL_OPERATOR_APPOINTMENT_THRESHOLD
  ) {
    return "serial_operator";
  }

  if (
    s.psc_status === "present" &&
    s.psc_individual_count === 1 &&
    (s.psc_corporate_count ?? 0) === 0 &&
    s.director_active_appointments !== null &&
    s.director_active_appointments <= 1 &&
    (s.within_pool_director_count ?? 0) === 0
  ) {
    return "sole_independent";
  }

  if (
    s.psc_status !== "present" &&
    s.director_active_appointments == null
  ) {
    return "unknown";
  }

  return "standard";
}

export async function enrichSignals(): Promise<SignalsSummary> {
  const candidates = await db()
    .from("prospects")
    .select(
      "id, company_number, company_name, postcode, director_name, director_officer_id, signals_attempted_at",
    )
    .not("director_name", "is", null)
    .is("signals_attempted_at", null)
    .order("created_at", { ascending: true });
  if (candidates.error) throw candidates.error;

  const all = candidates.data ?? [];
  const considered = all.length;
  const batch = all.slice(0, MAX_SIGNALS_PER_RUN);
  const hitCap = considered > MAX_SIGNALS_PER_RUN;

  let processed = 0;
  let pscPresent = 0;
  let pscNoneFiled = 0;
  let officerIdResolved = 0;
  let officerIdMissing = 0;

  const byPostcode: Record<string, number> = Object.fromEntries(
    POSTCODE_PREFIXES.map((p) => [p, 0]),
  );
  const errorsByBucket: Record<string, number> = {};
  const errorExamples: SignalErrorRecord[] = [];
  const sample: SignalsSummary["sample"] = [];
  const processedIds: string[] = [];

  const recordError = (record: SignalErrorRecord) => {
    const bucket =
      record.stage === "db_update"
        ? "db_update"
        : record.status !== undefined
        ? `${record.stage}_${record.status}`
        : "network";
    errorsByBucket[bucket] = (errorsByBucket[bucket] ?? 0) + 1;
    if (errorExamples.length < 5) errorExamples.push(record);
  };

  for (const prospect of batch) {
    // Step 1: PSC fetch.
    let psc: PscSummary;
    try {
      psc = await fetchPsc(prospect.company_number);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const status =
        err instanceof CompaniesHouseError ? err.status : undefined;
      console.warn(
        `[signals] skip ${prospect.company_number}: PSC fetch failed — ${message}`,
      );
      recordError({
        stage: "ch_psc",
        company_number: prospect.company_number,
        company_name: prospect.company_name,
        status,
        message,
      });
      continue;
    }
    if (psc.status === "present") pscPresent++;
    if (psc.status === "none_filed") pscNoneFiled++;

    // Step 2: resolve director officer ID for backfill rows.
    let officerId: string | null = prospect.director_officer_id;
    if (!officerId) {
      try {
        const officers = await fetchOfficersWithLinks(prospect.company_number);
        const picked = pickDirector(officers);
        officerId = picked?.officer_id ?? null;
        if (officerId) {
          officerIdResolved++;
        } else {
          officerIdMissing++;
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const status =
          err instanceof CompaniesHouseError ? err.status : undefined;
        console.warn(
          `[signals] skip ${prospect.company_number}: officers fetch failed — ${message}`,
        );
        recordError({
          stage: "ch_officers",
          company_number: prospect.company_number,
          company_name: prospect.company_name,
          status,
          message,
        });
        continue;
      }
    }

    // Step 3: appointments fetch (only if officer ID is known).
    let activeAppointments: number | null = null;
    if (officerId) {
      try {
        activeAppointments = await countActiveAppointments(officerId);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const status =
          err instanceof CompaniesHouseError ? err.status : undefined;
        console.warn(
          `[signals] skip ${prospect.company_number}: appointments fetch failed — ${message}`,
        );
        recordError({
          stage: "ch_appointments",
          company_number: prospect.company_number,
          company_name: prospect.company_name,
          status,
          message,
        });
        continue;
      }
    }

    // Pre-collision flag — within_pool_director_count is filled by the
    // group-by pass below, after which we re-derive for affected rows.
    const greenfieldFlag = deriveGreenfieldFlag({
      psc_status: psc.status,
      psc_corporate_count: psc.corporateCount,
      psc_individual_count: psc.individualCount,
      director_active_appointments: activeAppointments,
      within_pool_director_count: 0,
    });

    const upd = await db()
      .from("prospects")
      .update({
        director_officer_id: officerId,
        psc_corporate_count: psc.corporateCount,
        psc_individual_count: psc.individualCount,
        psc_total_count: psc.totalCount,
        psc_status: psc.status,
        director_active_appointments: activeAppointments,
        within_pool_director_count: 0,
        greenfield_flag: greenfieldFlag,
        signals_attempted_at: new Date().toISOString(),
      })
      .eq("id", prospect.id);
    if (upd.error) {
      recordError({
        stage: "db_update",
        company_number: prospect.company_number,
        company_name: prospect.company_name,
        message: upd.error.message,
      });
      continue;
    }

    processed++;
    processedIds.push(prospect.id);

    const prefix = extractPrefix(prospect.postcode);
    if (prefix) byPostcode[prefix]++;

    if (sample.length < 5) {
      sample.push({
        company_number: prospect.company_number,
        company_name: prospect.company_name,
        director_name: prospect.director_name,
        psc_status: psc.status,
        psc_corporate_count: psc.corporateCount,
        psc_individual_count: psc.individualCount,
        director_active_appointments: activeAppointments,
        greenfield_flag: greenfieldFlag,
      });
    }
  }

  // Within-pool director collisions. Computed over ALL prospects with
  // an attempted signal row so newly-discovered duplicates of older
  // rows are caught — not just collisions within this batch.
  let withinPoolUpdates = 0;
  let groupSubsidiary = 0;
  let serialOperator = 0;
  let soleIndependent = 0;
  let standard = 0;
  let unknownFlag = 0;

  const allSignaled = await db()
    .from("prospects")
    .select(
      "id, director_name, psc_status, psc_corporate_count, psc_individual_count, director_active_appointments",
    )
    .not("director_name", "is", null)
    .not("signals_attempted_at", "is", null);
  if (allSignaled.error) {
    console.warn(
      `[signals] within-pool group-by skipped — ${allSignaled.error.message}`,
    );
  } else {
    type SignaledRow = NonNullable<typeof allSignaled.data>[number];
    const byName = new Map<string, SignaledRow[]>();
    for (const row of allSignaled.data ?? []) {
      const name = row.director_name;
      if (!name) continue;
      const bucket = byName.get(name) ?? [];
      bucket.push(row);
      byName.set(name, bucket);
    }

    // Apply collisions only to rows we processed this run; rows
    // outside this batch keep their existing within_pool counts to
    // avoid an O(pool) write storm on every run.
    const processedIdSet = new Set(processedIds);
    for (const [, rows] of byName) {
      if (rows.length < 2) continue;
      const others = rows.length - 1;
      for (const row of rows) {
        if (!processedIdSet.has(row.id)) continue;
        const reDerived = deriveGreenfieldFlag({
          psc_status: row.psc_status,
          psc_corporate_count: row.psc_corporate_count,
          psc_individual_count: row.psc_individual_count,
          director_active_appointments: row.director_active_appointments,
          within_pool_director_count: others,
        });
        const upd = await db()
          .from("prospects")
          .update({
            within_pool_director_count: others,
            greenfield_flag: reDerived,
          })
          .eq("id", row.id);
        if (upd.error) {
          console.warn(
            `[signals] within-pool update failed for ${row.id} — ${upd.error.message}`,
          );
          continue;
        }
        withinPoolUpdates++;
      }
    }
  }

  // Flag tallies for the summary, read back from DB so they reflect
  // the re-derived flags after the within-pool pass.
  if (processedIds.length > 0) {
    const flagsResult = await db()
      .from("prospects")
      .select("greenfield_flag")
      .in("id", processedIds);
    for (const row of flagsResult.data ?? []) {
      switch (row.greenfield_flag) {
        case "group_subsidiary":
          groupSubsidiary++;
          break;
        case "serial_operator":
          serialOperator++;
          break;
        case "sole_independent":
          soleIndependent++;
          break;
        case "unknown":
          unknownFlag++;
          break;
        case "standard":
          standard++;
          break;
      }
    }
  }

  const summary: SignalsSummary = {
    considered,
    processed,
    hitCap,
    pscPresent,
    pscNoneFiled,
    groupSubsidiary,
    serialOperator,
    soleIndependent,
    standard,
    unknown: unknownFlag,
    withinPoolUpdates,
    officerIdResolved,
    officerIdMissing,
    byPostcode,
    errors: { byBucket: errorsByBucket, examples: errorExamples },
    sample,
  };

  console.log("[signals] summary", summary);
  return summary;
}
