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

const norm = (v: unknown) => String(v ?? "").trim().toLowerCase();

// Pure rule — given the raw operator pin + the company's existing set keys.
export function resolveChosenSet(pinnedItemKey: string | null | undefined, existingKeys: readonly string[]): ChosenSet {
  const key = norm(pinnedItemKey);
  if (key && existingKeys.some((k) => norm(k) === key)) return { chosenKey: key, source: "operator" };
  return { chosenKey: null, source: null };
}

const db = supabase as unknown as { from: (t: string) => ReturnType<typeof supabase.from> };

// Self-contained hook for consumers that don't already hold the pin + set list.
// Returns the validated chosen key (or null). loading is true until resolved.
export function useChosenJourneyKey(companyId?: string): { chosenKey: string | null; source: "operator" | null; loading: boolean } {
  const [state, setState] = useState<{ chosenKey: string | null; source: "operator" | null; loading: boolean }>(
    { chosenKey: null, source: null, loading: Boolean(companyId) },
  );
  useEffect(() => {
    if (!companyId) { setState({ chosenKey: null, source: null, loading: false }); return; }
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
      setState({ ...resolved, loading: false });
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
