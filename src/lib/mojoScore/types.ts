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
