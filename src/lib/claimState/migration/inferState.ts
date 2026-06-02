// ── Claim State Inference — Backwards-Compatibility Migration ─────────────────
//
// Pure functions. No DB calls, no side effects.
//
// Given the existing field values on a legacy claim row, infer which state
// the claim should start in. Applied once by the migration runner to all
// pre-existing claims that have state = 'outside_view' (the default).
//
// Inference rules (spec §4.1):
//
//   flow       ─ routes.claim_id links back to this claim AND
//                route has ≥1 step with status IN ('in_progress','complete')
//
//   focus      ─ odi_needs row is associated with this claim AND
//                importance ≥ 1 AND satisfaction scored (>0),
//                OR a positioning canvas field (category/buyer/value) is non-empty
//                for claims of type 'positioning'
//
//   diagnose   ─ Gate 1 satisfied: ≥1 org-band 'supports' signal ref
//                (directness ≠ 'weak', structure_level ≠ 'raw') AND
//                ≥2 total 'supports' signal refs.
//                Delegates to checkOutsideViewToDiagnose — single source of truth.
//
//   outside_view ─ everything else (including org-band 'qualifies' refs,
//                  outside-only refs, and <2 total supporting)
//
// Callers pass pre-loaded side-data so inference remains a pure function.

import type { ClaimState } from "../types.ts";
import type { ClaimSignalRefForGate } from "../types.ts";
import { checkOutsideViewToDiagnose } from "../gates.ts";

// ── Input shape ───────────────────────────────────────────────────────────────

export type ClaimInferenceInput = {
  claimType: string;
  signalRefs: Array<{
    relationship: string;
    signal_band: "outside" | "organization" | "customer";
    // Optional: when present, used for Gate 1 quality checks (directness≠weak,
    // structure_level≠raw). Defaults to 'inferred' / 'extracted' when absent.
    directness?: "direct" | "inferred" | "weak";
    structure_level?: "raw" | "extracted" | "interpreted";
  }>;
  linkedRoute: {
    steps_json: Array<{ status: string }> | null;
  } | null;
  linkedOdiNeed: {
    importance: number;
    satisfaction: number;
  } | null;
  positioningCanvas: {
    category?: string | null;
    buyer?: string | null;
    value?: string | null;
  } | null;
};

// ── Inference ─────────────────────────────────────────────────────────────────

export function inferClaimState(input: ClaimInferenceInput): ClaimState {
  // Flow: linked route with at least one started step
  if (input.linkedRoute) {
    const startedSteps = (input.linkedRoute.steps_json ?? []).filter(
      (s) => s.status === "in_progress" || s.status === "complete",
    );
    if (startedSteps.length > 0) return "flow";
  }

  // Focus: ODI need with importance scored, or positioning canvas populated
  if (
    input.linkedOdiNeed &&
    input.linkedOdiNeed.importance >= 1 &&
    input.linkedOdiNeed.satisfaction > 0
  ) {
    return "focus";
  }

  if (input.claimType === "positioning" && input.positioningCanvas) {
    const { category, buyer, value } = input.positioningCanvas;
    const populated = [category, buyer, value].filter(
      (v) => v !== null && v !== undefined && v.trim() !== "",
    );
    if (populated.length >= 1) return "focus";
  }

  // Diagnose: delegate to Gate 1 (checkOutsideViewToDiagnose) — single source
  // of truth for the "what makes a claim diagnosable" condition.
  //
  // Build ClaimSignalRefForGate from signalRefs. framing_fit and validation_status
  // default to non-blocking values; Gate 1 does not inspect them.
  const gateRefs: ClaimSignalRefForGate[] = input.signalRefs.map((r) => ({
    relationship: r.relationship as "supports" | "contradicts" | "qualifies",
    signal: {
      signal_band: r.signal_band,
      directness: r.directness ?? "inferred",
      structure_level: r.structure_level ?? "extracted",
      framing_fit: "partial" as const,
      validation_status: "directional" as const,
    },
  }));

  if (checkOutsideViewToDiagnose({ state: "outside_view", id: "" }, gateRefs).allowed) {
    return "diagnose";
  }

  return "outside_view";
}
