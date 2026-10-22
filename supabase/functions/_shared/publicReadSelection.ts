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
//   S  today's query, then (isAnalysisRow ∨ isPageShapedRow) ∧ !isChannelJunk(text, source_title) ∧ evidence_class <> 'listing';
//      DEDUPE before the cap — same canonical URL (normalizeUrlKey) + same statement (normalizeForHash) counts
//      once, the newest read (created_at, then id) wins. THEN (operator ruling 33, 2026-10-22 — supersedes the beat-2
//      order FOR THE GENERATOR ONLY; the preview keeps compareBeat2) the evidence-tier selector, selectByEvidence below:
//      verified page words before unverified; tiers filing / record / own page / review / our read; within a tier read
//      date desc, strength, event date desc, sha256(id), host; host round-robin within a tier (a filing's unit is its
//      document); rounds filing, record, record, own page, review; soft shares; our read never past its share.
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
import { isAnalysisRow, isPageShapedRow } from "./voiceLabel.ts";
import { isChannelJunk } from "./ownWordsExtract.ts";
import { normalizeForHash, sha256HexSync } from "./contentIdentity.ts";
import { normalizeUrlKey } from "../../../src/lib/firstRead/quoteProducer.ts";
import { isPairAdmissible } from "./relevanceActive.ts";
import { gapVerdictForDeltaType, orderGapPairs, strengthForSignal } from "./previewOrder.ts";
import { excerptIsVerifiedPageWords } from "./classSourcingScope.ts";
import { matchRegistryUrl } from "./registryClassifier.ts";
import { isEmployerReviewHost } from "./deltaRuleChecks.ts";

// R1 (2026-10-14): bumped because the pool's TEXT for a signal changed — it is now rowTextOf's
// assembly, with the source title carried as its own field instead of appended. Nothing about which
// rows are admitted, deduped, ordered or capped changed; what a row SAYS to the model did.
// P1 (2026-10-14): bumped again — the rows the CURRENT read cites are now admitted ahead of the
// cap, on their own budget of 12, so WHICH rows enter the pool has changed. A read stamped
// 2026-10-14.1 was built from a pool where the cap could silently discard the evidence its own
// predecessor rested on (audit 10228: Wasabi's FedRAMP and AI-product rows, all live, all over_cap).
// N2 (2026-10-14): bumped again — rows that STATE a name a still-sourced current line uses are now
// admitted before the cap on P1's budget. WHICH rows enter the pool changed, so the stamp moves.
// 2026-10-22 (operator ruling 4): bumped for the own-words host order — a company with confirmed related entities takes
// its own-words seed host first, then each related host, round-robin within the cap. WHICH rows enter the pool changed
// for those companies, so the stamp moves (for every company: the stamp names the rule, not the outcome).
// 2026-10-22 (operator ruling 9): bumped — a pair whose identity carries an ACTIVE claim_delta_rule_refusal (rule R1–R3 or
// operator) is no longer admitted; isPairAdmissible reads it, as the preview does. WHICH rows enter the pool changed.
// 2026-10-22 (operator ruling 33): bumped — the signal cap no longer admits the alphabetically first hosts among same-date
// rows; the evidence-tier selector (verified first, tiers, shares, sha256 tie-break) decides, and the cap is 30.
export const SELECTION_VERSION = "gpr-select-2026-10-22.3" as const;

export type Dropped = { id: string; kind: "signal" | "own_word" | "finding" | "delta"; reason: string };

// ── selection_dropped (operator ruling 33, 2026-10-22): every row the selection did not admit, in every read's ledger ──
/** The reason family a drop belongs to — cap, share, class, hold, duplicate, junk, refusal (other: a reason this map
 *  has not been taught, which the selection test refuses). */
