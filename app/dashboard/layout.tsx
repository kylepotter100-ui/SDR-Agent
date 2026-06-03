import Link from "next/link";

import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Wordmark } from "@/components/brand/wordmark";
import { Nav } from "@/components/dashboard/nav";
import { signOut } from "./actions";

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
    <div className="min-h-screen bg-brand-cream">
      <header className="border-b border-brand-near-black/10 bg-brand-cream">
        <div className="mx-auto max-w-6xl px-4">
          <div className="flex h-14 items-center justify-between gap-3">
            <Link
              href="/dashboard"
              className="flex items-baseline gap-2 transition-opacity hover:opacity-80"
            >
              <Wordmark size="sm" />
              <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-brand-near-black/50">
                SDR
              </span>
            </Link>
            <div className="flex items-center gap-3">
              <span className="hidden font-mono text-xs text-brand-near-black/60 sm:inline">
                {user?.email}
              </span>
              <form action={signOut}>
                <Button variant="ghost" size="sm" type="submit">
                  Sign out
                </Button>
              </form>
            </div>
          </div>
          <Nav />
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}
