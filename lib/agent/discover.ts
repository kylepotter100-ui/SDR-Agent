/**
 * Companies House discovery.
 *
 * Pulls UK incorporations from the last 7 days for the target SIC
 * codes (config-driven via lib/config.ts), filters them in code by
 * postcode prefix, caches raw responses into companies_house_raw, and
 * returns a summary suitable for spot-checking. Pure-ish: side
 * effects (HTTP, DB) are confined to this module; inputs come from
 * lib/config.ts and process.env.
 *
 * Prospect rows and enrichment land in Checkpoint 4; this module
 * only writes to companies_house_raw.
 */

import { db } from "@/lib/db";
import type { Json } from "@/lib/db.types";
import {
  POSTCODE_PREFIXES,
  SIC_CODES,
  SIC_CODE_LIST,
  SIC_TIERS,
  type PostcodePrefix,
} from "@/lib/config";

const CH_BASE_URL = "https://api.company-information.service.gov.uk";
const PAGE_SIZE = 100;
const LOOKBACK_DAYS = 7;
const PAGE_LIMIT = 50;

interface CompaniesHouseAddress {
  postal_code?: string;
}

interface CompaniesHouseItem {
  company_number: string;
  company_name: string;
  date_of_creation?: string;
  registered_office_address?: CompaniesHouseAddress;
  sic_codes?: string[];
}

interface CompaniesHouseSearchResponse {
  total_results?: number;
  items?: CompaniesHouseItem[];
}

interface QualifyingItem {
  company_number: string;
  company_name: string;
  postcode: string;
  postcode_prefix: PostcodePrefix;
  date_of_creation: string | null;
  sic_codes: string[];
  raw: Json;
}

export interface DiscoverSummary {
  window: { from: string; to: string };
  fetched: number;
  qualified: number;
  newlyCached: number;
  alreadyCached: number;
  byPostcode: Record<string, number>;
  byTier: Record<number, number>;
  sample: Array<{
    company_number: string;
    company_name: string;
    postcode: string;
    sic_codes: string[];
    date_of_creation: string | null;
  }>;
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

function ymdUtc(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function dateWindow(now: Date = new Date()): { from: string; to: string } {
  const from = new Date(now);
  from.setUTCDate(from.getUTCDate() - LOOKBACK_DAYS);
  return { from: ymdUtc(from), to: ymdUtc(now) };
}

function extractPrefix(
  postcode: string | undefined | null,
): PostcodePrefix | null {
  if (!postcode) return null;
  const match = postcode.toUpperCase().match(/^([A-Z]+)/);
  if (!match) return null;
  const prefix = match[1];
  return (POSTCODE_PREFIXES as readonly string[]).includes(prefix)
    ? (prefix as PostcodePrefix)
    : null;
}

function tierForSic(code: string): number | null {
  const found = SIC_CODES.find((c) => c.code === code);
  return found ? found.tier : null;
}

function bestTier(codes: string[]): number | null {
  let best: number | null = null;
  for (const code of codes) {
    const tier = tierForSic(code);
    if (tier !== null && (best === null || tier < best)) best = tier;
  }
  return best;
}

async function chFetch(path: string): Promise<Response> {
  const url = `${CH_BASE_URL}${path}`;
  const headers = {
    Authorization: chAuthHeader(),
    Accept: "application/json",
  };
  let res = await fetch(url, { headers });
  if (res.status === 429) {
    const retryAfter = Number(res.headers.get("retry-after") ?? "1");
    await new Promise((r) =>
      setTimeout(r, Math.max(retryAfter, 1) * 1000),
    );
    res = await fetch(url, { headers });
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `Companies House ${res.status} ${res.statusText}: ${body.slice(0, 500)}`,
    );
  }
  return res;
}

async function fetchAllPages(
  from: string,
  to: string,
): Promise<CompaniesHouseItem[]> {
  const items: CompaniesHouseItem[] = [];
  for (let page = 0; page < PAGE_LIMIT; page++) {
    const params = new URLSearchParams({
      incorporated_from: from,
      incorporated_to: to,
      sic_codes: SIC_CODE_LIST.join(","),
      size: String(PAGE_SIZE),
      start_index: String(page * PAGE_SIZE),
    });
    const res = await chFetch(
      `/advanced-search/companies?${params.toString()}`,
    );
    const body = (await res.json()) as CompaniesHouseSearchResponse;
    const batch = body.items ?? [];
    items.push(...batch);
    if (batch.length < PAGE_SIZE) return items;
  }
  throw new Error(
    `Companies House pagination exceeded ${PAGE_LIMIT} pages — investigate before re-running`,
  );
}

export async function discover(): Promise<DiscoverSummary> {
  const window = dateWindow();
  const rawItems = await fetchAllPages(window.from, window.to);

  const qualifying: QualifyingItem[] = [];
  for (const item of rawItems) {
    const postcode = item.registered_office_address?.postal_code;
    const prefix = extractPrefix(postcode);
    if (!prefix || !postcode) continue;
    qualifying.push({
      company_number: item.company_number,
      company_name: item.company_name,
      postcode: postcode.toUpperCase(),
      postcode_prefix: prefix,
      date_of_creation: item.date_of_creation ?? null,
      sic_codes: item.sic_codes ?? [],
      raw: item as unknown as Json,
    });
  }

  let newlyCached = 0;
  let alreadyCached = 0;

  if (qualifying.length > 0) {
    const numbers = qualifying.map((q) => q.company_number);
    const existing = await db()
      .from("companies_house_raw")
      .select("company_number")
      .in("company_number", numbers);
    if (existing.error) throw existing.error;
    const existingSet = new Set(
      existing.data?.map((r) => r.company_number) ?? [],
    );
    const inserts = qualifying
      .filter((q) => !existingSet.has(q.company_number))
      .map((q) => ({
        company_number: q.company_number,
        raw_data: q.raw,
      }));
    alreadyCached = qualifying.length - inserts.length;
    if (inserts.length > 0) {
      const ins = await db()
        .from("companies_house_raw")
        .insert(inserts);
      if (ins.error) throw ins.error;
      newlyCached = inserts.length;
    }
  }

  const byPostcode: Record<string, number> = Object.fromEntries(
    POSTCODE_PREFIXES.map((p) => [p, 0]),
  );
  const byTier: Record<number, number> = Object.fromEntries(
    SIC_TIERS.map((t) => [t.tier, 0]),
  );
  for (const q of qualifying) {
    byPostcode[q.postcode_prefix]++;
    const tier = bestTier(q.sic_codes);
    if (tier !== null) byTier[tier]++;
  }

  const sample = qualifying.slice(0, 5).map((q) => ({
    company_number: q.company_number,
    company_name: q.company_name,
    postcode: q.postcode,
    sic_codes: q.sic_codes,
    date_of_creation: q.date_of_creation,
  }));

  const summary: DiscoverSummary = {
    window,
    fetched: rawItems.length,
    qualified: qualifying.length,
    newlyCached,
    alreadyCached,
    byPostcode,
    byTier,
    sample,
  };

  console.log("[discover] window", summary.window);
  console.log(
    `[discover] fetched=${summary.fetched} qualified=${summary.qualified} newlyCached=${summary.newlyCached} alreadyCached=${summary.alreadyCached}`,
  );
  console.log("[discover] byPostcode", summary.byPostcode);
  console.log("[discover] byTier", summary.byTier);
  console.log("[discover] sample", summary.sample);

  return summary;
}
