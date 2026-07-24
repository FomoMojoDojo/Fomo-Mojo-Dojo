// ── Claim State Machine — Core Types ─────────────────────────────────────────
//
// These types are the source of truth for the claim lifecycle.
// No DB calls here — purely structural definitions.

export type ClaimState = "outside_view" | "diagnose" | "focus" | "flow";
export type ClaimStateOrRetired = ClaimState | "retired";
export type ActionCategory = "fix" | "improve" | "create";

// Ordered list used for transition validation (skip-state detection).
export const CLAIM_STATE_ORDER: ClaimState[] = [
  "outside_view",
  "diagnose",
  "focus",
  "flow",
];

export function claimStateIndex(state: ClaimState): number {
  return CLAIM_STATE_ORDER.indexOf(state);
}

/** True when toState skips at least one state above fromState (forward only). */
export function isSkipTransition(
  fromState: ClaimState,
  toState: ClaimState,
): boolean {
  const fromIdx = claimStateIndex(fromState);
  const toIdx = claimStateIndex(toState);
  return toIdx > fromIdx + 1;
}

// ── Stored event shape (matches claim_events table) ───────────────────────────

export type ClaimEvent = {
  id: string;
  company_id: string;
  claim_id: string;
  from_state: ClaimState | null; // null = initial state set by migration
  to_state: ClaimStateOrRetired;
  triggered_by_event: string;
  evidence_delta: EvidenceDelta;
  occurred_at: string;
};

export type EvidenceDelta = {
  added_signal_ids?: string[];
  removed_signal_ids?: string[];
  changed_triangulation?: { from: string; to: string };
  note?: string;
};

// ── Gate input shapes (minimal — do not import full row types) ────────────────
//
// Gate functions receive only what they need. This keeps them pure and
// independently testable without importing the entire domain model.

export type ClaimForGate = {
  id: string;
  company_id: string;
  claim_type: string;
  state: ClaimState;
  need_statement: string | null;
  action_category: ActionCategory | null;
  triangulation_state: string;
  // INT-2: provenance axis (orthogonal to the state ladder). Optional so every
  // public-path caller is untouched; absent ⇒ treated as public_observed.
  provenance?: "public_observed" | "internal_declared" | "analytic";
};

export type SignalForGate = {
  id?: string;
  signal_band: "outside" | "organization" | "customer";
  directness: "direct" | "inferred" | "weak";
  framing_fit: "strong" | "partial" | "weak" | "unknown";
  validation_status: "unvalidated" | "directional" | "validated" | "contradicted";
  structure_level: "raw" | "extracted" | "interpreted";
};

export type ClaimSignalRefForGate = {
  signal_id?: string;
  relationship: "supports" | "contradicts" | "qualifies";
  signal: SignalForGate;
};

export type OdiNeedForGate = {
  importance: number;
  satisfaction: number;
  opportunity_score: number;
};

export type RouteForGate = {
  id: string;
  steps_json: Array<{ status: string }> | null;
  stale_reason: string | null;
  dependency_state: string | null;
  linked_need_ids: string[] | null;
};

export type TensionForGate = {
  is_commitment_blocker: boolean;
  blocked_commitments: string[];
};

export type ManagedOutcomeForGate = {
  journey_key: string;
};

// ── Gate check result ─────────────────────────────────────────────────────────

export type GateCheckResult = {
  allowed: boolean;
  /** Human-readable explanation of each unmet requirement. Empty = allowed. */
  blockers: string[];
};

// ── State distribution (stored in area_scores_json) ───────────────────────────

export type ClaimStateDistribution = {
  outside_view: number;
  diagnose: number;
  focus: number;
  flow: number;
  total: number;
  computed_at: string; // ISO string
};

// ── Claim types that are "need claims" (require ODI grammar for Focus gate) ───

export const NEED_CLAIM_TYPES = [
  "customer_outcome",
  "unmet_need",
] as const;

export type NeedClaimType = (typeof NEED_CLAIM_TYPES)[number];

export function isNeedClaim(claimType: string): claimType is NeedClaimType {
  return NEED_CLAIM_TYPES.includes(claimType as NeedClaimType);
}

// ── Derived tension structural row (from derived_tensions_structural view) ────

export type DerivedStructuralTensionType =
  | "under_evidenced_diagnose"
  | "under_evidenced_focus"
  | "destabilized_commitment";

export type DerivedStructuralTensionRow = {
  company_id: string;
  tension_type: DerivedStructuralTensionType;
  claim_id: string;
  statement: string;
  state: ClaimState;
  topic: string | null;
  claim_type: string;
  route_id: string | null;
  stale_reason: string | null;
};
