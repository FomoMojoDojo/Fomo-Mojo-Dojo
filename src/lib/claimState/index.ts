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
} from "./types.ts";

export {
  CLAIM_STATE_ORDER,
  NEED_CLAIM_TYPES,
  claimStateIndex,
  isSkipTransition,
  isNeedClaim,
} from "./types.ts";

export {
  checkNoSkip,
  checkOutsideViewToDiagnose,
  checkDiagnoseToFocus,
  checkFocusToFlow,
  shouldRegressDiagnoseToOutsideView,
  shouldRegressFocusToDiagnose,
  shouldRegressFlowToFocus,
} from "./gates.ts";

export type { TransitionResult, RegressionResult, RegressionSweepResult } from "./machine.ts";

export { transitionClaim, retireClaim, regressionSweep } from "./machine.ts";

export {
  computeClaimStateDistribution,
  recomputeAndWriteDistribution,
  stateDistributionToBand,
} from "./distribution.ts";

export type { ClaimInferenceInput } from "./migration/inferState.ts";
export { inferClaimState } from "./migration/inferState.ts";

export type { MigrationRecord, MigrationRunResult } from "./migration/runner.ts";
export { runBackwardsCompatMigration } from "./migration/runner.ts";
