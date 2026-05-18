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

interface OfficersResponse {
  items?: Officer[];
}

/**
 * Returns active officers for a company. 404 is treated as an empty
 * list because very-new incorporations sometimes appear before their
 * officer records are indexed — common, not exceptional.
 */
export async function fetchOfficers(
  companyNumber: string,
): Promise<Officer[]> {
  try {
    const res = await chFetch(
      `/company/${encodeURIComponent(companyNumber)}/officers?items_per_page=20`,
    );
    const body = (await res.json()) as OfficersResponse;
    return body.items ?? [];
  } catch (err) {
    if (err instanceof CompaniesHouseError && err.status === 404) {
      return [];
    }
    throw err;
  }
}
