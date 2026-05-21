"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";

const ACTOR = "kyle" as const;

async function requireSession() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  return supabase;
}

export async function addSuppression(
  email: string,
  reason: string,
  notes: string | null,
) {
  const normalised = email.trim().toLowerCase();
  if (!normalised || !normalised.includes("@")) {
    throw new Error("A valid email is required");
  }
  const supabase = await requireSession();
  const { error } = await supabase
    .from("suppression_list")
    .upsert(
      {
        email: normalised,
        reason: reason.trim() || "manual_block",
        notes: notes?.trim() || null,
      },
      { onConflict: "email" },
    );
  if (error) throw error;
  revalidatePath("/dashboard/suppression");
}

export async function removeSuppression(email: string) {
  const supabase = await requireSession();
  const { error } = await supabase
    .from("suppression_list")
    .delete()
    .eq("email", email);
  if (error) throw error;
  revalidatePath("/dashboard/suppression");
}

/**
 * Suppress from a prospect detail page: add the director's email to the
 * list and set the prospect to opted_out. Only valid when the prospect
 * has a director_email.
 */
export async function suppressProspect(id: string, email: string) {
  const normalised = email.trim().toLowerCase();
  if (!normalised || !normalised.includes("@")) {
    throw new Error("Prospect has no valid email to suppress");
  }
  const supabase = await requireSession();

  const { error: supErr } = await supabase
    .from("suppression_list")
    .upsert(
      { email: normalised, reason: "manual_block", notes: null },
      { onConflict: "email" },
    );
  if (supErr) throw supErr;

  const { data: current } = await supabase
    .from("prospects")
    .select("status")
    .eq("id", id)
    .maybeSingle();

  const { error: updErr } = await supabase
    .from("prospects")
    .update({
      status: "opted_out",
      last_action_at: new Date().toISOString(),
      last_action_by: ACTOR,
    })
    .eq("id", id);
  if (updErr) throw updErr;

  if (current && current.status !== "opted_out") {
    const { error: transErr } = await supabase
      .from("prospect_status_transitions")
      .insert({
        prospect_id: id,
        from_status: current.status,
        to_status: "opted_out",
        changed_by: ACTOR,
      });
    if (transErr) {
      console.warn(
        `[dashboard] suppress transition audit failed for ${id}: ${transErr.message}`,
      );
    }
  }

  revalidatePath(`/dashboard/prospects/${id}`);
  revalidatePath("/dashboard/prospects");
  revalidatePath("/dashboard/suppression");
}
