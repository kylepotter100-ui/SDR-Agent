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

  // mailto is built from the PERSISTED props, not live edit state, so
  // the composed message always matches what mark-sent will log.
  const composeReason = !props.canCompose
    ? props.blockReason
    : dirty
      ? "Save your edits first"
      : null;
  const canActuallyCompose = composeReason === null;

  const mailtoHref = canActuallyCompose && props.directorEmail
    ? `mailto:${encodeURIComponent(props.directorEmail)}` +
      `?subject=${encodeURIComponent(props.subject)}` +
      `&body=${encodeURIComponent(props.body)}`
    : null;

  const draftPlain = `Subject: ${props.subject}\n\n${props.body}`;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-neutral-400">
          Personalised draft
        </span>
        <CopyButton text={draftPlain} label="Copy draft" />
      </div>

      <label className="flex flex-col gap-1 text-xs text-neutral-500">
        Subject
        <input
          type="text"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm font-semibold text-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400"
        />
      </label>

      <label className="flex flex-col gap-1 text-xs text-neutral-500">
        Body
        <textarea
          rows={14}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          className="w-full resize-y rounded-md border border-neutral-300 bg-neutral-50 px-3 py-2 font-mono text-[13px] leading-relaxed text-neutral-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400"
        />
      </label>

      <div className="flex flex-wrap items-center justify-end gap-2">
        {composeReason && (
          <span className="mr-auto text-xs text-amber-700">
            {composeReason}
          </span>
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
        {mailtoHref ? (
          <a
            href={mailtoHref}
            className="inline-flex h-8 items-center justify-center rounded-md bg-neutral-900 px-3 text-sm font-medium text-white transition-colors hover:bg-neutral-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400"
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
