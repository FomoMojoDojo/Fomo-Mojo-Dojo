// CONDITIONS GENERATION — runConditionsGeneration and its in-flight state MOVED out of
// ClientRefinePreviewWorkshopView (Job Map Tier 1 lift, 2026-09-11). Same edge function
// (generate-step-conditions), same body ({ company_id, journey_key } — nothing else: the run writes
// conditions_json only and never a selection / identity column), same frozen refusal, same
// timeout-polling confirmation, same toasts. The workshop view now calls this hook from its header
// button (useConditionsGeneration.test.ts proves the request shape) and the workspace Job Map calls the
// same hook. No new write path exists (Option B holds).
import { useCallback, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { isFrozenCompany } from "@/lib/frozenCompanies";

type StepLike = { id: string; conditions_json?: unknown };

export type ConditionsGenerationArgs = {
  companyId?: string | null;
  /** The viewed set's key (job_steps.journey_key); null when no set is in view. */
  setKey: string | null;
  /** The viewed set's steps — decides the "generated" vs "refreshed" wording and seeds the change signature. */
  steps: StepLike[];
  /** Re-read job_steps once the run has landed. */
  refetch: () => void | Promise<unknown>;
};

/** True when the set already carries conditions (the button reads "Regenerate", else "Generate"). */
export function setHasConditions(steps: StepLike[]): boolean {
  return steps.some((s) => Array.isArray(s.conditions_json) && s.conditions_json.length > 0);
}

// b-ii: deliberate per-set conditions generation. Invokes the edge function
// (LOCAL 14b + 70b judge via the committed module; field-merge keeps operator
// edits). Generation can exceed the Kong 150s gateway — on timeout the writes
// still land server-side, so we confirm completion by polling conditions_json
// for a change against a pre-run snapshot.
export function useConditionsGeneration({ companyId, setKey, steps, refetch }: ConditionsGenerationArgs): { run: () => Promise<void>; running: boolean } {
  const [running, setRunning] = useState(false);

  const run = useCallback(async () => {
    if (!companyId || !setKey) return;
    if (isFrozenCompany(companyId)) {
      toast.error("This is a frozen reference company — conditions are not generated for it.");
      return;
    }
    const setHadConditions = setHasConditions(steps);
    const successMsg = setHadConditions ? "Conditions refreshed — your edits kept" : "Conditions generated";
    const beforeSig = JSON.stringify(steps.map((s) => [s.id, s.conditions_json ?? null]));

    setRunning(true);
    toast.loading(setHadConditions ? "Regenerating conditions… (~1–2 min)" : "Generating conditions… (~1–2 min)", { id: "gen-conditions" });
    try {
      const { data, error } = await supabase.functions.invoke("generate-step-conditions", {
        body: { company_id: companyId, journey_key: setKey },
      });
      if (!error && (data as { ok?: boolean } | null)?.ok === true) {
        await refetch();
        toast.success(successMsg, { id: "gen-conditions" });
        return;
      }
      // Invoke errored (often a Kong 150s timeout while generation continues
      // server-side). Poll the set's conditions_json until it changes.
      for (let attempt = 0; attempt < 50; attempt++) {
        await new Promise<void>((r) => setTimeout(r, 6000));
        const { data: rows } = await supabase
          .from("job_steps")
          .select("id, conditions_json")
          .eq("company_id", companyId)
          .eq("journey_key", setKey)
          .order("step_number", { ascending: true });
        const sig = JSON.stringify(((rows as Array<{ id: string; conditions_json: unknown }> | null) ?? []).map((r) => [r.id, r.conditions_json ?? null]));
        if (sig !== beforeSig) {
          await refetch();
          toast.success(successMsg, { id: "gen-conditions" });
          return;
        }
      }
      throw new Error("Conditions are taking longer than expected — refresh the page in a moment.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to generate conditions.", { id: "gen-conditions" });
    } finally {
      setRunning(false);
    }
  }, [companyId, setKey, steps, refetch]);

  return { run, running };
}
