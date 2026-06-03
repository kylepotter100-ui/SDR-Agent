import * as React from "react";

import { cn } from "@/lib/utils";
import type { ProspectStatus } from "@/lib/db.types";

// Semantic colour mapping preserved; saturations tuned for the cream
// surface and text bumped to 800/900 for AA contrast.
const STATUS_STYLES: Record<ProspectStatus, string> = {
  new: "bg-brand-near-black/5 text-brand-near-black/70",
  surfaced: "bg-blue-100 text-blue-900",
  sent: "bg-amber-100 text-amber-900",
  replied: "bg-violet-100 text-violet-900",
  qualified: "bg-emerald-100 text-emerald-900",
  dead: "bg-brand-near-black/10 text-brand-near-black/50",
  opted_out: "bg-red-100 text-red-900",
  ignored: "bg-brand-near-black/10 text-brand-near-black/40 line-through",
};

export function StatusPill({ status }: { status: ProspectStatus }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize",
        STATUS_STYLES[status],
      )}
    >
      {status.replace(/_/g, " ")}
    </span>
  );
}

export function Badge({
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full bg-brand-near-black/5 px-2 py-0.5 text-xs font-medium text-brand-near-black/70",
        className,
      )}
      {...props}
    />
  );
}
