// ── Public-read input selection (operator ruling 5, signed 2026-09-18) ─────────────────────────────
//
// generate-public-read used to take the first N rows of each kind in physical row order — no ORDER BY, no
// admission beyond the query predicate. Edgewood's ledger held nine "Declared in page metadata (/)" social-link
// rows, eight aggregator-hosted self-copies, one row with no page and no URL, and seven relevance-orthogonal
// pairs. This module is the ONE selection step, deterministic and admitted by the preview's own authorities —
// every predicate is IMPORTED (voiceLabel.isPageShapedRow, ownWordsExtract.isChannelJunk, relevanceActive.
// isPairAdmissible, previewOrder.compareBeat2 / orderGapPairs / gapVerdictForDeltaType / strengthForSignal,
// quoteProducer.normalizeUrlKey — already mounted for the edge — and contentIdentity.normalizeForHash); nothing is copied and no new ranking is
// invented. Pure: the caller runs the queries and passes rows; the ledger is stamped with SELECTION_VERSION so
// every stored read says which selection built it (absent = the pre-ruling physical-order selection).
//
//   S  today's query, then isPageShapedRow ∧ !isChannelJunk(text, source_title) ∧ evidence_class <> 'listing';
//      DEDUPE before the cap — same canonical URL (normalizeUrlKey) + same statement (normalizeForHash) counts
//      once, the newest read (created_at, then id) wins; ORDER BY the preview's beat-2 keys (compareBeat2:
//      read-date desc, host, strength, event date desc) with id as the final tie-break; BREADTH — one row per
//      host in that order before any second row from the same host, then a second per host, … until the cap.
//   O  candidates whose content identity has an ACTIVE own_words claim, one per identity, ORDER BY created_at, id.
//   F  predicate unchanged, ORDER BY created_at, id.
//   D  isPairAdmissible ∧ every claim of the pair active ∧ operator_disposition <> 'rejected_pairing';
//      ORDER BY the gap beat's own order (orderGapPairs: verdict rank, then evidence rank desc), then id;
//      BREADTH (amendment signed 2026-09-18) — one pair per distinct OBSERVED claim in that order before any
//      second pair on the same observed claim, then a second per claim, … until the cap.
//      Evidence rank here is the PUBLIC CLAIM's stored confidence (high 3 / medium 2 / low 1); the preview ranks a
//      pair by its newest record SIGNAL's confidence_to_use (useFirstReadPreviewData.ts:741–760) — the claim's
//      confidence is the same scale one level up, and the only pair-level authority the generator has without
//      re-deriving the preview's signal join.
import { isPageShapedRow } from "./voiceLabel.ts";
import { isChannelJunk } from "./ownWordsExtract.ts";
import { normalizeForHash } from "./contentIdentity.ts";
import { normalizeUrlKey } from "../../../src/lib/firstRead/quoteProducer.ts";
import { isPairAdmissible } from "./relevanceActive.ts";
import { compareBeat2, gapVerdictForDeltaType, orderGapPairs, strengthForSignal } from "./previewOrder.ts";

export const SELECTION_VERSION = "gpr-select-2026-09-18.1" as const;

export type Dropped = { id: string; kind: "signal" | "own_word" | "finding" | "delta"; reason: string };

export type SelSignal = {
  id: string; claim_text: string | null; evidence_excerpt: string | null; source_title: string | null; source_url: string | null;
  event_date: string | null; created_at: string | null; confidence_to_use: string | null; evidence_class: string | null;
  voice_class?: string | null; raw_payload?: unknown;
};

export function signalText(s: Pick<SelSignal, "claim_text" | "evidence_excerpt">): string {
  return (s.claim_text ?? s.evidence_excerpt ?? "").trim();
}

function hostOf(url: string | null | undefined): string {
  try { return new URL(String(url ?? "")).hostname.replace(/^www\./i, "").toLowerCase(); } catch { return ""; }
}

const newer = (a: SelSignal, b: SelSignal) => `${a.created_at ?? ""}|${a.id}` > `${b.created_at ?? ""}|${b.id}`;

