"use client";

import { useRef, useState, useTransition } from "react";

import { markSent } from "@/app/dashboard/prospects/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

function todayISODate(): string {
  return new Date().toISOString().slice(0, 10);
}

export function MarkSentDialog({ id }: { id: string }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [date, setDate] = useState(todayISODate());
  const [notes, setNotes] = useState("");
  const [pending, startTransition] = useTransition();

  return (
    <>
      <Button
        variant="secondary"
        size="sm"
        onClick={() => dialogRef.current?.showModal()}
      >
        Mark sent
      </Button>
      <dialog
        ref={dialogRef}
        className="m-auto w-[min(28rem,calc(100vw-2rem))] rounded-lg border border-brand-near-black/10 bg-brand-cream p-0 backdrop:bg-brand-near-black/40"
      >
        <form
          className="flex flex-col gap-3 p-4"
          onSubmit={(e) => {
            e.preventDefault();
            startTransition(async () => {
              await markSent(id, new Date(date).toISOString(), notes);
              setNotes("");
              dialogRef.current?.close();
            });
          }}
        >
          <h2 className="font-mono text-xs uppercase tracking-wide text-brand-near-black/60">
            Mark sent
          </h2>
          <label className="flex flex-col gap-1 font-mono text-xs uppercase tracking-wide text-brand-near-black/50">
            Sent on
            <Input
              type="date"
              value={date}
              max={todayISODate()}
              onChange={(e) => setDate(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1 font-mono text-xs uppercase tracking-wide text-brand-near-black/50">
            Notes (optional — e.g. edits made before sending)
            <textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full rounded-md border border-brand-near-black/20 bg-white px-3 py-2 text-sm text-brand-near-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/40"
            />
          </label>
          <p className="text-xs text-brand-near-black/50">
            The current draft is snapshotted to the send record.
          </p>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => dialogRef.current?.close()}
            >
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={pending}>
              {pending ? "Saving…" : "Record send"}
            </Button>
          </div>
        </form>
      </dialog>
    </>
  );
}
