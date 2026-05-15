// ── Claim State Machine — Barrel Export ───────────────────────────────────────

export type {
  ClaimState,
  ClaimStateOrRetired,
  ActionCategory,
  ClaimEvent,
  EvidenceDelta,
  ClaimForGate,
  SignalForGate,
  ClaimSignalRefForGate,
  OdiNeedForGate,
  RouteForGate,
  TensionForGate,
  ManagedOutcomeForGate,
  GateCheckResult,
  ClaimStateDistribution,
  NeedClaimType,
  DerivedStructuralTensionType,
  DerivedStructuralTensionRow,
} from "./types";

export {
  CLAIM_STATE_ORDER,
  NEED_CLAIM_TYPES,
  claimStateIndex,
  isSkipTransition,
  isNeedClaim,
} from "./types";

export {
  checkNoSkip,
  checkOutsideViewToDiagnose,
  checkDiagnoseToFocus,
  checkFocusToFlow,
  shouldRegressDiagnoseToOutsideView,
  shouldRegressFocusToDiagnose,
  shouldRegressFlowToFocus,
} from "./gates";

export type { TransitionResult, RegressionResult, RegressionSweepResult } from "./machine";

export { transitionClaim, retireClaim, regressionSweep } from "./machine";

export {
  computeClaimStateDistribution,
  recomputeAndWriteDistribution,
  stateDistributionToBand,
} from "./distribution";

export type { ClaimInferenceInput } from "./migration/inferState";
export { inferClaimState } from "./migration/inferState";

export type { MigrationRecord, MigrationRunResult } from "./migration/runner";
export { runBackwardsCompatMigration } from "./migration/runner";
