// First Read — pure mapping functions, per operator rulings R2/R4/R5.
// Kept pure and separate so the rulings are testable without I/O.

import type { FRColdOpen, FRGapPair, FRGapStatement, FRGapVerdict, FRStatusSource, SignalStrength } from "./types";
import { formatFullDate } from "./deriveSourceTag";
import { isRelevanceActive } from "@/lib/firstRead/relevanceActive";

// ── Derived contradiction "why" (2026-08-22, SIGNED softened wording) ────────────────────────────
// A plain-language one-liner built ONLY from fields already on the pair/statement rows (both sides'
// texts are shown above; here we cite the declared date, the contradicting-source count, the deduped
// hosts, and the most-recent contra date). NO model, NO stored field. Date slots are OPTIONAL —
// included only when present, NEVER guessed. Returns null when unconstructible (not contradicted /
// zero contradicting pairs) so the beat renders nothing rather than a fabricated line.
// ── Judged contradiction reason (2026-08-22, SIGNED) ─────────────────────────────────────────────
// The client-facing "why" is now the JUDGED reason stored on the divergent pair at delta-decision
// time (claim_deltas.judge_reason) — richer than the derived line. Because it is now shown to the
// client, it passes a deterministic GROUNDING CHECK first (no model): non-empty, and it must not cite
// a host/domain that is absent from THIS statement's own pair set (guard against a reason referencing
// evidence that isn't here). Fails the check → the caller falls back to deriveContradictionWhy.
export function isGroundedReason(reason: string | null | undefined, evidenceHosts: ReadonlySet<string>): boolean {
  const r = (reason ?? "").trim();
  if (!r) return false; // non-empty
  // Any domain-like token the reason cites must be in the statement's evidence hosts.
  const cited = r.toLowerCase().match(/\b[a-z0-9][a-z0-9-]*\.(?:com|org|net|io|gov|edu|co|us|ai|info|biz)\b/g) ?? [];
  return cited.every((h) => evidenceHosts.has(h));
}

/** The strongest divergent pair of a contradicted statement (highest evidenceRank; tie → most recent
 *  eventDate). Shared selection rule for the fresh explanation and the judged reason. */
function strongestDivergentPair(st: Pick<FRGapStatement, "verdict" | "evidence">): FRGapPair | null {
  if (st.verdict !== "contradicted") return null;
  const contra = st.evidence.filter((e) => e.verdict === "contradicted");
  if (contra.length === 0) return null;
  return [...contra].sort(
    (a, b) => b.evidenceRank - a.evidenceRank || (b.eventDate ?? "").localeCompare(a.eventDate ?? ""),
  )[0];
}

// Sentinel tail of the honest non-specific explanation (excerpt is pure valence). A pair whose
// explanation contains it is treated as non-specific and DEFERRED to a specific pair when one exists.
const NON_SPECIFIC_MARK = "critical without specifics";

/** TIER 1 of the contradiction "why": the freshly generated, grounded "what differs" explanation.
 *  Among the statement's divergent pairs that carry a grounded explanation, PREFER the strongest one
 *  whose explanation is SPECIFIC (names the excerpt's concrete allegation) over an honest non-specific
 *  one; only when NO pair is specific does the honest non-specific line show. Null when none carry one. */
export function conflictExplanationFor(st: Pick<FRGapStatement, "verdict" | "evidence">): string | null {
  if (st.verdict !== "contradicted") return null;
  const withExpl = st.evidence.filter((e) => e.verdict === "contradicted" && (e.conflictExplanation ?? "").trim().length > 0);
  if (withExpl.length === 0) return null;
  const byStrength = (a: FRGapPair, b: FRGapPair) =>
    b.evidenceRank - a.evidenceRank || (b.eventDate ?? "").localeCompare(a.eventDate ?? "");
  const specific = withExpl.filter((e) => !(e.conflictExplanation ?? "").toLowerCase().includes(NON_SPECIFIC_MARK));
  const chosen = (specific.length ? specific : withExpl).sort(byStrength)[0];
  return (chosen.conflictExplanation ?? "").trim() || null;
}

/** TIER 2: the judged reason to show for a contradicted statement, or null when there is none or it
 *  fails the grounding check. Same STRONGEST-divergent-pair rule; grounded against the pair host set. */
export function judgedContradictionReason(st: Pick<FRGapStatement, "verdict" | "evidence">): string | null {
  const strongest = strongestDivergentPair(st);
  if (!strongest) return null;
  const reason = (strongest.judgeReason ?? "").trim();
  const evidenceHosts = new Set(
    st.evidence.map((e) => (e.recordHost ?? "").trim().toLowerCase()).filter((h) => h.length > 0),
  );
  return isGroundedReason(reason, evidenceHosts) ? reason : null;
}

