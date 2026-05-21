import type { ProspectStatus } from "@/lib/db.types";
import { POSTCODE_PREFIXES, SIC_TIERS } from "@/lib/config";

export const PROSPECT_STATUSES: ProspectStatus[] = [
  "new",
  "surfaced",
  "sent",
  "replied",
  "qualified",
  "dead",
  "opted_out",
  "ignored",
];

export const SIC_TIER_VALUES: number[] = SIC_TIERS.map((t) => t.tier);

export interface ListFilters {
  statuses: ProspectStatus[];
  tiers: number[];
  postcodes: string[];
  email: "yes" | "no" | null;
  q: string;
}

export type RawSearchParams = Record<string, string | string[] | undefined>;

function csvList(v: string | string[] | undefined): string[] {
  if (!v) return [];
  const s = Array.isArray(v) ? v.join(",") : v;
  return s
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}

export function parseListFilters(sp: RawSearchParams): ListFilters {
  const statuses = csvList(sp.status).filter((s): s is ProspectStatus =>
    (PROSPECT_STATUSES as string[]).includes(s),
  );
  const tiers = csvList(sp.tier)
    .map(Number)
    .filter((n) => Number.isInteger(n) && SIC_TIER_VALUES.includes(n));
  const postcodes = csvList(sp.pc)
    .map((p) => p.toUpperCase())
    .filter((p) => (POSTCODE_PREFIXES as readonly string[]).includes(p));
  const emailRaw = typeof sp.email === "string" ? sp.email : null;
  const email = emailRaw === "yes" || emailRaw === "no" ? emailRaw : null;
  // Strip characters that have meaning in PostgREST's filter grammar so a
  // search term can't break or inject into the .or() filter string.
  const q = (typeof sp.q === "string" ? sp.q : "")
    .replace(/[,():*%\\]/g, "")
    .slice(0, 80);
  return { statuses, tiers, postcodes, email, q };
}

export function hasActiveFilters(f: ListFilters): boolean {
  return (
    f.statuses.length > 0 ||
    f.tiers.length > 0 ||
    f.postcodes.length > 0 ||
    f.email !== null ||
    f.q.length > 0
  );
}
