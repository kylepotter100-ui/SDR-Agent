import Link from "next/link";
import { notFound } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import {
  getSuppressedEmails,
  isSuppressed,
  STATUS_EXCLUDED,
} from "@/lib/agent/suppression";
import { StatusPill } from "@/components/ui/badge";
import { StatusSelect } from "@/components/dashboard/status-select";
import { ProspectActions } from "@/components/dashboard/prospect-actions";
import { AddNoteDialog } from "@/components/dashboard/add-note-dialog";
import { MarkSentDialog } from "@/components/dashboard/mark-sent-dialog";
import { LogReplyDialog } from "@/components/dashboard/log-reply-dialog";
import { SuppressButton } from "@/components/dashboard/suppress-button";
import { DraftEditor } from "@/components/dashboard/draft-editor";

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const CH_PROFILE =
  "https://find-and-update.company-information.service.gov.uk/company/";

const CARD =
  "rounded-lg border border-brand-near-black/10 bg-white/60 p-4";
const LABEL =
  "font-mono text-xs uppercase tracking-wide text-brand-near-black/50";
const LINK =
  "text-brand-accent underline-offset-2 hover:underline";

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className={LABEL}>{label}</span>
      <span className="text-sm text-brand-near-black">{children}</span>
    </div>
  );
}

