import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

type AreaScoresJson = Record<string, unknown> | null;

export interface Company {
  id: string;
  name: string;
  website: string | null;
  created_by: string;
  created_at: string;

  // NEW
  mojo_score: number | null;
  potential_score: number | null;
  projected_score: number | null;
  evidence_status: string | null;
  evidence_note: string | null;
  last_scored_at: string | null;
  area_scores_json: AreaScoresJson;
  public_source_filters_json?: Record<string, unknown> | null;
}

interface CompanyCtx {
  companies: Company[];
  activeCompany: Company | null;
  setActiveCompanyId: (id: string) => void;
  loading: boolean;
  refetch: () => Promise<void>;
}

const CompanyContext = createContext<CompanyCtx | undefined>(undefined);

export function CompanyProvider({ children }: { children: ReactNode }) {
  const { user, isAdmin, loading: authLoading } = useAuth();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [activeId, setActiveId] = useState<string | null>(() =>
    localStorage.getItem('active_company_id')
  );
  const [loading, setLoading] = useState(true);

  const fetchCompanies = useCallback(async () => {
    if (authLoading) {
      setLoading(true);
      return;
    }

    if (!user || !isAdmin) {
      setCompanies([]);
      setActiveId(null);
      localStorage.removeItem('active_company_id');
      setLoading(false);
      return;
    }
    const baseSelect =
      "id,name,website,created_by,created_at,mojo_score,potential_score,projected_score,evidence_status,evidence_note,last_scored_at,area_scores_json";
    const extendedSelect = `${baseSelect},public_source_filters_json`;

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
        }));
      }
    }

    if (error) {
      console.error("[companies] fetch error:", error);
      setCompanies([]);
      setLoading(false);
      return;
    }

    setCompanies((data as Company[]) || []);
    setLoading(false);
  }, [user, isAdmin, authLoading]);

  useEffect(() => {
    fetchCompanies();
  }, [fetchCompanies]);

  const setActiveCompanyId = (id: string) => {
    setActiveId(id);
    localStorage.setItem('active_company_id', id);
  };

  useEffect(() => {
    if (companies.length === 0) return;

    const stillExists = activeId ? companies.some((company) => company.id === activeId) : false;
    if (stillExists) return;

    const nextId = companies[0].id;
    setActiveId(nextId);
    localStorage.setItem('active_company_id', nextId);
  }, [companies, activeId]);

  const activeCompany = companies.find((c) => c.id === activeId) ?? companies[0] ?? null;

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
