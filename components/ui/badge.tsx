import * as React from "react";

import { cn } from "@/lib/utils";
import type { ProspectStatus } from "@/lib/db.types";

const STATUS_STYLES: Record<ProspectStatus, string> = {
  new: "bg-neutral-100 text-neutral-700",
  surfaced: "bg-blue-100 text-blue-800",
  contacted: "bg-amber-100 text-amber-800",
  replied: "bg-violet-100 text-violet-800",
  qualified: "bg-green-100 text-green-800",
  dead: "bg-neutral-200 text-neutral-500",
  ignored: "bg-neutral-200 text-neutral-500 line-through",
};

export function StatusPill({ status }: { status: ProspectStatus }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize",
        STATUS_STYLES[status],
      )}
    >
      {status}
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
        "inline-flex items-center rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-700",
        className,
      )}
      {...props}
    />
  );
}
