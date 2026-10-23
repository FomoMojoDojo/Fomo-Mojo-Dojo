// ── THE POSITIONING ALTERNATIVE (operator ruling 15, 2026-10-22) ───────────────────────────────────────────────────────
//
// A positioning names who the company is for AND what that customer would otherwise choose. The read had no field for
// the second half, so "names an alternative" could not be asked. The field:
//
//   positioning.alternatives: [{ "name": "<the alternative, as a cited row names it>",
//                               "text": "<how the company stands against it, as the cited rows state it>",
//                               "citations": ["<id>"] }]
//
// SOURCED ONLY FROM ROWS THAT NAME THE ALTERNATIVE. The stage gate refuses an alternative that
//   A1  cites nothing;
//   A2  whose name is not in the verified page words of any row it cites;
//   A3  whose only naming rows are OUR read (a finding, an analysis row, class our_read) — our analysis naming a
//       competitor is not the record naming the alternative.
// EMPTY is correct when no row names one: the field stays [] and the stored read records an alternative GAP — an open
// question for the room, never a generated guess (payload.alternative_gap; source_kind 'alternative_gap', CHECK widened).
//
// THE ALTERNATIVES STEP (operator ruling 49, 2026-10-22). The positioning generator no longer writes this field. A
// dedicated call over the RECORD and REVIEW rows only (class record signals) names each alternative with the row's own
// clause; deterministic gates then decide what stays — A1–A3 above, and
//   A4  the text is a BYTE-EXACT clause of a cited row (carriedSpan.clausesOf) that contains the name;
//   A5  that clause names the company or a confirmed related entity — an alternative to someone else is not one to us.
// Entries whose text is identical MERGE into one, the names joined " and " in record order. No re-ask: a failing entry is
// dropped, and an empty result records the gap.
// Pure: no I/O, no model.
import { clausesOf } from "./carriedSpan.ts";

export const ALTERNATIVES_FIELD = "alternatives" as const;
export const ALTERNATIVE_GAP_KEY = "alternative_gap" as const;
// SIGNED (ruling 20): the render string and the open question live in alternativeStrings.ts (no imports), shared with the client.
export { ALTERNATIVE_GAP_QUESTION, ALTERNATIVE_RENDER, renderAlternative } from "./alternativeStrings.ts";
import { ALTERNATIVE_GAP_QUESTION } from "./alternativeStrings.ts";
/** first_read_open_questions.source_kind for the gap (CHECK widened by migration 20261022230000). */
export const ALTERNATIVE_GAP_SOURCE_KIND = "alternative_gap" as const;

export type Alternative = { name: string; text: string; citations: string[] };
export type AlternativeRefusal = { field: string; rule: "A1" | "A2" | "A3"; name: string; detail: string };
/** What the gate knows about one cited ref: its class, whether it is a finding, and its VERIFIED page words (R5 rowTextOf;
 *  "" when the row carries none). */
export type CitedRowView = { cls: string | null; finding: boolean; pageWords: string };

