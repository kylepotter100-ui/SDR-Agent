import { NextResponse } from "next/server";

import {
  fetchOfficersWithLinks,
  fetchPsc,
  countActiveAppointments,
} from "@/lib/companies-house";
import { pickDirector } from "@/lib/agent/apollo";
import { deriveGreenfieldFlag } from "@/lib/agent/signals";
import { requireCronAuth } from "@/lib/cron-auth";

/**
 * Smoke test for the signals stage's CH integration.
 *
 * POST with { company_number: "12345678" }. Runs the same three CH
 * lookups the signals stage runs — PSC, officers, appointments — and
 * returns the derived greenfield_flag without persisting anything.
 *
 * within_pool_director_count is fixed at 0 here because it requires
 * the live prospects pool to compute; the preview is intended for
 * checking the CH-derived inputs and the flag derivation on individual
 * companies, not for replicating the full stage. Hit it against:
 *  - a Potter-Sanctuary-shaped sole trader (expect sole_independent)
 *  - a known subsidiary of an existing group (expect group_subsidiary)
 *  - a known serial-operator director (expect serial_operator)
 *
 * Bearer-authed against CRON_SECRET, same as the other /api/dev/* routes.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface PreviewBody {
  company_number?: string;
}

export async function POST(request: Request) {
  const denied = requireCronAuth(request);
  if (denied) return denied;

  let body: PreviewBody;
  try {
    body = (await request.json()) as PreviewBody;
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  const companyNumber = body.company_number?.trim();
  if (!companyNumber) {
    return NextResponse.json(
      { error: "Missing company_number" },
      { status: 400 },
    );
  }

  try {
    const psc = await fetchPsc(companyNumber);
    const officers = await fetchOfficersWithLinks(companyNumber);
    const picked = pickDirector(officers);

    let activeAppointments: number | null = null;
    if (picked?.officer_id) {
      activeAppointments = await countActiveAppointments(picked.officer_id);
    }

    const flag = deriveGreenfieldFlag({
      psc_status: psc.status,
      psc_corporate_count: psc.corporateCount,
      psc_individual_count: psc.individualCount,
      director_active_appointments: activeAppointments,
      within_pool_director_count: 0,
    });

    return NextResponse.json({
      company_number: companyNumber,
      psc: {
        status: psc.status,
        corporate_count: psc.corporateCount,
        individual_count: psc.individualCount,
        total_count: psc.totalCount,
      },
      director: picked
        ? {
            raw_name: picked.raw,
            flipped_name: picked.flipped,
            officer_id: picked.officer_id,
          }
        : null,
      director_active_appointments: activeAppointments,
      greenfield_flag: flag,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[signals-preview] failed", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
