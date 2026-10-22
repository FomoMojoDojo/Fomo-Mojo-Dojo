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
// question for the room, never a generated guess. The gap is RECORDED on the read (payload.alternative_gap); routing it to
// the Questions beat (first_read_open_questions) needs a new source_kind (its CHECK admits finding / silent_delta /
// status_conflict / cascade_gap only) and the operator's signed string — both PROPOSED below, neither wired or rendered.
// Pure: no I/O, no model.

export const ALTERNATIVES_FIELD = "alternatives" as const;
export const ALTERNATIVE_GAP_KEY = "alternative_gap" as const;
/** PROPOSED (not signed, not rendered): the Questions-beat string an empty alternative would route as. */
export const ALTERNATIVE_GAP_QUESTION_PROPOSED = "When customers choose you, what are they choosing you over?";
/** PROPOSED (not signed, not rendered): how one alternative would render on the positioning beat. */
export const ALTERNATIVE_RENDER_PROPOSED = "Instead of you, they'd weigh {name} — {text}";
/** PROPOSED storage for the routed gap: first_read_open_questions source_kind 'alternative_gap' (needs the CHECK widened). */
export const ALTERNATIVE_GAP_SOURCE_KIND_PROPOSED = "alternative_gap" as const;

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
export function alternativeGapOf(payload: Record<string, unknown> | null | undefined): { question_identity: string; reason: string; question_proposed: string } | null {
  const alts = alternativesOf(payload).filter((a) => a.name.trim());
  if (alts.length > 0) return null;
  return { question_identity: "alternative_gap:positioning", reason: "no cited row names an alternative", question_proposed: ALTERNATIVE_GAP_QUESTION_PROPOSED };
}
