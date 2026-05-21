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
        className="m-auto w-[min(28rem,calc(100vw-2rem))] rounded-lg border border-neutral-200 p-0 backdrop:bg-black/40"
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
          <h2 className="text-sm font-semibold text-neutral-900">Mark sent</h2>
          <label className="flex flex-col gap-1 text-xs text-neutral-500">
            Sent on
            <Input
              type="date"
              value={date}
              max={todayISODate()}
              onChange={(e) => setDate(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-neutral-500">
            Notes (optional — e.g. edits made before sending)
            <textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400"
            />
          </label>
          <p className="text-xs text-neutral-400">
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