/** S: admit, dedupe (newest read wins), order by the preview's keys, then breadth round-robin per host up to the cap. */
export function selectSignals(rows: SelSignal[], cap: number, recurrenceConfirmedIds: ReadonlySet<string>): { kept: SelSignal[]; dropped: Dropped[] } {
  const dropped: Dropped[] = [];
  const admitted: SelSignal[] = [];
  for (const s of rows) {
    const text = signalText(s);
    if (!text) { dropped.push({ id: s.id, kind: "signal", reason: "empty_text" }); continue; }
    if (!isPageShapedRow(s)) { dropped.push({ id: s.id, kind: "signal", reason: "not_page_shaped" }); continue; }
    if (isChannelJunk(text, s.source_title ?? null)) { dropped.push({ id: s.id, kind: "signal", reason: "channel_junk" }); continue; }
    if (s.evidence_class === "listing") { dropped.push({ id: s.id, kind: "signal", reason: "listing" }); continue; }
    admitted.push(s);
  }
  // dedupe: same canonical URL + same statement → one row, the newest read wins
  const byKey = new Map<string, SelSignal>();
  for (const s of admitted) {
    const key = `${normalizeUrlKey(s.source_url)}|${normalizeForHash(signalText(s))}`;
    const prior = byKey.get(key);
    if (!prior) { byKey.set(key, s); continue; }
    if (newer(s, prior)) { dropped.push({ id: prior.id, kind: "signal", reason: `duplicate_of:${s.id}` }); byKey.set(key, s); }
    else dropped.push({ id: s.id, kind: "signal", reason: `duplicate_of:${prior.id}` });
  }
  // order by the preview's beat-2 keys (compareBeat2), id as the total-order tie-break
  const sortable = [...byKey.values()].map((s) => ({
    s, readDate: (s.created_at ?? "").slice(0, 10), host: hostOf(s.source_url),
    signal: { strength: strengthForSignal(s.confidence_to_use, recurrenceConfirmedIds.has(s.id)), eventDate: s.event_date ?? null },
  }));
  sortable.sort((a, b) => compareBeat2(a, b) || a.s.id.localeCompare(b.s.id));
  // breadth: round-robin over hosts in order of first appearance
  const hostOrder: string[] = [];
  const queues = new Map<string, SelSignal[]>();
  for (const x of sortable) {
    if (!queues.has(x.host)) { queues.set(x.host, []); hostOrder.push(x.host); }
    queues.get(x.host)!.push(x.s);
  }
  const kept: SelSignal[] = [];
  for (let round = 0; kept.length < cap; round++) {
    let took = false;
    for (const h of hostOrder) {
      if (kept.length >= cap) break;
      const q = queues.get(h)!;
      if (q.length > round) { kept.push(q[round]); took = true; }
    }
    if (!took) break;
  }
  const keptIds = new Set(kept.map((s) => s.id));
  for (const x of sortable) if (!keptIds.has(x.s.id)) dropped.push({ id: x.s.id, kind: "signal", reason: "over_cap" });
  return { kept, dropped };
}

export type SelOwnWord = { id: string; quote: string | null; judge_kind?: string | null; content_identity: string | null; created_at: string | null };

/** O: one candidate per content identity that has an ACTIVE own_words claim; ORDER BY created_at, id; cap. */
export function selectOwnWords(rows: SelOwnWord[], cap: number, activeIdentities: ReadonlySet<string>, eligible: (w: SelOwnWord) => boolean): { kept: SelOwnWord[]; dropped: Dropped[] } {
  const dropped: Dropped[] = [];
  const ordered = [...rows].sort((a, b) => `${a.created_at ?? ""}|${a.id}`.localeCompare(`${b.created_at ?? ""}|${b.id}`));
  const seen = new Set<string>();
  const kept: SelOwnWord[] = [];
  for (const w of ordered) {
    if (!(w.quote ?? "").trim()) { dropped.push({ id: w.id, kind: "own_word", reason: "empty_quote" }); continue; }
    if (!eligible(w)) { dropped.push({ id: w.id, kind: "own_word", reason: "kind_ineligible" }); continue; }
    if (!w.content_identity || !activeIdentities.has(w.content_identity)) { dropped.push({ id: w.id, kind: "own_word", reason: "no_active_claim" }); continue; }
    if (seen.has(w.content_identity)) { dropped.push({ id: w.id, kind: "own_word", reason: "duplicate_identity" }); continue; }
    seen.add(w.content_identity);
    if (kept.length >= cap) { dropped.push({ id: w.id, kind: "own_word", reason: "over_cap" }); continue; }
    kept.push(w);
  }
  return { kept, dropped };
}

export type SelFinding = { id: string; body: string | null; created_at: string | null };

