// First Read (8-beat) — pure mapping functions, per operator rulings R2/R4/R5.
// Kept pure and separate so the rulings are testable without I/O.

import type { FRColdOpen, FRGapPair, FRGapStatement, FRGapVerdict, FRStatusSource, SignalStrength } from "./types";
import { formatFullDate } from "./deriveSourceTag";

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

/** TIER 1 of the contradiction "why": the freshly generated, grounded "what differs" explanation of
 *  the strongest divergent pair (already grounded-gated in the hook). Null when absent. */
export function conflictExplanationFor(st: Pick<FRGapStatement, "verdict" | "evidence">): string | null {
  const p = strongestDivergentPair(st);
  const expl = (p?.conflictExplanation ?? "").trim();
  return expl || null;
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
    if (p.verdict === "confirmed" || p.verdict === "contradicted") st.evidence.push(p);
  }
  for (const st of byId.values()) {
    const hasContra = st.evidence.some((e) => e.verdict === "contradicted");
    const hasEcho = st.evidence.some((e) => e.verdict === "confirmed");
    st.verdict = hasContra ? "contradicted" : hasEcho ? "confirmed" : "unechoed";
  }
  return order.map((k) => byId.get(k)!);
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