const norm = (s: string) => String(s ?? "").toLowerCase().replace(/[’']/g, "'").replace(/\s+/g, " ").trim();

/** The alternatives a payload carries (anything malformed is read as an entry with what it has, so the gate sees it). */
export function alternativesOf(payload: Record<string, unknown> | null | undefined): Alternative[] {
  const a = payload?.[ALTERNATIVES_FIELD];
  if (!Array.isArray(a)) return [];
  return a.map((x) => {
    const o = (x ?? {}) as Record<string, unknown>;
    return { name: String(o.name ?? ""), text: String(o.text ?? ""), citations: Array.isArray(o.citations) ? o.citations.map(String) : [] };
  });
}

/** THE gate (A1–A3). `view(ref)` resolves a cited ref (a ledger token at stage, a uuid at promote). */
export function alternativeRefusals(payload: Record<string, unknown> | null | undefined, view: (ref: string) => CitedRowView | null): AlternativeRefusal[] {
  const out: AlternativeRefusal[] = [];
  alternativesOf(payload).forEach((alt, i) => {
    const field = `${ALTERNATIVES_FIELD}[${i}]`;
    const name = alt.name.trim();
    if (!name && !alt.text.trim()) return;                      // an empty slot is not an alternative
    if (alt.citations.length === 0) { out.push({ field, rule: "A1", name, detail: `${field} "${name}" cites nothing — an alternative is sourced only from rows that name it` }); return; }
    const rows = alt.citations.map((r) => view(r)).filter((r): r is CitedRowView => !!r);
    const naming = rows.filter((r) => name && norm(r.pageWords).includes(norm(name)));
    if (naming.length === 0) { out.push({ field, rule: "A2", name, detail: `${field}: "${name}" is not in the verified page words of any row it cites` }); return; }
    if (!naming.some((r) => !r.finding && (r.cls === "record" || r.cls === "you"))) {
      out.push({ field, rule: "A3", name, detail: `${field}: "${name}" is named only by our own read — the record must name the alternative` });
    }
  });
  return out;
}
export function alternativeRefusalDetail(r: readonly AlternativeRefusal[]): string | null {
  return r.length ? r.map((x) => `${x.rule} ${x.detail}`).join("; ") : null;
}

/** The gap a positioning read records when it names no alternative (null when it names one). */
export function alternativeGapOf(payload: Record<string, unknown> | null | undefined): { question_identity: string; reason: string; question: string } | null {
  const alts = alternativesOf(payload).filter((a) => a.name.trim());
  if (alts.length > 0) return null;
  return { question_identity: "alternative_gap:positioning", reason: "no cited row names an alternative", question: ALTERNATIVE_GAP_QUESTION };
}

// ── THE STEP (ruling 49) ─────────────────────────────────────────────────────────────────────────────────────────────
export const ALTERNATIVES_STEP_VERSION = "2026-10-22.1" as const;
/** The step's instruction, as proposed (17:26) and signed with ruling 49. */
export const ALTERNATIVES_STEP_PROMPT = `You read rows of a company's PUBLIC record — what press, analysts and customers say. Name each alternative a customer could choose instead — a competitor, a substitute, or doing nothing — ONLY as a row below names it. For each, give the name as the row writes it and copy the row's own clause containing that name, word for word. Cite the row's token. If no row names an alternative, return {"alternatives":[]} — that is the correct answer.
Return ONLY JSON: {"alternatives":[{"name":"<exactly as the row writes it>","text":"<the row's own clause containing the name, copied exactly>","citations":["<token>"]}]}`;
/** The step's input: the RECORD and REVIEW rows only — class record signals (our read, own words, filings, pairs excluded). */
export function alternativesStepRows<T extends { kind: string; source_class: string }>(rows: readonly T[]): T[] {
  return rows.filter((r) => r.kind === "signal" && r.source_class === "record");
}
/** Words too common to identify an entity in a clause (A5). Generic corporate and function words only. */
const ENTITY_GENERIC = new Set(["the", "and", "of", "inc", "llc", "ltd", "corp", "corporation", "company", "companies", "co", "group", "holdings", "communications", "technologies", "services", "solutions", "systems", "international", "global"]);
/** The tokens that identify the company or a confirmed related entity in a clause (A5). */
export function entityTokensOf(names: readonly string[]): string[] {
  const out = new Set<string>();
  for (const n of names) for (const w of String(n ?? "").toLowerCase().split(/[^a-z0-9]+/)) if (w.length >= 3 && !ENTITY_GENERIC.has(w)) out.add(w);
  return [...out];
}
export type StepDrop = { entry: Alternative; rule: "A1" | "A2" | "A3" | "A4" | "A5"; detail: string };
/** The deterministic gates on the step's answer, then the merge. `textOf(ref)` is a cited row's verified page words;
 *  `isStepRow(ref)` true for the record/review rows the step was shown. */
export function gateAlternativesStep(
  raw: unknown, textOf: (ref: string) => string, isStepRow: (ref: string) => boolean, entityTokens: readonly string[],
): { kept: Alternative[]; dropped: StepDrop[] } {
  const entries = alternativesOf({ alternatives: raw } as Record<string, unknown>).filter((a) => a.name.trim() || a.text.trim());
  const kept: Alternative[] = [];
  const dropped: StepDrop[] = [];
  const names = (t: string) => new RegExp(`(^|[^a-z0-9])(${entityTokens.map((x) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})([^a-z0-9]|$)`, "i").test(t);
  for (const a of entries) {
    const name = a.name.trim(), text = a.text.trim();
    if (a.citations.length === 0) { dropped.push({ entry: a, rule: "A1", detail: "cites nothing" }); continue; }
    if (!a.citations.every((r) => isStepRow(r))) { dropped.push({ entry: a, rule: "A3", detail: "cites a row that is not a record or review row" }); continue; }
    if (!name || !a.citations.some((r) => norm(textOf(r)).includes(norm(name)))) { dropped.push({ entry: a, rule: "A2", detail: `"${name}" is not in the page words of a row it cites` }); continue; }
    // byte-exact but for ONE terminal stop: clausesOf keeps a row's final "." on its last clause, and the signed render puts
    // no stop after {text} — so "…wireless FWA" and "…wireless FWA." are the same clause; every other byte must match
    const stop = (t: string) => t.replace(/[.!?]$/, "");
    const clauseOk = a.citations.some((r) => clausesOf(textOf(r)).some((c) => stop(c.text) === stop(text)));
    if (!clauseOk || !norm(text).includes(norm(name))) { dropped.push({ entry: a, rule: "A4", detail: "the text is not a byte-exact clause of a cited row containing the name" }); continue; }
    if (entityTokens.length === 0 || !names(text)) { dropped.push({ entry: a, rule: "A5", detail: "the clause names neither the company nor a confirmed related entity" }); continue; }
    kept.push({ name, text, citations: a.citations });
  }
  // MERGE: identical text → one entry, names joined " and " in record order (the order they appear in the clause)
  const byText = new Map<string, Alternative>();
  for (const a of kept) {
    const prior = byText.get(a.text);
    if (!prior) { byText.set(a.text, { ...a, citations: [...a.citations] }); continue; }
    const ns = [...prior.name.split(" and "), a.name].filter((x, i, arr) => arr.indexOf(x) === i)
      .sort((x, y) => a.text.toLowerCase().indexOf(x.toLowerCase()) - a.text.toLowerCase().indexOf(y.toLowerCase()));
    prior.name = ns.join(" and ");
    for (const c of a.citations) if (!prior.citations.includes(c)) prior.citations.push(c);
  }
  return { kept: [...byText.values()], dropped };
}
