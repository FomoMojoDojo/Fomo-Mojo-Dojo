// ── Gate 6a — public-read birth guards (deterministic, pre-write) ───────────────
//
// Two pure, deterministic guards for the "Our read" generator, extracted so the
// vacuous-proofs can exercise them directly:
//
//   FRAMING GATE — a posit is a HYPOTHESIS for the room to test, never a verdict.
//     Reject any posit prose carrying verdict-family / UNDERSERVED vocabulary
//     (whole-word, case-insensitive). The judge stays as the semantic layer above
//     this; this gate is the deterministic floor a model can't talk its way past.
//
//   CITATION GATE — every ref a posit cites must be a real ledger token; a ref
//     outside the ledger rejects the whole read (the anti-fabrication floor).
//
// Both walk the payloads structurally and IGNORE citation arrays (those hold ids,
// not prose) when scanning for framing vocabulary.

/** Verdict-family + UNDERSERVED vocabulary forbidden on a posit (Gate-6a signature). */
export const FORBIDDEN_FRAMING_WORDS = [
  "underserved", "verdict", "confirmed", "contradicted", "proven",
  "definitive", "definitively", "certainly", "echoed", "unspoken",
] as const;
const FRAMING_RE = new RegExp(`\\b(${FORBIDDEN_FRAMING_WORDS.join("|")})\\b`, "i");
const CITATION_KEY_RE = /citation|cite|ids$/i;

/** Every PROSE string in a payload — citation arrays (ids, not prose) are skipped. */
export function proseStrings(payload: unknown): string[] {
  const out: string[] = [];
  const walk = (v: unknown, key?: string) => {
    const isCiteKey = !!key && CITATION_KEY_RE.test(key);
    if (typeof v === "string") { if (!isCiteKey) out.push(v); }
    else if (Array.isArray(v)) { if (!isCiteKey) for (const x of v) walk(x); }
    else if (v && typeof v === "object") for (const [k, val] of Object.entries(v)) walk(val, k);
  };
  walk(payload);
  return out;
}

/** FRAMING GATE — the forbidden-vocabulary violations across the three posits.
 *  Empty ⇒ clean. Non-empty ⇒ reject the read, write nothing. */
export function framingViolations(payloadsByKind: Record<string, unknown>): Array<{ kind: string; word: string; text: string }> {
  const out: Array<{ kind: string; word: string; text: string }> = [];
  for (const [kind, payload] of Object.entries(payloadsByKind)) {
    for (const s of proseStrings(payload)) {
      const m = FRAMING_RE.exec(s);
      if (m) out.push({ kind, word: m[1].toLowerCase(), text: s.slice(0, 100) });
    }
  }
  return out;
}

/** Every citation ref token a payload cites (from any "citations"/"cite"/"…ids" array). */
export function collectCitationRefs(payload: unknown): string[] {
  const out: string[] = [];
  const walk = (v: unknown, key?: string) => {
    if (Array.isArray(v)) {
      if (key && CITATION_KEY_RE.test(key)) { for (const x of v) if (typeof x === "string") out.push(x.trim()); }
      else for (const x of v) walk(x);
    } else if (v && typeof v === "object") for (const [k, val] of Object.entries(v)) walk(val, k);
  };
  walk(payload);
  return [...new Set(out)];
}

/** CITATION GATE — refs cited by the payload that are NOT valid ledger tokens. */
export function unknownCitationRefs(payload: unknown, validRefs: Set<string>): string[] {
  return collectCitationRefs(payload).filter((ref) => !validRefs.has(ref));
}

/** Provenance values that mean "from the public record" — the only ones an "Our read" may rest on. */
export const PUBLIC_PROVENANCES = new Set(["public_observed", "public_inferred", "public_research", "market_read", "publicly_declared"]);
export function isPublicProvenance(p: string | null | undefined): boolean {
  return !!p && PUBLIC_PROVENANCES.has(p);
}

/** LIVE+PUBLIC-AT-MINT GATE — every cited id must be in the ledger with a public provenance and
 *  liveness 'live'. Returns the offending ids; empty ⇒ all citations are live public rows. */
export function citationsLivePublic(
  citedIds: string[],
  provenances: Record<string, string>,
  liveness: Record<string, string>,
): { ok: boolean; bad: string[] } {
  const bad = citedIds.filter((id) => !(isPublicProvenance(provenances[id]) && liveness[id] === "live"));
  return { ok: bad.length === 0, bad };
}
