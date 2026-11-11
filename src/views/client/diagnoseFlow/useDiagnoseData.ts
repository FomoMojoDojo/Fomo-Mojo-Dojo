// DIAGNOSE FLOW · SLICE 1 — THE ONE READ (rulings P2/P3: read-only, no new stores).
//
// Every statement in this file is a SELECT. There is no insert, update, delete, RPC or
// functions.invoke here, and none may be added: slice 1 renders what other paths wrote. The callers
// census in the STOP 1 report turns on that fact — this route must never reach evaluate-*,
// propose-*, refresh-*, assess-surface-drift or council-review, and the hooks it reuses
// (useCompanyFiles, useFileProposals, useRoutes, useOdiNeeds, useCompanyClaims, useLiveMojoScore)
// were each checked to carry zero invokes.
//
// NOT in src/lib/diagnose/ on purpose: that directory is the 2026-10-01 Diagnose data layer, and
// diagnose-data-guard check (e) fails on any mojoScore import there. The SCORE RULE (P13) requires
// useLiveMojoScore, so this read lives beside the screens instead.
//
// DISPLAY HONESTY (spec, closing line): this hook returns ROWS AND COUNTS. It never returns a
// sentence. Every number a screen shows comes from here or is omitted; nothing is typed in.
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyFiles } from "@/hooks/useCompanyFiles";
import { useFileProposals } from "@/hooks/useFileProposals";
import { useRoutes } from "@/hooks/useRoutes";
import { useOdiNeeds } from "@/hooks/useOdiNeeds";
import { useCompanyClaims } from "@/lib/claims/useCompanyClaims";
import { useLiveMojoScore } from "@/views/client/workspace/useLiveMojoScore";
import type { MojoScoreResult } from "@/lib/mojoScore/types";

/** W1 / Send: one uploaded document and what its accepted proposals added. */
export type DiagnoseDocument = {
  readonly id: string;
  readonly fileName: string;
  readonly uploadedAt: string;
  /** Any accepted proposal for this file. */
  readonly added: boolean;
  /** Any proposal whose processing_state is 'failed'. */
  readonly failed: boolean;
  /** G6 — which candidate kinds the ACCEPTED proposals carry, in the signed order. */
  readonly kinds: {
    readonly positioning: boolean;
    readonly goals: boolean;
    readonly groups: boolean;
    readonly routes: boolean;
  };
};

/** W2: one of the four base parts — the declared line and the outside line, each possibly absent. */
export type DiagnoseBasePart = {
  readonly key: "promise" | "positioning" | "strategy" | "serves";
  readonly declared: string | null;
  readonly outside: string | null;
};

export type DiagnoseProblem = { readonly id: string; readonly statement: string; readonly source: string | null };

export type DiagnoseGoal = {
  readonly id: string;
  readonly statement: string;
  /** The spec's "Today:" sub-line renders only when a start value exists. managed_outcomes holds no
   *  scalar start value in any column (STOP 1 finding ③), so this is null for every row today — the
   *  sub-line is omitted rather than invented, and lights up on its own when a store arrives. */
  readonly todayValue: string | null;
  /** "What's fixed" — managed_outcomes.constraint when non-null. */
  readonly fixed: string | null;
};

export type DiagnoseMarketGroup = {
  readonly id: string;
  readonly group: string;
  readonly job: string | null;
  /** recipient | referrer | funder | partner | user → a role chip. Anything else (and NULL) → none. */
  readonly role: "recipient" | "referrer" | "funder" | "partner" | "user" | null;
  /** True when relationship_kind is NULL or unmapped — the operator-only flag. */
  readonly roleUnknown: boolean;
  /** market_register: public_inferred → the outside read; internal_* → the company's documents. */
  readonly fromOutside: boolean;
};

export type DiagnoseInitiative = {
  readonly id: string;
  readonly title: string;
  /** what_would_have_to_be_true[].condition — one "This bets that:" sub-line each. */
  readonly bets: readonly string[];
  /** N2 — m: how many conditions the route depends on. */
  readonly conditions: number;
  /** N2 / O1 — n: how many of them have EVIDENCE, read strictly. A condition is evidenced only
   *  when a stored link names the evidence: `evidence_refs` non-empty. O1 settles that a bare
   *  `satisfied_flag`, and a check_outcomes row with no refs, are NOT evidence — a mark with
   *  nothing attached says someone looked, not what they found. Stage A (2026-11-09) measured the
   *  whole database: 0 conditions carry an `evidence_refs` key and 0 of the 3 check_outcomes rows
   *  carry a ref, so this is 0 for every route today and the Ahead zone says so. */
  readonly evidenced: number;
};

