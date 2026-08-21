// ── Outside-only Mojo Score — methodology 'outside-v1.1.0' ───────────────────
//
// OPERATOR-SIGNED (resolves the Phase A design-gate 3b stop via option (a)).
// Anchor + micro-moves, computed from OUTSIDE-VOICE material only. The INSIDE
// score (snapshotMojoScore, v1.1.0) is a separate methodology and is untouched;
// this reading is insert-only in mojo_scores under methodology_version
// 'outside-v1.1.0'. v1.0.0 → v1.1.0: coverage_breadth now reads the SIGNED
// source categories (sourceCategories.ts) instead of the crawl-run source_type.
// Older outside-v1.0.0 snapshots keep their stamp.
//
// Deterministic. No LLM calls. Pure function — no I/O.
//
// ANCHOR = 15 (research base rate for strategy success, sub-20%).
//
// MOVES (each linear, documented here; the stated ranges are enforced):
//   echo_integrity  −4…+4   clamp(confirmed − contradicted, −4, +4), where
//                           the unit is the STATEMENT, not the pair row
//                           (operator ruling 2026-08-21): confirmed = distinct
//                           own-words statements (declaredClaimId) with an
//                           'echoed' pair, contradicted = distinct statements
//                           with a 'divergent' pair, among eligible claim_deltas
//                           (struck claims and uploaded-document-derived
//                           declared sides excluded — the First Read
//                           outside-only provenance gate). One statement echoed
//                           by eight sources is ONE confirmation. Unspoken
//                           statements contribute 0: silence never penalizes.
//   record_strength  0…+2   2 × (strong ÷ total) over eligible outside-voice
//                           signals, strength per R4 (strong =
//                           recurrence-accepted; thin = low confidence;
//                           else moderate).
//   differentiation_echo 0…+2  +1 per declared claim with topic
//                           'positioning' or 'market' (R2 trivial facets)
//                           that has a confirmed ('echoed') outside pair,
//                           capped at +2.
//   coverage_breadth 0…+1   min(outsideKindsPresent − 1, 3) ÷ 3 over the
//                           SIGNED source categories (sourceCategories.ts) of
//                           eligible outside-voice signals. Breadth counts the
//                           four OUTSIDE kinds only — Reviews & listings,
//                           Social, Press & articles, Directories; "Your own
//                           site" (client voice) and "Other" never count.
//                           (1 kind → 0, 4 kinds → 1.)
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

export const OUTSIDE_METHODOLOGY_VERSION = "outside-v1.1.0";
import { categorizeHost, coverageSubline, hostFromUrl, OUTSIDE_KINDS, type SourceCategory } from "./sourceCategories";

export const OUTSIDE_ANCHOR = 15;
// Signed (2026-08-22): record_strength lever sub-line when recurrence has not been run for a company.
export const RECORD_STRENGTH_NOT_COMPUTED =
  "Not yet computed — signal recurrence hasn't been run for this company.";
export const OUTSIDE_MIN_SIGNALS = 10;
export const FRESHNESS_WINDOW_MONTHS = 18;

export type OutsideSignalInput = {
  id: string;
  sourceType: string | null;
  sourceUrl: string | null; // the source's URL — categorized via the signed source-category map
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
  id?: string; // claim_deltas.id — recorded in the input ledger (optional for unit fixtures)
};

/** The exact rows each micro-move counted — persisted with the snapshot, birth-stamped, never
 *  updated. Signal ids for record_strength/coverage/freshness; delta ids for echo/differentiation;
 *  the distinct source_type values coverage saw. Makes the score auditable and diffable. */
export type OutsideScoreLedger = {
  signal_count: number;
  echo_integrity: {
    // Statement ids are the SCORED unit (distinct own-words ids); delta ids are the visible pair
    // rows beneath them (kept for provenance — every echoed pair stays traceable).
    echoed_statement_ids: string[];
    divergent_statement_ids: string[];
    echoed_delta_ids: string[];
    divergent_delta_ids: string[];
  };
  record_strength: { strong_signal_ids: string[]; signal_count: number; not_computed?: boolean };
  differentiation_echo: { delta_ids: string[] };
  coverage_breadth: {
    signal_ids: string[];
    kinds_present: SourceCategory[]; // OUTSIDE kinds counted (canonical order)
    kind_hosts: Record<string, string[]>; // per-kind distinct hosts that contributed
  };
  freshness: { fresh_signal_ids: string[] };
};

export type OutsideScoreInput = {
  companyId: string;
  signals: OutsideSignalInput[];
  deltas: OutsideDeltaInput[];
  computedAt: string; // ISO timestamp
  /** Whether signal recurrence was run for this read. When false, record_strength is NOT computed
   *  (recurrence establishes signal strength) — it renders "not yet computed" and is excluded from
   *  the total, rather than storing a misleading 0. Defaults to true (back-compat). */
  recurrenceComputed?: boolean;
};

export type OutsideScoreMove = {
  key: string;
  value: number | null; // unrounded; null when the move was NOT computed (see `computed`)
  min: number;
  max: number;
  explanation: string;
  /** false ⇒ the move was not computed (e.g. record_strength with no recurrence run). It renders
   *  "—" and contributes 0 to the total (excluded, not counted as a real 0). Defaults true. */
  computed?: boolean;
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
      inputLedger: OutsideScoreLedger;
    };

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/** Half-up rounding (2.5 → 3, −2.5 → −2). Math.round is half-up for our range (all positive). */
function roundHalfUp(v: number): number {
  return Math.floor(v + 0.5);
}

