// PCT-2 (public-change-tracking, step 2): reconcile public synthesis rows
// (opportunities / odi_needs) by content identity instead of delete+insert.
// Tier 1 — keep / add / preserve. NO contradiction, NO supersede, NO strike
// (those are Tier 2, gated on a contradiction signal we don't have).
//
// Operates ONLY on provenance_type='public_research' rows. Curated ('manual') and
// declared ('internal_declared') rows are never SELECTed in and never touched.
//
// - KEEP: a new-run row whose identity matches an existing active public row →
//   the existing row is kept; only last_confirmed_run_id advances. Prior text,
//   scores, updated_at are retained verbatim (a reword that still means the same
//   thing is not a content change — re-wording-as-improvement is Tier 2).
// - ADD: a new-run row with no match → inserted with content_identity, status
//   'active', source_run_id and last_confirmed_run_id = current run.
// - PRESERVE: an existing active public row the new run did not match → left
//   UNTOUCHED. Absence is an open question, not a contradiction: status stays
//   active, last_confirmed_run_id is NOT advanced, nothing is struck.
//
// MATCH is lexical, two-stage:
//   1. exact content_identity (normalized-statement sha256) — folds case,
//      whitespace, punctuation-trivial restatement.
//   2. else, within the SAME (journey_key, step_number) only: distinctive-token
//      Jaccard >= THRESHOLD. Distinctive tokens = normalized words minus a small
//      universal-scaffold stop-list (the/to/of/a/it/takes/time/minimize).
//      Directional verbs (reduce/increase/improve) are KEPT so opposite-polarity
//      outcomes can never collapse to the same set. One match max; ties ADD.
//   The rule catches scaffold variation, NOT synonym/morphological variation:
//   "locate options" vs "find options" is treated as NEW (recoverable near-dup) —
//   semantic matching is out of Tier-1 scope, by design.

import { contentIdentity, normalizeForHash } from "./contentIdentity.ts";

export const JACCARD_THRESHOLD = 0.80;
// Universal scaffold only — NOT the directional verbs. Operator-trimmed list.
const STOP_TOKENS = new Set(["the", "to", "of", "a", "it", "takes", "time", "minimize"]);

function distinctiveTokens(statement: string): Set<string> {
  // Tokenize like syndication.normalizeWords (lowercase, strip non-letter/number
  // to spaces, split), then drop universal scaffold.
  const words = normalizeForHash(statement)
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean)
    .filter((w) => !STOP_TOKENS.has(w));
  return new Set(words);
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

export type ExistingRow = {
  id: string;
  statement: string;
  content_identity: string | null;
  journey_key: string;
  step_number: number;
};

export type NewRow = {
  // Caller-opaque handle (e.g. temp_key or index) echoed back in the plan.
  ref: string;
  statement: string;
  journey_key: string;
  step_number: number;
};

export type ReconcilePlanEntry =
  | { ref: string; action: "keep"; existingId: string; identity: string }
  | { ref: string; action: "add"; identity: string };

export type ReconcilePlan = {
  entries: ReconcilePlanEntry[];
  // Existing active public rows whose content_identity was NULL and is now
  // computed — caller persists these as the lazy backfill through the one helper.
  identityBackfill: Array<{ id: string; identity: string }>;
  // Existing rows matched by some new row (their ids); last_confirmed advances.
  keptExistingIds: string[];
  // Existing active public rows not matched — preserved untouched (ids only, for
  // assertion/telemetry; caller does nothing to them).
  preservedExistingIds: string[];
};

// Pure planner — no DB I/O. Computes identities for every existing + new row and
// produces the keep/add plan. Caller executes the writes (so table-specific
// concerns like the opportunities parent tree stay in the caller).
export async function planReconcile(
  existing: ExistingRow[],
  incoming: NewRow[],
): Promise<ReconcilePlan> {
  const identityBackfill: Array<{ id: string; identity: string }> = [];
  const existingByIdentity = new Map<string, ExistingRow>();
  const existingResolvedIdentity = new Map<string, string>(); // row id -> identity

  for (const row of existing) {
    const identity = row.content_identity && row.content_identity.length === 64
      ? row.content_identity
      : await contentIdentity(row.statement);
    if (!row.content_identity) identityBackfill.push({ id: row.id, identity });
    existingResolvedIdentity.set(row.id, identity);
    // First-wins if two existing rows somehow share an identity (no UNIQUE exists);
    // the second stays available only to the Jaccard path, never silently dropped.
    if (!existingByIdentity.has(identity)) existingByIdentity.set(identity, row);
  }

  const consumed = new Set<string>(); // existing row ids already matched (one-match-max)
  const entries: ReconcilePlanEntry[] = [];
  const keptExistingIds: string[] = [];

  for (const nr of incoming) {
    const identity = await contentIdentity(nr.statement);

    // Stage 1: exact identity.
    const exact = existingByIdentity.get(identity);
    if (exact && !consumed.has(exact.id)) {
      consumed.add(exact.id);
      keptExistingIds.push(exact.id);
      entries.push({ ref: nr.ref, action: "keep", existingId: exact.id, identity });
      continue;
    }

    // Stage 2: distinctive-token Jaccard within same (journey_key, step_number).
    const nrTokens = distinctiveTokens(nr.statement);
    let best: ExistingRow | null = null;
    let bestScore = 0;
    let tie = false;
    for (const e of existing) {
      if (consumed.has(e.id)) continue;
      if (e.journey_key !== nr.journey_key || e.step_number !== nr.step_number) continue;
      const score = jaccard(nrTokens, distinctiveTokens(e.statement));
      if (score > bestScore) { bestScore = score; best = e; tie = false; }
      else if (score === bestScore && bestScore > 0) { tie = true; }
    }
    if (best && bestScore >= JACCARD_THRESHOLD && !tie) {
      consumed.add(best.id);
      keptExistingIds.push(best.id);
      entries.push({ ref: nr.ref, action: "keep", existingId: best.id, identity });
      continue;
    }

    // No match → add.
    entries.push({ ref: nr.ref, action: "add", identity });
  }

  const preservedExistingIds = existing.map((e) => e.id).filter((id) => !consumed.has(id));
  return { entries, identityBackfill, keptExistingIds, preservedExistingIds };
}
