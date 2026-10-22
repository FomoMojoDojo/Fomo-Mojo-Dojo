// ── THE LEVEL RULE (operator ruling 14, 2026-10-22) — positioning, promise and strategy speak above the offering ─────
//
// WHY. Spectrum's current reads restate its offering: the value line is a product line (WiFi 7 extenders), the
// differentiators are programs (Anytime Upgrade, the repair plan, U.S. phone support), the promise's subject is a
// product, and best fit names only a geography and the services sold. Every line was sourced and cited, so no gate
// refused it — sourcing asks whether the record says it, never whether it belongs in THIS read.
//
// THE TERM SOURCE is the company's CURRENT OFFERING READ — its items' labels, statements and cited rows. Never a fixed
// technology list: "AI", "S3", "MRI" are legitimate value terms for other companies. A company with no offering read has
// no terms, and every check passes (fail open: the level rule cannot refuse a line against a catalogue that is not there).
//
//   L1 offering echo       a value / differentiator / promise / aspiration / how-to-win / capability line whose every cited
//                          row is an offering item's row AND ≥ 75% of whose content words (stopwords and the company's name
//                          removed) occur in those items' label or statement. LOG ONLY (ruling 14: until the fleet false
//                          positives — Gotham ×3, causeway, Mithun — are read).
//   L2 strategy names an   a strategy rung naming a multi-word offering label name (namesIn, company-name words removed —
//      offering           "Anytime Upgrade", not "TV service"). REFUSES on aspiration / where-to-play / how-to-win; LOGS on a
//                          capability (a capability may name the program it runs).
//   L3 promise product     the promise's subject (the text before its first main verb) contains an offering item's label.
//      subject            REFUSES.
//   L4 best fit, no need   best fit minus customer heads, geography and size words, place names, digits, seeking-words and
//                          the offering's label and kind words is EMPTY — it names who and where, never what for. REFUSES.
//
// Pure: no I/O, no model. The generator runs it after S1 and before the judge, and again at promote.
import { namesIn } from "./classFactCheck.ts";

export type LevelKind = "positioning" | "promise" | "strategy";
export type LevelCheck = "L1" | "L2" | "L3" | "L4";
/** A line as the checks read it: its field path, its text, and its cited rows as UUIDs. */
export type LevelLine = { field?: string; text: string; refs: readonly string[] };
/** An offering item as the checks read it (the current offering read's payload.items[]; refs are UUIDs). */
export type LevelItem = { label: string; statement?: string | null; kind_hint?: string | null; refs?: readonly string[] | null };
export type LevelHit = {
  check: LevelCheck; field: string; text: string;
  /** the offering items the line echoes (labels) — what the re-ask names */
  items: string[];
  /** true ⇒ the line is refused at level; false ⇒ logged only */
  refuses: boolean;
  detail: string;
};

export const L1_COVERAGE = 0.75;
/** Ruling 14: which checks refuse. L1 logs only. */
export const LEVEL_REFUSING: ReadonlySet<LevelCheck> = new Set(["L2", "L3", "L4"]);

const STOP = new Set(("the a an of in to and or for with its it is are as at by on that this we our you your their from be been has have " +
  "not no than more most other others them they all any can will who what which into across over up via also such like including include " +
  "includes provide provides providing offer offers offering deliver delivers delivering ability maintain").split(" "));
