// DIAGNOSE SOURCE CLASSES (DF2, signed 2026-10-01) — the world / your team / your customers triad.
//
// THE LAW. The triad renders ONLY where a stored field classes the source. Two stored fields do:
//   1. claims.outside_support_count / organization_support_count / customer_support_count
//   2. the interview record's speaker_role, with the item's speaker_side
// Everywhere else the source is UNCLASSED and is counted as such. An unclassed count is not a
// failure state to be hidden — it is the honest answer, and DF2 requires it to be shown.
//
// signals.voice_class IS NOT USED TO CLASS ANYTHING. It is read for exactly one purpose: to exclude
// model-written analysis (voice_class = 'analysis'), which is not a source at all. The earlier fact
// report found 498 'analysis' rows and 660 NULLs fleet-wide; treating either as a voice would have
// counted the model's own prose as evidence.
//
// "CUSTOMERS" SHOWS ITS TRUE COUNT, INCLUDING 0. Edgewood's customer count is 0 — no live
// market_participant interview, no claim with customer support. A zero here is a finding, not an
// empty state, so nothing in this module may coerce it away.
//
// EXCLUDED IS NOT UNCLASSED. Two things are dropped from the counts entirely rather than landing in
// `unclassed`: an 'analysis' signal (not a source) and an item whose speaker_side is 'ours' (our own
// interviewer speaking, not the client and not their customer). `unclassed` means "a real source we
// cannot class"; it must never absorb things that are not sources.

/** The four counts. `unclassed` is a real source we cannot class, never a dumping ground. */
export type SourceCounts = {
  readonly world: number;
  readonly team: number;
  readonly customers: number;
  readonly unclassed: number;
};

export const EMPTY_SOURCE_COUNTS: SourceCounts = Object.freeze({ world: 0, team: 0, customers: 0, unclassed: 0 });

/** The stored support counts a claim carries. Null/absent is 0 — a missing count is not evidence. */
export type ClaimSupport = {
  readonly outside_support_count: number | null | undefined;
  readonly organization_support_count: number | null | undefined;
  readonly customer_support_count: number | null | undefined;
};

/** The two stored fields that class an interview source, read together. */
export type InterviewSource = {
  /** The item's speaker side — CHECK-constrained to 'client' | 'ours'. */
  readonly speaker_side: string | null | undefined;
  /** The record's speaker role — CHECK-constrained to the three roles below. */
  readonly speaker_role: string | null | undefined;
};

/** A backing signal. voice_class is read ONLY to exclude 'analysis'. */
export type BackingSignal = { readonly voice_class: string | null | undefined };

/** The signed role map (step 2 census, 2026-10-01). Both source columns are CHECK-constrained to
 *  exactly these values, so this map is total — not merely exhaustive over today's rows. */
export const TEAM_ROLES = ["client_stakeholder", "working_session"] as const;
export const CUSTOMER_ROLES = ["market_participant"] as const;

function nonNegative(n: number | null | undefined): number {
  return typeof n === "number" && Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

/**
 * A claim's triad, straight from the three stored counts.
 *
 * A claim with all three at 0 returns all zeros — NOT one unclassed. A claim with no recorded
 * support is a claim nobody has backed, which is a different statement from "backed by a source we
 * cannot class", and DF2 keeps them apart.
 */
export function claimSourceCounts(claim: ClaimSupport): SourceCounts {
  return {
    world: nonNegative(claim.outside_support_count),
    team: nonNegative(claim.organization_support_count),
    customers: nonNegative(claim.customer_support_count),
    unclassed: 0,
  };
}

/**
 * One interview source, classed by the record's role and the item's side.
 *
 *   client + client_stakeholder  → team
 *   client + working_session     → team
 *   client + market_participant  → customers
 *   ours   + (any role)          → EXCLUDED (all zeros): our interviewer is not a source
 *
 * A side or role outside the CHECK constraints cannot occur, but if the constraint is ever widened
 * without this map being updated the source lands in `unclassed` rather than being silently dropped
 * or silently counted — the honest failure mode.
 */
export function interviewItemSourceCounts(source: InterviewSource): SourceCounts {
  const side = String(source.speaker_side ?? "");
  const role = String(source.speaker_role ?? "");

  // Our own interviewer speaking. Not a source — excluded entirely, never unclassed.
  if (side === "ours") return EMPTY_SOURCE_COUNTS;

  if (side !== "client") {
    // Not a side this map knows. A real source we cannot class.
    return { ...EMPTY_SOURCE_COUNTS, unclassed: 1 };
  }

  if ((TEAM_ROLES as readonly string[]).includes(role)) return { ...EMPTY_SOURCE_COUNTS, team: 1 };
  if ((CUSTOMER_ROLES as readonly string[]).includes(role)) return { ...EMPTY_SOURCE_COUNTS, customers: 1 };
  return { ...EMPTY_SOURCE_COUNTS, unclassed: 1 };
}

/**
 * Findings, needs, and anything else backed by signals: each backing signal is ONE UNCLASSED source,
 * because no stored field on a signal classes it. 'analysis' signals are excluded entirely — they
 * are the model's own prose, not a source.
 *
 * This is the only function in this module that reads voice_class, and it reads it only to exclude.
 */
export function signalBackedSourceCounts(signals: readonly BackingSignal[]): SourceCounts {
  let unclassed = 0;
  for (const s of signals) {
    if (String(s.voice_class ?? "") === "analysis") continue; // not a source
    unclassed += 1;
  }
  return { ...EMPTY_SOURCE_COUNTS, unclassed };
}

/** Sum. Used to roll a set of claims or items into one triad. */
export function addSourceCounts(a: SourceCounts, b: SourceCounts): SourceCounts {
  return {
    world: a.world + b.world,
    team: a.team + b.team,
    customers: a.customers + b.customers,
    unclassed: a.unclassed + b.unclassed,
  };
}

export function sumSourceCounts(all: readonly SourceCounts[]): SourceCounts {
  return all.reduce(addSourceCounts, EMPTY_SOURCE_COUNTS);
}

/** True when nothing at all backs the item — every class and the unclassed count are 0. */
export function hasNoSources(c: SourceCounts): boolean {
  return c.world === 0 && c.team === 0 && c.customers === 0 && c.unclassed === 0;
}
