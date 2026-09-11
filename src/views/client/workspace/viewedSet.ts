// The job-step set a workspace page is looking at. THE chosen set is useChosenSetKey (the operator
// pin, validated) — never a heuristic. When nothing is chosen, the VIEW is seeded by
// heuristicDefaultViewSeed and the page must say so (DEFAULT_SEED_NOTE) — a seed never reads as chosen.
import { useMemo } from "react";
import { useJobSteps, type JobStepRow } from "@/hooks/useJobSteps";
import { heuristicDefaultViewSeed, useChosenSetKey } from "@/lib/chosenJobStepSet";

export type ViewedSet = {
  loading: boolean;
  steps: JobStepRow[];
  /** All set keys present for the company (job_steps.journey_key — a column name, never UI text). */
  keys: string[];
  viewedKey: string | null;
  chosen: boolean;
  /** Steps of the viewed set, by step_number. */
  viewedSteps: JobStepRow[];
  /** The set's own title (job_steps.journey_title), when the record carries one. */
  viewedTitle: string | null;
};

export function useViewedSet(companyId?: string): ViewedSet {
  const { items, loading: stepsLoading } = useJobSteps(companyId);
  const { chosenKey, loading: chosenLoading } = useChosenSetKey(companyId);
  return useMemo(() => {
    const keys = Array.from(new Set(items.map((s) => String(s.journey_key ?? ""))).values()).filter(Boolean);
    const designedByKey = new Map<string, number>();
    for (const s of items) {
      const k = String(s.journey_key ?? "");
      designedByKey.set(k, (designedByKey.get(k) ?? 0) + (s.designed ? 1 : 0));
    }
    const chosen = chosenKey !== null && keys.includes(chosenKey);
    const viewedKey = chosen ? chosenKey : heuristicDefaultViewSeed(keys, designedByKey);
    const viewedSteps = items
      .filter((s) => String(s.journey_key ?? "") === viewedKey)
      .sort((a, b) => (a.step_number ?? 0) - (b.step_number ?? 0));
    const viewedTitle = viewedSteps.find((s) => s.journey_title)?.journey_title ?? null;
    return { loading: stepsLoading || chosenLoading, steps: items, keys, viewedKey, chosen, viewedSteps, viewedTitle };
  }, [chosenKey, chosenLoading, items, stepsLoading]);
}
