import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type OdiMarketDefinitionRow = {
  id: string;
  company_id: string;
  journey_key: string;
  job_executor: string;
  chooser: string;
  jtbd: string;
  source_path: string;
  // RG-1: the stored register, birth-immutable. Present via select("*"); typed
  // so the register guard can judge this row before its text reaches client copy.
  market_register?: string | null;
  frameworks_used: string[];
  innovation_strategy?: string | null;
  created_at: string;
  updated_at: string;
};

export type OdiNeedRow = {
  id: string;
  company_id: string;
  tier: "need" | "want" | "desire" | string;
  desired_outcome: string;
  journey_key: "customer" | "revenue" | "operations" | string;
  step_number: number;
  step_label: string;
  importance: number;
  satisfaction: number;
  opportunity_score: number;
  sort_order?: number | null;
  service_state: "underserved" | "served" | "overserved" | string;
  provenance_type?: "manual" | "public_research" | "framework_adjudicated" | "odi_survey" | "internal_declared" | string | null;
  confidence?: number | null;
  source_path: string;
  source_url?: string | null;
  notes?: string | null;
  social_extraction_json?: unknown | null;
  frameworks_used: string[];
  dependency_state?: string | null;
  validation_state?: string | null;
  evidence_state?: string | null;
  last_reviewed_at?: string | null;
  stale_reason?: string | null;
  stale_since_event_id?: string | null;
  source_run_id?: string | null;
  odi_canonical_statement?: string | null;
  updated_at?: string | null;
  created_at: string;
  /** Gate 3: the interview record an interview-sourced need points at (keyed read only; embedded through the FK). */
  interview_record_id?: string | null;
  interview_records?: { id: string; speaker_role: string; person_name: string; interviewed_at: string; verbatim: string; retracted_at: string | null } | null;
  strategy_alignment?: "aligned" | "off_strategy" | "unknown" | null;
  strategy_alignment_reason?: string | null;
  strategy_alignment_evaluated_at?: string | null;
};

/** JobMapOrgPanel.handleMarkNeedReviewed's write, MOVED verbatim (Job Map Tier 1 lift, 2026-09-11): the
 *  row leaves its review state — dependency_state fresh, stale markers cleared, last_reviewed_at now.
 *  The panel and the workspace Job Map both call this; no other column is touched. */
export async function markNeedReviewed(needId: string): Promise<void> {
  await supabase
    .from("odi_needs")
    .update({
      dependency_state: "fresh",
      stale_reason: null,
      stale_since_event_id: null,
      last_reviewed_at: new Date().toISOString(),
    })
    .eq("id", needId);
}

