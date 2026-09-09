import { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { safeLocalStorageGet, safeLocalStorageRemove, safeLocalStorageSet } from '@/lib/safeLocalStorage';
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
  // FD-3: operator-set published industry_reference_job_maps key for the
  // front-door standard map. Exact-match-or-fallback at read; never fuzzy.
  industry_key?: string | null;

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
  // INT-4 tri-state honesty: TRUE only when the operator actually SET a phase
  // (program_phase non-NULL in the DB). The normalized engagement_phase below
  // defaults NULL to "outside_signals", which masked set-vs-derived and
  // dead-coded MapView's adminPhase ?? autoPhase hybrid — no consumer may
  // silently treat a derived phase as a set one.
  engagement_phase_set?: boolean;
  // Normalised, always-valid engagement phase derived from program_phase on read.
  // Use this instead of casting program_phase directly.
  engagement_phase: EngagementPhase;
  excluded_signals_json?: ExcludedSignal[] | null;
  selected_route_id?: string | null;
  selected_route_summary_json?: Record<string, unknown> | null;
  selected_route_updated_at?: string | null;
  engagement_started_at?: string | null;
}

interface CompanyCtx {
  companies: Company[];
  activeCompany: Company | null;
  setActiveCompanyId: (id: string) => void;
  fetchError?: string | null;
  loading: boolean;
  refetch: () => Promise<void>;
  /** H3: attempts/retries the last companies fetch took (1/0 = answered first time). */
  fetchAttempts?: { attempts: number; retries: number };
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
  engagement_phase_set: true, // mock company behaves as operator-set
  engagement_phase: "outside_signals",
  excluded_signals_json: [],
  selected_route_id: null,
  selected_route_summary_json: null,
  selected_route_updated_at: null,
  engagement_started_at: null,
};

function pickDefaultCompanyId(companies: Company[]): string | null {
  if (companies.length === 0) return null;

  const preferred = companies.find((company) =>
    company.name.trim().toLowerCase() === PREFERRED_COMPANY_NAME,
  );

  return preferred?.id ?? companies[0].id;
}

import {
  COMPANIES_BACKOFF_MS, COMPANIES_FETCH_ATTEMPTS,
  fetchWithTransientRetry, isTransientFetchError,
} from "@/lib/companies/companiesFetchRetry";

function isAbortLikeError(error: { message?: string; details?: string } | null | undefined) {
  const text = `${String(error?.message || "")} ${String(error?.details || "")}`.toLowerCase();
  return text.includes("abort") || text.includes("aborted");
}