export function monthsBetween(fromIso: string, toIso: string): number {
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

  // echo_integrity: clamp(distinct echoed statements − distinct contradicted statements, −4, +4).
  // The unit of echo is the STATEMENT (own-words id = declaredClaimId), not the pair row: one
  // own-words statement echoed by eight sources is ONE confirmation. Unspoken = 0 (silence never
  // penalizes). Deltas with no declaredClaimId carry no statement identity and are not counted.
  const echoedStatementIds = [
    ...new Set(input.deltas.filter((d) => d.deltaType === "echoed" && d.declaredClaimId).map((d) => d.declaredClaimId as string)),
  ];
  const divergentStatementIds = [
    ...new Set(input.deltas.filter((d) => d.deltaType === "divergent" && d.declaredClaimId).map((d) => d.declaredClaimId as string)),
  ];
  const confirmed = echoedStatementIds.length;
  const contradicted = divergentStatementIds.length;
  const echoIntegrity = clamp(confirmed - contradicted, -4, 4);

  // record_strength: 2 × strong-share — but ONLY when recurrence was run (recurrence establishes
  // "strong" = recurrence-accepted). With no recurrence run, it is NOT computed (renders "—",
  // excluded from the total) rather than a misleading 0.
  const recurrenceRan = input.recurrenceComputed !== false;
  const strongCount = input.signals.filter((s) => strengthOf(s) === "strong").length;
  const recordStrength = recurrenceRan ? 2 * (strongCount / signalCount) : null;

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

  // coverage_breadth: distinct OUTSIDE source kinds present (signed categories). "Your own site"
  // (client voice) and "Other" never count. min(kindsPresent − 1, 3) / 3.
  const kindHosts = new Map<SourceCategory, string[]>();
  for (const s of input.signals) {
    const cat = categorizeHost(s.sourceUrl);
    if (!OUTSIDE_KINDS.includes(cat)) continue;
    const host = hostFromUrl(s.sourceUrl);
    if (!host) continue;
    const arr = kindHosts.get(cat) ?? [];
    arr.push(host);
    kindHosts.set(cat, arr);
  }
  const presentKinds = OUTSIDE_KINDS.filter((k) => kindHosts.has(k)); // canonical order
  const coverageBreadth = Math.min(Math.max(presentKinds.length - 1, 0), 3) / 3;

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
      explanation: `${confirmed} confirmed vs ${contradicted} contradicted outside statements; unspoken statements count zero.`,
    },
    {
      key: "record_strength",
      value: recordStrength,
      min: 0,
      max: 2,
      computed: recurrenceRan,
      explanation: recurrenceRan
        ? `${strongCount} of ${signalCount} outside signals are strong (repeated across independent sources).`
        : RECORD_STRENGTH_NOT_COMPUTED,
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
      explanation: coverageSubline(presentKinds),
    },
    {
      key: "freshness",
      value: freshness,
      min: 0,
      max: 1,
      explanation: `${freshCount} of ${signalCount} outside signals dated within the last ${FRESHNESS_WINDOW_MONTHS} months; undated signals count as not fresh.`,
    },
  ];

  // ── INPUT LEDGER — the exact rows each move counted (ids where available). ──────
  const deltaId = (d: OutsideDeltaInput) => d.id ?? "";
  const inputLedger: OutsideScoreLedger = {
    signal_count: signalCount,
    echo_integrity: {
      echoed_statement_ids: echoedStatementIds,
      divergent_statement_ids: divergentStatementIds,
      echoed_delta_ids: input.deltas.filter((d) => d.deltaType === "echoed").map(deltaId).filter(Boolean),
      divergent_delta_ids: input.deltas.filter((d) => d.deltaType === "divergent").map(deltaId).filter(Boolean),
    },
    record_strength: {
      strong_signal_ids: recurrenceRan ? input.signals.filter((s) => strengthOf(s) === "strong").map((s) => s.id) : [],
      signal_count: signalCount,
      ...(recurrenceRan ? {} : { not_computed: true }),
    },
    differentiation_echo: {
      delta_ids: input.deltas
        .filter((d) => d.deltaType === "echoed" && d.declaredClaimId !== null &&
          ["positioning", "market"].includes((d.declaredTopic ?? "").trim().toLowerCase()))
        .map(deltaId).filter(Boolean),
    },
    coverage_breadth: {
      signal_ids: input.signals.map((s) => s.id),
      kinds_present: presentKinds, // the OUTSIDE kinds that counted, canonical order
      kind_hosts: Object.fromEntries(
        [...kindHosts.entries()].map(([k, v]) => [k, [...new Set(v)]]),
      ),
    },
    freshness: {
      fresh_signal_ids: input.signals
        .filter((s) => s.eventDate !== null && monthsBetween(s.eventDate, input.computedAt) <= FRESHNESS_WINDOW_MONTHS)
        .map((s) => s.id),
    },
  };

  // A not-computed move (value null / computed:false) is EXCLUDED from the total — it contributes 0,
  // but as an absent lever, never a real 0. (Skipping record_strength lowers the ceiling from 25 to
  // 23; the floor stays 11. No band copy references the ceiling, so the ladder still holds.)
  const totalUnrounded = OUTSIDE_ANCHOR + moves.reduce((sum, m) => sum + (m.computed === false || m.value === null ? 0 : m.value), 0);
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
    inputLedger,
  };
}