/** F: predicate unchanged (the caller's query); ORDER BY created_at, id; cap. */
export function selectFindings(rows: SelFinding[], cap: number, recurrenceBacked: ReadonlySet<string>): { kept: SelFinding[]; dropped: Dropped[] } {
  const dropped: Dropped[] = [];
  const kept: SelFinding[] = [];
  for (const f of [...rows].sort((a, b) => `${a.created_at ?? ""}|${a.id}`.localeCompare(`${b.created_at ?? ""}|${b.id}`))) {
    if (!recurrenceBacked.has(f.id)) { dropped.push({ id: f.id, kind: "finding", reason: "not_recurrence_backed" }); continue; }
    if (!(f.body ?? "").trim()) { dropped.push({ id: f.id, kind: "finding", reason: "empty_body" }); continue; }
    if (kept.length >= cap) { dropped.push({ id: f.id, kind: "finding", reason: "over_cap" }); continue; }
    kept.push(f);
  }
  return { kept, dropped };
}

export type SelDelta = {
  id: string; delta_type: string; declared_claim_id: string | null; public_claim_id: string | null;
  relevance_verdict: string | null; observed_own_host: boolean | null; operator_disposition: string | null;
};
export type SelClaim = { id: string; statement: string | null; status: string | null; confidence?: string | null };

const confidenceRank = (c: string | null | undefined) => ({ high: 3, medium: 2, low: 1 } as Record<string, number>)[(c ?? "").toLowerCase()] ?? 1;

/** D: admissible (isPairAdmissible), every claim active, not operator-rejected; ordered by the gap beat's order, then id. */
export function selectDeltas(rows: SelDelta[], cap: number, claimById: ReadonlyMap<string, SelClaim>): { kept: SelDelta[]; dropped: Dropped[] } {
  const dropped: Dropped[] = [];
  const admitted: Array<{ d: SelDelta; verdict: string; evidenceRank: number }> = [];
  for (const d of rows) {
    const ids = [d.declared_claim_id, d.public_claim_id].filter((x): x is string => !!x);
    const decl = d.declared_claim_id ? claimById.get(d.declared_claim_id) : undefined;
    const pub = d.public_claim_id ? claimById.get(d.public_claim_id) : undefined;
    if (!(decl?.statement || pub?.statement)) { dropped.push({ id: d.id, kind: "delta", reason: "no_claim_text" }); continue; }
    if (!isPairAdmissible({ relevanceVerdict: d.relevance_verdict as never, observedOwnHost: !!d.observed_own_host })) { dropped.push({ id: d.id, kind: "delta", reason: d.observed_own_host ? "observed_own_host" : "relevance_orthogonal" }); continue; }
    if (!ids.every((id) => claimById.get(id)?.status === "active")) { dropped.push({ id: d.id, kind: "delta", reason: "claim_not_active" }); continue; }
    if (d.operator_disposition === "rejected_pairing") { dropped.push({ id: d.id, kind: "delta", reason: "rejected_pairing" }); continue; }
    admitted.push({ d, verdict: gapVerdictForDeltaType(d.delta_type) ?? "unspoken", evidenceRank: confidenceRank(pub?.confidence) });
  }
  // orderGapPairs is a stable sort by (verdict rank, evidence rank desc); pre-sort by id so equal keys resolve deterministically
  admitted.sort((a, b) => a.d.id.localeCompare(b.d.id));
  const ordered = orderGapPairs(admitted);
  // breadth: round-robin over observed claims in order of first appearance (a pair with no observed side is its own key)
  const keyOrder: string[] = [];
  const queues = new Map<string, SelDelta[]>();
  for (const x of ordered) {
    const key = x.d.public_claim_id ?? `none:${x.d.id}`;
    if (!queues.has(key)) { queues.set(key, []); keyOrder.push(key); }
    queues.get(key)!.push(x.d);
  }
  const kept: SelDelta[] = [];
  for (let round = 0; kept.length < cap; round++) {
    let took = false;
    for (const k of keyOrder) {
      if (kept.length >= cap) break;
      const q = queues.get(k)!;
      if (q.length > round) { kept.push(q[round]); took = true; }
    }
    if (!took) break;
  }
  const keptIds = new Set(kept.map((d) => d.id));
  for (const x of ordered) if (!keptIds.has(x.d.id)) dropped.push({ id: x.d.id, kind: "delta", reason: "over_cap" });
  return { kept, dropped };
}
