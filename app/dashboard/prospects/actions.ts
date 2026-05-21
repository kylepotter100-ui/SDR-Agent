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

  // Update the source of truth first; the audit insert follows. If the
  // insert fails (rare), the status is still correct and we only lose one
  // audit row — logged as a warning. Single-user scale; no RPC needed.
  const { error: updErr } = await supabase
    .from("prospects")
    .update({
      status,
      last_action_at: new Date().toISOString(),
      last_action_by: ACTOR,
    })
    .eq("id", id);
  if (updErr) throw updErr;

  const { error: transErr } = await supabase
    .from("prospect_status_transitions")
    .insert({
      prospect_id: id,
      from_status: current.status,
      to_status: status,
      changed_by: ACTOR,
    });
  if (transErr) {
    console.warn(
      `[dashboard] status transition audit insert failed for ${id}: ${transErr.message}`,
    );
  }

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
