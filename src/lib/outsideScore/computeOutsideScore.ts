// ── Outside-only Mojo Score — methodology 'outside-v1.0.0' ───────────────────
//
// OPERATOR-SIGNED (resolves the Phase A design-gate 3b stop via option (a)).
// Anchor + micro-moves, computed from OUTSIDE-VOICE material only. v1.1.0 is
// untouched — this is a separate, insert-only reading stored in mojo_scores
// under methodology_version 'outside-v1.0.0'.
//
// Deterministic. No LLM calls. Pure function — no I/O.
//
// ANCHOR = 15 (research base rate for strategy success, sub-20%).
//
// MOVES (each linear, documented here; the stated ranges are enforced):
//   echo_integrity  −4…+4   clamp(confirmed − contradicted, −4, +4), where
//                           confirmed = R5 'echoed' pairs and contradicted =
//                           R5 'divergent' pairs among eligible claim_deltas
//                           (struck claims and uploaded-document-derived
//                           declared sides excluded — the First Read
//                           outside-only provenance gate). Unspoken pairs
//                           contribute 0: silence never penalizes.
//   record_strength  0…+2   2 × (strong ÷ total) over eligible outside-voice
//                           signals, strength per R4 (strong =
//                           recurrence-accepted; thin = low confidence;
//                           else moderate).
//   differentiation_echo 0…+2  +1 per declared claim with topic
//                           'positioning' or 'market' (R2 trivial facets)
//                           that has a confirmed ('echoed') outside pair,
//                           capped at +2.
//   coverage_breadth 0…+1   min(distinctSourceTypes − 1, 3) ÷ 3 over
//                           eligible outside-voice signals (1 type → 0,
//                           4+ types → 1).
//   freshness        0…+1   share of eligible outside-voice signals whose
//                           event_date is within 18 months of computedAt.
//                           STATED RULE: undated signals count NOT fresh.
//
// FLOOR 11 / CEILING 25 by construction: 15 − 4 = 11; 15 + 4+2+2+1+1 = 25.
//
// ELIGIBILITY: fewer than 10 outside-voice signals → NO score row at all
// (the beat renders "Not enough public signal to score yet.").
//
// PRECISION: intermediate math is fractional; the stored total_score rounds
// HALF-UP to an integer; each component is stored UNROUNDED.

export const OUTSIDE_METHODOLOGY_VERSION = "outside-v1.0.0";
export const OUTSIDE_ANCHOR = 15;
export const OUTSIDE_MIN_SIGNALS = 10;
export const FRESHNESS_WINDOW_MONTHS = 18;

export type OutsideSignalInput = {
  id: string;
  sourceType: string | null;
  eventDate: string | null; // ISO date or null (null = NOT fresh, stated rule)
  confidence: string | null; // confidence_to_use
  recurrenceConfirmed: boolean; // participates in an ACCEPTED recurrence pair
};

export type OutsideDeltaInput = {
  // R5 vocabulary; the caller supplies only eligible pairs (struck and
  // doc-derived-declared excluded).
  deltaType: "echoed" | "divergent" | "internally_silent";
  declaredClaimId: string | null;
  declaredTopic: string | null;
};

export type OutsideScoreInput = {
  companyId: string;
  signals: OutsideSignalInput[];
  deltas: OutsideDeltaInput[];
  computedAt: string; // ISO timestamp
};

export type OutsideScoreMove = {
  key: string;
  value: number; // unrounded
  min: number;
  max: number;
  explanation: string;
};

export type OutsideScoreResult =
  | { eligible: false; companyId: string; signalCount: number }
  | {
      eligible: true;
      companyId: string;
      signalCount: number;
      anchor: number;
      moves: OutsideScoreMove[];
      totalUnrounded: number;
      totalScore: number; // half-up rounded integer
      methodologyVersion: string;
      computedAt: string;
    };

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/** Half-up rounding (2.5 → 3, −2.5 → −2). Math.round is half-up for our range (all positive). */
function roundHalfUp(v: number): number {
  return Math.floor(v + 0.5);
}

