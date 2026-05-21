"use client";

import { useRef, useState, useTransition } from "react";

import { logReply } from "@/app/dashboard/prospects/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

function todayISODate(): string {
  return new Date().toISOString().slice(0, 10);
}

export function LogReplyDialog({ id }: { id: string }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [date, setDate] = useState(todayISODate());
  const [body, setBody] = useState("");
  const [sentiment, setSentiment] = useState("");
  const [pending, startTransition] = useTransition();

  return (
    <>
      <Button
        variant="secondary"
        size="sm"
        onClick={() => dialogRef.current?.showModal()}
      >
        Log reply
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
              await logReply(id, new Date(date).toISOString(), body, sentiment);
              setBody("");
              setSentiment("");
              dialogRef.current?.close();
            });
          }}
        >
          <h2 className="text-sm font-semibold text-neutral-900">Log reply</h2>
          <label className="flex flex-col gap-1 text-xs text-neutral-500">
            Received on
            <Input
              type="date"
              value={date}
              max={todayISODate()}
              onChange={(e) => setDate(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-neutral-500">
            Reply
            <textarea
              autoFocus
              required
              rows={4}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Paste the reply…"
              className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-neutral-500">
            Sentiment (optional — your words)
            <Input
              type="text"
              value={sentiment}
              onChange={(e) => setSentiment(e.target.value)}
              placeholder="e.g. interested, not now, wrong person"
            />
          </label>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => dialogRef.current?.close()}
            >
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={pending || !body.trim()}>
              {pending ? "Saving…" : "Record reply"}
            </Button>
          </div>
        </form>
      </dialog>
    </>
  );
}
