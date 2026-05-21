"use client";

import { useRef, useState, useTransition } from "react";

import { addNote } from "@/app/dashboard/prospects/actions";
import { Button } from "@/components/ui/button";

export function AddNoteDialog({ id }: { id: string }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [body, setBody] = useState("");
  const [pending, startTransition] = useTransition();

  function close() {
    dialogRef.current?.close();
  }

  return (
    <>
      <Button
        variant="secondary"
        size="sm"
        onClick={() => dialogRef.current?.showModal()}
      >
        Add note
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
              await addNote(id, body);
              setBody("");
              close();
            });
          }}
        >
          <h2 className="text-sm font-semibold text-neutral-900">Add note</h2>
          <textarea
            autoFocus
            required
            rows={5}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Anything worth remembering about this prospect…"
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400"
          />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={close}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={pending || !body.trim()}>
              {pending ? "Saving…" : "Save note"}
            </Button>
          </div>
        </form>
      </dialog>
    </>
  );
}
