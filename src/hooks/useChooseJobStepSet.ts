// CHOOSE A JOB-STEP SET — the write body MOVED from OnStrategyPin.pinFocused (Job Map Tier 1 lift,
// 2026-09-11): the operator_primary_selection upsert (domain job_step_set) plus its audit row. Same
// table, same payload, same audit — OnStrategyPin now calls chooseJobStepSet from pinFocused
// (OnStrategyPin.lift.test.tsx proves the arguments are unchanged) and the workspace Job Map calls the
// same function through useChooseJobStepSet. No new write path exists (Option B holds).
//
// Choosing is a promotion, never a view: the chosen set is asserted ONLY by the read
// (useChosenSetKey / OnStrategyPin's query), which is also the single caller of clearStalePin — a
// choice that names a set with no steps is cleared there with its audit row. This module does not
// re-implement that clearing; after a choice the caller re-reads through that path.
import { useCallback, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { currentActor } from "@/lib/chosenJobStepSet";

// operator_primary_selection / its audit table aren't in the generated types (see chosenJobStepSet.ts).
const db = supabase as unknown as { from: (t: string) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any

/** OnStrategyPin.pinFocused's write, verbatim: who chose (chosen_by), the upsert, the audit row. */
export async function chooseJobStepSet(companyId: string, setKey: string): Promise<void> {
  // Gate E1 — a choice is a decision moment, and it is RECORDED: who made it, and an audit row.
  // chosen_by was NULL on every pin in the fleet before this; nothing could say who chose what.
  const actor = await currentActor();
  await db.from("operator_primary_selection").upsert(
    {
      company_id: companyId,
      domain: "job_step_set",
      item_key: setKey,
      item_id: null,
      chosen_by: actor,
      chosen_at: new Date().toISOString(),
    },
    { onConflict: "company_id,domain" },
  );
  await db.from("operator_primary_selection_audit").insert({
    company_id: companyId, domain: "job_step_set", item_key: setKey, action: "set", actor, reason: null,
  });
}

/** In-flight wrapper for a surface: choose(setKey) runs the write; `choosing` is true meanwhile. */
export function useChooseJobStepSet(companyId?: string): { choose: (setKey: string) => Promise<boolean>; choosing: boolean } {
  const [choosing, setChoosing] = useState(false);
  const choose = useCallback(async (setKey: string) => {
    if (!companyId || !setKey) return false;
    setChoosing(true);
    try {
      await chooseJobStepSet(companyId, setKey);
      return true;
    } finally {
      setChoosing(false);
    }
  }, [companyId]);
  return { choose, choosing };
}
