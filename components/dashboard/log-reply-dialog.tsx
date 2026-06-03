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
        className="m-auto w-[min(28rem,calc(100vw-2rem))] rounded-lg border border-brand-near-black/10 bg-brand-cream p-0 backdrop:bg-brand-near-black/40"
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
          <h2 className="font-mono text-xs uppercase tracking-wide text-brand-near-black/60">
            Log reply
          </h2>
          <label className="flex flex-col gap-1 font-mono text-xs uppercase tracking-wide text-brand-near-black/50">
            Received on
            <Input
              type="date"
              value={date}
              max={todayISODate()}
              onChange={(e) => setDate(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1 font-mono text-xs uppercase tracking-wide text-brand-near-black/50">
            Reply
            <textarea
              autoFocus
              required
              rows={4}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Paste the reply…"
              className="w-full rounded-md border border-brand-near-black/20 bg-white px-3 py-2 text-sm text-brand-near-black placeholder:text-brand-near-black/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/40"
            />
          </label>
          <label className="flex flex-col gap-1 font-mono text-xs uppercase tracking-wide text-brand-near-black/50">
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