export function CompanyProvider({ children }: { children: ReactNode }) {
  const { user, isAdmin, loading: authLoading } = useAuth();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [fetchError, setFetchError] = useState<string | null>(null);
  // H3.3 (2026-09-09): the sentinel id could be PERSISTED by the old error branch, so it outlived
  // the network blip that produced it and kept sending First Read to "Company not found". Any stored
  // copy is cleared on load. The literal lives in exactly one place (PUBLIC_CAFE_BARRA_FALLBACK
  // above) and `active_company_id` is read/written only inside this hook, so this is the only door.
  const [activeId, setActiveId] = useState<string | null>(() => {
    const stored = safeLocalStorageGet('active_company_id');
    if (stored === PUBLIC_CAFE_BARRA_FALLBACK.id) {
      safeLocalStorageRemove('active_company_id');
      return null;
    }
    return stored;
  });
  const [loading, setLoading] = useState(true);
  const pageUnloadingRef = useRef(false);
  // H3 — how many attempts the last companies fetch took. Exposed on the context so a test can
  // assert the retry actually happened (and, with the plant removed, that it did NOT: retries 0).
  const lastFetchAttemptsRef = useRef<{ attempts: number; retries: number }>({ attempts: 0, retries: 0 });

  useEffect(() => {
    const markPageUnloading = () => {
      pageUnloadingRef.current = true;
    };

    window.addEventListener("pagehide", markPageUnloading);
    window.addEventListener("beforeunload", markPageUnloading);

    return () => {
      window.removeEventListener("pagehide", markPageUnloading);
      window.removeEventListener("beforeunload", markPageUnloading);
    };
  }, []);

  const setFallbackPublicCompany = useCallback(() => {
    setCompanies([PUBLIC_CAFE_BARRA_FALLBACK]);
    const nextId = PUBLIC_CAFE_BARRA_FALLBACK.id;
    setActiveId((current) => current ?? nextId);
    if (!safeLocalStorageGet("active_company_id")) {
      safeLocalStorageSet("active_company_id", nextId);
    }
    setLoading(false);
  }, []);

  const fetchCompanies = useCallback(async (signal?: AbortSignal) => {
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
      "id,name,website,created_by,created_at,mojo_score,potential_score,projected_score,evidence_status,evidence_note,last_scored_at,area_scores_json,industry_key";
    const extendedSelect = `${baseSelect},public_source_filters_json,program_phase,excluded_signals_json,selected_route_id,selected_route_summary_json,selected_route_updated_at,engagement_started_at`;

    // The builder is REBUILT per attempt: a supabase query builder is a single-use thenable, so a
    // retry that re-awaited the same object would not re-issue the request.
    const runCompaniesQuery = async (select: string) => {
      let q = supabase.from("companies").select(select).order("created_at", { ascending: true });
      if (signal) q = q.abortSignal(signal);
      const r = (await q) as { data: unknown; error: unknown };
      return { data: (r.data ?? null) as any[] | null, error: r.error as any };
    };

    // H3.1 — a dropped connection is TRANSIENT, not an answer. Retry with backoff before calling it
    // a failure; a real error (permission, bad column, 400) still fails on the first attempt.
    const attempt = await fetchWithTransientRetry<any[]>({
      run: () => runCompaniesQuery(extendedSelect),
      maxAttempts: COMPANIES_FETCH_ATTEMPTS,
      backoffMs: COMPANIES_BACKOFF_MS,
      shouldAbort: () => !!signal?.aborted || pageUnloadingRef.current,
    });
    lastFetchAttemptsRef.current = { attempts: attempt.attempts, retries: attempt.retries };
    if (attempt.aborted) return;
    let { data, error } = attempt as { data: any[] | null; error: any };

    if (signal?.aborted || pageUnloadingRef.current || isAbortLikeError(error)) {
      return;
    }

    const missingColumn =
      !!error &&
      /public_source_filters_json|column .* does not exist|schema cache/i.test(
        String((error as { message?: string } | null)?.message || ""),
      );

    if (missingColumn) {
      const fallback = await fetchWithTransientRetry<any[]>({
        run: () => runCompaniesQuery(baseSelect),
        maxAttempts: COMPANIES_FETCH_ATTEMPTS,
        backoffMs: COMPANIES_BACKOFF_MS,
        shouldAbort: () => !!signal?.aborted || pageUnloadingRef.current,
      });
      if (fallback.aborted) return;
      lastFetchAttemptsRef.current = {
        attempts: lastFetchAttemptsRef.current.attempts + fallback.attempts,
        retries: lastFetchAttemptsRef.current.retries + fallback.retries,
      };
      data = (fallback.data ?? []) as any[];
      error = fallback.error;
      if (signal?.aborted || pageUnloadingRef.current || isAbortLikeError(error)) {
        return;
      }
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
      console.error(
        `[companies] fetch error after ${lastFetchAttemptsRef.current.attempts} attempt(s)` +
        `${isTransientFetchError(error) ? " (transient, retries exhausted)" : " (non-transient)"}:`,
        error,
      );
      // Integrity sweep: the failure is VISIBLE state, not just a console line.
      setFetchError(error.message || "companies fetch failed");
      // H3.2 (2026-09-09): a FAILED QUERY NO LONGER INSTALLS THE SENTINEL. Substituting a fake
      // company for a real list is not a graceful degrade — it sent the operator to
      // /first-read/00000000-…-0001 ("Company not found") and persisted that id. The banner is the
      // honest state; the list stays as it was. The sentinel now has exactly one caller: the
      // not-admin guard above, which is the public-preview case it was written for.
      setLoading(false);
      return;
    }
    setFetchError(null);

    const companies = ((data as Company[]) || []).map((row) => ({
      ...row,
      engagement_phase: normalizeEngagementPhase(row.program_phase),
      engagement_phase_set: row.program_phase != null,
    }));
    setCompanies(companies);
    setLoading(false);
  }, [user, isAdmin, authLoading, setFallbackPublicCompany]);

  useEffect(() => {
    const controller = new AbortController();
    void fetchCompanies(controller.signal);
    return () => controller.abort();
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
    <CompanyContext.Provider value={{ companies, activeCompany, setActiveCompanyId, loading, fetchError, refetch: fetchCompanies, fetchAttempts: lastFetchAttemptsRef.current }}>
      {children}
    </CompanyContext.Provider>
  );
}

export function useCompany() {
  const ctx = useContext(CompanyContext);
  if (!ctx) throw new Error('useCompany must be used within CompanyProvider');
  return ctx;
}

// Non-throwing variant for controls that can mount outside CompanyProvider
// (e.g. in isolated tests): returns undefined instead of throwing.
export function useCompanyIfAvailable() {
  return useContext(CompanyContext);
}
