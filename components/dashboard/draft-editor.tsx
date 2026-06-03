"use client";

import { useState, useTransition } from "react";

import { saveDraft } from "@/app/dashboard/prospects/actions";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy-button";

interface DraftEditorProps {
  id: string;
  subject: string;
  body: string;
  directorEmail: string | null;
  canCompose: boolean;
  blockReason: string | null;
}

export function DraftEditor(props: DraftEditorProps) {
  const [subject, setSubject] = useState(props.subject);
  const [body, setBody] = useState(props.body);
  const [pending, startTransition] = useTransition();

  // Per-render derived comparison against the prop. After saveDraft
  // revalidates the route, the parent re-renders with the persisted
  // value as the new prop; local state already equals it, so this
  // recomputes to false. A stored flag would stay stuck disabled.
  const dirty = subject !== props.subject || body !== props.body;

  // The compose URL is built from the PERSISTED props, not live edit
  // state, so the composed message always matches what mark-sent will
  // log. Outlook web compose deeplink format — the signed-in account
  // determines the From address (no URL parameter can force it).
  const composeReason = !props.canCompose
    ? props.blockReason
    : dirty
      ? "Save your edits first"
      : null;
  const canActuallyCompose = composeReason === null;

  const composeHref =
    canActuallyCompose && props.directorEmail
      ? `https://outlook.office.com/mail/deeplink/compose` +
        `?to=${encodeURIComponent(props.directorEmail)}` +
        `&subject=${encodeURIComponent(props.subject)}` +
        `&body=${encodeURIComponent(props.body)}`
      : null;

  const draftPlain = `Subject: ${props.subject}\n\n${props.body}`;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="font-mono text-xs uppercase tracking-wide text-brand-near-black/50">
          Personalised draft
        </span>
        <CopyButton text={draftPlain} label="Copy draft" />
      </div>

      <label className="flex flex-col gap-1 font-mono text-xs uppercase tracking-wide text-brand-near-black/50">
        Subject
        <input
          type="text"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          className="w-full rounded-md border border-brand-near-black/20 bg-white px-3 py-2 text-sm font-semibold text-brand-near-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/40"
        />
      </label>

      <label className="flex flex-col gap-1 font-mono text-xs uppercase tracking-wide text-brand-near-black/50">
        Body
        <textarea
          rows={14}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          className="w-full resize-y rounded-md border border-brand-near-black/20 bg-white px-3 py-2 font-mono text-[13px] leading-relaxed text-brand-near-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/40"
        />
      </label>

      <div className="flex flex-wrap items-center justify-end gap-2">
        {composeReason && (
          <span className="mr-auto text-xs text-amber-700">{composeReason}</span>
        )}
        <Button
          variant="secondary"
          size="sm"
          disabled={pending || !dirty}
          onClick={() =>
            startTransition(async () => {
              await saveDraft(props.id, subject, body);
            })
          }
        >
          {pending ? "Saving…" : "Save draft"}
        </Button>
        {composeHref ? (
          <a
            href={composeHref}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-8 items-center justify-center rounded-md bg-brand-accent px-3 text-sm font-medium text-brand-cream transition-colors hover:bg-brand-accent/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/40"
          >
            Compose in Outlook
          </a>
        ) : (
          <Button disabled size="sm">
            Compose in Outlook
          </Button>
        )}
      </div>
    </div>
  );
}
