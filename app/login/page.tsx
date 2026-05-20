"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";

import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";

function LoginForm() {
  const searchParams = useSearchParams();
  const from = searchParams.get("from") ?? "/dashboard";
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">(
    "idle",
  );
  const [message, setMessage] = useState("");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("sending");
    setMessage("");
    const supabase = createClient();
    const redirectTo = `${window.location.origin}/auth/callback?from=${encodeURIComponent(from)}`;
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        emailRedirectTo: redirectTo,
        // Only existing users get a link. Kyle's user is pre-created in
        // Supabase; public signups are disabled. A non-allowlisted email
        // therefore gets no link, and middleware refuses any session that
        // isn't the allowlisted address.
        shouldCreateUser: false,
      },
    });
    if (error) {
      setStatus("error");
      setMessage(error.message);
    } else {
      setStatus("sent");
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6">
      <h1 className="text-xl font-semibold text-neutral-900">
        KP SDR Dashboard
      </h1>
      <p className="mt-1 text-sm text-neutral-500">
        Sign in with a magic link.
      </p>
      {status === "sent" ? (
        <p className="mt-6 rounded-md bg-green-50 px-4 py-3 text-sm text-green-800">
          Check your inbox — a sign-in link is on its way.
        </p>
      ) : (
        <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-3">
          <input
            type="email"
            required
            autoComplete="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="h-10 rounded-md border border-neutral-300 px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400"
          />
          <Button type="submit" disabled={status === "sending"}>
            {status === "sending" ? "Sending…" : "Send magic link"}
          </Button>
          {status === "error" && (
            <p className="text-sm text-red-600">{message}</p>
          )}
        </form>
      )}
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
