import Link from "next/link";

import { createClient } from "@/lib/supabase/server";
import { StatusPill } from "@/components/ui/badge";
import { FilterBar } from "@/components/dashboard/filter-bar";
import {
  parseListFilters,
  type RawSearchParams,
} from "@/lib/dashboard/filters";

const RESULT_CAP = 200;

interface ProspectRow {
  id: string;
  company_name: string;
  postcode: string;
  sic_tier: number;
  status: import("@/lib/db.types").ProspectStatus;
  ranking_score: number | null;
  director_email: string | null;
  last_action_at: string | null;
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  });
}

export default async function ProspectsPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const sp = await searchParams;
  const filters = parseListFilters(sp);
  const supabase = await createClient();

  let query = supabase
    .from("prospects")
    .select(
      "id, company_name, postcode, sic_tier, status, ranking_score, director_email, last_action_at",
    )
    .limit(RESULT_CAP);

  if (filters.statuses.length) query = query.in("status", filters.statuses);
  if (filters.tiers.length) query = query.in("sic_tier", filters.tiers);
  if (filters.postcodes.length) {
    query = query.or(
      filters.postcodes.map((p) => `postcode.ilike.${p}%`).join(","),
    );
  }
  if (filters.email === "yes") query = query.not("director_email", "is", null);
  if (filters.email === "no") query = query.is("director_email", null);
  if (filters.q) {
    query = query.or(
      `company_name.ilike.%${filters.q}%,director_name.ilike.%${filters.q}%`,
    );
  }
  query = query
    .order("ranking_score", { ascending: false, nullsFirst: false })
    .order("surfaced_in_digest_at", { ascending: false, nullsFirst: false });

  const { data, error } = await query;
  if (error) {
    return (
      <div className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">
        Failed to load prospects: {error.message}
      </div>
    );
  }
  const rows = (data ?? []) as ProspectRow[];

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-lg font-semibold text-neutral-900">Prospects</h1>

      <FilterBar resultCount={rows.length} />

      {rows.length >= RESULT_CAP && (
        <p className="text-xs text-amber-700">
          Showing the first {RESULT_CAP}. Narrow your filter to see the rest.
        </p>
      )}

      {rows.length === 0 ? (
        <p className="text-sm text-neutral-500">
          No prospects match these filters.
        </p>
      ) : (
        <>
          {/* Desktop table */}
          <table className="hidden w-full border-collapse text-sm sm:table">
            <thead>
              <tr className="border-b border-neutral-200 text-left text-xs uppercase tracking-wide text-neutral-400">
                <th className="py-2 pr-3 font-medium">Company</th>
                <th className="py-2 pr-3 font-medium">Postcode</th>
                <th className="py-2 pr-3 font-medium">Tier</th>
                <th className="py-2 pr-3 font-medium">Status</th>
                <th className="py-2 pr-3 font-medium">Score</th>
                <th className="py-2 pr-3 font-medium">Last action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr
                  key={p.id}
                  className="border-b border-neutral-100 hover:bg-neutral-50"
                >
                  <td className="py-2 pr-3">
                    <Link
                      href={`/dashboard/prospects/${p.id}`}
                      className="font-medium text-neutral-900 hover:underline"
                    >
                      {p.company_name}
                    </Link>
                  </td>
                  <td className="py-2 pr-3 text-neutral-600">{p.postcode}</td>
                  <td className="py-2 pr-3 text-neutral-600">{p.sic_tier}</td>
                  <td className="py-2 pr-3">
                    <StatusPill status={p.status} />
                  </td>
                  <td className="py-2 pr-3 text-neutral-600">
                    {p.ranking_score ?? "—"}
                  </td>
                  <td className="py-2 pr-3 text-neutral-500">
                    {formatDate(p.last_action_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Mobile cards */}
          <ul className="flex flex-col gap-2 sm:hidden">
            {rows.map((p) => (
              <li key={p.id}>
                <Link
                  href={`/dashboard/prospects/${p.id}`}
                  className="block rounded-lg border border-neutral-200 bg-white p-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-medium text-neutral-900">
                      {p.company_name}
                    </span>
                    <StatusPill status={p.status} />
                  </div>
                  <div className="mt-1 text-xs text-neutral-500">
                    {p.postcode} · Tier {p.sic_tier} · Score{" "}
                    {p.ranking_score ?? "—"}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
