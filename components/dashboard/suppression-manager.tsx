"use client";

import { useState, useTransition } from "react";

import {
  addSuppression,
  removeSuppression,
} from "@/app/dashboard/suppression/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export interface SuppressionEntry {
  email: string;
  reason: string;
  added_at: string;
  notes: string | null;
}

export function SuppressionManager({
  entries,
}: {
  entries: SuppressionEntry[];
}) {
  const [email, setEmail] = useState("");
  const [reason, setReason] = useState("manual_block");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex flex-col gap-4">
      <form
        className="flex flex-col gap-2 rounded-lg border border-brand-near-black/10 bg-white/60 p-4 sm:flex-row sm:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          setError("");
          startTransition(async () => {
            try {
              await addSuppression(email, reason, notes);
              setEmail("");
              setNotes("");
            } catch (err) {
              setError(err instanceof Error ? err.message : "Failed to add");
            }
          });
        }}
      >
        <label className="flex flex-1 flex-col gap-1 font-mono text-xs uppercase tracking-wide text-brand-near-black/50">
          Email
          <Input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="someone@example.com"
          />
        </label>
        <label className="flex flex-col gap-1 font-mono text-xs uppercase tracking-wide text-brand-near-black/50">
          Reason
          <select
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="h-9 rounded-md border border-brand-near-black/20 bg-white px-2 text-sm text-brand-near-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/40"
          >
            <option value="manual_block">manual_block</option>
            <option value="unsubscribe">unsubscribe</option>
            <option value="bounce">bounce</option>
          </select>
        </label>
        <label className="flex flex-1 flex-col gap-1 font-mono text-xs uppercase tracking-wide text-brand-near-black/50">
          Notes
          <Input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </label>
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Adding…" : "Add"}
        </Button>
      </form>
      {error && <p className="text-sm text-red-600">{error}</p>}

      {entries.length === 0 ? (
        <p className="text-sm text-brand-near-black/55">
          Nothing suppressed. Addresses added here are skipped by the agent.
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-brand-near-black/5 rounded-lg border border-brand-near-black/10 bg-white/60">
          {entries.map((entry) => (
            <li
              key={entry.email}
              className="flex items-center justify-between gap-3 px-4 py-3"
            >
              <div className="min-w-0">
                <div className="truncate text-sm font-medium text-brand-near-black">
                  {entry.email}
                </div>
                <div className="font-mono text-xs text-brand-near-black/55">
                  {entry.reason}
                  {entry.notes ? ` · ${entry.notes}` : ""}
                </div>
              </div>
              <RemoveButton email={entry.email} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function RemoveButton({ email }: { email: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await removeSuppression(email);
        })
      }
    >
      Remove
    </Button>
  );
}
