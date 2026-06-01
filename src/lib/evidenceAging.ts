/**
 * Evidence Aging Model
 *
 * Classifies how fresh evidence is based on signal band and age.
 * Customer proof decays significantly faster than internal or outside alignment —
 * behavioral validation of customers has a shorter half-life than org or market
 * signals because customer context changes faster.
 *
 * Aging is invisible — never rendered as labels, badges, or countdowns in the UI.
 * It influences how cadence pressure and commitment fragility are described,
 * not what data is shown to the user.
 *
 * Design principles:
 *   - Deterministic (injectable `now` for testing)
 *   - Conservative (defaults to "fresh" when insufficient data — no false alarms)
 *   - Pure (no side effects, no external dependencies)
 */

import type { ProofGapMaturity } from "./strategicTemporalState";

// ─── Public types ──────────────────────────────────────────────────────────────

/**
 * How fresh a piece of evidence is, relative to its signal band's decay threshold.
 *
 *   fresh               — recently collected; full validity for commitment decisions
 *   aging               — starting to lose relevance; needs revisiting soon
 *   stale               — significantly outdated; should not drive new commitment
 *   unconfirmed         — never validated and overdue for review
 *   recently_reinforced — was aging/stale but updated recently; treat with fresh weight
 */
export type EvidenceAgingState =
  | "fresh"
  | "aging"
  | "stale"
  | "unconfirmed"
  | "recently_reinforced";

/**
 * Structural pressure derived from evidence age + proof gap maturity.
 *
 *   none    — no temporal concern
 *   warming — signals are aging; worth watching before advancing commitment
 *   urgent  — signals are stale; commitment at risk of being built on outdated proof
 */
export type ValidationCadencePressure = "none" | "warming" | "urgent";

// ─── Band-specific decay thresholds ───────────────────────────────────────────
//
// Customer proof decays ~2x faster than organization signals because customer
// context (market position, switching behavior, satisfaction) changes faster
// than internal org alignment.
//
// Outside research ages slowest — market dynamics and published signals remain
// relevant for longer periods.

const THRESHOLDS = {
  customer:     { aging: 14, stale: 30 },
  organization: { aging: 28, stale: 56 },
  outside:      { aging: 56, stale: 90 },
} as const;

/** Window (days) within which a previously-old record counts as recently reinforced. */
const REINFORCED_WINDOW_DAYS = 7;

// ─── Internal utilities ────────────────────────────────────────────────────────

function daysSince(dateStr: string, now: Date): number {
  const then = new Date(dateStr);
  if (isNaN(then.getTime())) return 0;
  return Math.max(0, Math.floor((now.getTime() - then.getTime()) / 86_400_000));
}

function bandThresholds(band: string): { aging: number; stale: number } {
  if (band === "customer") return THRESHOLDS.customer;
  if (band === "organization") return THRESHOLDS.organization;
  return THRESHOLDS.outside;
}

// ─── Main classification functions ────────────────────────────────────────────

/**
 * Classify how fresh a single signal is based on band-specific thresholds.
 *
 * Uses `updated_at` as the primary freshness marker — the last time the record
 * was touched by ingestion or manual review. Uses `created_at` to detect
 * recently-reinforced patterns (old record, recent update).
 */
export function classifySignalAge(
  signal: {
    created_at: string;
    updated_at: string;
    signal_band: string;
    validation_status: string;
  },
  now?: Date,
): EvidenceAgingState {
  const effectiveNow = now ?? new Date();
  const createdDays = daysSince(signal.created_at, effectiveNow);
  const updatedDays = daysSince(signal.updated_at, effectiveNow);
  const { aging, stale } = bandThresholds(signal.signal_band);

  // Recently reinforced: record was old but was just updated
  if (createdDays >= aging && updatedDays < REINFORCED_WINDOW_DAYS) {
    return "recently_reinforced";
  }

  // Unconfirmed: never validated and past the aging threshold
  if (signal.validation_status === "unvalidated" && updatedDays >= aging) {
    return "unconfirmed";
  }

  if (updatedDays >= stale) return "stale";
  if (updatedDays >= aging) return "aging";
  return "fresh";
}

/**
 * Priority rank for aging states — higher = worse.
 * Used to find the "worst" state across a set of signals.
 */
const AGING_RANK: Record<EvidenceAgingState, number> = {
  fresh:               0,
  recently_reinforced: 0,
  aging:               2,
  unconfirmed:         3,
  stale:               4,
};

/**
 * Return the worst customer proof aging state across all provided signals.
 * When no customer signals are present, returns "unconfirmed" — the absence of
 * customer data is itself a freshness concern.
 */
export function worstCustomerProofAge(
  signals: Array<{
    created_at: string;
    updated_at: string;
    signal_band: string;
    validation_status: string;
  }>,
  now?: Date,
): EvidenceAgingState {
  const effectiveNow = now ?? new Date();
  const customerSignals = signals.filter((s) => s.signal_band === "customer");
  if (customerSignals.length === 0) return "unconfirmed";

  return customerSignals
    .map((s) => classifySignalAge(s, effectiveNow))
    .reduce((worst, current) =>
      AGING_RANK[current] > AGING_RANK[worst] ? current : worst,
      "fresh" as EvidenceAgingState,
    );
}

/**
 * Derive how much temporal pressure the validation cadence is under.
 *
 * Urgency escalates when:
 *   - Customer proof is stale AND the proof gap has persisted more than a fresh cycle
 *   - Customer proof is aging AND the proof gap is not fresh
 *   - Customer proof is entirely unconfirmed AND the proof gap has persisted
 *
 * The maturity guard on "unconfirmed" prevents constant warming on fresh systems that
 * haven't yet begun customer research — absence of proof is only a concern once the
 * strategic direction has persisted long enough to warrant validation.
 */
export function deriveValidationCadencePressure(args: {
  customerProofAgingState: EvidenceAgingState;
  proofGapMaturity: ProofGapMaturity;
}): ValidationCadencePressure {
  const { customerProofAgingState, proofGapMaturity } = args;

  if (customerProofAgingState === "stale" && proofGapMaturity !== "fresh") {
    return "urgent";
  }
  if (
    (customerProofAgingState === "aging" || customerProofAgingState === "unconfirmed") &&
    proofGapMaturity !== "fresh"
  ) {
    return "warming";
  }
  return "none";
}

/**
 * Guard: returns false when evidence is too stale to justify strengthening a hypothesis.
 *
 * A hypothesis with only stale signals should not be transitioned to a higher
 * confidence state. The caller should check this before calling strengthenHypothesis().
 */
export function canStrengthenFromAge(ageState: EvidenceAgingState): boolean {
  return ageState !== "stale";
}
