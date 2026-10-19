// ── The regen path's two prompts, built from the client's anchor set (R22, 2026-10-18) ─────────────────
//
// Both builders take the anchor list clientAnchorsFor produced (name, host, entity anchors). Neither carries
// a fallback name: an empty list is a programming error upstream (the handler refuses before any prompt is
// built), so it throws here rather than naming nobody. The guard asserts no builder carries a literal
// placeholder for the business.
export const QUOTE_MAX_WORDS = 60;

function named(anchors: readonly string[]): string {
  const list = anchors.map((a) => String(a ?? "").trim()).filter(Boolean);
  if (list.length === 0) throw new Error("outsideRegenPrompts: an empty anchor list — the handler must refuse (client_unnamed) before a prompt is built");
  return list.join(", ");
}

/** The generator: lift exact substrings the third-party page says ABOUT the named business. */
export function genSystem(anchors: readonly string[]): string {
  const names = named(anchors);
  return (
    `You are reading a THIRD-PARTY web page (a review site, directory, marketplace, or partner). ` +
    `Extract ONLY statements this outside source makes ABOUT the business known as: ${names}. ` +
    `Return each as an EXACT substring of the supplied page text (copy-paste, invent nothing), at most ${QUOTE_MAX_WORDS} words. ` +
    `KEEP: what the source says about that business's products, service, quality, reputation, ratings phrased in prose, ` +
    `what it sells or offers, partner/wholesale relationships the source states. ` +
    `EXCLUDE: navigation, menus with prices, hours, cookie/consent, ads, other businesses, and anything not about ${names}. ` +
    `Respond with ONLY JSON: {"statements":["...","..."]}. No other text.`
  );
}

/** The judge: keep a candidate only when the outside source is speaking ABOUT the named business. */
export function judgeSystem(anchors: readonly string[]): string {
  const names = named(anchors);
  return (
    `You judge candidate quotes lifted from a THIRD-PARTY page about a business known as: ${names}. For each candidate decide keep=true ONLY if ` +
    `it is the outside source speaking ABOUT that business (its quality, offering, reputation, or a stated relationship) — NOT navigation, ` +
    `a menu/price line, hours, boilerplate, or a statement about a different business. ` +
    `Respond with ONLY JSON: {"verdicts":[{"quote":"...","keep":true,"reason":"..."}]}. No other text.`
  );
}
