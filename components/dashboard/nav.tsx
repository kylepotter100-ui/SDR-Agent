"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/dashboard", label: "Home", exact: true },
  { href: "/dashboard/prospects", label: "Prospects" },
  { href: "/dashboard/digests", label: "Digests" },
  { href: "/dashboard/suppression", label: "Suppression" },
  { href: "/dashboard/pipeline-health", label: "Pipeline" },
  { href: "/dashboard/settings", label: "Settings" },
];

export function Nav() {
  const path = usePathname();
  return (
    <nav className="-mb-px flex gap-1 overflow-x-auto">
      {NAV.map(({ href, label, exact }) => {
        const active = exact
          ? path === href
          : path === href || path.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`relative whitespace-nowrap px-3 py-2 text-sm transition-colors ${
              active
                ? "text-brand-near-black after:absolute after:inset-x-3 after:-bottom-px after:h-0.5 after:bg-brand-accent"
                : "text-brand-near-black/60 hover:text-brand-near-black"
            }`}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