/** Content words: lowercased, possessive 's dropped, split on non-word characters, length > 1, stopwords removed. */
export function contentWordsOf(t: string | null | undefined): string[] {
  return [...new Set(String(t ?? "").toLowerCase().replace(/[’']s\b/g, "").split(/[^a-z0-9%+/.\-]+/)
    .map((w) => w.replace(/^[.\-]+|[.\-]+$/g, "")).filter((w) => w && w.length > 1 && !STOP.has(w)))];
}
const nameWordsOf = (companyName: string) => new Set(contentWordsOf(companyName));

/** Which checks read a field, per kind. Field paths are the stamp's / the stored walker's (unique_attributes[2], …);
 *  a promise's root citation reads as "" (stored) or "(root)" (stamp). */
export function checksForField(kind: LevelKind, field: string): LevelCheck[] {
  const f = field.replace(/\[\d+\]$/, "[]");
  if (kind === "positioning") return f === "value" || f === "unique_attributes[]" ? ["L1"] : f === "best_fit" ? ["L4"] : [];
  if (kind === "promise") return f === "" || f === "(root)" || f === "promise" ? ["L1", "L3"] : [];
  if (f === "winning_aspiration" || f === "how_to_win") return ["L1", "L2"];
  if (f === "where_to_play") return ["L2"];
  if (f === "must_have_capabilities[]") return ["L1", "L2"];
  return [];
}

// ── L1 ──
export function l1OfferingEcho(line: LevelLine, items: readonly LevelItem[], companyName: string, threshold = L1_COVERAGE): { hit: boolean; coverage: number; items: string[] } {
  if (!line.refs.length || !items.length) return { hit: false, coverage: 0, items: [] };
  const name = nameWordsOf(companyName);
  const refsOf = (i: LevelItem) => new Set((i.refs ?? []).map(String));
  if (!line.refs.every((r) => items.some((i) => refsOf(i).has(r)))) return { hit: false, coverage: 0, items: [] };
  const echoed = items.filter((i) => line.refs.some((r) => refsOf(i).has(r)));
  const W = new Set(echoed.flatMap((i) => [...contentWordsOf(i.label), ...contentWordsOf(i.statement)]).filter((w) => !name.has(w)));
  const lw = contentWordsOf(line.text).filter((w) => !name.has(w));
  const coverage = lw.filter((w) => W.has(w)).length / Math.max(1, lw.length);
  return { hit: coverage >= threshold, coverage: +coverage.toFixed(2), items: echoed.map((i) => i.label) };
}

// ── L2 ──
/** The NAME an offering label is: a multi-word name (namesIn) that, once the company's own name words are removed, makes
 *  up at least two-thirds of the label's content words — "Anytime Upgrade", "CEO Index". A generic label ("TV service",
 *  "WiFi extenders") or one that merely mentions a place ("Live games from multiple New York teams") is not a name. */
export const L2_LABEL_NAME_SHARE = 2 / 3;
const stripName = (n: string, name: ReadonlySet<string>) => n.split(/\s+/).filter((w) => !name.has(w.toLowerCase())).join(" ").trim();
export function labelNamesOf(label: string, companyName: string): string[] {
  const name = nameWordsOf(companyName);
  const labelWords = contentWordsOf(label).filter((w) => !name.has(w));
  return namesIn(label).map((n) => stripName(n, name))
    .filter((n) => n.split(/\s+/).length >= 2 && contentWordsOf(n).length >= L2_LABEL_NAME_SHARE * Math.max(1, labelWords.length));
}
export function l2NamesOffering(line: LevelLine, items: readonly LevelItem[], companyName: string): { hit: boolean; names: string[]; items: string[] } {
  const name = nameWordsOf(companyName);
  const lineNames = new Set(namesIn(line.text).map((n) => stripName(n, name).toLowerCase()).filter(Boolean));
  const hits: Array<{ name: string; item: string }> = [];
  for (const i of items) for (const n of labelNamesOf(i.label, companyName)) {
    // a line name EQUALS the label name or CONTAINS it as whole words ("Offer Anytime Upgrade" — a sentence-initial verb
    // capitalized into the run — still names "Anytime Upgrade")
    const k = ` ${n.toLowerCase()} `;
    if ([...lineNames].some((x) => ` ${x} `.includes(k))) hits.push({ name: n, item: i.label });
  }
  return { hit: hits.length > 0, names: [...new Set(hits.map((h) => h.name))], items: [...new Set(hits.map((h) => h.item))] };
}

// ── L3 ──
const MAIN_VERB = /\b(promises?|provides?|delivers?|offers?|gives?|helps?|is|are|gain|makes?|lets?|ensures?|creates?|brings?)\b/i;
const norm = (s: string) => String(s ?? "").toLowerCase().replace(/[’']s\b/g, "").replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
/** The promise's grammatical subject: the text before its first main verb (the whole line when none is found). */
export function promiseSubjectOf(promise: string): string {
  const m = MAIN_VERB.exec(promise);
  return m ? promise.slice(0, m.index) : promise;
}
export function l3ProductSubject(line: LevelLine, items: readonly LevelItem[]): { hit: boolean; subject: string; items: string[] } {
  const subject = promiseSubjectOf(line.text);
  const s = ` ${norm(subject)} `;
  const hit = items.filter((i) => { const l = norm(i.label); return l.length > 3 && s.includes(` ${l} `); }).map((i) => i.label);
  return { hit: hit.length > 0, subject: subject.trim(), items: hit };
}

// ── L4 ──
const WHO = new Set("customers customer clients client people individuals users consumers businesses business companies organizations firms households homeowners members".split(" "));
const GEO = new Set("states state nationwide national us u.s. local locals regional global worldwide country city area market markets small medium-sized mid-market large enterprise enterprises sized".split(" "));
const SEEK = new Set("seeking looking want wanting need needing who interested".split(" "));
const singular = (w: string) => w.replace(/s$/, "");
/** What best fit says beyond who and where: the words left once customer heads, geography and size, place names,
 *  digits, seeking-words and the offering's own label and kind words are removed. Empty ⇒ it names no need. */
export function bestFitResidue(text: string, items: readonly LevelItem[]): string[] {
  const offW = new Set(items.flatMap((i) => [...contentWordsOf(i.label), ...contentWordsOf(i.kind_hint)]).map(singular));
  const caps = new Set((text.match(/\b[A-Z][a-zA-Z.]+/g) ?? []).map((x) => x.toLowerCase()));
  return contentWordsOf(text).filter((w) => !WHO.has(w) && !GEO.has(w) && !SEEK.has(w) && !/^\d/.test(w) && !offW.has(singular(w)) && !caps.has(w));
}
export function l4BestFitNoNeed(line: LevelLine, items: readonly LevelItem[]): { hit: boolean; residue: string[] } {
  if (!items.length || !line.text.trim()) return { hit: false, residue: [] };   // no catalogue ⇒ no terms ⇒ fail open
  const residue = bestFitResidue(line.text, items);
  return { hit: residue.length === 0, residue };
}

/** THE decision: every level hit on a read's lines. `refuses` per ruling 14 (L2 on a capability logs only). */
export function levelHits(kind: LevelKind, lines: readonly LevelLine[], items: readonly LevelItem[], companyName: string): LevelHit[] {
  const out: LevelHit[] = [];
  if (!items.length) return out;
  for (const raw of lines) {
    if (!raw.text?.trim()) continue;
    const line = { ...raw, field: raw.field ?? "" };
    for (const c of checksForField(kind, line.field)) {
      if (c === "L1") {
        const r = l1OfferingEcho(line, items, companyName);
        if (r.hit) out.push({ check: c, field: line.field, text: line.text, items: r.items, refuses: LEVEL_REFUSING.has(c), detail: `offering echo: coverage ${r.coverage} of its content words in ${r.items.join(" | ")}` });
      } else if (c === "L2") {
        const r = l2NamesOffering(line, items, companyName);
        const isCap = /^must_have_capabilities\[\d+\]$/.test(line.field ?? "");
        if (r.hit) out.push({ check: c, field: line.field, text: line.text, items: r.items, refuses: LEVEL_REFUSING.has(c) && !isCap, detail: `names the offering item${r.names.length > 1 ? "s" : ""} ${r.names.join(", ")}${isCap ? " (a capability — logged)" : ""}` });
      } else if (c === "L3") {
        const r = l3ProductSubject(line, items);
        if (r.hit) out.push({ check: c, field: line.field, text: line.text, items: r.items, refuses: LEVEL_REFUSING.has(c), detail: `the promise's subject "${r.subject}" is the offering item ${r.items.join(", ")}` });
      } else {
        const r = l4BestFitNoNeed(line, items);
        if (r.hit) out.push({ check: c, field: line.field, text: line.text, items: [], refuses: LEVEL_REFUSING.has(c), detail: "best fit names who and where, and no need — every remaining word is a customer, geography, size or offering word" });
      }
    }
  }
  return out;
}

/** The refusal detail a stage records (and the re-ask reads), or null when nothing refuses. */
export function levelRefusalDetail(hits: readonly LevelHit[]): string | null {
  const r = hits.filter((h) => h.refuses);
  if (!r.length) return null;
  return r.map((h) => `${h.field} [${h.check}]: ${h.detail}`).join("; ");
}

/** The offering items of a stored offering read (payload.items[]; refs or citations as UUIDs). */
export function levelItemsOfOfferingPayload(payload: Record<string, unknown> | null | undefined): LevelItem[] {
  const items = Array.isArray(payload?.items) ? payload!.items as Array<Record<string, unknown>> : [];
  return items.filter((i) => typeof i?.label === "string" && String(i.label).trim()).map((i) => ({
    label: String(i.label), statement: typeof i.statement === "string" ? i.statement : null,
    kind_hint: typeof i.kind_hint === "string" ? i.kind_hint : null,
    refs: (Array.isArray(i.refs) ? i.refs : Array.isArray(i.citations) ? i.citations : []).map(String),
  }));
}

// ── COUPLING (ruling 14): a predecessor line flagged at level is WITHHELD — never demanded, never carried, never fed ──
/** Which checks put a CURRENT-read line into the withheld set. All four: a predecessor line that echoes the offering is
 *  not demanded back (L1 logs on the NEW attempt, but continuity must not require the model to restate it). */
export const WITHHELD_LEVEL_CHECKS: ReadonlySet<LevelCheck> = new Set(["L1", "L2", "L3", "L4"]);
/** The predecessor-line keys (predecessorLineKey: field NUL text) of the current read's lines flagged at level. */
export function levelWithheldKeys(hits: readonly LevelHit[]): Set<string> {
  return new Set(hits.filter((h) => WITHHELD_LEVEL_CHECKS.has(h.check)).map((h) => `${h.field}\u0000${h.text}`));
}
/** The withheld set continuity, the prompt and the carries read: R5-P's, unioned with the level keys. */
export function unionWithheld(r5: ReadonlySet<string>, level: ReadonlySet<string>): Set<string> {
  return new Set([...r5, ...level]);
}
