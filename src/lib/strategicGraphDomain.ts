export const STRATEGIC_EVENT_TYPES = [
  "created",
  "updated",
  "deleted",
  "restored",
  "accepted",
  "rejected",
  "regenerated",
  "validated",
  "contradicted",
  "marked_stale",
  "refreshed",
  "score_changed",
] as const;

export const STRATEGIC_ACTOR_TYPES = ["system", "user", "dify", "council"] as const;

export const DEPENDENCY_TYPES = [
  "supports",
  "derives",
  "constrains",
  "validates",
  "contradicts",
  "assumes",
  "replaces",
] as const;

export const DEPENDENCY_STRENGTHS = ["high", "medium", "low"] as const;

export const DEPENDENCY_STATES = [
  "fresh",
  "stale",
  "needs_review",
  "contradicted",
  "revalidate",
] as const;

export const VALIDATION_STATES = [
  "unvalidated",
  "directional",
  "validated",
  "contradicted",
] as const;

export const EVIDENCE_STATES = ["partial", "sufficient", "thin", "contradicted"] as const;

export const STRATEGIC_OBJECT_TYPES = [
  "signal",
  "claim",
  "strategic_hypothesis",
  "job_map",
  "job_step",
  "odi_need",
  "route",
  "desired_outcome",
] as const;

export type StrategicEventType = (typeof STRATEGIC_EVENT_TYPES)[number];
export type StrategicActorType = (typeof STRATEGIC_ACTOR_TYPES)[number];
export type DependencyType = (typeof DEPENDENCY_TYPES)[number];
export type DependencyStrength = (typeof DEPENDENCY_STRENGTHS)[number];
export type DependencyState = (typeof DEPENDENCY_STATES)[number];
export type ValidationState = (typeof VALIDATION_STATES)[number];
export type EvidenceState = (typeof EVIDENCE_STATES)[number];
export type StrategicObjectType = (typeof STRATEGIC_OBJECT_TYPES)[number];

export type StrategicEvent = {
  id: string;
  company_id: string;
  event_type: StrategicEventType;
  actor_type: StrategicActorType;
  actor_id: string | null;
  source_run_id: string | null;
  object_type: string;
  object_id: string;
  previous_value: Record<string, unknown> | null;
  new_value: Record<string, unknown> | null;
  reason: string | null;
  created_at: string;
};

export type StrategicEventDraft = Omit<StrategicEvent, "id" | "created_at">;

export type ObjectDependency = {
  id: string;
  company_id: string;
  upstream_object_type: string;
  upstream_object_id: string;
  downstream_object_type: string;
  downstream_object_id: string;
  dependency_type: DependencyType;
  strength: DependencyStrength;
  created_at: string;
  updated_at: string;
};

export type ObjectDependencyDraft = Omit<ObjectDependency, "id" | "created_at" | "updated_at">;

export type ArtifactVersion = {
  id: string;
  company_id: string;
  object_type: string;
  object_id: string;
  version_number: number;
  snapshot: Record<string, unknown>;
  source_event_id: string | null;
  source_run_id: string | null;
  created_at: string;
};

export type ArtifactVersionDraft = Omit<ArtifactVersion, "id" | "created_at">;

export type StrategicStatusFields = {
  dependency_state: DependencyState;
  validation_state: ValidationState;
  evidence_state: EvidenceState;
  last_reviewed_at: string | null;
  stale_reason: string | null;
  stale_since_event_id: string | null;
  source_run_id: string | null;
  updated_at: string;
};

export type AffectedArtifactSummary = {
  object_type: "odi_need" | "route" | "desired_outcome";
  object_id: string;
  label: string;
  dependency_state: DependencyState;
  stale_reason: string | null;
  updated_at: string | null;
};

export function isDependencyState(value: unknown): value is DependencyState {
  return typeof value === "string" && (DEPENDENCY_STATES as readonly string[]).includes(value);
}

export function strategicObjectTable(objectType: string) {
  if (objectType === "strategic_hypothesis") return "strategic_hypotheses";
  if (objectType === "desired_outcome") return "managed_outcomes";
  return `${objectType}s`.replace("job_stepss", "job_steps").replace("odi_needss", "odi_needs");
}
