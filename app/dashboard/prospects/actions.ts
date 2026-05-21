"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { PROSPECT_STATUSES } from "@/lib/dashboard/filters";
import type { ProspectStatus } from "@/lib/db.types";

const ACTOR = "kyle" as const;

async function requireSession() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  return supabase;
}

function revalidateProspect(id: string) {
  revalidatePath(`/dashboard/prospects/${id}`);
  revalidatePath("/dashboard/prospects");
}

type SessionClient = Awaited<ReturnType<typeof createClient>>;

// Update the source-of-truth status first, then insert the audit row. If
// the insert fails (rare), the status is still correct and we lose one
// audit row — logged. Single-user scale; no RPC needed.
async function applyStatusChange(
  supabase: SessionClient,
  id: string,
  from: ProspectStatus,
  to: ProspectStatus,
) {
  const { error: updErr } = await supabase
    .from("prospects")
    .update({
      status: to,
      last_action_at: new Date().toISOString(),
      last_action_by: ACTOR,
    })
    .eq("id", id);
  if (updErr) throw updErr;

  const { error: transErr } = await supabase
    .from("prospect_status_transitions")
    .insert({ prospect_id: id, from_status: from, to_status: to, changed_by: ACTOR });
  if (transErr) {
    console.warn(
      `[dashboard] status transition audit insert failed for ${id}: ${transErr.message}`,
    );
  }
}

async function bumpLastAction(supabase: SessionClient, id: string) {
  const { error } = await supabase
    .from("prospects")
    .update({
      last_action_at: new Date().toISOString(),
      last_action_by: ACTOR,
    })
    .eq("id", id);
  if (error) {
    console.warn(`[dashboard] last_action bump failed for ${id}: ${error.message}`);
  }
}

export async function updateStatus(id: string, newStatus: string) {
  if (!(PROSPECT_STATUSES as string[]).includes(newStatus)) {
    throw new Error(`Invalid status: ${newStatus}`);
  }
  const status = newStatus as ProspectStatus;
  const supabase = await requireSession();

  const { data: current, error: readErr } = await supabase
    .from("prospects")
    .select("status")
    .eq("id", id)
    .maybeSingle();
  if (readErr) throw readErr;
  if (!current) throw new Error("Prospect not found");
  if (current.status === status) return;

  await applyStatusChange(supabase, id, current.status, status);
  revalidateProspect(id);
}

export async function toggleStar(id: string) {
  const supabase = await requireSession();
  const { data: current, error: readErr } = await supabase
    .from("prospects")
    .select("starred")
    .eq("id", id)
    .maybeSingle();
  if (readErr) throw readErr;
  if (!current) throw new Error("Prospect not found");

  const { error } = await supabase
    .from("prospects")
    .update({
      starred: !current.starred,
      last_action_at: new Date().toISOString(),
      last_action_by: ACTOR,
    })
    .eq("id", id);
  if (error) throw error;

  revalidateProspect(id);
}

export async function addNote(id: string, body: string) {
  const trimmed = body.trim();
  if (!trimmed) throw new Error("Note cannot be empty");
  const supabase = await requireSession();

  const { error: noteErr } = await supabase
    .from("prospect_notes")
    .insert({ prospect_id: id, body: trimmed });
  if (noteErr) throw noteErr;

  const { error: updErr } = await supabase
    .from("prospects")
    .update({
      last_action_at: new Date().toISOString(),
      last_action_by: ACTOR,
    })
    .eq("id", id);
  if (updErr) {
    console.warn(
      `[dashboard] last_action bump after note failed for ${id}: ${updErr.message}`,
    );
  }

  revalidatePath(`/dashboard/prospects/${id}`);
}

export async function markSent(
  id: string,
  sentAtISO: string | null,
  notes: string | null,
) {
  const supabase = await requireSession();
  const { data: p, error: readErr } = await supabase
    .from("prospects")
    .select("status, personalised_email_subject, personalised_email_body")
    .eq("id", id)
    .maybeSingle();
  if (readErr) throw readErr;
  if (!p) throw new Error("Prospect not found");

  const { error: sendErr } = await supabase.from("prospect_sends").insert({
    prospect_id: id,
    sent_at: sentAtISO ?? new Date().toISOString(),
    channel: "outlook_manual",
    subject: p.personalised_email_subject,
    body: p.personalised_email_body,
    notes: notes?.trim() || null,
  });
  if (sendErr) throw sendErr;

  // Only-forward auto-advance: new/surfaced -> sent. Never revives a
  // triaged prospect (ignored/opted_out) or regresses a later state.
  if (p.status === "new" || p.status === "surfaced") {
    await applyStatusChange(supabase, id, p.status, "sent");
  } else {
    await bumpLastAction(supabase, id);
  }
  revalidateProspect(id);
}

export async function logReply(
  id: string,
  receivedAtISO: string | null,
  body: string,
  sentiment: string | null,
) {
  const supabase = await requireSession();
  const { data: p, error: readErr } = await supabase
    .from("prospects")
    .select("status")
    .eq("id", id)
    .maybeSingle();
  if (readErr) throw readErr;
  if (!p) throw new Error("Prospect not found");

  const { error: replyErr } = await supabase.from("prospect_replies").insert({
    prospect_id: id,
    received_at: receivedAtISO ?? new Date().toISOString(),
    body: body.trim() || null,
    sentiment: sentiment?.trim() || null,
  });
  if (replyErr) throw replyErr;

  // Only-forward auto-advance: new/surfaced/sent -> replied. Never revives
  // a triaged prospect or regresses qualified/dead.
  if (p.status === "new" || p.status === "surfaced" || p.status === "sent") {
    await applyStatusChange(supabase, id, p.status, "replied");
  } else {
    await bumpLastAction(supabase, id);
  }
  revalidateProspect(id);
}
