"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";

import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { LoginBanner } from "@/components/brand/login-banner";

const INPUT_CLASS =
  "h-10 rounded-md border border-brand-near-black/20 bg-white px-3 text-sm text-brand-near-black placeholder:text-brand-near-black/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/40";

function LoginForm() {
  const searchParams = useSearchParams();
  const from = searchParams.get("from") ?? "/dashboard";
  const safeFrom = from.startsWith("/") ? from : "/dashboard";

  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");

  async function sendCode(e: React.FormEvent) {
    e.preventDefault();
    setWorking(true);
    setError("");
    const supabase = createClient();
    // OTP code flow (not magic-link click): Microsoft 365 Safe Links
    // pre-visits magic-link URLs and burns the one-time token before
    // the user clicks. A 6-digit code has no URL to pre-visit. The
    // Supabase email template must send {{ .Token }} only (no
    // ConfirmationURL) — see the PR setup notes. emailRedirectTo is
    // kept as a defensive fallback if a link ever reappears.
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        shouldCreateUser: false,
        emailRedirectTo: `${window.location.origin}/auth/callback?from=${encodeURIComponent(safeFrom)}`,
      },
    });
    setWorking(false);
    if (error) {
      setError(error.message);
    } else {
      setStep("code");
    }
  }

  async function verifyCode(e: React.FormEvent) {
    e.preventDefault();
    setWorking(true);
    setError("");
    const supabase = createClient();
    const { error } = await supabase.auth.verifyOtp({
      email: email.trim(),
      token: code.trim(),
      type: "email",
    });
    if (error) {
      setWorking(false);
      setError(error.message);
    } else {
      // Full navigation so the middleware sees the freshly-set session
      // cookie on the next request.
      window.location.assign(safeFrom);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
      <LoginBanner tagline="SDR Agent" />
      <p className="text-center text-sm text-brand-near-black/70">
        {step === "email"
          ? "Sign in with a one-time code."
          : `Enter the 6-digit code sent to ${email}.`}
      </p>

      {step === "email" ? (
        <form onSubmit={sendCode} className="mt-6 flex flex-col gap-3">
          <input
            type="email"
            required
            autoComplete="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={INPUT_CLASS}
          />
          <Button type="submit" disabled={working}>
            {working ? "Sending…" : "Send code"}
          </Button>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </form>
      ) : (
        <form onSubmit={verifyCode} className="mt-6 flex flex-col gap-3">
          <input
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]*"
            maxLength={6}
            required
            placeholder="123456"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            className={`${INPUT_CLASS} tracking-widest`}
          />
          <Button type="submit" disabled={working}>
            {working ? "Verifying…" : "Verify and sign in"}
          </Button>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="button"
            onClick={() => {
              setStep("email");
              setCode("");
              setError("");
            }}
            className="text-sm text-brand-near-black/60 hover:text-brand-near-black"
          >
            Use a different email
          </button>
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
