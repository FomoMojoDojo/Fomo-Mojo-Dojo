// ── The regen path's two prompts, built from the client's anchor set (R22, 2026-10-18) ─────────────────
//
// Both builders take the anchor list clientAnchorsFor produced (name, host, entity anchors). Neither carries
// a fallback name: an empty list is a programming error upstream (the handler refuses before any prompt is
// built), so it throws here rather than naming nobody. The guard asserts no builder carries a literal
// placeholder for the business.
//
// R27 (2026-10-18): THE COPYING RULE. Pilot 2 lost two true lifts to rewording ("This company" → "The company")
// and narrated two table cells into sentences; e4 (a normalized-substring check, unchanged) refused all four.
// The generator is now told, with one demonstration, that a statement is one contiguous span copied character
// for character, and it returns a reason beside each span. The judge's criteria are unchanged.
export const QUOTE_MAX_WORDS = 60;

/** The copying rule — the guard asserts this text is present in the built generator prompt (presence, not behaviour). */
export const COPYING_RULE =
  `COPYING RULE: each statement is ONE CONTIGUOUS SPAN copied character for character from PAGE TEXT. ` +
  `No rewording, no paraphrase, no joining of separate lines or cells, no added subject or verb, no fixing of grammar; ` +
  `trim only at the ends. If a true statement is spread across table cells (a label on one line, its value on the next), ` +
  `return the contiguous span that holds the specific — the cells as they stand — not a sentence you compose about them.`;

/** The demonstration — the pilot-2 sentence, and the one-word change that lost it. */
export const COPYING_DEMONSTRATION =
  `EXAMPLE. PAGE TEXT contains: "🟡 This company has maintained an active DOT status for 1 year but had no inspections ." ` +
  `CORRECT statement: "This company has maintained an active DOT status for 1 year but had no inspections" (the span, trimmed at the ends). ` +
  `WRONG: "The company has maintained an active DOT status for 1 year but had no inspections" — one word changed, so it is not on the page and is refused.`;

/** The JSON shape the generator returns: the span and why it is about the business. */
export const GENERATOR_JSON_SHAPE = `{"statements":[{"text":"<the copied span>","reason":"<why this is the source speaking about the business>"}]}`;

function named(anchors: readonly string[]): string {
  const list = anchors.map((a) => String(a ?? "").trim()).filter(Boolean);
  if (list.length === 0) throw new Error("outsideRegenPrompts: an empty anchor list — the handler must refuse (client_unnamed) before a prompt is built");
  return list.join(", ");
}

/** The generator: lift exact contiguous spans the third-party page says ABOUT the named business. */
export function genSystem(anchors: readonly string[]): string {
  const names = named(anchors);
  return (
    `You are reading a THIRD-PARTY web page (a review site, directory, marketplace, or partner). ` +
    `Extract ONLY statements this outside source makes ABOUT the business known as: ${names}. ` +
    `Each statement is at most ${QUOTE_MAX_WORDS} words. ` +
    `${COPYING_RULE} ` +
    `${COPYING_DEMONSTRATION} ` +
    `KEEP: what the source says about that business's products, service, quality, reputation, ratings phrased in prose, ` +
    `what it sells or offers, partner/wholesale relationships the source states. ` +
    `EXCLUDE: navigation, menus with prices, hours, cookie/consent, ads, other businesses, and anything not about ${names}. ` +
    `Respond with ONLY JSON: ${GENERATOR_JSON_SHAPE}. No other text.`
  );
}

/** The judge: keep a candidate only when the outside source is speaking ABOUT the named business. (Criteria unchanged.) */
export function judgeSystem(anchors: readonly string[]): string {
  const names = named(anchors);
  return (
    `You judge candidate quotes lifted from a THIRD-PARTY page about a business known as: ${names}. For each candidate decide keep=true ONLY if ` +
    `it is the outside source speaking ABOUT that business (its quality, offering, reputation, or a stated relationship) — NOT navigation, ` +
    `a menu/price line, hours, boilerplate, or a statement about a different business. ` +
    `Respond with ONLY JSON: {"verdicts":[{"quote":"...","keep":true,"reason":"..."}]}. No other text.`
  );
}
