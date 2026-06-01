import type { ConfidenceLevel, SignalTopic, ValidationStatus } from "./evidenceDomain.ts";

export const STRATEGIC_HYPOTHESIS_KINDS = [
  "directional_hypothesis",
  "inferred_tension",
  "candidate_assumption",
  "inferred_journey",
] as const;
export type StrategicHypothesisKind = (typeof STRATEGIC_HYPOTHESIS_KINDS)[number];

export const STRATEGIC_HYPOTHESIS_STATES = [
  "inferred",
  "emerging",
  "unstable",
  "strengthened",
  "contradicted",
  "reframed",
  "retired",
] as const;
export type StrategicHypothesisState = (typeof STRATEGIC_HYPOTHESIS_STATES)[number];

export type StrategicHypothesis = {
  id: string;
  company_id: string;
  hypothesis_key: string;
  statement: string;
  hypothesis_kind: StrategicHypothesisKind;
  hypothesis_state: StrategicHypothesisState;
  topic: SignalTopic | null;
  confidence: ConfidenceLevel;
  validation_state: ValidationStatus;
  what_must_be_true: string[];
  source_run_id: string | null;
  reframed_from_hypothesis_id: string | null;
  /** Forward pointer: the hypothesis that superseded this one. */
  superseded_by_id: string | null;
  /** Why this hypothesis was reframed (human-readable). */
  reframed_reason: string | null;
  /** What event or analysis run originated this hypothesis. */
  originating_context: string | null;
  /** For inferred_journey rows: the journey this hypothesis concerns (e.g. "b2b_partner"). */
  journey_key: string | null;
  is_active: boolean;
  raw_payload: unknown;
  created_at: string;
  updated_at: string;
};

export type StrategicHypothesisDraft = Omit<StrategicHypothesis, "id" | "created_at" | "updated_at">;

export type StrategicHypothesisCandidate = {
  hypothesis: StrategicHypothesisDraft;
  supportingClaimIds: string[];
  weakeningClaimIds: string[];
  matchedPreviousHypothesisId?: string | null;
};