export type DropFamily = "cap" | "share" | "class" | "hold" | "duplicate" | "junk" | "refusal" | "other";
export function dropFamily(reason: string): DropFamily {
  const r = String(reason ?? "");
  if (r === "over_cap" || r === "over_predecessor_cited_cap" || r === "over_predecessor_named_cap") return "cap";
  if (r === "tier_share") return "share";
  if (r === "hold" || r === "superseded") return "hold";
  if (r.startsWith("duplicate_of:") || r === "duplicate_identity") return "duplicate";
  if (["channel_junk", "listing", "not_page_shaped", "empty_text", "empty_quote", "empty_body", "no_claim_text"].includes(r)) return "junk";
  if (r.startsWith("rule_refusal:") || r === "rejected_pairing") return "refusal";
  if (r.startsWith("not_public_source_type:") || r.startsWith("kind_excluded:") || r.startsWith("relevance_") ||
    ["kind_ineligible", "not_recurrence_backed", "no_active_claim", "claim_not_active", "observed_own_host"].includes(r)) return "class";
  return "other";
}
export type SelectionDropped = Record<Dropped["kind"], Array<{ id: string; reason: string; family: DropFamily }>>;
/** The ledger's selection_dropped: every dropped row by kind, with its reason and family. */
export function selectionDroppedOf(dropped: readonly Dropped[]): SelectionDropped {
  const out: SelectionDropped = { signal: [], own_word: [], finding: [], delta: [] };
  for (const d of dropped) (out[d.kind] ??= []).push({ id: d.id, reason: d.reason, family: dropFamily(d.reason) });
  return out;
}

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
    // 1a-4 (2026-10-07): an ANALYSIS row is admitted past the page-shape gate. isPageShapedRow
    // refuses a synthesis row by construction — it carries no page address because it is not a read
    // OF a page — so leaving this gate untouched would admit zero analysis rows and the ruling could
    // not take effect. It is admitted on its own footing and LABELLED our_read; every other
    // admission rule (junk, listing), the dedupe, the beat-2 order, the per-host breadth and the cap
    // are unchanged. Breadth keeps it honest: analysis rows all carry the company's own host, so the
    // round-robin takes at most one per round and they can never flood the pool.
    if (!isAnalysisRow(s) && !isPageShapedRow(s)) { dropped.push({ id: s.id, kind: "signal", reason: "not_page_shaped" }); continue; }
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
  // ruling 33: the evidence-tier selector decides which admitted rows meet the cap
  const sel = selectByEvidence([...byKey.values()], cap, recurrenceConfirmedIds);
  for (const x of sel.dropped) dropped.push({ id: x.id, kind: "signal", reason: x.reason });
  return { kept: sel.kept, dropped };
}

// ── THE EVIDENCE-TIER SELECTOR (operator ruling 33, 2026-10-22) ──────────────────────────────────────────────────────
//
// WHY. compareBeat2 orders by read date, then HOST ALPHABETICALLY, and the breadth round-robin took hosts in that order
// until the cap — so among rows read on the same day the alphabetically first 20 hosts filled the cap. Spectrum lost 8
// of its 9 own-filing rows (sec.gov, host rank 27) and 5 of 9 alternative-naming rows at rank 21+ (pool diagnostic,
// ruling 28). Nothing about the evidence decided it.
//
// THE RULE, from fields every row already carries (no host or company terms):
//   PHASE V before PHASE U — a row without verified page words (excerptIsVerifiedPageWords) never takes a slot ahead of
//     one with them; a verified row left out only by its tier's share still fills before any unverified row.
//   TIERS — evidenceTierOf: T1 filing, T2 the independent record, T3 the company's own pages, T4 reviews, T5 our read.
//   WITHIN A TIER — read date desc, strength (strengthForSignal), event date desc, sha256(id), host; breadth is a
//     round-robin over hosts (a filing's unit is its document URL — a filer's filings share one host by nature).
//   ROUNDS — each round offers slots in SELECTION_ROUND order (the record twice: the largest, broadest tier); our read
//     enters only once T1–T4 of the phase are exhausted or at their shares.
//   SOFT SHARES — TIER_SHARE of the cap per tier; a slot nothing else can fill may go past a share, except our read's.
export type EvidenceTier = 1 | 2 | 3 | 4 | 5;
export const TIER_NAME: Readonly<Record<EvidenceTier, string>> = { 1: "filing", 2: "record", 3: "own_page", 4: "review", 5: "our_read" };
export const TIER_SHARE: Readonly<Record<EvidenceTier, number>> = { 1: 0.4, 2: 0.5, 3: 0.25, 4: 0.3, 5: 0.1 };
export const SELECTION_ROUND: readonly EvidenceTier[] = [1, 2, 2, 3, 4];
const REVIEW_SOURCE_TYPES: ReadonlySet<string> = new Set(["customer_review", "employee_review", "review_signal", "community_discussion", "directory"]);
const STRENGTH_RANK: Record<string, number> = { strong: 0, moderate: 1, thin: 2 };

