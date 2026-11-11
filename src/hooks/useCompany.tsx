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
  /** DB authority for the freeze (companies.frozen + enforce_company_freeze trigger). The client
   *  id list in @/lib/frozenCompanies is a cosmetic pre-check only. */
  frozen?: boolean | null;
  /** R40: a non-null hold marks a test fixture — never a default, never selectable, never a client surface. */
  fixture_hold?: string | null;
  id: string;
  name: string;
  website: string | null;
  /** The company declared it has no public site (2026-09-16): nothing is crawled, searched for, or born from its name. */
  no_public_site?: boolean | null;
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

// U6-62 (2026-11-11) — THE PUBLIC FALLBACK COMPANY IS GONE. What stood here was a complete fake
// company: a real client's name, website, three scores and a phase, handed to every caller who was
// not an admin. It was never a preview of anything. `internal` is the default presentation mode, so
// a visitor with no localStorage and no session got it on eleven routes, and a visitor with
// "client" stored got the whole Decision Command Screen on it. U6-46 shut the routes; this removes
// the thing they were showing.
//
// THE ID SURVIVES AND NOTHING ELSE DOES. The deleted installer PERSISTED this id to
// `active_company_id`, so browsers still carry it today, and an unknown stored id must not become a
// member's company. It is kept to RECOGNISE and DELETE a stored copy — there is no name, no
// website, no score, and no company object anywhere for it to name. Nothing renders from it.
const LEGACY_SENTINEL_COMPANY_ID = "00000000-0000-0000-0000-000000000001";