export type DiagnoseHypothesis = { readonly id: string; readonly statement: string; readonly kind: string | null };

export type DiagnosePerson = {
  readonly id: string;
  readonly name: string | null;
  readonly role: string | null;
  readonly interviewedAt: string | null;
};

export type DiagnoseData = {
  readonly loading: boolean;
  readonly company: string | null;
  readonly documents: readonly DiagnoseDocument[];
  readonly baseParts: readonly DiagnoseBasePart[];
  readonly problems: readonly DiagnoseProblem[];
  readonly goals: readonly DiagnoseGoal[];
  readonly market: readonly DiagnoseMarketGroup[];
  readonly initiatives: readonly DiagnoseInitiative[];
  readonly hypotheses: readonly DiagnoseHypothesis[];
  readonly people: readonly DiagnosePerson[];
  readonly firstReadStartedAt: string | null;
  readonly score: MojoScoreResult | null;
};

const ROLES = ["recipient", "referrer", "funder", "partner", "user"] as const;
type Role = (typeof ROLES)[number];

function text(v: unknown): string | null {
  return typeof v === "string" && v.trim().length > 0 ? v.trim() : null;
}

function jsonLength(v: unknown): number {
  return Array.isArray(v) ? v.length : 0;
}

type BaseRow = {
  artifact_role: string | null;
  value_for_customer: string | null;
  market_category: string | null;
  best_fit_customers: string | null;
  winning_aspiration: string | null;
  where_to_play: string | null;
  how_to_win: string | null;
};