/** A signal's evidence tier, from the fields it carries. Our read is tested first (the analysis mark wins every voice
 *  test, as in classOfSignal); a filing next; a review by its source type or an employer-review host; then the voice. */
export function evidenceTierOf(s: Pick<SelSignal, "source_url" | "evidence_class" | "voice_class" | "raw_payload">): EvidenceTier {
  const rp = (s.raw_payload && typeof s.raw_payload === "object") ? s.raw_payload as Record<string, unknown> : {};
  const st = String(rp.source_type ?? "");
  const va = (rp.voice_authority && typeof rp.voice_authority === "object") ? rp.voice_authority as Record<string, unknown> : {};
  if (isAnalysisRow(s as never)) return 5;
  if (va.authority === "own_filing_related" || s.evidence_class === "filing" || matchRegistryUrl(s.source_url)?.page_type === "filing_data") return 1;
  if (REVIEW_SOURCE_TYPES.has(st) || isEmployerReviewHost(hostOf(s.source_url))) return 4;
  if (s.voice_class === "client_voice") return 3;
  return 2;
}

function selectByEvidence(rows: SelSignal[], cap: number, confirmed: ReadonlySet<string>): { kept: SelSignal[]; dropped: Array<{ id: string; reason: string }> } {
  const tierOf = new Map(rows.map((s) => [s.id, evidenceTierOf(s)]));
  const verified = new Map(rows.map((s) => [s.id, excerptIsVerifiedPageWords(s as unknown as Record<string, unknown>)]));
  const key = new Map(rows.map((s) => [s.id, [
    (s.created_at ?? "").slice(0, 10),
    STRENGTH_RANK[strengthForSignal(s.confidence_to_use, confirmed.has(s.id))] ?? 9,
    s.event_date ?? "",
    sha256HexSync(s.id),
    hostOf(s.source_url),
  ] as const]));
  const cmp = (a: SelSignal, b: SelSignal): number => {
    const ka = key.get(a.id)!, kb = key.get(b.id)!;
    return kb[0].localeCompare(ka[0])            // read date, newest first
      || ka[1] - kb[1]                           // strength
      || kb[2].localeCompare(ka[2])              // event date, newest first (none last)
      || ka[3].localeCompare(kb[3])              // sha256(id): no bias toward any letter
      || ka[4].localeCompare(kb[4])              // host: the last tie-break
      || a.id.localeCompare(b.id);
  };
  const unitOf = (s: SelSignal) => tierOf.get(s.id) === 1 ? `doc:${String(s.source_url ?? "").split("#")[0]}` : `host:${hostOf(s.source_url)}`;
  const max = (t: EvidenceTier) => Math.ceil(cap * TIER_SHARE[t]);
  const kept: SelSignal[] = [];
  const keptIds = new Set<string>();
  const tN: Partial<Record<EvidenceTier, number>> = {};
  const take = (s: SelSignal) => { kept.push(s); keptIds.add(s.id); const t = tierOf.get(s.id)!; tN[t] = (tN[t] ?? 0) + 1; };
  for (const phaseVerified of [true, false]) {
    const phase = rows.filter((s) => verified.get(s.id) === phaseVerified).sort(cmp);
    const tiers = new Map<EvidenceTier, Map<string, SelSignal[]>>();
    for (const s of phase) {
      const t = tierOf.get(s.id)!;
      if (!tiers.has(t)) tiers.set(t, new Map());
      const m = tiers.get(t)!; const u = unitOf(s);
      if (!m.has(u)) m.set(u, []);
      m.get(u)!.push(s);
    }
    const cursor = new Map<EvidenceTier, { round: number; idx: number }>();
    /** the next row of tier t in host round-robin order, or null when the tier has none left */
    const nextOf = (t: EvidenceTier): SelSignal | null => {
      const m = tiers.get(t); if (!m) return null;
      const units = [...m.values()];
      const c = cursor.get(t) ?? { round: 0, idx: 0 };
      cursor.set(t, c);
      for (;;) {
        if (c.idx >= units.length) { c.idx = 0; c.round++; if (!units.some((q) => q.length > c.round)) return null; }
        const q = units[c.idx++];
        if (q.length > c.round) return q[c.round];
      }
    };
    while (kept.length < cap) {
      let took = false;
      for (const t of SELECTION_ROUND) {
        if (kept.length >= cap) break;
        if ((tN[t] ?? 0) >= max(t)) continue;
        const s = nextOf(t);
        if (s) { take(s); took = true; }
      }
      if (!took) break;
    }
    // our read: only once T1–T4 of this phase are exhausted or at share, and never past its own share
    for (const q of tiers.get(5)?.values() ?? []) for (const s of q) {
      if (kept.length >= cap || (tN[5] ?? 0) >= max(5)) break;
      take(s);
    }
    // phase V outranks the shares: a verified row left out only by its share fills before ANY unverified row
    if (phaseVerified) for (const s of phase) {
      if (kept.length >= cap) break;
      if (!keptIds.has(s.id) && tierOf.get(s.id) !== 5) take(s);
    }
  }
  // soft shares: a slot nothing else can fill goes past a share — verified first — never to our read
  const rest = rows.filter((s) => !keptIds.has(s.id) && tierOf.get(s.id) !== 5)
    .sort((a, b) => (verified.get(a.id) === verified.get(b.id) ? cmp(a, b) : verified.get(a.id) ? -1 : 1));
  for (const s of rest) { if (kept.length >= cap) break; take(s); }
  const dropped = rows.filter((s) => !keptIds.has(s.id)).sort(cmp)
    .map((s) => ({ id: s.id, reason: (tN[tierOf.get(s.id)!] ?? 0) >= max(tierOf.get(s.id)!) ? "tier_share" : "over_cap" }));
  return { kept, dropped };
}