export default async function ProspectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: p, error } = await supabase
    .from("prospects")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    return (
      <div className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">
        Failed to load prospect: {error.message}
      </div>
    );
  }
  if (!p) notFound();

  const [{ data: notes }, { data: sends }, { data: replies }, suppressed] =
    await Promise.all([
      supabase
        .from("prospect_notes")
        .select("id, body, created_at")
        .eq("prospect_id", id)
        .order("created_at", { ascending: false }),
      supabase
        .from("prospect_sends")
        .select("id, sent_at, channel, notes")
        .eq("prospect_id", id)
        .order("sent_at", { ascending: false }),
      supabase
        .from("prospect_replies")
        .select("id, received_at, body, sentiment")
        .eq("prospect_id", id)
        .order("received_at", { ascending: false }),
      getSuppressedEmails(),
    ]);

  const hasDraft = Boolean(
    p.personalised_email_subject && p.personalised_email_body,
  );

  // Send guard. STATUS_EXCLUDED already groups opted_out/ignored/dead;
  // suppression entries are lowercased on insert so the membership
  // check needs the same normalisation. `sent` is not in STATUS_EXCLUDED
  // — re-compose stays allowed; the visible status carries the warning.
  const directorEmailLower = p.director_email?.trim().toLowerCase() ?? null;
  const blockReason: string | null = !p.director_email
    ? "Awaiting Apollo enrichment"
    : (STATUS_EXCLUDED as string[]).includes(p.status)
      ? "Suppressed / opted out"
      : isSuppressed(directorEmailLower, suppressed)
        ? "Suppressed / opted out"
        : !hasDraft
          ? "No draft yet"
          : null;
  const canCompose = blockReason === null;

  return (
    <div className="flex flex-col gap-6">
      {/* Header — breadcrumb, title, status. */}
      <div>
        <Link
          href="/dashboard/prospects"
          className="text-sm text-brand-near-black/60 hover:text-brand-near-black"
        >
          ← All prospects
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="font-serif text-2xl tracking-tight text-brand-near-black">
            {p.company_name}
          </h1>
          <StatusPill status={p.status} />
          {p.starred && (
            <span aria-label="Starred" className="text-brand-accent">
              ★
            </span>
          )}
        </div>
      </div>

      {/* Sticky action row — always reachable during the review loop. */}
      <div className="sticky top-0 z-10 -mx-4 flex flex-wrap items-center gap-2 border-y border-brand-near-black/10 bg-brand-cream/95 px-4 py-2 backdrop-blur supports-[backdrop-filter]:bg-brand-cream/70">
        <StatusSelect id={p.id} status={p.status} />
        <ProspectActions id={p.id} starred={p.starred} status={p.status} />
        <span className="mx-1 h-5 w-px bg-brand-near-black/15" />
        <MarkSentDialog id={p.id} />
        <LogReplyDialog id={p.id} />
        {p.director_email && (
          <SuppressButton id={p.id} email={p.director_email} />
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Facts */}
        <div className={`flex flex-col gap-4 ${CARD}`}>
          <Field label="Location">
            {p.postcode}
            {p.registered_address ? ` · ${p.registered_address}` : ""}
          </Field>
          <Field label="SIC">
            {p.sic_code}
            {p.sic_description ? ` · ${p.sic_description}` : ""} · Tier{" "}
            {p.sic_tier} (fit {p.fit_weight})
          </Field>
          <Field label="Signal">{p.observable_signal ?? "—"}</Field>
          <Field label="Ranking">
            <span className="font-mono">{p.ranking_score ?? "—"}</span>
            {p.ranking_reasoning ? (
              <span className="mt-1 block text-brand-near-black/60">
                {p.ranking_reasoning}
              </span>
            ) : null}
          </Field>
          <Field label="Director">
            {p.director_name ?? "not known"}
            {p.director_email ? (
              <a href={`mailto:${p.director_email}`} className={`ml-2 ${LINK}`}>
                {p.director_email}
              </a>
            ) : (
              <span className="ml-2 text-amber-700">
                — email: lookup manually
              </span>
            )}
          </Field>
          <Field label="Incorporated">{p.incorporated_on ?? "—"}</Field>
          <Field label="Links">
            <span className="flex flex-wrap gap-3">
              <a
                href={`${CH_PROFILE}${encodeURIComponent(p.company_number)}`}
                target="_blank"
                rel="noreferrer"
                className={LINK}
              >
                Companies House
              </a>
              {p.website_url && (
                <a
                  href={p.website_url}
                  target="_blank"
                  rel="noreferrer"
                  className={LINK}
                >
                  Website
                </a>
              )}
              {p.facebook_url && (
                <a
                  href={p.facebook_url}
                  target="_blank"
                  rel="noreferrer"
                  className={LINK}
                >
                  Facebook
                </a>
              )}
              {p.maps_place_id && (
                <a
                  href={`https://www.google.com/maps/place/?q=place_id:${encodeURIComponent(p.maps_place_id)}`}
                  target="_blank"
                  rel="noreferrer"
                  className={LINK}
                >
                  Google Maps
                </a>
              )}
            </span>
          </Field>
        </div>

        {/* Email draft */}
        <div className={`flex flex-col gap-3 ${CARD}`}>
          {hasDraft ? (
            <DraftEditor
              id={p.id}
              subject={p.personalised_email_subject ?? ""}
              body={p.personalised_email_body ?? ""}
              directorEmail={p.director_email}
              canCompose={canCompose}
              blockReason={blockReason}
            />
          ) : (
            <>
              <span className={LABEL}>Personalised draft</span>
              <p className="rounded-md bg-brand-near-black/5 px-3 py-6 text-center text-sm text-brand-near-black/55">
                Personalisation pending — the agent hasn&rsquo;t written a draft
                for this prospect yet.
              </p>
            </>
          )}
        </div>
      </div>

      {/* Notes */}
      <div className={`flex flex-col gap-3 ${CARD}`}>
        <div className="flex items-center justify-between">
          <span className={LABEL}>Notes</span>
          <AddNoteDialog id={p.id} />
        </div>
        {notes && notes.length > 0 ? (
          <ul className="flex flex-col gap-3">
            {notes.map((n) => (
              <li
                key={n.id}
                className="border-b border-brand-near-black/5 pb-3 last:border-0 last:pb-0"
              >
                <p className="whitespace-pre-wrap text-sm text-brand-near-black">
                  {n.body}
                </p>
                <p className="mt-1 font-mono text-xs text-brand-near-black/45">
                  {formatTimestamp(n.created_at)}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-brand-near-black/55">No notes yet.</p>
        )}
      </div>

      {/* Sends + replies */}
      <div className="grid gap-6 lg:grid-cols-2">
        <div className={`flex flex-col gap-3 ${CARD}`}>
          <span className={LABEL}>Sends</span>
          {sends && sends.length > 0 ? (
            <ul className="flex flex-col gap-2">
              {sends.map((s) => (
                <li key={s.id} className="text-sm text-brand-near-black">
                  <span className="font-mono">{formatTimestamp(s.sent_at)}</span>
                  <span className="text-brand-near-black/40">
                    {" "}
                    · {s.channel}
                  </span>
                  {s.notes ? (
                    <span className="block text-xs text-brand-near-black/55">
                      {s.notes}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-brand-near-black/55">Not sent yet.</p>
          )}
        </div>

        <div className={`flex flex-col gap-3 ${CARD}`}>
          <span className={LABEL}>Replies</span>
          {replies && replies.length > 0 ? (
            <ul className="flex flex-col gap-3">
              {replies.map((r) => (
                <li
                  key={r.id}
                  className="border-b border-brand-near-black/5 pb-3 last:border-0 last:pb-0"
                >
                  <p className="font-mono text-xs text-brand-near-black/45">
                    {formatTimestamp(r.received_at)}
                    {r.sentiment ? ` · ${r.sentiment}` : ""}
                  </p>
                  {r.body ? (
                    <p className="mt-1 whitespace-pre-wrap text-sm text-brand-near-black">
                      {r.body}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-brand-near-black/55">
              No replies logged.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