/** The reads that have no hook of their own yet. One effect, one abort flag, no writes. */
function useDirectReads(companyId: string | undefined) {
  const [state, setState] = useState<{
    loading: boolean;
    positioning: BaseRow[];
    cascades: BaseRow[];
    problems: DiagnoseProblem[];
    goals: DiagnoseGoal[];
    market: DiagnoseMarketGroup[];
    hypotheses: DiagnoseHypothesis[];
    people: DiagnosePerson[];
    firstReadStartedAt: string | null;
  }>({
    loading: false, positioning: [], cascades: [], problems: [], goals: [], market: [],
    hypotheses: [], people: [], firstReadStartedAt: null,
  });

  useEffect(() => {
    if (!companyId) return;
    let cancelled = false;
    setState((s) => ({ ...s, loading: true }));
    void (async () => {
      const [pos, cas, sps, intake, frsp, outcomes, mkt, hyp, people, frs] = await Promise.all([
        supabase.from("positioning_canvases")
          .select("artifact_role, value_for_customer, market_category, best_fit_customers")
          .eq("company_id", companyId),
        supabase.from("strategy_cascades")
          .select("artifact_role, winning_aspiration, where_to_play, how_to_win")
          .eq("company_id", companyId),
        supabase.from("strategy_problem_statements")
          .select("id, statement, source, status").eq("company_id", companyId),
        supabase.from("intake_responses")
          .select("id, explicit_strategic_problem, where_stuck, source").eq("company_id", companyId),
        supabase.from("first_read_stated_problem")
          .select("id, statement, register, status").eq("company_id", companyId),
        supabase.from("managed_outcomes")
          .select("id, outcome_statement, outcome_title, constraint").eq("company_id", companyId),
        supabase.from("odi_market_definitions")
          .select("id, job_executor, jtbd, relationship_kind, market_register")
          .eq("company_id", companyId).is("retracted_at", null),
        supabase.from("strategic_hypotheses")
          .select("id, statement, hypothesis_kind, is_active").eq("company_id", companyId),
        // W9 "Who should be heard?" — tier 1 (U6-14). Name, role and date, never the text, and the
        // same door fetchDiagnoseRunning uses, so the people W9 lists are exactly the people that
        // made Diagnose "running". The function filters retracted rows and resolves membership.
        (supabase as unknown as { rpc: (n: string, a: Record<string, unknown>, o?: { get?: boolean }) => Promise<{ data: unknown }> })
          .rpc("interview_people", { p_company_ids: [companyId] }, { get: true }),
        supabase.from("first_read_sessions")
          .select("started_at").eq("company_id", companyId).order("started_at", { ascending: true }).limit(1),
      ]);
      if (cancelled) return;

      const rows = <T,>(r: { data: unknown }) => (Array.isArray(r.data) ? (r.data as T[]) : []);

      const problems: DiagnoseProblem[] = [
        ...rows<Record<string, unknown>>(sps)
          .filter((r) => r.status !== "retired" && text(r.statement))
          .map((r) => ({ id: String(r.id), statement: text(r.statement)!, source: text(r.source) })),
        ...rows<Record<string, unknown>>(intake)
          .flatMap((r) => [text(r.explicit_strategic_problem), text(r.where_stuck)]
            .filter((v): v is string => v !== null)
            .map((statement, i) => ({ id: `${String(r.id)}:${i}`, statement, source: text(r.source) }))),
        ...rows<Record<string, unknown>>(frsp)
          .filter((r) => r.status !== "retired" && text(r.statement))
          .map((r) => ({ id: String(r.id), statement: text(r.statement)!, source: text(r.register) })),
      ];

      const goals: DiagnoseGoal[] = rows<Record<string, unknown>>(outcomes)
        .map((r) => ({
          id: String(r.id),
          statement: text(r.outcome_statement) ?? text(r.outcome_title) ?? "",
          todayValue: null, // see DiagnoseGoal.todayValue
          fixed: text(r.constraint),
        }))
        .filter((g) => g.statement.length > 0);

      const market: DiagnoseMarketGroup[] = rows<Record<string, unknown>>(mkt)
        .map((r) => {
          const kind = text(r.relationship_kind);
          const role = (ROLES as readonly string[]).includes(kind ?? "") ? (kind as Role) : null;
          return {
            id: String(r.id),
            group: text(r.job_executor) ?? "",
            job: text(r.jtbd),
            role,
            roleUnknown: role === null,
            fromOutside: String(r.market_register ?? "").startsWith("public_"),
          };
        })
        .filter((m) => m.group.length > 0);

      setState({
        loading: false,
        positioning: rows<BaseRow>(pos),
        cascades: rows<BaseRow>(cas),
        problems,
        goals,
        market,
        hypotheses: rows<Record<string, unknown>>(hyp)
          .filter((r) => r.is_active !== false && text(r.statement))
          .map((r) => ({ id: String(r.id), statement: text(r.statement)!, kind: text(r.hypothesis_kind) })),
        people: rows<Record<string, unknown>>(people)
          .map((r) => ({
            id: String(r.id),
            name: text(r.person_name),
            role: text(r.person_role),
            interviewedAt: text(r.interviewed_at),
          })),
        firstReadStartedAt: text(rows<Record<string, unknown>>(frs)[0]?.started_at),
      });
    })();
    return () => { cancelled = true; };
  }, [companyId]);

  return state;
}

