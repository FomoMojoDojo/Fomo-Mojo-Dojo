import type { ClaimState } from "./claimState/types.ts";

export const SIGNAL_BANDS = ["outside", "organization", "customer"] as const;
export type SignalBand = (typeof SIGNAL_BANDS)[number];

export const SIGNAL_SOURCE_TYPES = [
  "public_baseline_run",
  "file_proposal",
  "uploaded_file",
  "file",
  "mojo_analysis",
  "interview",
  "survey",
  "transcript",
  "customer_research",
  "manual_note",
  "unknown",
] as const;
export type SignalSourceType = (typeof SIGNAL_SOURCE_TYPES)[number];

export const EVIDENCE_TYPES = [
  "founder_narrative",
  "internal_data",
  "market_signal",
  "customer_validation",
  "quantitative",
  "unknown",
] as const;
export type EvidenceType = (typeof EVIDENCE_TYPES)[number];

export const SIGNAL_TOPICS = [
  "positioning",
  "strategy",
  "job",
  "need",
  "outcome",
  "route",
  "proof",
  "market",
  "problem",
  "question",
  "unknown",
] as const;
export type SignalTopic = (typeof SIGNAL_TOPICS)[number];

export const DIRECTNESS_LEVELS = ["direct", "inferred", "weak"] as const;
export type Directness = (typeof DIRECTNESS_LEVELS)[number];

export const FRAMING_FIT_LEVELS = ["strong", "partial", "weak", "unknown"] as const;
export type FramingFit = (typeof FRAMING_FIT_LEVELS)[number];

export const STRUCTURE_LEVELS = ["raw", "extracted", "interpreted"] as const;
export type StructureLevel = (typeof STRUCTURE_LEVELS)[number];

export const VALIDATION_STATUSES = ["unvalidated", "directional", "validated", "contradicted"] as const;
export type ValidationStatus = (typeof VALIDATION_STATUSES)[number];

export const CONFIDENCE_LEVELS = ["high", "medium", "low"] as const;
export type ConfidenceLevel = (typeof CONFIDENCE_LEVELS)[number];

export const CLAIM_TYPES = [
  "observation",
  "inference",
  "hypothesis",
  "assumption",
  "strategic_belief",
  "customer_outcome",
  "unmet_need",
  "route_candidate",
] as const;
export type ClaimType = (typeof CLAIM_TYPES)[number];

export const TRIANGULATION_STATES = [
  "single_source",
  "multi_source",
  "customer_backed",
  "contradicted",
  "untested",
] as const;
export type TriangulationState = (typeof TRIANGULATION_STATES)[number];

export const CLAIM_SIGNAL_REF_RELATIONSHIPS = ["supports", "contradicts", "qualifies"] as const;
export type ClaimSignalRefRelationship = (typeof CLAIM_SIGNAL_REF_RELATIONSHIPS)[number];

export type Signal = {
  id: string;
  company_id: string;
  source_id: string | null;
  source_type: string;
  source_title: string | null;
  source_url: string | null;
  signal_band: SignalBand;
  evidence_type: EvidenceType;
  claim_text: string;
  evidence_excerpt: string;
  topic: string | null;
  framework: string | null;
  directness: Directness;
  recency: string | null;
  framing_fit: FramingFit;
  structure_level: StructureLevel;
  validation_status: ValidationStatus;
  confidence_to_use: ConfidenceLevel;
  relevance_state: string;
  // B1: four-class voice taxonomy (client_voice | outside_voice_about_client |
  // competitor_voice | market_context). Optional: legacy rows are NULL and read
  // through the binary fallback in classifyVoice. Never a substitute for signal_band.
  voice_class?: string | null;
  raw_payload: unknown;
  created_at: string;
  updated_at: string;
};

export type SignalDraft = Omit<Signal, "id" | "created_at" | "updated_at">;

export type Claim = {
  id: string;
  company_id: string;
  statement: string;
  topic: string | null;
  claim_type: ClaimType;
  state: ClaimState;
  outside_support_count: number;
  organization_support_count: number;
  customer_support_count: number;
  triangulation_state: TriangulationState;
  confidence: ConfidenceLevel;
  revalidation_flag: boolean;
  raw_payload: unknown;
  created_at: string;
  updated_at: string;
};

export type ClaimDraft = Omit<Claim, "id" | "created_at" | "updated_at">;

export type ClaimSignalRef = {
  id: string;
  company_id: string;
  claim_id: string;
  signal_id: string;
  relationship: ClaimSignalRefRelationship;
  created_at: string;
};

export type ClaimSignalRefDraft = Omit<ClaimSignalRef, "id" | "created_at">;

export type ClaimCandidate = {
  claim: ClaimDraft;
  sourceSignals: Array<{
    signalIndex: number;
    relationship: ClaimSignalRefRelationship;
  }>;
};

export const CUSTOMER_SIGNAL_SOURCE_TYPES = new Set<string>([
  "interview",
  "survey",
  "transcript",
  "customer_research",
]);

export function isConfidenceLevel(value: unknown): value is ConfidenceLevel {
  return typeof value === "string" && (CONFIDENCE_LEVELS as readonly string[]).includes(value);
}

export function isSignalBand(value: unknown): value is SignalBand {
  return typeof value === "string" && (SIGNAL_BANDS as readonly string[]).includes(value);
}

export function normalizeStatement(value: unknown) {
  return String(value ?? "")
    .replace(/[‐‑‒–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeClaimKey(value: unknown) {
  return normalizeStatement(value)
    .toLowerCase()
    .replace(/^(the document|this document|analysis|research)\s+(highlights|shows|suggests|indicates|reveals)\s+/i, "")
    .replace(/^["'`]+|["'`]+$/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function isCustomerSignalSourceType(value: unknown) {
  return CUSTOMER_SIGNAL_SOURCE_TYPES.has(String(value ?? "").trim().toLowerCase());
}

// Phase 2+ placeholder only. Do not wire this yet.
export type MarketFrameDraft = {
  market_definition: string;
  primary_job: string;
  job_executor: string;
  alternatives: string[];
  success_metrics: string[];
  framing_status: "draft" | "working" | "validated";
  confidence: ConfidenceLevel;
  created_from_claims: string[];
};
