// MH-1: the single authority for "the chosen on-strategy job-step set".
//
// THE chosen set = the operator's choice (operator_primary_selection, job_step_set
// domain) — but only if that set still exists among the company's current sets.
// No choice (or a stale choice whose set is gone) → null. This is never a
// heuristic: every ASSERTION of the on-strategy set (chip, headline score basis,
// homepage audience) reads this. Heuristics seed the ephemeral default VIEW only
// (heuristicDefaultViewSeed below) and never stand in as a claim.
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type ChosenSet = { chosenKey: string | null; source: "operator" | null };

/** Gate E1 — shown once when a pin is found to name a set that no longer exists. The pin is cleared
 *  (with an audit row) rather than left to fail silently: an operator who chose something is owed the
 *  news that their choice stopped being about anything. */
export const PIN_CLEARED_STALE_NOTE = "The set you chose no longer exists — choose again"; // signed
/** Gate E1 — shown beside a view that the heuristic seeded, so a default never reads as a choice. */
export const DEFAULT_SEED_NOTE = "Not chosen — showing the largest set"; // signed

/** The signed-in operator, for audit rows and chosen_by. Email when present, else the user id, else null. */
export async function currentActor(): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getUser();
    return data?.user?.email ?? data?.user?.id ?? null;
  } catch { return null; }
}

/** Clear a stale job-step-set pin and record WHY. Called from the read path, which is the only place
 *  that can see a pin has gone stale — the write trigger cannot, because the steps may be deleted long
 *  after the pin was made. Best-effort: a failed clear leaves the pin, which the resolvers already
 *  treat as no choice, so the surface stays honest either way. */
export async function clearStalePin(companyId: string, staleKey: string, actor: string | null): Promise<void> {
  try {
    await db.from("operator_primary_selection_audit").insert({
      company_id: companyId, domain: "job_step_set", item_key: staleKey,
      action: "cleared_stale", actor,
      reason: "the pinned set has no job steps for this company",
    });
    await db.from("operator_primary_selection")
      .delete().eq("company_id", companyId).eq("domain", "job_step_set");
  } catch { /* the pin already reads as "no choice"; the surface is unaffected */ }
}

const norm = (v: unknown) => String(v ?? "").trim().toLowerCase();

// Pure rule — given the raw operator pin + the company's existing set keys.
export function resolveChosenSet(pinnedItemKey: string | null | undefined, existingKeys: readonly string[]): ChosenSet {
  const key = norm(pinnedItemKey);
  if (key && existingKeys.some((k) => norm(k) === key)) return { chosenKey: key, source: "operator" };
  return { chosenKey: null, source: null };
}

// Loose accessor throughout: two of these tables sit outside the generated Database type until it is
// regenerated, and the typed builder recurses past TS's depth limit when they are mixed in one call.
const db = supabase as unknown as { from: (t: string) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any

// Self-contained hook for consumers that don't already hold the pin + set list.
// Returns the validated chosen key (or null). loading is true until resolved.
export function useChosenSetKey(companyId?: string): {
  chosenKey: string | null; source: "operator" | null; loading: boolean; clearedStale: boolean;
} {
  const [state, setState] = useState<{
    chosenKey: string | null; source: "operator" | null; loading: boolean; clearedStale: boolean;
  }>({ chosenKey: null, source: null, loading: Boolean(companyId), clearedStale: false });
  useEffect(() => {
    if (!companyId) { setState({ chosenKey: null, source: null, loading: false, clearedStale: false }); return; }
    let cancelled = false;
    setState((s) => ({ ...s, loading: true }));
    (async () => {
      const [pinRes, stepRes] = await Promise.all([
        db.from("operator_primary_selection").select("item_key").eq("company_id", companyId).eq("domain", "job_step_set").maybeSingle(),
        db.from("job_steps").select("journey_key").eq("company_id", companyId),
      ]);
      if (cancelled) return;
      const pin = (pinRes as { data?: { item_key?: unknown } | null }).data?.item_key;
      const keys = (((stepRes as { data?: Array<{ journey_key?: unknown }> | null }).data) ?? []).map((r) => String(r.journey_key ?? ""));
      const resolved = resolveChosenSet(typeof pin === "string" ? pin : null, keys);
      // Gate E1 — a pin that named something and no longer does is CLEARED, not ignored. Ignoring it
      // is how Edgewood carried an invalid choice for six weeks with nothing on any surface saying so.
      if (typeof pin === "string" && pin.trim() && !resolved.chosenKey) {
        await clearStalePin(companyId, pin, await currentActor());
        if (!cancelled) setState({ chosenKey: null, source: null, loading: false, clearedStale: true });
        return;
      }
      setState({ ...resolved, loading: false, clearedStale: false });
    })();
    return () => { cancelled = true; };
  }, [companyId]);
  return state;
}

const isInternalKey = (k: string) => {
  const x = norm(k);
  return x === "internal" || x === "operations" || x.startsWith("internal-") || x.startsWith("internal_");
};

// Ephemeral default-VIEW seed ONLY — never an assertion of the chosen set. When no
// set is chosen, seed the view to a real, complete set: prefer a NON-internal-ops
// set with the most designed steps (tie-break by input order). Replaces the old
// "first non-customer", which landed on the undesigned internal-operations set
// (the latent EDGE-CKPT case: Edgewood with no choice → "internal").
export function heuristicDefaultViewSeed(
  optionKeys: readonly string[],
  designedByKey: ReadonlyMap<string, number>,
): string | null {
  if (optionKeys.length === 0) return null;
  const nonInternal = optionKeys.filter((k) => !isInternalKey(k));
  const pool = nonInternal.length ? nonInternal : [...optionKeys];
  let best = pool[0];
  for (const k of pool) {
    if ((designedByKey.get(k) ?? 0) > (designedByKey.get(best) ?? 0)) best = k;
  }
  return best ?? null;
}
