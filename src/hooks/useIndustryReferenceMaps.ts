// FD-3 — the published industry-standard job-map library, for FrontDoorMapAct.
//
// Reads industry_reference_job_maps and returns only PUBLISHED maps, grouped by
// industry_key with steps ordered by step_number. This is reference content —
// true-by-reference, walled from all corroboration machinery (provenance
// 'industry_standard_reference', FD-1). No company data, no scoring, no register.
//
// PUBLISHED-ONLY, structurally, three ways:
//   1. RLS SELECT policy on the table is (is_published = true) for authenticated.
//   2. This query ALSO filters .eq("is_published", true) — belt-and-suspenders,
//      so even an admin (whose ALL policy could read drafts) gets only published
//      rows on this path.
//   3. FrontDoorMapAct matches a company key against THIS key set only.
// coffee-cafe (is_published = false) therefore never appears here.

import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type ReferenceStep = {
  step_number: number;
  step_label: string;
  description: string;
};

export type ReferenceMap = {
  industry_key: string;
  industry_label: string;
  taxonomy_version: string | null;
  steps: ReferenceStep[];
};

type Row = {
  industry_key: string;
  industry_label: string;
  step_number: number;
  step_label: string;
  description: string;
  taxonomy_version: string | null;
};

export function useIndustryReferenceMaps(): {
  maps: Map<string, ReferenceMap>;
  keys: string[];
  loading: boolean;
  error: string | null;
} {
  const [maps, setMaps] = useState<Map<string, ReferenceMap>>(new Map());
  const [loading, setLoading] = useState(true);
  // GATE C-2 — `error` is ADDITIVE, so FrontDoorMapAct renders the signed error via <ActData>
  // instead of the fallback selector on a failed read. `maps` / `keys` / `loading` are
  // byte-identical for every existing consumer (error still leaves maps empty).
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      const { data, error: qErr } = await supabase
        .from("industry_reference_job_maps")
        .select("industry_key, industry_label, step_number, step_label, description, taxonomy_version")
        .eq("is_published", true) // published-only at the query layer, on top of RLS
        .order("industry_key", { ascending: true })
        .order("step_number", { ascending: true });
      if (cancelled) return;
      if (qErr) setError(qErr.message);
      const rows = (data ?? []) as Row[];
      const grouped = new Map<string, ReferenceMap>();
      for (const r of rows) {
        let m = grouped.get(r.industry_key);
        if (!m) {
          m = { industry_key: r.industry_key, industry_label: r.industry_label, taxonomy_version: r.taxonomy_version ?? null, steps: [] };
          grouped.set(r.industry_key, m);
        }
        m.steps.push({ step_number: r.step_number, step_label: r.step_label, description: r.description });
      }
      setMaps(grouped);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  // Alphabetical, deterministic — the fallback selector's option order.
  const keys = [...maps.keys()].sort();
  return { maps, keys, loading, error };
}
