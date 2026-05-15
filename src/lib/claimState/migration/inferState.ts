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
//   diagnose   ─ claim has ≥2 signal refs (any band), OR
//                ≥1 signal ref with signal_band = 'organization'
//
//   outside_view ─ everything else
//
// Callers pass pre-loaded side-data so inference remains a pure function.

import type { ClaimState } from "../types";

// ── Input shape ───────────────────────────────────────────────────────────────

export type ClaimInferenceInput = {
  claimType: string;
  signalRefs: Array<{
    relationship: string;
    signal_band: "outside" | "organization" | "customer";
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

  // Diagnose: ≥2 signal refs, or ≥1 org-band signal ref
  const hasOrgSignal = input.signalRefs.some(
    (r) => r.signal_band === "organization",
  );
  if (hasOrgSignal || input.signalRefs.length >= 2) return "diagnose";

  return "outside_view";
}