function monthsBetween(fromIso: string, toIso: string): number {
  const from = new Date(fromIso).getTime();
  const to = new Date(toIso).getTime();
  if (!Number.isFinite(from) || !Number.isFinite(to)) return Number.POSITIVE_INFINITY;
  return (to - from) / (1000 * 60 * 60 * 24 * 30.44);
}

export function strengthOf(signal: OutsideSignalInput): "strong" | "moderate" | "thin" {
  if (signal.recurrenceConfirmed) return "strong";
  if ((signal.confidence ?? "").toLowerCase() === "low") return "thin";
  return "moderate";
}

export function computeOutsideScore(input: OutsideScoreInput): OutsideScoreResult {
  const signalCount = input.signals.length;
  if (signalCount < OUTSIDE_MIN_SIGNALS) {
    return { eligible: false, companyId: input.companyId, signalCount };
  }

  // echo_integrity: clamp(confirmed − contradicted, −4, +4); unspoken = 0.
  const confirmed = input.deltas.filter((d) => d.deltaType === "echoed").length;
  const contradicted = input.deltas.filter((d) => d.deltaType === "divergent").length;
  const echoIntegrity = clamp(confirmed - contradicted, -4, 4);

  // record_strength: 2 × strong-share.
  const strongCount = input.signals.filter((s) => strengthOf(s) === "strong").length;
  const recordStrength = 2 * (strongCount / signalCount);

  // differentiation_echo: min(#distinct positioning/market declared claims
  // with an echoed pair, 2).
  const diffClaims = new Set(
    input.deltas
      .filter(
        (d) =>
          d.deltaType === "echoed" &&
          d.declaredClaimId !== null &&
          ["positioning", "market"].includes((d.declaredTopic ?? "").trim().toLowerCase()),
      )
      .map((d) => d.declaredClaimId as string),
  );
  const differentiationEcho = Math.min(diffClaims.size, 2);

  // coverage_breadth: min(distinctTypes − 1, 3) / 3.
  const distinctTypes = new Set(
    input.signals.map((s) => (s.sourceType ?? "").trim()).filter((t) => t.length > 0),
  ).size;
  const coverageBreadth = Math.min(Math.max(distinctTypes - 1, 0), 3) / 3;

  // freshness: share with event_date within 18 months of computedAt; undated NOT fresh.
  const freshCount = input.signals.filter(
    (s) => s.eventDate !== null && monthsBetween(s.eventDate, input.computedAt) <= FRESHNESS_WINDOW_MONTHS,
  ).length;
  const freshness = freshCount / signalCount;

  const moves: OutsideScoreMove[] = [
    {
      key: "echo_integrity",
      value: echoIntegrity,
      min: -4,
      max: 4,
      explanation: `${confirmed} confirmed vs ${contradicted} contradicted outside pairs; unspoken pairs count zero.`,
    },
    {
      key: "record_strength",
      value: recordStrength,
      min: 0,
      max: 2,
      explanation: `${strongCount} of ${signalCount} outside signals are strong (repeated across independent sources).`,
    },
    {
      key: "differentiation_echo",
      value: differentiationEcho,
      min: 0,
      max: 2,
      explanation: `${diffClaims.size} positioning/market statement(s) confirmed by the outside record (capped at 2).`,
    },
    {
      key: "coverage_breadth",
      value: coverageBreadth,
      min: 0,
      max: 1,
      explanation: `${distinctTypes} distinct public source type(s) represented.`,
    },
    {
      key: "freshness",
      value: freshness,
      min: 0,
      max: 1,
      explanation: `${freshCount} of ${signalCount} outside signals dated within the last ${FRESHNESS_WINDOW_MONTHS} months; undated signals count as not fresh.`,
    },
  ];

  const totalUnrounded = OUTSIDE_ANCHOR + moves.reduce((sum, m) => sum + m.value, 0);
  return {
    eligible: true,
    companyId: input.companyId,
    signalCount,
    anchor: OUTSIDE_ANCHOR,
    moves,
    totalUnrounded,
    totalScore: roundHalfUp(totalUnrounded),
    methodologyVersion: OUTSIDE_METHODOLOGY_VERSION,
    computedAt: input.computedAt,
  };
}
