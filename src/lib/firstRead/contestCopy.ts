// OC-3 — contest render copy + the kind→controls mapping (pure, so the "kind-appropriate
// controls only" and "consequences-before-act" laws are unit-testable and single-sourced).
//
// ⚠️ ALL USER-FACING STRINGS BELOW ARE **PENDING OPERATOR SIGNATURE** (operator surface,
// Extracts). Draft copy — do not treat as signed.

import type { ContestKind, ContestResolution } from "@/hooks/useClaimContests";

// Kind chip — plain English (GOAL 1). PENDING SIGNATURE.
export const KIND_LABEL: Record<ContestKind, string> = {
  disputed: "Client says this is false",
  immaterial: "Client says true, but not a focus now",
};

// Resolved-state labels for the historical trail. PENDING SIGNATURE.
export const RESOLVED_LABEL: Record<ContestResolution, string> = {
  strike_resolved: "Struck",
  set_aside: "Set aside",
  dismissed: "Dismissed",
};

export interface ResolutionOption {
  resolution: ContestResolution;
  /** The button label. PENDING SIGNATURE. */
  label: string;
  /** Consequences-before-act: plain English of what WILL happen. PENDING SIGNATURE. */
  consequence: string;
}

// Consequence copy, keyed by resolution. PENDING SIGNATURE.
const CONSEQUENCE: Record<ContestResolution, string> = {
  strike_resolved: "Striking stops this finding counting everywhere — score, deltas, readiness. Reversible later.",
  set_aside: "Setting aside de-emphasizes the finding, but it still counts everywhere. Reversible later.",
  dismissed: "Dismissing closes the contest and changes nothing — the finding stands; the disagreement stays on record.",
};

// Button labels, keyed by resolution. PENDING SIGNATURE.
const OPTION_LABEL: Record<ContestResolution, string> = {
  strike_resolved: "Strike the finding",
  set_aside: "Set the finding aside",
  dismissed: "Dismiss the contest",
};

/**
 * The resolution controls a contest of this KIND may offer — the render-side half of
 * ruling 9 (+ the 2026-07-24 amendment). Structurally:
 *   disputed   → Strike | Dismiss   (never Set-aside)
 *   immaterial → Set-aside | Dismiss (never Strike)
 * Dismiss is offered for BOTH kinds. The DB CHECK + resolve_contest are the authority;
 * this only decides which buttons render — it can never widen what the RPC accepts.
 */
export function resolutionOptionsFor(kind: ContestKind): ResolutionOption[] {
  const resolutions: ContestResolution[] =
    kind === "disputed" ? ["strike_resolved", "dismissed"] : ["set_aside", "dismissed"];
  return resolutions.map((resolution) => ({
    resolution,
    label: OPTION_LABEL[resolution],
    consequence: CONSEQUENCE[resolution],
  }));
}

// Section + control copy. PENDING SIGNATURE.
export const CONTEST_COPY = {
  sectionTitle: "Contested — awaiting your judgment",
  sectionIntro: "Findings a client pushed back on in a session. Decide each — nothing changes until you do.",
  rationaleLabel: "Their reason",
  sessionDatePrefix: "From your session",
  reasonPlaceholder: "Why? (recorded with your decision)",
  reasonRequiredHint: "A reason is required.",
  confirm: "Confirm",
  cancel: "Cancel",
  resolvedTrailTitle: "Resolved",
  emptyResolvedReason: "—",
} as const;
