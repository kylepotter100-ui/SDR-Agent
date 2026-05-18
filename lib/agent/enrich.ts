/**
 * Google Places enrichment.
 *
 * Reads cached raw companies from companies_house_raw that don't yet
 * have a prospects row, calls Google Places (New) searchText for each
 * to determine website / Facebook / Maps presence, derives the
 * prospect-level fields (SIC tier, fit weight, address), and inserts
 * one prospect row per company.
 *
 * Capped per-run to bound cost. Director name / email come in
 * Checkpoint 5; personalisation, ranking, digest, cron come later.
 */

import { db } from "@/lib/db";
import {
  POSTCODE_PREFIXES,
  SIC_CODES,
  type PostcodePrefix,
  type SicCode,
} from "@/lib/config";

const PLACES_URL = "https://places.googleapis.com/v1/places:searchText";
const FIELD_MASK = "places.id,places.displayName,places.websiteUri,places.formattedAddress";
const MAX_ENRICH_PER_RUN = 100;
const COST_PER_LOOKUP_GBP = 0.013;

interface CompaniesHouseAddress {
  address_line_1?: string;
  address_line_2?: string;
  locality?: string;
  region?: string;
  postal_code?: string;
  country?: string;
}

interface CompaniesHouseItem {
  company_number: string;
  company_name: string;
  date_of_creation?: string;
  registered_office_address?: CompaniesHouseAddress;
  sic_codes?: string[];
}

interface PlacesSearchResponse {
  places?: Array<{
    id?: string;
    displayName?: { text?: string };
    websiteUri?: string;
    formattedAddress?: string;
  }>;
}

interface MapsOutcome {
  has_website: boolean | null;
  website_url: string | null;
  facebook_url: string | null;
  maps_place_id: string | null;
  observable_signal: string;
}

export interface EnrichSummary {
  considered: number;
  enriched: number;
  skippedNoSicMatch: number;
  skippedError: number;
  hitCap: boolean;
  withWebsite: number;
  facebookOnly: number;
  noMapsPresence: number;
  mapsListedNoWebsite: number;
  byPostcode: Record<string, number>;
  estimatedCostGbp: number;
  sample: Array<{
    company_number: string;
    company_name: string;
    postcode: string;
    sic_code: string;
    sic_tier: number;
    has_website: boolean | null;
    website_url: string | null;
    facebook_url: string | null;
    observable_signal: string;
  }>;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
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

function pickBestSic(codes: string[] | undefined): SicCode | null {
  if (!codes) return null;
  let best: SicCode | null = null;
  for (const code of codes) {
    const match = SIC_CODES.find((c) => c.code === code);
    if (match && (best === null || match.tier < best.tier)) {
      best = match;
    }
  }
  return best;
}

function tierFitWeight(tier: number): number {
  const weights: Record<number, number> = {
    1: 1.0,
    2: 0.9,
    3: 0.7,
    4: 0.6,
    5: 0.8,
    6: 0.5,
  };
  return weights[tier] ?? 0.5;
}

function joinAddress(addr: CompaniesHouseAddress | undefined): string | null {
  if (!addr) return null;
  const parts = [
    addr.address_line_1,
    addr.address_line_2,
    addr.locality,
    addr.region,
    addr.postal_code,
  ].filter((s): s is string => Boolean(s && s.trim()));
  return parts.length > 0 ? parts.join(", ") : null;
}

function townForQuery(addr: CompaniesHouseAddress | undefined): string {
  return addr?.locality?.trim() || addr?.postal_code?.trim() || "";
}

async function searchPlace(
  companyName: string,
  town: string,
): Promise<PlacesSearchResponse> {
  const apiKey = requireEnv("GOOGLE_PLACES_API_KEY");
  const textQuery = [companyName, town, "UK"].filter(Boolean).join(", ");
  const headers = {
    "Content-Type": "application/json",
    "X-Goog-Api-Key": apiKey,
    "X-Goog-FieldMask": FIELD_MASK,
  };
  const body = JSON.stringify({ textQuery });

  let res = await fetch(PLACES_URL, { method: "POST", headers, body });
  if (res.status === 429 || res.status === 500) {
    const retryAfter = Number(res.headers.get("retry-after") ?? "1");
    await new Promise((r) => setTimeout(r, Math.max(retryAfter, 1) * 1000));
    res = await fetch(PLACES_URL, { method: "POST", headers, body });
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `Google Places ${res.status} ${res.statusText}: ${text.slice(0, 500)}`,
    );
  }
  return (await res.json()) as PlacesSearchResponse;
}

