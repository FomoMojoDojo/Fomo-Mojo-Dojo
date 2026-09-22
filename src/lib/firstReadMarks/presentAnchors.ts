// The anchors currently ON the page (commit 2 of 4, 2026-09-22) — computed from the read's data with the same keys
// the rows use, so "What we heard" can tell a mark whose row is gone from one whose row is still there. Pure.
// This mirrors the render rules of the beats (which rows exist and how they key). A mark not placed here is not
// invisible: "What we heard" lists every live mark, placed or not (FM19).
import type { FirstReadPreviewData } from "@/views/client/firstReadPreview/types";
import { anchorId } from "./useFirstReadMarks";

/** The markable beats and the read fields each carries. */
const STATIC_BEATS = new Set(["arc", "cold", "siesta1", "siesta2", "next", "base", "score"]);
const SECTION_BEATS = ["record", "yousay", "gap", "findings", "promise", "positioning", "strategy", "serve", "offer", "questions"];

export function presentAnchorIds(read: FirstReadPreviewData): Set<string> {
  const ids = new Set<string>();
  const add = (kind: string, key: string | null | undefined) => { const k = (key ?? "").trim(); if (k) ids.add(anchorId(kind, k)); };
  for (const b of SECTION_BEATS) if (!STATIC_BEATS.has(b)) add("section", b);
  if (read.coldOpen?.rung && read.coldOpen.anchorKey) add(read.coldOpen.rung === "pointer" ? "cold_open_pointer" : read.coldOpen.rung === "signal" ? "signal" : "cold_open_line", read.coldOpen.anchorKey);
  for (const s of read.signals) add("signal", s.id);
  for (const w of read.ownWords) add("own_words", w.id);
  for (const c of read.declared) add("channel_claim", c.id);
  if (read.declared.length) add("group", "yousay:channels");
  for (const st of read.gapStatements) { add("gap_statement", st.statementId); for (const p of st.evidence) add("gap_pair", p.contentIdentity); }
  for (const r of read.reverseRows) add("reverse_row", r.id);
  if (read.reverseRows.length) add("group", "gap:reverse");
  for (const f of read.findings) { add("finding", f.id); for (const q of f.quotes) if (q.signalId) add("finding_quote", `${f.id}:${q.signalId}`); }
  for (const m of read.observedMarkets) add("market", m.journeyKey);
  for (const g of read.unstatedGroups) add("candidate_group", g.originalIdentity);
  if (read.unstatedGroups.length) add("group", "serve:unstated");
  for (const q of read.questionAnchors ?? []) add("question", q.identity);
  // offering_question keys by a text hash filled asynchronously (read.offeringQuestionKeys); until it fills, or when the
  // text changed, the mark cannot be placed on a row — FM19: it is then listed in "What we heard" as row_gone
  for (const k of read.offeringQuestionKeys ?? []) add("offering_question", k);
  for (const c of read.statusConflicts) add("status_conflict", c.questionIdentity);
  if (read.promise?.text) add("read_field", "promise:promise");
  if (read.positioning) {
    if (read.positioning.category) add("read_field", "positioning:category");
    if (read.positioning.value) add("read_field", "positioning:value");
    read.positioning.differentiators.forEach((_, i) => add("read_field", `positioning:differentiators:${i}`));
  }
  if (read.strategy) {
    if (read.strategy.aspiration) add("read_field", "strategy:aspiration");
    if (read.strategy.whereToPlay) add("read_field", "strategy:where_to_play");
    if (read.strategy.howToWin) add("read_field", "strategy:how_to_win");
    (read.strategy.capabilities ?? []).forEach((_, i) => add("read_field", `strategy:capabilities:${i}`));
    (read.strategy.managementSystems ?? []).forEach((_, i) => add("read_field", `strategy:management_systems:${i}`));
  }
  (read.offering?.items ?? []).forEach((_, i) => add("read_field", `offering:items:${i}`));
  if (read.score) add("score_value", "score");
  return ids;
}
