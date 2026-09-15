// The job-step set a workspace page is looking at. THE chosen set is useChosenSetKey (the operator
// pin, validated) — never a heuristic. When nothing is chosen, the VIEW is seeded by
// heuristicDefaultViewSeed and the page must say so (DEFAULT_SEED_NOTE) — a seed never reads as chosen.
// A page may VIEW another set (the Job Map switcher): `viewKey` overrides the seed / the chosen set for
// the view only; `chosen` is then "the viewed set IS the chosen set", so ON STRATEGY follows the read.
//
// Item 2 R1 (signed 2026-09-15): `sets` is the UNION of the company's live market definitions
// (odi_market_definitions, retracted_at IS NULL) and its job_steps key sets — each entry mapped
// (job_steps rows > 0) or not. Chosen/seed resolution considers MAPPED keys only (`keys`); an unmapped
// key is never the default view and never reads as chosen. `viewKey` MAY name an unmapped key (the
// market door). Label order: job_steps.journey_title → market_lens.title → key.
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useJobSteps, type JobStepRow } from "@/hooks/useJobSteps";
import { heuristicDefaultViewSeed, useChosenSetKey } from "@/lib/chosenJobStepSet";
import { readLiveDefinitionKeys } from "@/lib/liveDefinitionKeys";

export type ViewedSetEntry = {
  key: string;
  /** job_steps.journey_title → market_lens.title → null (the page renders the key). */
  title: string | null;
  /** job_steps rows > 0. */
  mapped: boolean;
  stepCount: number;
};

export type ViewedSet = {
  loading: boolean;
  steps: JobStepRow[];
  /** MAPPED set keys (job_steps.journey_key — a column name, never UI text). Chosen/seed resolve over these. */
  keys: string[];
  /** The union (R1): every live definition and every job_steps set, in key order. */
  sets: ViewedSetEntry[];
  viewedKey: string | null;
  /** The operator's chosen key when it names an existing MAPPED set, else null (useChosenSetKey). */
  chosenKey: string | null;
  /** True only when the viewed set is the chosen set. */
  chosen: boolean;
  /** Steps of the viewed set, by step_number (empty for an unmapped market). */
  viewedSteps: JobStepRow[];
  /** The viewed entry's label (same order as `sets[].title`). */
  viewedTitle: string | null;
  /** False when the viewed key is a definition with no job_steps (the market door). */
  viewedMapped: boolean;
  /** Re-read the steps (after a generation run). */
  refetchSteps: () => void;
  /** After a successful choose: clear the chosen key, then re-read it — the chip returns only with the read. */
  invalidateChosen: () => void;
};

type MarketIndex = { defKeys: string[]; lensTitles: Map<string, string>; loading: boolean };

/** Live definitions (retracted excluded) + market_lens titles for the company. Reads only. */
function useMarketIndex(companyId?: string): MarketIndex {
  const [state, setState] = useState<MarketIndex>({ defKeys: [], lensTitles: new Map(), loading: Boolean(companyId) });
  useEffect(() => {
    if (!companyId) { setState({ defKeys: [], lensTitles: new Map(), loading: false }); return; }
    let cancelled = false;
    setState((s) => ({ ...s, loading: true }));
    (async () => {
      const [defKeys, lens] = await Promise.all([
        readLiveDefinitionKeys(supabase, companyId),
        supabase.from("market_lens").select("journey_key, title").eq("company_id", companyId),
      ]);
      if (cancelled) return;
      const lensTitles = new Map<string, string>();
      for (const r of ((lens.data as Array<{ journey_key: string | null; title: string | null }> | null) ?? [])) {
        const k = String(r.journey_key ?? ""); const t = String(r.title ?? "").trim();
        if (k && t && !lensTitles.has(k)) lensTitles.set(k, t);
      }
      setState({ defKeys, lensTitles, loading: false });
    })();
    return () => { cancelled = true; };
  }, [companyId]);
  return state;
}

export function useViewedSet(companyId?: string, viewKey?: string | null): ViewedSet {
  const { items, loading: stepsLoading, refetch: refetchSteps } = useJobSteps(companyId);
  const { chosenKey: rawChosen, loading: chosenLoading, invalidate: invalidateChosen } = useChosenSetKey(companyId);
  const market = useMarketIndex(companyId);
  return useMemo(() => {
    const keys = Array.from(new Set(items.map((s) => String(s.journey_key ?? ""))).values()).filter(Boolean);
    const stepCountByKey = new Map<string, number>();
    const designedByKey = new Map<string, number>();
    for (const s of items) {
      const k = String(s.journey_key ?? "");
      stepCountByKey.set(k, (stepCountByKey.get(k) ?? 0) + 1);
      designedByKey.set(k, (designedByKey.get(k) ?? 0) + (s.designed ? 1 : 0));
    }
    const unionKeys = Array.from(new Set([...keys, ...market.defKeys]).values()).sort((a, b) => a.localeCompare(b));
    const titleFor = (key: string): string | null =>
      items.find((s) => String(s.journey_key ?? "") === key && s.journey_title)?.journey_title ?? market.lensTitles.get(key) ?? null;
    const sets: ViewedSetEntry[] = unionKeys.map((key) => ({ key, title: titleFor(key), mapped: (stepCountByKey.get(key) ?? 0) > 0, stepCount: stepCountByKey.get(key) ?? 0 }));
    // Chosen and seed resolve over MAPPED keys only; the view override may name any union key.
    const chosenKey = rawChosen !== null && keys.includes(rawChosen) ? rawChosen : null;
    const override = viewKey && unionKeys.includes(viewKey) ? viewKey : null;
    const viewedKey = override ?? chosenKey ?? heuristicDefaultViewSeed(keys, designedByKey);
    const chosen = chosenKey !== null && viewedKey === chosenKey;
    const viewedSteps = items
      .filter((s) => String(s.journey_key ?? "") === viewedKey)
      .sort((a, b) => (a.step_number ?? 0) - (b.step_number ?? 0));
    const viewedTitle = viewedKey ? titleFor(viewedKey) : null;
    const viewedMapped = viewedSteps.length > 0;
    return { loading: stepsLoading || chosenLoading || market.loading, steps: items, keys, sets, viewedKey, chosenKey, chosen, viewedSteps, viewedTitle, viewedMapped, refetchSteps, invalidateChosen };
  }, [rawChosen, chosenLoading, items, stepsLoading, viewKey, invalidateChosen, refetchSteps, market]);
}
