// ── MojoScore public API ──────────────────────────────────────────────────────
export type {
  ClaimState,
  ClaimInput,
  RouteInput,
  NeedInput,
  MojoScoreInput,
  ContributorScore,
  ProjectedRaise,
  EngagementState,
  MojoScoreResult,
} from "./types";

export { computeMojoScore, METHODOLOGY_VERSION } from "./computeMojoScore";
export { writeMojoScore } from "./writeMojoScore";
export { deriveEngagementState } from "./contributors/stateDistributionHealth";
