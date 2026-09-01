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
  "definitive", "definitively", "certainly", "echoed", "unspoken", "disputed",
] as const;
const FRAMING_RE = new RegExp(`\\b(${FORBIDDEN_FRAMING_WORDS.join("|")})\\b`, "i");
// A payload key holds citation TOKENS (ids, not prose) when it names citations/cites/ids — OR, for the
// offering kind, `refs`/`ref` (items and open_questions cite via a `refs` token array). These arrays are
// skipped by the prose scan and translated token→uuid by translateCitations. Existing kinds carry no
// `refs`/`ref` key, so widening this is additive.
const CITATION_KEY_RE = /citation|cite|refs?$|ids$/i;

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

/** Provenance values that mean "from the public record" — the only ones an "Our read" may rest on.
 *  HARDENED (2026-09-01): 'market_read' is DELIBERATELY EXCLUDED. That string is what refresh-cascade
 *  stamps on an uploaded-augmented cascade (the filed provenance-lie); treating it as public would let
 *  uploaded-augmented content pass this gate's ledger/citation invariants and route to the external
 *  model. This is an explicit allowlist (fail-closed): any value not listed — market_read, unknown
 *  strings, casing variants, null — is non-public. See publicProvenanceHardening.test.ts. */
export const PUBLIC_PROVENANCES = new Set(["public_observed", "public_inferred", "public_research", "publicly_declared"]);
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

// ── Gate 6a — OFFERING kind (2026-09-01): deterministic structural guards + judge-accept logic ──────
//
// The `offering` public read enumerates what the public record shows the company puts in front of the
// people it serves (products / services / programs / formats / channels). These pure guards enforce
// the invariants a model cannot be trusted to self-enforce; the LLM judge (its criteria live in the
// generator's judge prompt) is the semantic layer ABOVE this deterministic floor.

/** The five allowed offering item kinds. Anything else is a structural violation. */
export const OFFERING_KIND_HINTS = new Set(["product", "service", "program", "format", "channel"]);
/** The three allowed open-question reasons (currency / entity doubts + a catch-all). */
export const OFFERING_OQ_REASONS = new Set(["currency", "entity", "other"]);
/** Currency / verdict / status vocabulary forbidden INSIDE an item statement — a doubt of this shape
 *  belongs in open_questions (reason: currency|entity), never asserted as a verdict in an item. This
 *  is BROADER than the shared framing list (it adds status words like stale/closed/retired). */
export const OFFERING_BANNED_STATEMENT_WORDS = [
  "stale", "closed", "retired", "discontinued", "defunct", "shuttered",
  "confirmed", "contradicted", "disputed", "underserved", "verdict", "proven", "definitive",
] as const;
const OFFERING_BANNED_RE = new RegExp(`\\b(${OFFERING_BANNED_STATEMENT_WORDS.join("|")})\\b`, "i");

export type OfferingViolation = { code: string; detail: string };

/** OFFERING STRUCTURE GATE (deterministic, pre-judge). Enforces, per item: a label, a statement, a
 *  NON-EMPTY refs array whose every token is a valid ledger ref, and a valid kind_hint; and forbids
 *  currency/verdict vocab in the statement. Per open_question: text, non-empty valid refs, valid
 *  reason. An EMPTY items array is allowed (earned-empty renders from the run ledger, not from here).
 *  Empty result ⇒ clean; any violation ⇒ reject the read, write nothing. `validRefs` is the ledger's
 *  ref-token set (the catalogue keys). */
export function offeringStructureViolations(payload: unknown, validRefs: Set<string>): OfferingViolation[] {
  const out: OfferingViolation[] = [];
  const p = (payload ?? {}) as Record<string, unknown>;
  const cleanRefs = (v: unknown): string[] =>
    (Array.isArray(v) ? v : []).filter((r): r is string => typeof r === "string" && r.trim() !== "").map((r) => r.trim());

  const items = Array.isArray(p.items) ? p.items : [];
  items.forEach((raw, i) => {
    const it = (raw ?? {}) as Record<string, unknown>;
    const label = typeof it.label === "string" ? it.label.trim() : "";
    const statement = typeof it.statement === "string" ? it.statement.trim() : "";
    const refs = cleanRefs(it.refs);
    const hint = typeof it.kind_hint === "string" ? it.kind_hint.trim() : "";
    if (!label) out.push({ code: "item_no_label", detail: `item[${i}]` });
    if (!statement) out.push({ code: "item_no_statement", detail: `item[${i}]` });
    if (refs.length === 0) out.push({ code: "item_uncited", detail: `item[${i}] "${(label || statement).slice(0, 60)}"` });
    for (const r of refs) if (!validRefs.has(r)) out.push({ code: "item_ref_outside_ledger", detail: `item[${i}] ${r}` });
    if (!OFFERING_KIND_HINTS.has(hint)) out.push({ code: "item_bad_kind_hint", detail: `item[${i}] kind_hint=${hint || "(none)"}` });
    const m = OFFERING_BANNED_RE.exec(statement);
    if (m) out.push({ code: "item_statement_banned_vocab", detail: `item[${i}] "${m[1].toLowerCase()}"` });
  });

  const oqs = Array.isArray(p.open_questions) ? p.open_questions : [];
  oqs.forEach((raw, i) => {
    const oq = (raw ?? {}) as Record<string, unknown>;
    const text = typeof oq.text === "string" ? oq.text.trim() : "";
    const refs = cleanRefs(oq.refs);
    const reason = typeof oq.reason === "string" ? oq.reason.trim() : "";
    if (!text) out.push({ code: "oq_no_text", detail: `open_questions[${i}]` });
    if (refs.length === 0) out.push({ code: "oq_uncited", detail: `open_questions[${i}]` });
    for (const r of refs) if (!validRefs.has(r)) out.push({ code: "oq_ref_outside_ledger", detail: `open_questions[${i}] ${r}` });
    if (!OFFERING_OQ_REASONS.has(reason)) out.push({ code: "oq_bad_reason", detail: `open_questions[${i}] reason=${reason || "(none)"}` });
  });
  return out;
}

/** OFFERING JUDGE-ACCEPT (pure). The offering kind is accepted only if the judge affirmed ALL FOUR of
 *  its semantic criteria: enumerable (each item is an offering, not a strategy/positioning statement),
 *  entity-attribution (no item describes a co-located / partner / third-party entity's offering),
 *  doubts-placed (currency/entity doubts appear in open_questions, never as a verdict in an item), and
 *  banned-vocab-absent. A missing/false flag on ANY of the four → reject (fail-closed). This is the
 *  criterion the entity falsification probe exercises: strip the entity clause and an entity-bad
 *  verdict wrongly accepts. */
export function offeringAcceptFromVerdict(verdict: Record<string, unknown> | null | undefined): boolean {
  if (!verdict) return false;
  const o = (verdict.offering ?? {}) as Record<string, unknown>;
  return o.enumerable_ok === true
    && o.entity_attribution_ok === true
    && o.doubts_placed_ok === true
    && o.banned_vocab_ok === true;
}