function mapPlacesResponse(resp: PlacesSearchResponse): MapsOutcome {
  const place = resp.places?.[0];
  if (!place) {
    return {
      has_website: null,
      website_url: null,
      facebook_url: null,
      maps_place_id: null,
      observable_signal: "No Google Maps presence — very new business",
    };
  }
  const websiteUri = place.websiteUri ?? null;
  const placeId = place.id ?? null;
  if (!websiteUri) {
    return {
      has_website: false,
      website_url: null,
      facebook_url: null,
      maps_place_id: placeId,
      observable_signal: "Google Maps listed, no website found",
    };
  }
  if (websiteUri.toLowerCase().includes("facebook.com")) {
    return {
      has_website: false,
      website_url: null,
      facebook_url: websiteUri,
      maps_place_id: placeId,
      observable_signal: "Facebook-only, no website",
    };
  }
  return {
    has_website: true,
    website_url: websiteUri,
    facebook_url: null,
    maps_place_id: placeId,
    observable_signal: "Website found",
  };
}

async function selectUnenrichedRaw(): Promise<
  Array<{ company_number: string; raw: CompaniesHouseItem }>
> {
  const existing = await db().from("prospects").select("company_number");
  if (existing.error) throw existing.error;
  const enrichedNumbers = new Set(
    existing.data?.map((r) => r.company_number) ?? [],
  );

  const raw = await db()
    .from("companies_house_raw")
    .select("company_number, raw_data")
    .order("fetched_at", { ascending: true });
  if (raw.error) throw raw.error;

  const rows: Array<{ company_number: string; raw: CompaniesHouseItem }> = [];
  for (const r of raw.data ?? []) {
    if (enrichedNumbers.has(r.company_number)) continue;
    rows.push({
      company_number: r.company_number,
      raw: r.raw_data as unknown as CompaniesHouseItem,
    });
  }
  return rows;
}

export async function enrich(): Promise<EnrichSummary> {
  const candidates = await selectUnenrichedRaw();
  const considered = candidates.length;
  const batch = candidates.slice(0, MAX_ENRICH_PER_RUN);
  const hitCap = considered > MAX_ENRICH_PER_RUN;

  let enriched = 0;
  let skippedNoSicMatch = 0;
  let skippedError = 0;
  let withWebsite = 0;
  let facebookOnly = 0;
  let noMapsPresence = 0;
  let mapsListedNoWebsite = 0;
  let lookupCalls = 0;

  const byPostcode: Record<string, number> = Object.fromEntries(
    POSTCODE_PREFIXES.map((p) => [p, 0]),
  );
  const sample: EnrichSummary["sample"] = [];

  for (const { company_number, raw } of batch) {
    const sic = pickBestSic(raw.sic_codes);
    if (!sic) {
      console.warn(
        `[enrich] skip ${company_number}: no qualifying SIC code on raw item`,
      );
      skippedNoSicMatch++;
      continue;
    }

    const addr = raw.registered_office_address;
    const postcode = addr?.postal_code?.toUpperCase() ?? "";
    const prefix = extractPrefix(postcode);
    if (!prefix) {
      console.warn(
        `[enrich] skip ${company_number}: postcode '${postcode}' outside target prefixes`,
      );
      skippedNoSicMatch++;
      continue;
    }

    const town = townForQuery(addr);
    let outcome: MapsOutcome;
    try {
      lookupCalls++;
      const resp = await searchPlace(raw.company_name, town);
      outcome = mapPlacesResponse(resp);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(
        `[enrich] skip ${company_number} (${raw.company_name}): Places lookup failed — ${message}`,
      );
      skippedError++;
      continue;
    }

    const insert = await db()
      .from("prospects")
      .insert({
        company_number,
        company_name: raw.company_name,
        sic_code: sic.code,
        sic_description: sic.description,
        sic_tier: sic.tier,
        fit_weight: tierFitWeight(sic.tier),
        postcode,
        registered_address: joinAddress(addr),
        incorporated_on: raw.date_of_creation ?? null,
        has_website: outcome.has_website,
        website_url: outcome.website_url,
        facebook_url: outcome.facebook_url,
        maps_place_id: outcome.maps_place_id,
        observable_signal: outcome.observable_signal,
      });
    if (insert.error) {
      console.warn(
        `[enrich] skip ${company_number}: prospect insert failed — ${insert.error.message}`,
      );
      skippedError++;
      continue;
    }

    enriched++;
    byPostcode[prefix]++;
    if (outcome.has_website === true) withWebsite++;
    else if (outcome.facebook_url) facebookOnly++;
    else if (outcome.has_website === null) noMapsPresence++;
    else mapsListedNoWebsite++;

    if (sample.length < 5) {
      sample.push({
        company_number,
        company_name: raw.company_name,
        postcode,
        sic_code: sic.code,
        sic_tier: sic.tier,
        has_website: outcome.has_website,
        website_url: outcome.website_url,
        facebook_url: outcome.facebook_url,
        observable_signal: outcome.observable_signal,
      });
    }
  }

  const summary: EnrichSummary = {
    considered,
    enriched,
    skippedNoSicMatch,
    skippedError,
    hitCap,
    withWebsite,
    facebookOnly,
    noMapsPresence,
    mapsListedNoWebsite,
    byPostcode,
    estimatedCostGbp: Number((lookupCalls * COST_PER_LOOKUP_GBP).toFixed(3)),
    sample,
  };

  console.log("[enrich] summary", summary);
  return summary;
}