export type SelOwnWord = { id: string; quote: string | null; judge_kind?: string | null; content_identity: string | null; created_at: string | null };

/** Ruling 1 (2026-10-22): the own-host order for own-words selection — the seed host first, then each confirmed related
 *  host in effect. Absent ⇒ the original single-host selection, byte-identical. */
export type OwnWordsHostOrder = { seed: string | null; related: readonly string[] };

/** O: one candidate per content identity that has an ACTIVE own_words claim; ORDER BY created_at, id; cap.
 *  With a host order (a company with confirmed related entities in effect), the admitted rows are taken round-robin
 *  within the same cap: one from the seed host, then one from each related host in order, then one from any other host,
 *  repeating — so the company's own site is never crowded out by a related entity's. */
export function selectOwnWords(rows: SelOwnWord[], cap: number, activeIdentities: ReadonlySet<string>, eligible: (w: SelOwnWord) => boolean, hostOrder?: OwnWordsHostOrder | null): { kept: SelOwnWord[]; dropped: Dropped[] } {
  if (hostOrder && hostOrder.related.length > 0) return selectOwnWordsByHost(rows, cap, activeIdentities, eligible, hostOrder);
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

function selectOwnWordsByHost(rows: SelOwnWord[], cap: number, activeIdentities: ReadonlySet<string>, eligible: (w: SelOwnWord) => boolean, order: OwnWordsHostOrder): { kept: SelOwnWord[]; dropped: Dropped[] } {
  const dropped: Dropped[] = [];
  const ordered = [...rows].sort((a, b) => `${a.created_at ?? ""}|${a.id}`.localeCompare(`${b.created_at ?? ""}|${b.id}`));
  const seen = new Set<string>();
  const admitted: SelOwnWord[] = [];
  for (const w of ordered) {
    if (!(w.quote ?? "").trim()) { dropped.push({ id: w.id, kind: "own_word", reason: "empty_quote" }); continue; }
    if (!eligible(w)) { dropped.push({ id: w.id, kind: "own_word", reason: "kind_ineligible" }); continue; }
    if (!w.content_identity || !activeIdentities.has(w.content_identity)) { dropped.push({ id: w.id, kind: "own_word", reason: "no_active_claim" }); continue; }
    if (seen.has(w.content_identity)) { dropped.push({ id: w.id, kind: "own_word", reason: "duplicate_identity" }); continue; }
    seen.add(w.content_identity);
    admitted.push(w);
  }
  const onHost = (h: string, d: string) => !!d && (h === d || h.endsWith(`.${d}`));
  const hosts = [order.seed ?? "", ...order.related].map((h) => h.toLowerCase().replace(/^www\./, ""));
  const bucketOf = (w: SelOwnWord) => { const h = hostOf((w as { source_url?: string | null }).source_url); const i = hosts.findIndex((d) => onHost(h, d)); return i < 0 ? hosts.length : i; };
  const buckets: SelOwnWord[][] = Array.from({ length: hosts.length + 1 }, () => []);
  for (const w of admitted) buckets[bucketOf(w)].push(w);
  const kept: SelOwnWord[] = [];
  for (let round = 0; kept.length < cap; round++) {
    let took = false;
    for (const b of buckets) {
      if (kept.length >= cap) break;
      if (round < b.length) { kept.push(b[round]); took = true; }
    }
    if (!took) break;
  }
  const keptIds = new Set(kept.map((w) => w.id));
  for (const w of admitted) if (!keptIds.has(w.id)) dropped.push({ id: w.id, kind: "own_word", reason: "over_cap" });
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
  content_identity?: string | null;
};
export type SelClaim = { id: string; statement: string | null; status: string | null; confidence?: string | null };

const confidenceRank = (c: string | null | undefined) => ({ high: 3, medium: 2, low: 1 } as Record<string, number>)[(c ?? "").toLowerCase()] ?? 1;

/** D: admissible (isPairAdmissible, which reads the pair's ACTIVE rule refusal by content identity — ruling 9), every claim
 *  active, not operator-rejected; ordered by the gap beat's order, then id. `ruleRefusalByIdentity` maps content_identity →
 *  the refusal's rule (claim_delta_rule_refusals_active); it is required so a caller cannot silently omit it. */
export function selectDeltas(rows: SelDelta[], cap: number, claimById: ReadonlyMap<string, SelClaim>, ruleRefusalByIdentity: ReadonlyMap<string, string>): { kept: SelDelta[]; dropped: Dropped[] } {
  const dropped: Dropped[] = [];
  const admitted: Array<{ d: SelDelta; verdict: string; evidenceRank: number }> = [];
  for (const d of rows) {
    const ids = [d.declared_claim_id, d.public_claim_id].filter((x): x is string => !!x);
    const decl = d.declared_claim_id ? claimById.get(d.declared_claim_id) : undefined;
    const pub = d.public_claim_id ? claimById.get(d.public_claim_id) : undefined;
    if (!(decl?.statement || pub?.statement)) { dropped.push({ id: d.id, kind: "delta", reason: "no_claim_text" }); continue; }
    const ruleRefusal = d.content_identity ? ruleRefusalByIdentity.get(d.content_identity) ?? null : null;
    if (!isPairAdmissible({ relevanceVerdict: d.relevance_verdict as never, observedOwnHost: !!d.observed_own_host, ruleRefusal })) {
      dropped.push({ id: d.id, kind: "delta", reason: ruleRefusal ? `rule_refusal:${ruleRefusal}` : d.observed_own_host ? "observed_own_host" : "relevance_orthogonal" }); continue;
    }
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