export function useDiagnoseData(companyId: string | undefined, companyName: string | null): DiagnoseData {
  const files = useCompanyFiles(companyId);
  const proposals = useFileProposals(companyId);
  const { items: routes } = useRoutes(companyId);
  const { needs } = useOdiNeeds(companyId);
  const { claims } = useCompanyClaims(companyId);
  const score = useLiveMojoScore(companyId, claims, routes, needs);
  const direct = useDirectReads(companyId);

  const documents = useMemo<DiagnoseDocument[]>(() => {
    const byFile = new Map<string, Array<Record<string, unknown>>>();
    for (const p of (proposals.data ?? []) as unknown as Array<Record<string, unknown>>) {
      const fid = typeof p.file_id === "string" ? p.file_id : null;
      if (!fid) continue;
      const list = byFile.get(fid);
      if (list) list.push(p); else byFile.set(fid, [p]);
    }
    return (files.data ?? [])
      // Gate B's interview transcripts are not documents on this surface — W9 holds the people, and
      // the DATA MAPPING keeps a person's name off every other screen.
      .filter((f) => !f.is_interview)
      .map((f) => {
        const ps = byFile.get(f.id) ?? [];
        const accepted = ps.filter((p) => p.status === "accepted");
        return {
          id: f.id,
          fileName: f.file_name,
          uploadedAt: f.uploaded_at,
          added: accepted.length > 0,
          failed: ps.some((p) => p.processing_state === "failed"),
          kinds: {
            positioning: accepted.some((p) => jsonLength(p.candidate_positioning_updates) > 0),
            goals: accepted.some((p) => jsonLength(p.candidate_outcomes) > 0),
            groups: accepted.some((p) => jsonLength(p.candidate_needs) > 0 || jsonLength(p.candidate_job_steps) > 0),
            routes: accepted.some((p) => jsonLength(p.possible_routes) > 0),
          },
        };
      });
  }, [files.data, proposals.data]);

  const baseParts = useMemo<DiagnoseBasePart[]>(() => {
    const pick = (rows: BaseRow[], role: string) => rows.find((r) => r.artifact_role === role) ?? null;
    const declaredPos = pick(direct.positioning, "declared_direction");
    const outsidePos = pick(direct.positioning, "market_read");
    const declaredCas = pick(direct.cascades, "declared_direction");
    const outsideCas = pick(direct.cascades, "market_read");
    // "Who the company serves" has no declared store yet (DATA MAPPING: MISSING), so its declared
    // side is null by construction and the item renders the outside side with the none-yet state.
    const serves = direct.market.filter((m) => m.role === "recipient").map((m) => m.group).join(" · ");
    return [
      { key: "promise", declared: text(declaredPos?.value_for_customer), outside: text(outsidePos?.value_for_customer) },
      { key: "positioning", declared: text(declaredPos?.market_category), outside: text(outsidePos?.market_category) },
      { key: "strategy", declared: text(declaredCas?.winning_aspiration), outside: text(outsideCas?.winning_aspiration) },
      { key: "serves", declared: null, outside: text(serves) },
    ];
  }, [direct.positioning, direct.cascades, direct.market]);

  const initiatives = useMemo<DiagnoseInitiative[]>(() =>
    routes
      .filter((r) => r.level === "route")
      .map((r) => {
        const conds = Array.isArray(r.what_would_have_to_be_true) ? r.what_would_have_to_be_true : [];
        return {
          id: r.id,
          title: text(r.title) ?? "",
          bets: conds
            .map((w) => text((w as { condition?: unknown })?.condition))
            .filter((v): v is string => v !== null),
          conditions: conds.length,
          evidenced: conds.filter((w) => jsonLength((w as { evidence_refs?: unknown })?.evidence_refs) > 0).length,
        };
      })
      .filter((r) => r.title.length > 0),
  [routes]);

  return {
    loading: files.isLoading || proposals.isLoading || direct.loading,
    company: companyName,
    documents,
    baseParts,
    problems: direct.problems,
    goals: direct.goals,
    market: direct.market,
    initiatives,
    hypotheses: direct.hypotheses,
    people: direct.people,
    firstReadStartedAt: direct.firstReadStartedAt,
    score,
  };
}

// ── DERIVATIONS (pure, so the screens stay dumb and these stay testable) ────────────────────────

/** G3 — a count line drops a zero segment; all zero → no line at all. */
export function countSegments(segments: ReadonlyArray<{ n: number; text: string }>): string[] {
  return segments.filter((s) => s.n > 0).map((s) => s.text);
}

/** W2 — "{a} of {b} lines both say it" needs b, the number of base parts. */
export const BASE_PART_COUNT = 4;

/** Home card 3's base row: parts whose declared AND outside side are both present. */
export function basePartsAgreed(parts: readonly DiagnoseBasePart[]): number {
  return parts.filter((p) => p.declared !== null && p.outside !== null).length;
}

/** Home card 1 / In focus: the live records with no name. */
export function unnamedPeople(people: readonly DiagnosePerson[]): readonly DiagnosePerson[] {
  return people.filter((p) => p.name === null);
}

/** G4 — roles are listed only when EVERY unnamed record has one. */
export function unnamedRoles(people: readonly DiagnosePerson[]): readonly string[] {
  const unnamed = unnamedPeople(people);
  if (unnamed.length === 0) return [];
  return unnamed.every((p) => p.role !== null) ? unnamed.map((p) => p.role!) : [];
}

/** A real date, formatted for a live screen. Never a placeholder — absent means the card is omitted. */
export function formatDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return null;
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}
