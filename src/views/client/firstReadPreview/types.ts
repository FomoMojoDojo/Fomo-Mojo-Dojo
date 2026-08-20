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
  questions: [],
};
