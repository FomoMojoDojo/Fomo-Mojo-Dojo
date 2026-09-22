// The anchors currently ON the page WITH THEIR TEXT (commit 4 of 4, ruling FM12 revised, 2026-09-22). Pure.
//
// presentAnchorIds answers "is this row still here?" — keys only. The revisit prompt also has to answer "does it
// still say what it said?", so this walks the same branches in the same order and keeps each row's text exactly as
// the MarkTarget on that row passes it. presentAnchorIds stays the client-side reader (R1: the client render does
// not change); this is the operator-side one. The two MUST agree on keys — currentAnchors.test.ts pins that.
//
// text: null means "the row is here, but its words are not derivable from the read". Two kinds are like that and
// both are deliberate:
//   section   the beat headline is static signed copy inside the act components, not read data
//   group     the three block labels are signed constants in acts.tsx, not read data
// Static copy cannot drift from a data change — only from a code change — so a null text is classified `match`
// and never raises the prompt. offering_question keys BY the hash of its own text, so a wording change there
// changes the KEY and surfaces as row_gone (R6); its text is likewise not carried here.
import type { FirstReadPreviewData } from "@/views/client/firstReadPreview/types";
import type { AnchorKind } from "./anchors";

/** One row as the page renders it now. */
export type CurrentAnchor = { anchor_kind: AnchorKind; anchor_key: string; text: string | null };

/** The markable beats (mirrors presentAnchorIds). */
const STATIC_BEATS = new Set(["arc", "cold", "siesta1", "siesta2", "next", "base", "score"]);
const SECTION_BEATS = ["record", "yousay", "gap", "findings", "promise", "positioning", "strategy", "serve", "offer", "questions"];

export function currentAnchors(read: FirstReadPreviewData): CurrentAnchor[] {
  const out: CurrentAnchor[] = [];
  const add = (anchor_kind: AnchorKind, key: string | null | undefined, text: string | null) => {
    const anchor_key = (key ?? "").trim();
    if (!anchor_key) return;
    out.push({ anchor_kind, anchor_key, text: text === null ? null : text.trim() });
  };
  for (const b of SECTION_BEATS) if (!STATIC_BEATS.has(b)) add("section", b, null); // static copy
  if (read.coldOpen?.rung && read.coldOpen.anchorKey) {
    add(read.coldOpen.rung === "pointer" ? "cold_open_pointer" : read.coldOpen.rung === "signal" ? "signal" : "cold_open_line", read.coldOpen.anchorKey, read.coldOpen.text);
  }
  for (const s of read.signals) add("signal", s.id, s.text);
  for (const w of read.ownWords) add("own_words", w.id, w.quote);
  for (const c of read.declared) add("channel_claim", c.id, c.statement);
  if (read.declared.length) add("group", "yousay:channels", null); // static copy
  for (const st of read.gapStatements) {
    add("gap_statement", st.statementId, st.declared);
    for (const p of st.evidence) add("gap_pair", p.contentIdentity, p.record ?? p.listing?.productName ?? "");
  }
  for (const r of read.reverseRows) add("reverse_row", r.id, r.statement);
  if (read.reverseRows.length) add("group", "gap:reverse", null); // static copy
  for (const f of read.findings) {
    add("finding", f.id, f.body);
    for (const q of f.quotes) if (q.signalId) add("finding_quote", `${f.id}:${q.signalId}`, q.text);
  }
  for (const m of read.observedMarkets) add("market", m.journeyKey, m.who);
  for (const g of read.unstatedGroups) add("candidate_group", g.originalIdentity, g.who);
  if (read.unstatedGroups.length) add("group", "serve:unstated", null); // static copy
  for (const q of read.questionAnchors ?? []) add("question", q.identity, q.text);
  for (const k of read.offeringQuestionKeys ?? []) add("offering_question", k, null); // keyed BY its own text hash
  for (const c of read.statusConflicts) add("status_conflict", c.questionIdentity, c.question);
  if (read.promise?.text) add("read_field", "promise:promise", read.promise.text);
  if (read.positioning) {
    if (read.positioning.category) add("read_field", "positioning:category", read.positioning.category);
    if (read.positioning.value) add("read_field", "positioning:value", read.positioning.value);
    read.positioning.differentiators.forEach((d, i) => add("read_field", `positioning:differentiators:${i}`, d));
  }
  if (read.strategy) {
    if (read.strategy.aspiration) add("read_field", "strategy:aspiration", read.strategy.aspiration);
    if (read.strategy.whereToPlay) add("read_field", "strategy:where_to_play", read.strategy.whereToPlay);
    if (read.strategy.howToWin) add("read_field", "strategy:how_to_win", read.strategy.howToWin);
    (read.strategy.capabilities ?? []).forEach((c, i) => add("read_field", `strategy:capabilities:${i}`, c));
    (read.strategy.managementSystems ?? []).forEach((m, i) => add("read_field", `strategy:management_systems:${i}`, m));
  }
  // The item's text is the label and the statement joined exactly as the row renders them.
  (read.offering?.items ?? []).forEach((it, i) => add("read_field", `offering:items:${i}`, `${it.label} — ${it.statement}`));
  if (read.score) add("score_value", "score", String(read.score.value));
  return out;
}
