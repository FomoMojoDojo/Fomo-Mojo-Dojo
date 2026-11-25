// ── MojoScore v1 — Type Definitions ──────────────────────────────────────────
//
// Pure type shapes. No imports from React or Supabase so contributors remain
// independently testable. Raw DB row shapes are re-declared inline to avoid
// coupling to hook files.

export type ClaimState = "outside_view" | "diagnose" | "focus" | "flow";

// Minimal claim shape needed by contributors (no React imports).
export type ClaimInput = {
  id: string;
  state: ClaimState;
  claim_type: string | null;
  topic: string | null;
  outside_support_count: number;
  organization_support_count: number;
  customer_support_count: number;
  updated_at: string | null;
};

export type DetailItemInput = {
  id: string;
  title: string;
  status: "complete" | "in_progress" | "missing" | string;
};

// Minimal route shape needed by contributors.
export type RouteInput = {
  id: string;
  category: string;
  level?: string | null;
  parent_id?: string | null;
  claim_id?: string | null;
  steps_json?: DetailItemInput[] | null;
  evidence_json?: DetailItemInput[] | null;
  why_this_matters_json?: string[] | null;
  rejected_alternatives?: Array<{
    alternative_title: string;
    rejection_reason: string;
    considered_at?: string;
  }> | null;
  what_would_have_to_be_true?: Array<{
    condition: string;
    satisfied_flag: boolean;
    evidence_refs?: string[];
  }> | null;
  linked_need_ids?: string[] | null;
  updated_at?: string | null;
};

// Minimal need shape needed by contributors.
export type NeedInput = {
  id: string;
  desired_outcome: string;
  importance: number;
  satisfaction: number;
  opportunity_score: number;
  service_state: string;
  updated_at?: string | null;
};

// ── Input bundle passed to every contributor ──────────────────────────────────

export type MojoScoreInput = {
  companyId: string;
  claims: ClaimInput[];
  routes: RouteInput[];
  needs: NeedInput[];
  computedAt: string; // ISO timestamp
};

// ── Output shapes ─────────────────────────────────────────────────────────────

export type ContributorScore = {
  key: string;
  label: string;
  /** Raw 0–100 contributor score before weighting. */
  score: number;
  /** Fraction of total score this contributor accounts for (0–1). */
  weight: number;
  /** score × weight — contribution to the total (0–100 scale). */
  weighted: number;
  /** ≤200 char editorial explanation surfaced in the UI. */
  explanation: string;
  /** Optional sub-breakdown keyed by label. */
  sub_scores?: Record<string, number>;
};

export type ProjectedRaise = {
  action_description: string;
  estimated_points: number;
  confidence: "high" | "medium" | "low";
};

/** High-level engagement state derived from claim distribution. */
export type EngagementState =
  | "forming"       // < 20% diagnose-or-above
  | "diagnosing"    // diagnose-or-above ≥ 50%, focus+flow < 10%
  | "focusing"      // focus+flow ≥ 10%, flow < 30%
  | "committing"    // flow ≥ 30%, flow < 60%
  | "accelerating"; // flow ≥ 60%

export type MojoScoreResult = {
  company_id: string;
  total_score: number;
  contributors: ContributorScore[];
  projected_raisers: ProjectedRaise[];
  engagement_state: EngagementState;
  methodology_version: string;
  computed_at: string;
};

// ── THE SCORE'S INPUT RULE — ONE DEFINITION (SP-478 / SP-682 ruling 3, 2026-11-25) ────────────────
//
// Which rows the Mojo Score counts. The browser's live computation (useLiveMojoScore) and the
// server's snapshot (snapshotMojoScore) used to state this rule separately, and they had drifted:
// the server counted retracted needs and inactive routes and the browser did not. The ruling is the
// browser's rule, and BOTH now apply the three predicates below — the guard
// (mojo-score-authority-guard, check a6) fails if either stops.
//
//   a claim counts   unless it is struck                         (minimized claims keep counting)
//   a route counts   when its relevance_state is 'active'
//   a need counts    when it sits in a market (journey_key set) and is neither retracted nor
//                    proposed; a need linked to two markets counts ONCE
//
// A row that does not CARRY a column (the property is absent, not null) came from a read that
// already applied the rule for it, so it counts. That is what lets a narrow select — or the route
// rows the browser builds from opportunities when the routes read fails — pass through unchanged.
//
// This file is the home for the rule because it is already the home of the score's input shapes and
// is already loaded by the edge runtime; it imports nothing.

/** Where each input is read from. Needs come through the needs_in_market view (M-2). */
export const SCORE_INPUT_SOURCES = { claims: "claims", routes: "routes", needs: "needs_in_market" } as const;
/** The columns a read must select for the rule to be applied to its rows. */
export const SCORE_CLAIM_COLUMNS =
  "id, state, claim_type, topic, outside_support_count, organization_support_count, customer_support_count, updated_at, status";
export const SCORE_ROUTE_COLUMNS =
  "id, category, level, parent_id, claim_id, steps_json, evidence_json, why_this_matters_json, rejected_alternatives, what_would_have_to_be_true, linked_need_ids, updated_at, relevance_state";
export const SCORE_NEED_COLUMNS =
  "id, desired_outcome, importance, satisfaction, opportunity_score, service_state, updated_at, status, journey_key";

export function claimCounts(c: { status?: string | null }): boolean {
  return c.status !== "struck";
}
export function routeCounts(r: { relevance_state?: string | null }): boolean {
  return r.relevance_state === undefined || r.relevance_state === "active";
}
export function needCounts(n: { status?: string | null; journey_key?: string | null }): boolean {
  return n.journey_key !== null && n.status !== "retracted" && n.status !== "proposed";
}

/** The rows the score counts, out of the rows a read returned. Order is kept; a need seen twice
 *  (one row per market link) is kept once, at its first position. */
export function scoreInputSet<
  C extends { status?: string | null },
  R extends { relevance_state?: string | null },
  N extends { id: string; status?: string | null; journey_key?: string | null },
>(rows: { claims: readonly C[]; routes: readonly R[]; needs: readonly N[] }): { claims: C[]; routes: R[]; needs: N[] } {
  const seen = new Set<string>();
  const needs: N[] = [];
  for (const n of rows.needs) {
    if (!needCounts(n) || seen.has(n.id)) continue;
    seen.add(n.id);
    needs.push(n);
  }
  return { claims: rows.claims.filter(claimCounts), routes: rows.routes.filter(routeCounts), needs };
}
