// The job-step set a workspace page is looking at. THE chosen set is useChosenSetKey (the operator
// pin, validated) — never a heuristic. When nothing is chosen, the VIEW is seeded by
// heuristicDefaultViewSeed and the page must say so (DEFAULT_SEED_NOTE) — a seed never reads as chosen.
// A page may VIEW another set (the Job Map switcher): `viewKey` overrides the seed / the chosen set for
// the view only; `chosen` is then "the viewed set IS the chosen set", so ON STRATEGY follows the read.
import { useMemo } from "react";
import { useJobSteps, type JobStepRow } from "@/hooks/useJobSteps";
import { heuristicDefaultViewSeed, useChosenSetKey } from "@/lib/chosenJobStepSet";

export type ViewedSet = {
  loading: boolean;
  steps: JobStepRow[];
  /** All set keys present for the company (job_steps.journey_key — a column name, never UI text). */
  keys: string[];
  /** Every set, in key order, with its own title (job_steps.journey_title) when the record carries one. */
  sets: Array<{ key: string; title: string | null }>;
  viewedKey: string | null;
  /** The operator's chosen key when it names an existing set, else null (useChosenSetKey). */
  chosenKey: string | null;
  /** True only when the viewed set is the chosen set. */
  chosen: boolean;
  /** Steps of the viewed set, by step_number. */
  viewedSteps: JobStepRow[];
  /** The set's own title (job_steps.journey_title), when the record carries one. */
  viewedTitle: string | null;
  /** Re-read the steps (after a generation run). */
  refetchSteps: () => void;
  /** After a successful choose: clear the chosen key, then re-read it — the chip returns only with the read. */
  invalidateChosen: () => void;
};

export function useViewedSet(companyId?: string, viewKey?: string | null): ViewedSet {
  const { items, loading: stepsLoading, refetch: refetchSteps } = useJobSteps(companyId);
  const { chosenKey: rawChosen, loading: chosenLoading, invalidate: invalidateChosen } = useChosenSetKey(companyId);
  return useMemo(() => {
    const keys = Array.from(new Set(items.map((s) => String(s.journey_key ?? ""))).values()).filter(Boolean);
    const designedByKey = new Map<string, number>();
    for (const s of items) {
      const k = String(s.journey_key ?? "");
      designedByKey.set(k, (designedByKey.get(k) ?? 0) + (s.designed ? 1 : 0));
    }
    const chosenKey = rawChosen !== null && keys.includes(rawChosen) ? rawChosen : null;
    const override = viewKey && keys.includes(viewKey) ? viewKey : null;
    const viewedKey = override ?? chosenKey ?? heuristicDefaultViewSeed(keys, designedByKey);
    const chosen = chosenKey !== null && viewedKey === chosenKey;
    const sets = keys.map((key) => ({ key, title: items.find((s) => String(s.journey_key ?? "") === key && s.journey_title)?.journey_title ?? null }));
    const viewedSteps = items
      .filter((s) => String(s.journey_key ?? "") === viewedKey)
      .sort((a, b) => (a.step_number ?? 0) - (b.step_number ?? 0));
    const viewedTitle = viewedSteps.find((s) => s.journey_title)?.journey_title ?? null;
    return { loading: stepsLoading || chosenLoading, steps: items, keys, sets, viewedKey, chosenKey, chosen, viewedSteps, viewedTitle, refetchSteps, invalidateChosen };
  }, [rawChosen, chosenLoading, items, stepsLoading, viewKey, invalidateChosen, refetchSteps]);
}
