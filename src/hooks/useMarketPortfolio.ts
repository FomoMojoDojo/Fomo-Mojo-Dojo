// MPD-3 — the client-view market-portfolio read: fetches the market rows and
// resolves them through resolveMarketPortfolio at surface:'outside' —
// register-pure BY CONSTRUCTION (OOD-1/2/3): only public_inferred /
// publicly_declared markets can reach this hook's output. Internal-register
// markets are Diagnose material and never pass the resolver's surface filter.
//
// Live reads, no pinned run ids, no polling. hasInternalDeclared feeds the
// conditional Diagnose hand-off line (renders ONLY for companies that have
// internal-declared markets).

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  resolveMarketPortfolio,
  type MarketDefRow,
  type MarketLensRow,
  type ResolvedPortfolio,
  type SameMarketVerdictRow,
} from "@/lib/marketPortfolio/resolveMarketPortfolio";

export type MarketPortfolioState = {
  loading: boolean;
  portfolio: ResolvedPortfolio | null;
  hasInternalDeclared: boolean;
  error: string | null;
};

export function useMarketPortfolio(companyId?: string): MarketPortfolioState {
  const [state, setState] = useState<MarketPortfolioState>({
    loading: Boolean(companyId),
    portfolio: null,
    hasInternalDeclared: false,
    error: null,
  });
  const seq = useRef(0);

  useEffect(() => {
    seq.current += 1;
    const mySeq = seq.current;
    if (!companyId) {
      setState({ loading: false, portfolio: null, hasInternalDeclared: false, error: null });
      return;
    }
    setState({ loading: true, portfolio: null, hasInternalDeclared: false, error: null });
    (async () => {
      const [defsRes, lensRes, verdictRes] = await Promise.all([
        supabase
          .from("odi_market_definitions")
          .select("id, journey_key, job_executor, jtbd, chooser, provenance_type, market_register, relationship_kind, relationship_basis, declared_verbatim, declared_source_ref")
          .eq("company_id", companyId),
        supabase
          .from("market_lens")
          .select("journey_key, portfolio_state, portfolio_role")
          .eq("company_id", companyId),
        supabase
          .from("market_discovery_verdicts")
          .select("verdict_kind, verdict, market_a_identity, market_b_identity, judge_reason, pair_identity")
          .eq("company_id", companyId)
          .eq("verdict_kind", "same_market"),
      ]);
      if (seq.current !== mySeq) return;
      const firstError = defsRes.error ?? lensRes.error ?? verdictRes.error;
      if (firstError) {
        setState({ loading: false, portfolio: null, hasInternalDeclared: false, error: firstError.message });
        return;
      }
      const defs = (defsRes.data ?? []) as unknown as MarketDefRow[];
      const portfolio = await resolveMarketPortfolio({
        defs,
        lenses: (lensRes.data ?? []) as unknown as MarketLensRow[],
        verdicts: (verdictRes.data ?? []) as unknown as SameMarketVerdictRow[],
        surface: "outside", // register purity: Act A never sees internal markets
      });
      if (seq.current !== mySeq) return;
      setState({
        loading: false,
        portfolio,
        hasInternalDeclared: defs.some((d) => d.market_register === "internal_declared"),
        error: null,
      });
    })();
  }, [companyId]);

  return state;
}
