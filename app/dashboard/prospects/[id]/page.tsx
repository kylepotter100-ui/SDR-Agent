import Link from "next/link";
import { notFound } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { StatusPill } from "@/components/ui/badge";
import { CopyButton } from "@/components/ui/copy-button";
import { StatusSelect } from "@/components/dashboard/status-select";
import { ProspectActions } from "@/components/dashboard/prospect-actions";
import { AddNoteDialog } from "@/components/dashboard/add-note-dialog";
import { MarkSentDialog } from "@/components/dashboard/mark-sent-dialog";
import { LogReplyDialog } from "@/components/dashboard/log-reply-dialog";
import { SuppressButton } from "@/components/dashboard/suppress-button";

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const CH_PROFILE = "https://find-and-update.company-information.service.gov.uk/company/";

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs font-medium uppercase tracking-wide text-neutral-400">
        {label}
      </span>
      <span className="text-sm text-neutral-800">{children}</span>
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

  const [{ data: notes }, { data: sends }, { data: replies }] =
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
    ]);

  const hasDraft = Boolean(p.personalised_email_subject && p.personalised_email_body);
  const draftPlain = hasDraft
    ? `Subject: ${p.personalised_email_subject}\n\n${p.personalised_email_body}`
    : "";

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href="/dashboard/prospects"
          className="text-sm text-neutral-500 hover:text-neutral-900"
        >
          ← All prospects
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-semibold text-neutral-900">
            {p.company_name}
          </h1>
          <StatusPill status={p.status} />
          {p.starred && <span className="text-amber-500">★</span>}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <StatusSelect id={p.id} status={p.status} />
          <ProspectActions id={p.id} starred={p.starred} status={p.status} />
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <MarkSentDialog id={p.id} />
          <LogReplyDialog id={p.id} />
          {p.director_email && (
            <SuppressButton id={p.id} email={p.director_email} />
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Facts */}
        <div className="flex flex-col gap-4 rounded-lg border border-neutral-200 bg-white p-4">
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
            {p.ranking_score ?? "—"}
            {p.ranking_reasoning ? (
              <span className="mt-1 block text-neutral-500">
                {p.ranking_reasoning}
              </span>
            ) : null}
          </Field>
          <Field label="Director">
            {p.director_name ?? "not known"}
            {p.director_email ? (
              <a
                href={`mailto:${p.director_email}`}
                className="ml-2 text-blue-700 hover:underline"
              >
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
                className="text-blue-700 hover:underline"
              >
                Companies House
              </a>
              {p.website_url && (
                <a
                  href={p.website_url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-blue-700 hover:underline"
                >
                  Website
                </a>
              )}
              {p.facebook_url && (
                <a
                  href={p.facebook_url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-blue-700 hover:underline"
                >
                  Facebook
                </a>
              )}
              {p.maps_place_id && (
                <a
                  href={`https://www.google.com/maps/place/?q=place_id:${encodeURIComponent(p.maps_place_id)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-blue-700 hover:underline"
                >
                  Google Maps
                </a>
              )}
            </span>
          </Field>
        </div>

        {/* Email draft */}
        <div className="flex flex-col gap-3 rounded-lg border border-neutral-200 bg-white p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium uppercase tracking-wide text-neutral-400">
              Personalised draft
            </span>
            {hasDraft && <CopyButton text={draftPlain} label="Copy draft" />}
          </div>
          {hasDraft ? (
            <>
              <div className="text-sm font-semibold text-neutral-900">
                {p.personalised_email_subject}
              </div>
              <pre className="whitespace-pre-wrap break-words rounded-md bg-neutral-50 p-3 font-mono text-[13px] leading-relaxed text-neutral-800">
                {p.personalised_email_body}
              </pre>
            </>
          ) : (
            <p className="rounded-md bg-neutral-50 px-3 py-6 text-center text-sm text-neutral-500">
              Personalisation pending — the agent hasn&rsquo;t written a draft
              for this prospect yet.
            </p>
          )}
        </div>
      </div>

      {/* Notes */}
      <div className="flex flex-col gap-3 rounded-lg border border-neutral-200 bg-white p-4">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium uppercase tracking-wide text-neutral-400">
            Notes
          </span>
          <AddNoteDialog id={p.id} />
        </div>
        {notes && notes.length > 0 ? (
          <ul className="flex flex-col gap-3">
            {notes.map((n) => (
              <li key={n.id} className="border-b border-neutral-100 pb-3 last:border-0 last:pb-0">
                <p className="whitespace-pre-wrap text-sm text-neutral-800">
                  {n.body}
                </p>
                <p className="mt-1 text-xs text-neutral-400">
                  {formatTimestamp(n.created_at)}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-neutral-500">No notes yet.</p>
        )}
      </div>

      {/* Sends + replies */}
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="flex flex-col gap-3 rounded-lg border border-neutral-200 bg-white p-4">
          <span className="text-xs font-medium uppercase tracking-wide text-neutral-400">
            Sends
          </span>
          {sends && sends.length > 0 ? (
            <ul className="flex flex-col gap-2">
              {sends.map((s) => (
                <li key={s.id} className="text-sm text-neutral-800">
                  {formatTimestamp(s.sent_at)}
                  <span className="text-neutral-400"> · {s.channel}</span>
                  {s.notes ? (
                    <span className="block text-xs text-neutral-500">
                      {s.notes}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-neutral-500">Not sent yet.</p>
          )}
        </div>

        <div className="flex flex-col gap-3 rounded-lg border border-neutral-200 bg-white p-4">
          <span className="text-xs font-medium uppercase tracking-wide text-neutral-400">
            Replies
          </span>
          {replies && replies.length > 0 ? (
            <ul className="flex flex-col gap-3">
              {replies.map((r) => (
                <li
                  key={r.id}
                  className="border-b border-neutral-100 pb-3 last:border-0 last:pb-0"
                >
                  <p className="text-xs text-neutral-400">
                    {formatTimestamp(r.received_at)}
                    {r.sentiment ? ` · ${r.sentiment}` : ""}
                  </p>
                  {r.body ? (
                    <p className="mt-1 whitespace-pre-wrap text-sm text-neutral-800">
                      {r.body}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-neutral-500">No replies logged.</p>
          )}
        </div>
      </div>
    </div>
  );
}
