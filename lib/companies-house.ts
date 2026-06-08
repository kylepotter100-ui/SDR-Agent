/**
 * Companies House Public Data API client.
 *
 * Shared by lib/agent/discover.ts (advanced-search) and lib/agent/apollo.ts
 * (officers lookup for director name). Thin wrapper around fetch — HTTP
 * Basic auth with COMPANIES_HOUSE_API_KEY as the username and an empty
 * password per the API docs, single conditional retry on 429.
 */

export const CH_BASE_URL = "https://api.company-information.service.gov.uk";

export class CompaniesHouseError extends Error {
  status: number;
  bodySnippet: string;
  constructor(status: number, statusText: string, bodySnippet: string) {
    super(`Companies House ${status} ${statusText}: ${bodySnippet}`);
    this.name = "CompaniesHouseError";
    this.status = status;
    this.bodySnippet = bodySnippet;
  }
}

function chAuthHeader(): string {
  const key = process.env.COMPANIES_HOUSE_API_KEY;
  if (!key) {
    throw new Error(
      "Missing required environment variable: COMPANIES_HOUSE_API_KEY",
    );
  }
  return `Basic ${Buffer.from(`${key}:`).toString("base64")}`;
}

export async function chFetch(path: string): Promise<Response> {
  const url = `${CH_BASE_URL}${path}`;
  const headers = {
    Authorization: chAuthHeader(),
    Accept: "application/json",
  };
  let res = await fetch(url, { headers });
  if (res.status === 429) {
    const retryAfter = Number(res.headers.get("retry-after") ?? "1");
    await new Promise((r) => setTimeout(r, Math.max(retryAfter, 1) * 1000));
    res = await fetch(url, { headers });
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new CompaniesHouseError(res.status, res.statusText, body.slice(0, 500));
  }
  return res;
}

export interface Officer {
  name: string;
  officer_role: string;
  appointed_on?: string;
  resigned_on?: string;
}

export interface OfficerWithLinks extends Officer {
  officer_id: string | null;
}

interface RawOfficer extends Officer {
  links?: {
    officer?: {
      appointments?: string;
    };
  };
}

interface OfficersResponse {
  items?: RawOfficer[];
}

/**
 * CH returns each officer's appointments URL as
 * "/officers/{id}/appointments". Extract the id segment; return null
 * if the field is absent or shaped unexpectedly.
 */
function extractOfficerId(appointmentsPath: string | undefined): string | null {
  if (!appointmentsPath) return null;
  const match = appointmentsPath.match(/\/officers\/([^/]+)\/appointments/);
  return match ? match[1] : null;
}

/**
 * Returns officers for a company alongside their internal CH officer
 * IDs (extracted from links.officer.appointments). The officer ID is
 * what /officers/{id}/appointments accepts, so resolving it once here
 * avoids a second officers fetch in the signals stage.
 *
 * 404 → empty list, matching the behaviour of fetchOfficers.
 */
export async function fetchOfficersWithLinks(
  companyNumber: string,
): Promise<OfficerWithLinks[]> {
  try {
    const res = await chFetch(
      `/company/${encodeURIComponent(companyNumber)}/officers?items_per_page=20`,
    );
    const body = (await res.json()) as OfficersResponse;
    return (body.items ?? []).map((o) => ({
      name: o.name,
      officer_role: o.officer_role,
      appointed_on: o.appointed_on,
      resigned_on: o.resigned_on,
      officer_id: extractOfficerId(o.links?.officer?.appointments),
    }));
  } catch (err) {
    if (err instanceof CompaniesHouseError && err.status === 404) {
      return [];
    }
    throw err;
  }
}

/**
 * Returns active officers for a company. 404 is treated as an empty
 * list because very-new incorporations sometimes appear before their
 * officer records are indexed — common, not exceptional.
 *
 * Thin projection over fetchOfficersWithLinks so callers that don't
 * need the officer id (currently none — apollo and signals both call
 * the linked variant) can keep the existing shape.
 */
export async function fetchOfficers(
  companyNumber: string,
): Promise<Officer[]> {
  const officers = await fetchOfficersWithLinks(companyNumber);
  return officers.map((o) => ({
    name: o.name,
    officer_role: o.officer_role,
    appointed_on: o.appointed_on,
    resigned_on: o.resigned_on,
  }));
}

export interface PscSummary {
  corporateCount: number;
  individualCount: number;
  totalCount: number;
  status: "present" | "none_filed" | "unknown";
}

type PscKind =
  | "individual-person-with-significant-control"
  | "corporate-entity-person-with-significant-control"
  | "legal-person-person-with-significant-control"
  | "super-secure-person-with-significant-control"
  | string;

interface RawPscItem {
  kind?: PscKind;
}

interface PscResponse {
  items?: RawPscItem[];
}

/**
 * Returns a PSC summary for a company.
 *
 * - 404 → none filed (very-new incorporations often haven't yet).
 * - corporate-entity and legal-person kinds count as corporate
 *   (parent-controls-subsidiary signal).
 * - individual kinds count as individual.
 * - super-secure (anonymised) and *-statement items count toward
 *   totalCount only.
 * - status === "unknown" when the only items present are statements
 *   or super-secure (no named controller, can't decide greenfield).
 */
export async function fetchPsc(companyNumber: string): Promise<PscSummary> {
  let res: Response;
  try {
    res = await chFetch(
      `/company/${encodeURIComponent(companyNumber)}/persons-with-significant-control?items_per_page=50`,
    );
  } catch (err) {
    if (err instanceof CompaniesHouseError && err.status === 404) {
      return {
        corporateCount: 0,
        individualCount: 0,
        totalCount: 0,
        status: "none_filed",
      };
    }
    throw err;
  }
  const body = (await res.json()) as PscResponse;
  const items = body.items ?? [];

  let corporate = 0;
  let individual = 0;
  for (const item of items) {
    const kind = item.kind ?? "";
    if (
      kind === "corporate-entity-person-with-significant-control" ||
      kind === "legal-person-person-with-significant-control"
    ) {
      corporate++;
    } else if (kind === "individual-person-with-significant-control") {
      individual++;
    }
  }

  let status: PscSummary["status"];
  if (items.length === 0) status = "none_filed";
  else if (corporate === 0 && individual === 0) status = "unknown";
  else status = "present";

  return {
    corporateCount: corporate,
    individualCount: individual,
    totalCount: items.length,
    status,
  };
}

interface AppointmentItem {
  resigned_on?: string;
}

interface AppointmentsResponse {
  items?: AppointmentItem[];
}

/**
 * Returns the number of currently-active appointments for an officer.
 * Capped at the items_per_page=50 page size — anything past 50 is
 * already an unambiguous serial operator and we don't paginate.
 *
 * 404 → 0 (officer ID exists but appointments aren't indexed yet;
 * very rare).
 */
export async function countActiveAppointments(
  officerId: string,
): Promise<number> {
  try {
    const res = await chFetch(
      `/officers/${encodeURIComponent(officerId)}/appointments?items_per_page=50`,
    );
    const body = (await res.json()) as AppointmentsResponse;
    return (body.items ?? []).filter((i) => !i.resigned_on).length;
  } catch (err) {
    if (err instanceof CompaniesHouseError && err.status === 404) {
      return 0;
    }
    throw err;
  }
}
