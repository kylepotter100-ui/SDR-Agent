"use client";

import { useTransition } from "react";

import { suppressProspect } from "@/app/dashboard/suppression/actions";
import { Button } from "@/components/ui/button";

export function SuppressButton({
  id,
  email,
}: {
  id: string;
  email: string;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={pending}
      onClick={() => {
        if (
          !confirm(
            `Suppress ${email}? This adds it to the suppression list and sets the prospect to opted out — the agent will skip it.`,
          )
        ) {
          return;
        }
        startTransition(async () => {
          await suppressProspect(id, email);
        });
      }}
    >
      Suppress
    </Button>
  );
}
