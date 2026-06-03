import { createClient } from "@/lib/supabase/server";
import {
  SuppressionManager,
  type SuppressionEntry,
} from "@/components/dashboard/suppression-manager";

export default async function SuppressionPage() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("suppression_list")
    .select("email, reason, added_at, notes")
    .order("added_at", { ascending: false });

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="font-serif text-2xl tracking-tight text-brand-near-black">
          Suppression list
        </h1>
        <p className="mt-1 text-sm text-brand-near-black/60">
          The agent skips these addresses when personalising and building the
          digest.
        </p>
      </div>
      {error ? (
        <div className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">
          Failed to load suppression list: {error.message}
        </div>
      ) : (
        <SuppressionManager entries={(data ?? []) as SuppressionEntry[]} />
      )}
    </div>
  );
}