// N4 (2026-09-26) — THE DEFAULT SKIPS FROZEN COMPANIES. The preferred name is "cafe barra", which
// on the live fleet is CB1 — the frozen reference fixture. So a browser with no stored selection
// opened every provider-driven surface on the one company whose write controls are all refused:
// the Company page's own sections, the freeze trigger on 96 tables, the lot. A first-ever visit
// landing on a read-only fixture is not a useful default.
//
// IF EVERY COMPANY IS FROZEN the old answer stands (preferred, else the first row) — a fleet with
// nothing writable still has to resolve to something, and refusing to pick would leave the whole
// app with no company at all.
export function pickDefaultCompanyId(companies: Company[]): string | null {
  if (companies.length === 0) return null;

  // R40: a HELD company (fixture_hold) is never the default, even when every other row is frozen
  const unheld = companies.filter((company) => !company.fixture_hold);
  if (unheld.length === 0) return null;
  const selectable = unheld.filter((company) => company.frozen !== true);
  const pool = selectable.length > 0 ? selectable : unheld;

  const preferred = pool.find((company) =>
    company.name.trim().toLowerCase() === PREFERRED_COMPANY_NAME,
  );

  return preferred?.id ?? pool[0].id;
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
  // copy is cleared on load. `active_company_id` is read/written only inside this hook, so this is
  // the only door.
  //
  // U6-62: A STORED ID IS A CLAIM, NOT AN AUTHORITY. Clearing the sentinel is not what keeps a
  // caller off a company they do not hold — the effect below does, by discarding any stored id that
  // is not in the list the SERVER returned for this caller. This purge just stops a known-dead id
  // from surviving in storage.
  const [activeId, setActiveId] = useState<string | null>(() => {
    const stored = safeLocalStorageGet('active_company_id');
    if (stored === LEGACY_SENTINEL_COMPANY_ID) {
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

  const fetchCompanies = useCallback(async (signal?: AbortSignal) => {
    if (authLoading) {
      setLoading(true);
      return;
    }

    const baseSelect =
      "id,name,website,created_by,created_at,frozen,fixture_hold,mojo_score,potential_score,projected_score,evidence_status,evidence_note,last_scored_at,area_scores_json,industry_key,no_public_site";
    const extendedSelect = `${baseSelect},public_source_filters_json,program_phase,excluded_signals_json,selected_route_id,selected_route_summary_json,selected_route_updated_at,engagement_started_at`;

    // U6 part 1 — NO SESSION, NO COMPANIES. The deleted branch answered this case with the fake
    // company; the honest answer is an empty list. Every route that renders a company is behind a
    // session (U6-46), so nothing downstream needs a stand-in, and a stored id is dropped here
    // rather than left to point at a company this browser can no longer read.
    if (!user) {
      setCompanies([]);
      setActiveId(null);
      safeLocalStorageRemove("active_company_id");
      setFetchError(null);
      setLoading(false);
      return;
    }

    // U6 part 1 — A MEMBER READS THEIR OWN COMPANIES, FROM THE SERVER.
    //
    // The query is `company_members` with the company embedded, not `companies` filtered: the
    // membership row is the authority on what this account holds, and its own SELECT policy
    // ("Users see own or admin all company_members", user_id = auth.uid()) means a member's query
    // can only ever return their own rows. The `companies` policy carries a second arm,
    // `created_by = auth.uid()`, which would hand a self-created company to a non-member — reading
    // through the membership table means that arm cannot widen this list.
    //
    // ORDER IS MEMBERSHIP ORDER (U6-49): created_at DESCENDING, so the most recently assigned
    // company is companies[0]. The landing resolver takes that order as given and does not re-sort,
    // which is why it is applied here, on the only query that knows it.
    if (!isAdmin) {
      let mq = supabase
        .from("company_members")
        .select(`created_at,companies!inner(${extendedSelect})`)
        .order("created_at", { ascending: false });
      if (signal) mq = mq.abortSignal(signal) as typeof mq;
      const mr = (await mq) as unknown as { data: Array<{ companies: unknown }> | null; error: any };
      if (signal?.aborted || pageUnloadingRef.current || isAbortLikeError(mr.error)) return;
      lastFetchAttemptsRef.current = { attempts: 1, retries: 0 };
      if (mr.error) {
        // U6-54: a refused or failed read is a FAILURE, never "you belong to nothing". S-U6-1 is
        // reserved for an account the server said has no membership.
        console.error("[companies] member fetch error:", mr.error);
        setFetchError(mr.error.message || "companies fetch failed");
        setLoading(false);
        return;
      }
      setFetchError(null);
      const seen = new Set<string>();
      const own: Company[] = [];
      for (const row of mr.data ?? []) {
        const c = row?.companies as Company | null;
        // Two memberships on one company (different roles) would list it twice; keep the first,
        // which is the most recent by the ordering above.
        if (!c?.id || seen.has(c.id)) continue;
        seen.add(c.id);
        own.push({
          ...c,
          engagement_phase: normalizeEngagementPhase(c.program_phase),
          engagement_phase_set: c.program_phase != null,
        });
      }
      setCompanies(own);
      setLoading(false);
      return;
    }

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
  }, [user, isAdmin, authLoading]);

  useEffect(() => {
    const controller = new AbortController();
    void fetchCompanies(controller.signal);
    return () => controller.abort();
  }, [fetchCompanies]);

  const setActiveCompanyId = (id: string) => {
    // R40: a held company can never become the active one
    if (companies.some((c) => c.id === id && c.fixture_hold)) return;
    setActiveId(id);
    safeLocalStorageSet('active_company_id', id);
  };

  // U6-62 — A STORED ID CANNOT SELECT A COMPANY. This reconciles the stored id against the list the
  // SERVER returned for this caller: if it is not in that list it is discarded, whatever it names.
  // That is what makes a stale id (a company the account was removed from) and a foreign id (one
  // guessed or pasted, or left behind by the deleted fallback) both resolve to the caller's own
  // company rather than to the stored one.
  //
  // IT WAITS FOR THE FETCH. `companies` is [] while loading, and acting then would wipe a perfectly
  // good id on every reload. The old form returned early on an empty list, which also meant a
  // signed-in account with NO companies kept its stored id forever — now it is cleared.
  //
  // A MEMBER'S DEFAULT IS MEMBERSHIP ORDER, not pickDefaultCompanyId: that picker prefers a company
  // by NAME and skips frozen ones, which is the right answer for an operator choosing among the
  // fleet and the wrong one for an account that holds exactly what it was assigned. companies[0] is
  // the most recently assigned (U6-49), the same company the landing resolver sends them to.
  useEffect(() => {
    if (loading) return;

    const stillExists = activeId ? companies.some((company) => company.id === activeId) : false;
    if (stillExists) return;

    if (companies.length === 0) {
      if (activeId !== null) {
        setActiveId(null);
        safeLocalStorageRemove('active_company_id');
      }
      return;
    }

    const nextId = isAdmin ? pickDefaultCompanyId(companies) : companies[0].id;
    if (!nextId) {
      if (activeId !== null) {
        setActiveId(null);
        safeLocalStorageRemove('active_company_id');
      }
      return;
    }
    setActiveId(nextId);
    safeLocalStorageSet('active_company_id', nextId);
  }, [companies, activeId, isAdmin, loading]);

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