export function deriveContradictionWhy(st: Pick<FRGapStatement, "verdict" | "evidence" | "declaredDate">): string | null {
  if (st.verdict !== "contradicted") return null;
  const contra = st.evidence.filter((e) => e.verdict === "contradicted");
  const n = contra.length;
  if (n === 0) return null;
  const hosts = [...new Set(contra.map((e) => (e.recordHost ?? "").trim()).filter((h) => h.length > 0))];
  const contraDates = contra.map((e) => e.eventDate).filter((d): d is string => !!d);
  const latest = contraDates.length ? contraDates.reduce((a, b) => (a > b ? a : b)) : null;
  const declaredDateStr = formatFullDate(st.declaredDate ?? null);
  const latestStr = formatFullDate(latest);
  const declClause = declaredDateStr ? ` (stated ${declaredDateStr})` : "";
  const hostClause = hosts.length ? ` (${hosts.join(", ")})` : "";
  const noun = n === 1 ? "source" : "sources";
  const verb = n === 1 ? "tells" : "tell";
  const dateClause = latestStr ? `, most recently ${latestStr}` : "";
  return `You say this${declClause}; ${n} public ${noun}${hostClause} ${verb} a different story${dateClause}.`;
}

// ── Cold-open ladder (2026-08-22) — deterministic, FIRST MATCH WINS ─────────────────────────────
//   rung 1: an active status conflict → the disputed-location line + STATUS DISPUTED chip;
//   rung 2: own-words statements exist → the echo-gap line (counts are beat 4's STATEMENT counts,
//           passed in, never recomputed here);
//   rung 3: else the strongest-signal fallback (already built by the hook), unchanged.
export type ColdOpenLadderInput = {
  statusConflict: { location: string; closedCount: number; openCount: number } | null;
  /** Beat 4's statement counts (from groupGapStatements) — null when there are no gap statements. */
  gap: { statements: number; confirmed: number; contradicted: number } | null;
  /** Formatted date of the latest public-vs-public deltas run (rung-2 source tag), or null. */
  deltasRunDate: string | null;
  /** The already-built strongest-signal cold open (rung 3). */
  fallback: FRColdOpen | null;
};
export function coldOpenLadder(input: ColdOpenLadderInput): FRColdOpen | null {
  // rung 1 — status conflict
  if (input.statusConflict && input.statusConflict.location.trim()) {
    const c = input.statusConflict;
    return {
      text: `Some sources say ${c.location} is closed. Others say it's open. Which is true today?`,
      sourceTag: { label: `${c.closedCount} reported closed · ${c.openCount} still listed open` },
      eventDate: null,
      statusDisputed: true,
      quoted: false,
    };
  }
  // rung 2 — echo gap (own-words statements exist). n/m/k are beat 4's numbers, verbatim.
  if (input.gap && input.gap.statements > 0) {
    const n = input.gap.statements;
    const m = input.gap.confirmed;
    const k = input.gap.contradicted;
    const echoes = m === 0 ? "none of them" : String(m);
    const contradictClause = k > 0 ? ` and contradicts ${k}` : "";
    return {
      text: `You say ${n} things about yourself. The public record echoes ${echoes}${contradictClause}.`,
      sourceTag: { label: `Public read · ${input.deltasRunDate ?? ""}`.replace(/·\s*$/, "").trim() },
      eventDate: null,
      statusDisputed: false,
      quoted: false,
    };
  }
  // rung 3 — strongest-signal fallback, unchanged
  return input.fallback;
}

/**
 * R4 (signed): strong = recurrence-confirmed across independent sources;
 * moderate = single-source medium confidence; thin = low confidence.
 * Unruled edge (single-source HIGH confidence) fails toward the weaker
 * bucket (moderate), consistent with R4's structure.
 */
export function strengthForSignal(
  confidence: string | null | undefined,
  recurrenceConfirmed: boolean,
): SignalStrength {
  if (recurrenceConfirmed) return "strong";
  if ((confidence ?? "").toLowerCase() === "low") return "thin";
  return "moderate";
}

// FIX 2 (2026-08-25) — negative-valence cue lexicon for "What the world says". Render-layer only:
// a deterministic keyword test on the outside excerpt, used ONLY to hoist the strongest negative
// signal into an early slot (placement is the emphasis — no alarm styling, no editorializing).
// Deliberately narrow to strong negative cues so a positive signal ("safe, supportive") is not
// mis-hoisted; a rare false positive only surfaces a mildly-negative signal, never fabricates one.
const NEGATIVE_CUES: readonly string[] = [
  "downhill", "down hill", "declin", "getting worse", "got worse", "worse than", "deteriorat",
  "understaff", "short staff", "short-staff", "high turnover", "turnover", "burnout", "burned out",
  "quit", "walked out", "laid off", "layoff", "unsafe", "safety concern", "assault", "abuse",
  "not recommend", "would not recommend", "do not recommend", "terrible", "awful", "horrible",
  "avoid", "1 star", "one star", "toxic", "underpaid", "low pay", "pay is", "mismanage",
  "no support", "lack of support", "understaffed", "chaos", "scam", "fraud", "lawsuit", "neglect",
];
export function isNegativeSignal(text: string | null | undefined): boolean {
  const t = (text ?? "").toLowerCase();
  return NEGATIVE_CUES.some((cue) => t.includes(cue));
}

