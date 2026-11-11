// IS THERE A FIRST READ TO OPEN? (U6 part 1, 2026-11-11)
//
// A `first_read_sessions` row is the First Read's existence. Without one the eight-beat page mounts
// and renders its empty shell, which is indistinguishable from a company whose read found nothing —
// so the landing asks this question first and says S-U6-6 instead.
//
// MEMBER-READABLE BY ITS OWN POLICY, not through a door: first_read_sessions carries
// "Members read own company first_read_sessions" (company_id IN (select company_id from
// company_members where user_id = auth.uid())), so this exact query answers for a member and for an
// admin without a branch. An id the caller cannot read contributes nothing, which is the correct
// answer rather than an error — the gate upstream is what refuses a foreign company.
import { supabase } from "@/integrations/supabase/client";

/** The subset of `companyIds` that have a First Read. Throws if the query fails (U6-54). */
export async function fetchFirstReadReady(companyIds: readonly string[]): Promise<ReadonlySet<string>> {
  if (companyIds.length === 0) return new Set<string>();
  const { data, error } = await supabase
    .from("first_read_sessions")
    .select("company_id")
    .in("company_id", companyIds as string[]);
  if (error) throw new Error(error.message || "first_read_sessions read failed");
  const ready = new Set<string>();
  for (const row of data ?? []) {
    const id = (row as { company_id?: string | null }).company_id;
    if (typeof id === "string" && id.length > 0) ready.add(id);
  }
  return ready;
}
