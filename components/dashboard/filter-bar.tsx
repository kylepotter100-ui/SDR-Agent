"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { PROSPECT_STATUSES, SIC_TIER_VALUES } from "@/lib/dashboard/filters";
import { POSTCODE_PREFIXES } from "@/lib/config";

function Chip({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "rounded-full border px-3 py-1 text-xs font-medium capitalize transition-colors",
        active
          ? "border-brand-accent bg-brand-accent text-brand-cream"
          : "border-brand-near-black/15 bg-white text-brand-near-black/70 hover:bg-brand-near-black/5",
      )}
    >
      {label}
    </button>
  );
}

function Group({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="font-mono text-xs uppercase tracking-wide text-brand-near-black/50">
        {label}
      </span>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

export function FilterBar({ resultCount }: { resultCount: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [search, setSearch] = useState(searchParams.get("q") ?? "");

  const pushParams = useCallback(
    (next: URLSearchParams) => {
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [router, pathname],
  );

  const toggleCsv = useCallback(
    (key: string, value: string) => {
      const next = new URLSearchParams(searchParams.toString());
      const current = (next.get(key) ?? "").split(",").filter(Boolean);
      const updated = current.includes(value)
        ? current.filter((v) => v !== value)
        : [...current, value];
      if (updated.length) next.set(key, updated.join(","));
      else next.delete(key);
      pushParams(next);
    },
    [searchParams, pushParams],
  );

  const setSingle = useCallback(
    (key: string, value: string | null) => {
      const next = new URLSearchParams(searchParams.toString());
      if (value === null) next.delete(key);
      else next.set(key, value);
      pushParams(next);
    },
    [searchParams, pushParams],
  );

  // Debounce the text search into the URL.
  useEffect(() => {
    const handle = setTimeout(() => {
      const current = searchParams.get("q") ?? "";
      if (search !== current) {
        const next = new URLSearchParams(searchParams.toString());
        if (search.trim()) next.set("q", search.trim());
        else next.delete("q");
        pushParams(next);
      }
    }, 300);
    return () => clearTimeout(handle);
  }, [search, searchParams, pushParams]);

  const has = (key: string, value: string) =>
    (searchParams.get(key) ?? "").split(",").includes(value);
  const emailFilter = searchParams.get("email");
  const active = Boolean(
    searchParams.get("status") ||
      searchParams.get("tier") ||
      searchParams.get("pc") ||
      searchParams.get("email") ||
      searchParams.get("q"),
  );

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-brand-near-black/10 bg-white/60 p-4">
      <Input
        type="search"
        placeholder="Search company or director name…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      <Group label="Status">
        {PROSPECT_STATUSES.map((s) => (
          <Chip
            key={s}
            label={s.replace(/_/g, " ")}
            active={has("status", s)}
            onClick={() => toggleCsv("status", s)}
          />
        ))}
      </Group>

      <Group label="SIC tier">
        {SIC_TIER_VALUES.map((t) => (
          <Chip
            key={t}
            label={`Tier ${t}`}
            active={has("tier", String(t))}
            onClick={() => toggleCsv("tier", String(t))}
          />
        ))}
      </Group>

      <Group label="Postcode">
        {POSTCODE_PREFIXES.map((p) => (
          <Chip
            key={p}
            label={p}
            active={has("pc", p)}
            onClick={() => toggleCsv("pc", p)}
          />
        ))}
      </Group>

      <Group label="Director email">
        <Chip
          label="Has email"
          active={emailFilter === "yes"}
          onClick={() =>
            setSingle("email", emailFilter === "yes" ? null : "yes")
          }
        />
        <Chip
          label="No email"
          active={emailFilter === "no"}
          onClick={() =>
            setSingle("email", emailFilter === "no" ? null : "no")
          }
        />
      </Group>

      <div className="flex items-center justify-between border-t border-brand-near-black/10 pt-3 text-sm">
        <span className="text-brand-near-black/60">
          {active ? (
            <>
              Filtered —{" "}
              <strong className="font-mono text-brand-near-black">
                {resultCount}
              </strong>{" "}
              {resultCount === 1 ? "prospect" : "prospects"}
            </>
          ) : (
            <>
              Showing all —{" "}
              <strong className="font-mono text-brand-near-black">
                {resultCount}
              </strong>{" "}
              {resultCount === 1 ? "prospect" : "prospects"}
            </>
          )}
        </span>
        {active && (
          <button
            type="button"
            onClick={() => {
              setSearch("");
              router.replace(pathname, { scroll: false });
            }}
            className="text-brand-near-black/60 underline hover:text-brand-near-black"
          >
            Clear filters
          </button>
        )}
      </div>
    </div>
  );
}