export function useOdiNeeds(companyId?: string, refreshKey = 0, journeyKey?: string) {
  const [loading, setLoading] = useState(false);
  const [marketDefinition, setMarketDefinition] = useState<OdiMarketDefinitionRow | null>(null);
  const [needs, setNeeds] = useState<OdiNeedRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [updatingScoresId, setUpdatingScoresId] = useState<string | null>(null);

  useEffect(() => {
    if (!companyId) {
      setMarketDefinition(null);
      setNeeds([]);
      setError(null);
      setLoading(false);
      return;
    }

    let cancelled = false;

    (async () => {
      setMarketDefinition(null);
      setNeeds([]);
      setLoading(true);
      setError(null);

      // With a focus key: exact (company_id, journey_key) market_def. Without
      // one (MPD-0): prefer the SPINE journey (journey_key='customer' — the
      // de-facto primary) so a portfolio/discovered row can never hijack "the
      // market" by being written last; fall back to the legacy latest-updated
      // row only when no customer def exists. Surfaces with a lens/market
      // switcher MUST still pass the focused key.
      const resolveNoKeyMarket = async () => {
        const customer = await supabase
          .from("odi_market_definitions")
          .select("*")
          .eq("company_id", companyId)
          .eq("journey_key", "customer")
          .maybeSingle();
        if (customer.error || customer.data) return customer;
        return await supabase
          .from("odi_market_definitions")
          .select("*")
          .eq("company_id", companyId)
          .order("updated_at", { ascending: false })
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
      };
      const marketQuery = journeyKey
        ? supabase
            .from("odi_market_definitions")
            .select("*")
            .eq("company_id", companyId)
            .eq("journey_key", journeyKey)
            .maybeSingle()
        : resolveNoKeyMarket();

      // Lens-reads law: when a focus key is passed, needs are scoped server-side to
      // that journey — a focused lens must never receive another market's needs.
      // No key ⇒ legacy company-wide list (pre-lens consumers filter client-side).
      // 4f-6 (ruling F9): BOTH paths are market-keyed surfaces, so both exclude COMPANY-HELD needs
      // (holder='company', journey_key NULL). The keyed path already excludes them by its
      // .eq("journey_key", key); the no-key path did NOT, and every unscoped consumer — the home,
      // the shell, the score, the Opportunities and Needs panels — would have rendered or counted a
      // company-held need under a market it does not belong to. `journey_key IS NOT NULL` is the
      // test, not holder, because the paired CHECK binds them and the key is what these surfaces
      // actually group and label by. A surface FOR company-held needs is client-view work; until it
      // exists they render nowhere.
      // Gate 3 (2026-09-16): the KEYED read embeds the interview record an interview-sourced need
      // points at (speaker role, name, date, verbatim — the frame's inputs) and excludes rows whose
      // record was retracted (status='retracted', set by the retraction trigger). The no-key path
      // (legacy company-wide list) keeps select("*") and ALSO excludes retracted rows (gate 3 delta,
      // ruling 1: a retracted finding vanishes from every surface, the home and the shell included).
      const needsQuery = journeyKey
        ? supabase
            .from("odi_needs")
            .select("*, interview_records(id, speaker_role, person_name, interviewed_at, verbatim, retracted_at)")
            .eq("company_id", companyId)
            .eq("journey_key", journeyKey)
            .neq("status", "retracted")
            .order("tier", { ascending: true })
            .order("sort_order", { ascending: true, nullsFirst: false })
            .order("opportunity_score", { ascending: false })
        : supabase
            .from("odi_needs")
            .select("*")
            .eq("company_id", companyId)
            .not("journey_key", "is", null)
            .neq("status", "retracted")
            .order("tier", { ascending: true })
            .order("sort_order", { ascending: true, nullsFirst: false })
            .order("opportunity_score", { ascending: false });
      const [marketRes, needsRes] = await Promise.all([marketQuery, needsQuery]);

      if (cancelled) return;

      const isNetworkError = (msg: string) =>
        msg.toLowerCase().includes("load failed") ||
        msg.toLowerCase().includes("networkerror") ||
        msg.toLowerCase().includes("failed to fetch");

      const errors: string[] = [];
      if (marketRes.error) {
        const msg = marketRes.error.message || "";
        if (isNetworkError(msg)) {
          console.warn("[useOdiNeeds] market-definition network error (transient):", msg, { companyId });
        } else {
          errors.push(`Market definition: ${msg}`);
        }
      }
      if (needsRes.error) {
        const msg = needsRes.error.message || "";
        if (isNetworkError(msg)) {
          console.warn("[useOdiNeeds] needs network error (transient):", msg, { companyId });
        } else {
          errors.push(`Needs: ${msg}`);
        }
      }

      setMarketDefinition(marketRes.error ? null : ((marketRes.data as OdiMarketDefinitionRow | null) ?? null));
      setNeeds(needsRes.error ? [] : ((needsRes.data as OdiNeedRow[]) ?? []));
      setError(errors.length > 0 ? errors.join(" | ") : null);

      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [companyId, refreshKey, journeyKey]);

  async function updateMarketDefinition(patch: Partial<Pick<OdiMarketDefinitionRow, "innovation_strategy">>) {
    if (!companyId) throw new Error("Select a company first.");

    const { error } = await supabase
      .from("odi_market_definitions")
      .update(patch)
      .eq("company_id", companyId);

    if (error) throw new Error(error.message || "Failed to update market definition.");

    setMarketDefinition((prev) => (prev ? { ...prev, ...patch } : prev));
  }

  async function updateNeedScores(needId: string, importance: number, satisfaction: number) {
    const imp = Math.max(0, Math.min(10, Math.round(importance)));
    const sat = Math.max(0, Math.min(10, Math.round(satisfaction)));
    const opportunityScore = imp + Math.max(0, imp - sat);
    const serviceState: OdiNeedRow["service_state"] =
      opportunityScore >= 10 ? "underserved" : sat > imp + 1 ? "overserved" : "served";

    setUpdatingScoresId(needId);
    try {
      const { error } = await supabase
        .from("odi_needs")
        .update({ importance: imp, satisfaction: sat, opportunity_score: opportunityScore, service_state: serviceState })
        .eq("id", needId);

      if (error) throw new Error(error.message || "Failed to update scores.");

      setNeeds((prev) =>
        prev.map((n) =>
          n.id === needId ? { ...n, importance: imp, satisfaction: sat, opportunity_score: opportunityScore, service_state: serviceState } : n,
        ),
      );
    } finally {
      setUpdatingScoresId(null);
    }
  }

  return { loading, marketDefinition, needs, error, updatingScoresId, updateNeedScores, updateMarketDefinition };
}
