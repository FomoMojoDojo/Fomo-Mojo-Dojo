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
  /** S5: the featured item references a location with a live status conflict. */
  statusDisputed?: boolean;
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

/** OW-3: a verbatim (or judge-faithful) self-assertion the company makes on its own channels,
 *  written by the extractor (claim_type='own_words'). Tri-state by fidelity in beat 3. Tag is
 *  page + read date (own-words are read-dated by nature). */
export type FROwnWord = {
  id: string;
  quote: string;
  pageUrl: string;
  pageHost: string;
  fidelity: "verbatim" | "paraphrased";
  sourceTag: { label: string } | null;
};

export type FRMarket = {
  id: string;
  executorStatement: string;
  jobStatement: string | null;
  chosen: boolean;
};

// A1 (2026-08-20): beat 4 surfaces the DECLARED-anchored say-vs-see — contradicted (divergent),
// unechoed (publicly_silent: we say it, the record is silent), confirmed (echoed). 'unspoken'
// (internally_silent, record-only) is off this surface; the type keeps it for the mapper.
export type FRGapVerdict = "confirmed" | "contradicted" | "unechoed" | "unspoken";

export type FRGapPair = {
  id: string;
  verdict: FRGapVerdict;
  /** Declared-side statement; null only for a record-only row. */
  declared: string | null;
  /** Public-record side statement; null for `unechoed` (the record is silent). */
  record: string | null;
  sourceTag: SourceTagResult;
  eventDate: string | null;
  /** A1: evidence strength (3 strong / 2 moderate / 1 thin) — the within-category sort key. */
  evidenceRank: number;
  /** S5: backing references a location with a live status conflict. */
  statusDisputed?: boolean;
};

/** A1: persisted type counts that pick beat 4's headline (never a disagreement headline over
 *  zero disagreements). Derived from the rendered pairs. */
export type FRGapCounts = { contradicted: number; unechoed: number; confirmed: number };

/** S3/S5: a live status conflict — an authoritative source reports {location} closed while others
 *  list it open. Pinned atop Questions + Findings; rows whose backing references {location} carry
 *  a STATUS DISPUTED chip. Never a verdict. */
export type FRStatusSource = { host: string; date: string | null; quote: string };
export type FRStatusConflict = {
  location: string;
  /** lowercased match key (the partner name) used to mark disputed rows. */
  matchKey: string;
  question: string;
  closed: FRStatusSource[];
  open: FRStatusSource[];
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
  /** R4: age of the finding's earliest backing signal. stale = event_date > 18 months old OR
   *  undated (reuses FRESHNESS_WINDOW_MONTHS). Stale ranks below fresh at equal recurrence;
   *  never hidden. The marker distinguishes an old-but-dated finding from an undated one. */
  stale: boolean;
  ageMarker: "dated" | "undated" | null;
  /** S5: backing references a location with a live status conflict. */
  statusDisputed?: boolean;
};

/** One persisted micro-move of the outside score (W1, 2026-08-20): value / max with
 *  its persisted explanation. No live recompute — every field is read from the
 *  mojo_scores snapshot (component_scores[key] + explanation[key]). */
export type FRScoreLever = {
  key: string;
  label: string;
  value: number;
  max: number;
  explanation: string;
};

/** Inferred base reading (R-B / W1) — the interpretation of the beat-7 score: band name +
 *  band meaning + the five micro-moves, all from the persisted snapshot. No unearned
 *  adjectives. The component orders the levers by headroom (max − value) desc. */
export type FRWhereYouStand = {
  scoreValue: number;
  band: string;
  bandMeaning: string;
  levers: FRScoreLever[];
  sourceTag: SourceTagResult;
} | null;

export type FirstReadPreviewData = {
  company: { name: string; website: string | null } | null;
  coldOpen: FRColdOpen | null;
  declared: FRDeclared[];
  /** OW-3: the company's own verbatim self-assertions (beat 3 lead). */
  ownWords: FROwnWord[];
  /** OW-3: own_words hidden at render (no usable quote) — reported, never silent. */
  ownWordsHiddenIds: string[];
  /** OW-3: whether the own-words extraction LOOKED (a first_read_own_words integrity record
   *  exists) — grounds beat 3's empty state in a persisted record, not array emptiness. */
  ownWordsLooked: boolean;
  markets: FRMarket[];
  /** Outside-voice signals, strength-mapped (R4), strong-first then newest. */
  signals: FRSignal[];
  /** Outside-methodology score rows ONLY (R1) — v1.1.0 never renders here. */
  score: FRScore | null;
  gapPairs: FRGapPair[];
  /** A1: type counts driving the gap headline/standfirst. */
  gapCounts: FRGapCounts;
  /** S3/S5: live status conflicts (pinned atop Questions + Findings; mark disputed rows). */
  statusConflicts: FRStatusConflict[];
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
  ownWords: [],
  ownWordsHiddenIds: [],
  ownWordsLooked: false,
  markets: [],
  signals: [],
  score: null,
  gapPairs: [],
  gapCounts: { contradicted: 0, unechoed: 0, confirmed: 0 },
  statusConflicts: [],
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
