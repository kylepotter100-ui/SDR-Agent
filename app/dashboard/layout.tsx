import Link from "next/link";

import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { signOut } from "./actions";

const NAV = [
  { href: "/dashboard", label: "Home" },
  { href: "/dashboard/prospects", label: "Prospects" },
  { href: "/dashboard/digests", label: "Digests" },
  { href: "/dashboard/suppression", label: "Suppression" },
  { href: "/dashboard/pipeline-health", label: "Pipeline" },
  { href: "/dashboard/settings", label: "Settings" },
];

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div className="min-h-screen bg-neutral-50">
      <header className="border-b border-neutral-200 bg-white">
        <div className="mx-auto max-w-5xl px-4">
          <div className="flex h-14 items-center justify-between">
            <span className="text-sm font-semibold text-neutral-900">
              KP SDR
            </span>
            <div className="flex items-center gap-3">
              <span className="hidden text-xs text-neutral-500 sm:inline">
                {user?.email}
              </span>
              <form action={signOut}>
                <Button variant="ghost" size="sm" type="submit">
                  Sign out
                </Button>
              </form>
            </div>
          </div>
          <nav className="-mb-px flex gap-1 overflow-x-auto">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="whitespace-nowrap px-3 py-2 text-sm text-neutral-600 hover:text-neutral-900"
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
    </div>
  );
}
