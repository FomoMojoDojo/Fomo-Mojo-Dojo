// ── THE ALTERNATIVE STRINGS (operator ruling 20, signed; wired by ruling 49, 2026-10-22) ──────────────────────────────
// No imports: read by the generator (positioningAlternative.ts) AND the client render (beat 09), so the two can never say
// different words. The cited row's venue line renders beneath each alternative (CommitmentSource).
/** One alternative on the positioning beat. Ruling 54 (2026-10-22): the record's clause sits in curly quotes — it is the
 *  record's own words (A4); a terminal stop A4 ignored stays outside them, so it is simply not rendered. */
export const ALTERNATIVE_RENDER = "Your customers could choose {name} instead — \u201c{text}\u201d";
/** The open question an empty alternatives field renders as. */
export const ALTERNATIVE_GAP_QUESTION = "When customers choose you, what are they choosing you over?";
export function renderAlternative(a: { name: string; text: string }): string {
  return ALTERNATIVE_RENDER.replace("{name}", a.name).replace("{text}", a.text.replace(/[.!?]$/, ""));
}