// FIX 2: reserve an early slot for the strongest negative outside signal. Pure reorder (never adds/
// removes/mutates the input): among signals whose text is a negative cue, pick the strongest strength
// tier (strong > moderate > thin), tie-break most-recent eventDate, and move that ONE signal to
// NEG_SLOT_INDEX (within the shown top rows). No negative ⇒ the array is returned unchanged.
const NEG_STRENGTH_RANK: Record<string, number> = { strong: 0, moderate: 1, thin: 2 };
export const NEG_SLOT_INDEX = 2;
export function hoistStrongestNegative<T extends { id: string; text: string; strength: string; eventDate: string | null }>(signals: T[]): T[] {
  const negatives = signals.filter((s) => isNegativeSignal(s.text));
  if (negatives.length === 0) return signals;
  const pick = negatives.reduce((best, s) =>
    NEG_STRENGTH_RANK[s.strength] !== NEG_STRENGTH_RANK[best.strength]
      ? (NEG_STRENGTH_RANK[s.strength] < NEG_STRENGTH_RANK[best.strength] ? s : best)
      : ((s.eventDate ?? "") > (best.eventDate ?? "") ? s : best),
  );
  const idx = signals.findIndex((s) => s.id === pick.id);
  if (idx <= NEG_SLOT_INDEX) return signals; // already in an early slot
  const out = signals.slice();
  out.splice(idx, 1);
  out.splice(NEG_SLOT_INDEX, 0, pick);
  return out;
}

// A1: beat-4 order by discussability — contradicted → unechoed → confirmed (unspoken last,
// though it is off-surface). Ties break by evidence strength desc.
export const GAP_VERDICT_ORDER: Record<string, number> = { contradicted: 0, unechoed: 1, confirmed: 2, unspoken: 3 };
export function orderGapPairs<T extends { verdict: string; evidenceRank: number }>(pairs: T[]): T[] {
  return [...pairs].sort((a, b) =>
    (GAP_VERDICT_ORDER[a.verdict] ?? 9) - (GAP_VERDICT_ORDER[b.verdict] ?? 9) || b.evidenceRank - a.evidenceRank);
}

/**
 * 2026-08-21: the unit of echo is the STATEMENT, not the pair row. Group the beat-4 pairs by
 * their own-words id (statementId = declared_claim_id, the single identity authority's key).
 * Per statement: verdict = contradicted if ANY pair contradicted, else confirmed if ANY echoed,
 * else not-echoed. Every confirmed/contradicted pair is kept as visible evidence beneath — nothing
 * is hidden; a not-echoed statement carries no evidence (the record is silent). Statement order
 * follows the (already discussability-ordered) input's first appearance, so it is deterministic
 * and independent of within-group shuffling.
 */
