import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { safeLocalStorageGet, safeLocalStorageSet } from '@/lib/safeLocalStorage';
import { type EngagementPhase, normalizeEngagementPhase } from '@/lib/engagementPhase';

type AreaScoresJson = Record<string, unknown> | null;

export interface ExcludedSignal {
  fingerprint: string;
  reason: string;
  excluded_at: string;
}

export interface Company {
  id: string;
  name: string;
  website: string | null;
  created_by: string;
  created_at: string;
  quarter?: string | null;
  archetype?: string | null;

  // NEW
  mojo_score: number | null;
  potential_score: number | null;
  projected_score: number | null;
  evidence_status: string | null;
  evidence_note: string | null;
  last_scored_at: string | null;
  area_scores_json: AreaScoresJson;
  public_source_filters_json?: Record<string, unknown> | null;
  program_phase?: string | null;
  // Normalised, always-valid engagement phase derived from program_phase on read.
  // Use this instead of casting program_phase directly.
  engagement_phase: EngagementPhase;
  excluded_signals_json?: ExcludedSignal[] | null;
  selected_route_id?: string | null;
  selected_route_summary_json?: Record<string, unknown> | null;
  selected_route_updated_at?: string | null;
}

interface CompanyCtx {
  companies: Company[];
  activeCompany: Company | null;
  setActiveCompanyId: (id: string) => void;
  loading: boolean;
  refetch: () => Promise<void>;
}

const CompanyContext = createContext<CompanyCtx | undefined>(undefined);
const PREFERRED_COMPANY_NAME = "cafe barra";
const PUBLIC_CAFE_BARRA_FALLBACK: Company = {
  // Use a UUID-shaped id so UUID-filtered queries fail gracefully (empty) instead of throwing DB cast errors.
  id: "00000000-0000-0000-0000-000000000001",
  name: "Cafe Barra",
  website: "https://cafebarra.com",
  created_by: "public",
  created_at: new Date(0).toISOString(),
  quarter: "Q2 2026",
  archetype: "Founder",
  mojo_score: 64,
  potential_score: 78,
  projected_score: 82,
  evidence_status: "emerging",
  evidence_note: "Public preview fallback company.",
  last_scored_at: null,
  area_scores_json: null,
  public_source_filters_json: null,
  program_phase: "outside_signals",
  engagement_phase: "outside_signals",
  excluded_signals_json: [],
  selected_route_id: null,
  selected_route_summary_json: null,
  selected_route_updated_at: null,
};

function pickDefaultCompanyId(companies: Company[]): string | null {
  if (companies.length === 0) return null;

  const preferred = companies.find((company) =>
    company.name.trim().toLowerCase() === PREFERRED_COMPANY_NAME,
  );

  return preferred?.id ?? companies[0].id;
}

export function CompanyProvider({ children }: { children: ReactNode }) {
  const { user, isAdmin, loading: authLoading } = useAuth();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [activeId, setActiveId] = useState<string | null>(() =>
    safeLocalStorageGet('active_company_id')
  );
  const [loading, setLoading] = useState(true);

  const setFallbackPublicCompany = useCallback(() => {
    setCompanies([PUBLIC_CAFE_BARRA_FALLBACK]);
    const nextId = PUBLIC_CAFE_BARRA_FALLBACK.id;
    setActiveId((current) => current ?? nextId);
    if (!safeLocalStorageGet("active_company_id")) {
      safeLocalStorageSet("active_company_id", nextId);
    }
    setLoading(false);
  }, []);

  const fetchCompanies = useCallback(async () => {
    if (authLoading) {
      setLoading(true);
      return;
    }

    if (!user || !isAdmin) {
      setFallbackPublicCompany();
      setLoading(false);
      return;
    }
    const baseSelect =
      "id,name,website,created_by,created_at,mojo_score,potential_score,projected_score,evidence_status,evidence_note,last_scored_at,area_scores_json";
    const extendedSelect = `${baseSelect},public_source_filters_json,program_phase,excluded_signals_json,selected_route_id,selected_route_summary_json,selected_route_updated_at`;

    let { data, error } = await supabase
      .from("companies")
      .select(extendedSelect)
      .order("created_at", { ascending: true });

    const missingColumn =
      !!error &&
      /public_source_filters_json|column .* does not exist|schema cache/i.test(
        String((error as { message?: string } | null)?.message || ""),
      );

    if (missingColumn) {
      const fallback = await supabase
        .from("companies")
        .select(baseSelect)
        .order("created_at", { ascending: true });
      data = (fallback.data ?? []) as any[];
      error = fallback.error;
      if (!error) {
        data = (data ?? []).map((row) => ({
          ...row,
          public_source_filters_json: null,
          excluded_signals_json: [],
          selected_route_id: null,
          selected_route_summary_json: null,
          selected_route_updated_at: null,
        }));
      }
    }

    if (error) {
      console.error("[companies] fetch error:", error);
      // Keep UI usable even when DB access fails.
      setFallbackPublicCompany();
      setLoading(false);
      return;
    }

    const companies = ((data as Company[]) || []).map((row) => ({
      ...row,
      engagement_phase: normalizeEngagementPhase(row.program_phase),
    }));
    setCompanies(companies);
    setLoading(false);
  }, [user, isAdmin, authLoading, setFallbackPublicCompany]);

  useEffect(() => {
    fetchCompanies();
  }, [fetchCompanies]);

  const setActiveCompanyId = (id: string) => {
    setActiveId(id);
    safeLocalStorageSet('active_company_id', id);
  };

  useEffect(() => {
    if (companies.length === 0) return;

    const stillExists = activeId ? companies.some((company) => company.id === activeId) : false;
    if (stillExists) return;

    const nextId = pickDefaultCompanyId(companies);
    if (!nextId) return;
    setActiveId(nextId);
    safeLocalStorageSet('active_company_id', nextId);
  }, [companies, activeId]);

  const defaultCompanyId = pickDefaultCompanyId(companies);
  const activeCompany =
    companies.find((company) => company.id === activeId) ??
    companies.find((company) => company.id === defaultCompanyId) ??
    null;

  return (
    <CompanyContext.Provider value={{ companies, activeCompany, setActiveCompanyId, loading, refetch: fetchCompanies }}>
      {children}
    </CompanyContext.Provider>
  );
}

export function useCompany() {
  const ctx = useContext(CompanyContext);
  if (!ctx) throw new Error('useCompany must be used within CompanyProvider');
  return ctx;
}
