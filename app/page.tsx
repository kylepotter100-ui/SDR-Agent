import Link from "next/link";

import { LoginBanner } from "@/components/brand/login-banner";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
      <LoginBanner tagline="Autonomous prospecting" />
      <p className="text-center text-sm text-brand-near-black/70">
        The weekly pipeline runs via cron. The dashboard tracks every prospect
        from discovery through reply.
      </p>
      <div className="mt-8 flex justify-center">
        <Link
          href="/dashboard"
          className="inline-flex h-10 items-center justify-center rounded-md bg-brand-accent px-5 text-sm font-medium text-brand-cream transition-colors hover:bg-brand-accent/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/40"
        >
          Sign in
        </Link>
      </div>
    </main>
  );
}
