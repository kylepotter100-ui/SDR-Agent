"use client";

import { useTransition } from "react";

import { toggleStar, updateStatus } from "@/app/dashboard/prospects/actions";
import { Button } from "@/components/ui/button";
import type { ProspectStatus } from "@/lib/db.types";

export function ProspectActions({
  id,
  starred,
  status,
}: {
  id: string;
  starred: boolean;
  status: ProspectStatus;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex flex-wrap gap-2">
      <Button
        variant="secondary"
        size="sm"
        disabled={pending}
        onClick={() => startTransition(async () => { await toggleStar(id); })}
      >
        {starred ? "★ Starred" : "☆ Star"}
      </Button>
      {status !== "ignored" && (
        <Button
          variant="ghost"
          size="sm"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              await updateStatus(id, "ignored");
            })
          }
        >
          Ignore
        </Button>
      )}
    </div>
  );
}