export function groupGapStatements(pairs: FRGapPair[]): FRGapStatement[] {
  const order: string[] = [];
  const byId = new Map<string, FRGapStatement>();
  for (const p of pairs) {
    let st = byId.get(p.statementId);
    if (!st) {
      st = { statementId: p.statementId, declared: p.declared ?? "", declaredDate: p.declaredDate ?? null, verdict: "unechoed", evidence: [] };
      byId.set(p.statementId, st);
      order.push(p.statementId);
    }
    // Only confirmed/contradicted pairs carry a public-record side — those are the evidence.
    // RELEVANCE BACKSTOP (operator ruling 2026-08-25): a relevance-'orthogonal' pair is OMITTED
    // from the client render entirely (the line-through-in-place render is retired) — it never
    // enters `evidence`, so it neither shows nor drives the verdict. It stays fully recorded and
    // reversible in claim_deltas. The single shared selector isRelevanceActive is the gate.
    if ((p.verdict === "confirmed" || p.verdict === "contradicted") && isRelevanceActive(p.relevanceVerdict)) st.evidence.push(p);
  }
  for (const st of byId.values()) {
    // Verdict from the (now already active-only) evidence: contradicted if ANY contradicted, else
    // confirmed if ANY echoed, else not-echoed. A confirmed/contradicted statement therefore always
    // has >=1 rendered evidence pair — it can never be all-struck (invariant asserted in tests);
    // an all-struck statement falls to unechoed and renders the clean doesn't-echo empty state.
    const hasContra = st.evidence.some((e) => e.verdict === "contradicted");
    const hasEcho = st.evidence.some((e) => e.verdict === "confirmed");
    st.verdict = hasContra ? "contradicted" : hasEcho ? "confirmed" : "unechoed";
  }
  // FIX 1 (2026-08-25): order statements by their FINAL verdict, not the pre-strike pair order that
  // orderGapPairs produced. Before the relevance backstop, first-pair-appearance matched the statement
  // verdict; now a statement whose divergent pair(s) were struck orthogonal keeps its early
  // "contradicted-block" position while its final verdict is confirmed/unechoed — so a CONFIRMED
  // statement could render first on the disagreement page. Sort by GAP_VERDICT_ORDER (contradicted →
  // not-echoed → confirmed); within a group, strongest ACTIVE evidence first (evidenceRank desc, tie
  // most-recent active eventDate desc). Stable (JS sort) → first-appearance breaks full ties (e.g.
  // not-echoed statements with no active evidence). Pure reorder: gapCounts are unaffected.
  // `evidence` is already active-only (struck pairs were never pushed), so these read it directly.
  const maxRank = (st: FRGapStatement) => st.evidence.reduce((m, e) => Math.max(m, e.evidenceRank ?? 0), 0);
  const maxDate = (st: FRGapStatement) => st.evidence.reduce((m, e) => (e.eventDate && e.eventDate > m ? e.eventDate : m), "");
  return order.map((k) => byId.get(k)!).sort((a, b) =>
    (GAP_VERDICT_ORDER[a.verdict] ?? 9) - (GAP_VERDICT_ORDER[b.verdict] ?? 9)
    || maxRank(b) - maxRank(a)
    || maxDate(b).localeCompare(maxDate(a)));
}

/**
 * A1 (2026-08-20): beat 4 is the DECLARED-anchored say-vs-see. echoed→CONFIRMED,
 * divergent→CONTRADICTED, publicly_silent→UNECHOED (we say it, the record is silent).
 * internally_silent (record-only) is OFF this surface now (null) — it lives in the outside-raised
 * cold open, not the gap. (Prior R5 kept publicly_silent off and internally_silent on; reversed.)
 */
export function verdictForDeltaType(deltaType: string): FRGapVerdict | null {
  switch (deltaType) {
    case "echoed":
      return "confirmed";
    case "divergent":
      return "contradicted";
    case "publicly_silent":
      return "unechoed";
    default:
      return null;
  }
}

/** A folded status-conflict source: one host+date, with how many raw signal rows share it. */
export type FoldedStatusSource = { host: string; date: string | null; count: number };

/**
 * S4 (2026-08-21): DISPLAY-ONLY fold of status-conflict sources. Identical host+date entries
 * collapse to one row carrying a count (the underlying duplicate signal rows are untouched —
 * never deleted or superseded). First-appearance order is preserved. Used by the pinned banner so
 * two corner.inc · 2026-04-19 signals read as "corner.inc · 2026-04-19 ×2", once.
 */
export function foldByHostDate(sources: Pick<FRStatusSource, "host" | "date">[]): FoldedStatusSource[] {
  const order: string[] = [];
  const byKey = new Map<string, FoldedStatusSource>();
  for (const s of sources) {
    const key = `${s.host} ${s.date ?? ""}`;
    let g = byKey.get(key);
    if (!g) {
      g = { host: s.host, date: s.date, count: 0 };
      byKey.set(key, g);
      order.push(key);
    }
    g.count++;
  }
  return order.map((k) => byKey.get(k)!);
}

/**
 * R2: element grouping only where the declared topic maps trivially;
 * everything else stays ungrouped. Never hand-map ambiguous topics.
 */
export function facetForTopic(topic: string | null | undefined): "Market" | "Positioning" | null {
  const t = (topic ?? "").trim().toLowerCase();
  if (t === "market") return "Market";
  if (t === "positioning") return "Positioning";
  return null;
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** "2026-03-14" → "March 2026". Null/invalid → null (MOST RECENT omitted). */
export function formatMonthYear(isoDate: string | null | undefined): string | null {
  if (!isoDate) return null;
  const m = /^(\d{4})-(\d{2})/.exec(isoDate);
  if (!m) return null;
  const monthIndex = Number(m[2]) - 1;
  if (monthIndex < 0 || monthIndex > 11) return null;
  return `${MONTHS[monthIndex]} ${m[1]}`;
}

/** Bare host for the header identity line ("https://x.com/a" → "x.com"). */
export function bareHost(website: string | null | undefined): string | null {
  if (!website) return null;
  try {
    const url = new URL(website.includes("://") ? website : `https://${website}`);
    return url.hostname.replace(/^www\./, "") || null;
  } catch {
    return null;
  }
}
