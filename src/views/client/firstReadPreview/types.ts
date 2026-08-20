// First Read (8-beat client surface) — real-data contract.
//
// Phase A: every section is nullable/empty-able; a missing section renders its
// persisted-integrity empty state, NEVER fixture content. The shape descends
// from the Lovable build's FirstRead contract (mojomap-redesign sampleRead.ts
// @ 1f54a56) with fixture-only fields dropped.

import type { SourceTagResult } from "./deriveSourceTag";

export type SignalStrength = "strong" | "moderate" | "thin";

export type FRSignal = {
  id: string;
  /** Verbatim outside excerpt (signals.evidence_excerpt). */
  text: string;
  /** Derived source tag (source-honesty ruling) — null hides the tag. */
  sourceTag: SourceTagResult;
  /** ISO date of the newest instance, or null — null omits MOST RECENT. */
  eventDate: string | null;
  strength: SignalStrength;
};

export type FRColdOpen = {
  /** The featured outside statement (public claim) or a verbatim excerpt. */
  text: string;
  sourceTag: SourceTagResult;
  eventDate: string | null;
};

export type FRDeclared = {
  id: string;
  topic: string | null;
  /** R2: trivially mapped base element, or null = ungrouped. */
  facet: "Market" | "Positioning" | null;
  statement: string;
  /** Birth-record source tag — null hides the tag (never fixed copy). */
  sourceTag: SourceTagResult;
};

export type FRMarket = {
  id: string;
  executorStatement: string;
  jobStatement: string | null;
  chosen: boolean;
};

export type FRGapVerdict = "confirmed" | "contradicted" | "unspoken";

export type FRGapPair = {
  id: string;
  verdict: FRGapVerdict;
  /** Declared-side statement; null for unspoken (company silent). */
  declared: string | null;
  /** Public-record side statement. */
  record: string;
  sourceTag: SourceTagResult;
  eventDate: string | null;
};

export type FRScore = {
  value: number;
  computedAt: string;
  methodologyVersion: string;
};

// ── "What we see" public-register objects (public-beats gate, 2026-08-20) ──────
// Every row is labelled OUR READ and carries a source tag. Synthesized objects
// (markets/positioning/strategy) tag as "Public read · <date>"; channel rows tag
// as page + read date.

/** Observed market (odi_market_definitions, public register): people + the job. */
export type FRMarketDef = {
  id: string;
  who: string;
  job: string | null;
  sourceTag: SourceTagResult;
};

/** Observed positioning (positioning_canvases market_read). */
export type FRPositioning = {
  category: string | null;
  value: string | null;
  differentiators: string[];
  sourceTag: SourceTagResult;
} | null;

/** Observed promise (market_read canvas value_for_customer + proposed_tagline). */
export type FRPromise = {
  value: string | null;
  tagline: string | null;
  sourceTag: SourceTagResult;
} | null;

/** Observed strategy (strategy_cascades market_read). */
export type FRStrategy = {
  aspiration: string | null;
  whereToPlay: string | null;
  howToWin: string | null;
  sourceTag: SourceTagResult;
} | null;

/** Observed finding (S4) — public_inferred, ranked by recurrence breadth then recency. */
export type FRFinding = {
  id: string;
  body: string;
  /** finding_recurrence.distinct_host_count (independent corroborating hosts), 0 if none. */
  recurrence: number;
  sourceTag: SourceTagResult;
};

/** Inferred base reading (R-B) — persisted numbers only, no unearned adjectives. */
export type FRWhereYouStand = {
  scoreValue: number;
  band: string;
  activeFronts: number;
  strongSignals: number;
  sourceTag: SourceTagResult;
} | null;

export type FirstReadPreviewData = {
  company: { name: string; website: string | null } | null;
  coldOpen: FRColdOpen | null;
  declared: FRDeclared[];
  markets: FRMarket[];
  /** Outside-voice signals, strength-mapped (R4), strong-first then newest. */
  signals: FRSignal[];
  /** Outside-methodology score rows ONLY (R1) — v1.1.0 never renders here. */
  score: FRScore | null;
  gapPairs: FRGapPair[];
  /**
   * GATE B-1: the gap's persisted integrity state (integrity_runs, component
   * 'first_read_gap_pairs'): not-yet (no record), looked-and-none, couldn't-check.
   * Governs the empty-beat line — never derived from array emptiness alone.
   */
  gapIntegrity: "not_yet" | "looked_none" | "couldnt_check";
  // ── "What we see" public register (public-beats gate, 2026-08-20) ──
  /** R3: ids of channel rows hidden by the junk filter (reported, never silent). */
  channelJunkIds: string[];
  observedMarkets: FRMarketDef[];
  positioning: FRPositioning;
  promise: FRPromise;
  strategy: FRStrategy;
  whereYouStand: FRWhereYouStand;
  /** S4: observed findings (public_inferred, open), recurrence-ranked. */
  findings: FRFinding[];
  /**
   * S1: whether the outside read was LOOKED (a public_baseline_run exists) — grounds the
   * always-mounted Mojo Score beat's honest empty state in a persisted record, not array
   * emptiness. Score present → ladder; looked but no score → not-enough-signal; else not-yet.
   */
  scoreLooked: boolean;
  questions: string[];
};

export const EMPTY_FIRST_READ: FirstReadPreviewData = {
  company: null,
  coldOpen: null,
  declared: [],
  markets: [],
  signals: [],
  score: null,
  gapPairs: [],
  gapIntegrity: "not_yet",
  channelJunkIds: [],
  observedMarkets: [],
  positioning: null,
  promise: null,
  strategy: null,
  whereYouStand: null,
  findings: [],
  scoreLooked: false,
  questions: [],
};
