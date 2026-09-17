// Header readiness from the LIVE score (2026-09-16). The workshop header's ScoreContextBar binds to
// the same computeMojoScore result the home compass and the workspace Routes strip bind to, through the
// same projections — replacing the stored-score anatomy path (buildReadinessFromCompanySignals), which
// minted 48 / 64 / "Directional readiness" on a null mojo_score. No arithmetic of its own: current is
// the rounded total, reachable / unlockable are projections.ts verbatim, the posture word is the
// existing score→tier mapping. The live path has no ceiling governor, so ceilingReason is null.
import type { MojoScoreResult } from "./types";
import { computeReachableScore, computeUnlockableScore } from "./projections";
import { postureFromLegacyScore, READINESS_POSTURE_LABELS } from "@/lib/mojoScoreFromAnatomy";

export type LiveReadiness = {
  currentReadiness: number;
  nearTermPotential: number;
  structuralUpside: number;
  postureLabel: string;
  ceilingReason: null;
};

export function liveReadiness(score: MojoScoreResult | null): LiveReadiness | null {
  if (!score) return null;
  const currentReadiness  = Math.round(score.total_score);
  const nearTermPotential = computeReachableScore(score);
  const structuralUpside  = computeUnlockableScore(nearTermPotential, score);
  return {
    currentReadiness, nearTermPotential, structuralUpside,
    postureLabel: READINESS_POSTURE_LABELS[postureFromLegacyScore(currentReadiness)],
    ceilingReason: null,
  };
}
