"use client";

import { useTransition } from "react";

import { updateStatus } from "@/app/dashboard/prospects/actions";
import { PROSPECT_STATUSES } from "@/lib/dashboard/filters";
import { cn } from "@/lib/utils";
import type { ProspectStatus } from "@/lib/db.types";

export function StatusSelect({
  id,
  status,
}: {
  id: string;
  status: ProspectStatus;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <select
      aria-label="Prospect status"
      value={status}
      disabled={pending}
      onChange={(e) => {
        const next = e.target.value;
        startTransition(async () => {
          await updateStatus(id, next);
        });
      }}
      className={cn(
        "h-9 rounded-md border border-neutral-300 bg-white px-2 text-sm capitalize focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400",
        pending && "opacity-50",
      )}
    >
      {PROSPECT_STATUSES.map((s) => (
        <option key={s} value={s}>
          {s.replace(/_/g, " ")}
        </option>
      ))}
    </select>
  );
}
