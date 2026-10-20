// ── R3 OUTSIDE-EVIDENCE BIRTH GUARD (2026-08-26) ──────────────────────────────
// The generative regenerator (extract-outside-evidence) lifts candidate statements
// from a stored outside_page_snapshots.clean_text. Before ANY new signal is minted,
// each candidate passes the SAME two gate-2 disciplines the reconcile enforces —
// applied HERE at birth so a candidate that would be dropped downstream is never
// minted, and so both guards are unit-testable in isolation (default-deny):
//
//   E4 (evidenceExcerptGuard.excerptTracesToSource): the excerpt MUST be a
//       normalizeForHash-substring of the page text the model saw. A fabricated
//       append — an analyst conclusion the page never stated (the 13 e4 rows this
//       gate must NEVER rebirth) — is not a substring, so it is refused. Default-deny.
//   E2 (evidenceMappers.retainConcreteEvidence + the canonicalizeClaimStatement
//       cap/specificity discipline): thin to the concrete lead, refuse over-broad
//       (> cap) and over-thinned (dropping concrete tokens the source carried).
//
// Deterministic — ZERO model calls. Mirrors canonicalizeClaimStatement's outside/
// customer-band ceiling (160 single-clause / 480 multi-sentence-and-concrete) so an
// admitted excerpt survives rebuild-claims rather than being minted then dropped.
import { excerptTracesToSource } from "../../../src/lib/evidenceExcerptGuard.ts";
import { retainConcreteEvidence, extractConcreteTokens, splitSentences } from "../../../src/lib/evidenceMappers.ts";
import { E2_SINGLE_SENTENCE_MAX, E2_MULTI_SENTENCE_MAX } from "../../../src/lib/evidenceCaps.ts";
import { exactSpan } from "./nearestSpan.ts";

export type AdmitReason =
  | "empty"
  | "e4_not_verbatim"
  | "e2_bare_attribution"
  | "e2_overbroad"
  | "e2_too_short"
  | "e2_overthinned"
  | "e2_thin_broke_verbatim"
  | "slice_unresolved";

/** R31: an admitted excerpt is the RAW PAGE SLICE at the e4 match (offset, length in the page text); the model's
 *  shaped copy rides beside it as model_text and is never the stored text. */
export type AdmitResult =
  | { admit: true; excerpt: string; offset: number; length: number; model_text: string }
  | { admit: false; reason: AdmitReason };

const MIN_WORDS = 4;

// ── R31 (c): a BARE ATTRIBUTION CLAUSE is refused deterministically, before the judge ──────────────────────
// "Geniant Chairman and Co-CEO David Lancashire said." names a speaker and nothing said. Bare = the text ends on an
// attribution verb (an optional period after it), carries no quotation mark, and no comma / colon / semicolon that
// would separate reported content from the attribution ("…, Alexander said." is reported speech, not bare).
const ATTRIBUTION_VERBS = "said|says|say|told|tells|wrote|writes|added|adds|noted|notes|stated|states|explained|explains|commented|comments|recalled|recalls|announced|announces|confirmed|confirms";
const BARE_ATTRIBUTION = new RegExp(`^[^,;:"\u201c\u201d\u2018\u2019']*\\b(${ATTRIBUTION_VERBS})\\b\\s*\\.?$`, "i");
// R32: attributed-speech detection lives in the leaf module ./attribution.ts (re-exported here for the admission rail's callers).
export { detectAttribution, type AttributionForm, type AttributionHit } from "./attribution.ts";

export function isBareAttribution(text: string | null | undefined): boolean {
  const t = String(text ?? "").replace(/\s+/g, " ").trim();
  if (!t) return false;
  return BARE_ATTRIBUTION.test(t);
}

/** Admit a single candidate outside excerpt against the page text the model saw.
 *  Returns the excerpt to store (post-E2 shaping) or the refusal reason. */
export function admitOutsideEvidence(rawExcerpt: string, sourceText: string): AdmitResult {
  const raw = String(rawExcerpt ?? "").replace(/\s+/g, " ").trim();
  if (!raw) return { admit: false, reason: "empty" };

  // E4 — verbatim substring of the page (default-deny). Blocks fabricated appends.
  if (!excerptTracesToSource(raw, sourceText)) return { admit: false, reason: "e4_not_verbatim" };

  // R31 (c) — a bare attribution clause names a speaker and nothing said: refused before any judge.
  if (isBareAttribution(raw)) return { admit: false, reason: "e2_bare_attribution" };

  // E2 — concrete-retaining thinning + the outside/customer-band cap. R31 (b): the sentence test is the shared
  // splitter, which does not end a sentence after Dr. / Mr. / Inc. / … (NON_TERMINAL_ABBREVIATIONS).
  const shaped = retainConcreteEvidence(raw);
  const multiSentence = splitSentences(shaped).length > 1;
  const carriesConcrete = extractConcreteTokens(shaped).size > 0;
  const maxLen = multiSentence && carriesConcrete ? E2_MULTI_SENTENCE_MAX : E2_SINGLE_SENTENCE_MAX; // single home: evidenceCaps.ts
  if (shaped.length > maxLen) return { admit: false, reason: "e2_overbroad" };
  if (shaped.split(" ").filter(Boolean).length < MIN_WORDS) return { admit: false, reason: "e2_too_short" };

  // E2 specificity assertion — the shaped statement must not drop concrete tokens the raw carried.
  const sourceConcrete = extractConcreteTokens(raw);
  const stmtConcrete = extractConcreteTokens(shaped);
  for (const tok of sourceConcrete) if (!stmtConcrete.has(tok)) return { admit: false, reason: "e2_overthinned" };

  // Thinning must not have broken the verbatim trace (a prefix of a substring is still a
  // substring, but re-check so a future retain change can never silently smuggle non-source text).
  if (shaped !== raw && !excerptTracesToSource(shaped, sourceText)) {
    return { admit: false, reason: "e2_thin_broke_verbatim" };
  }

  // R31 (a) — the stored text is the PAGE's bytes at the e4 match, never the model's copy. The shaped text is a
  // normalized substring of the page (checked above), so the slice resolves; if it ever does not, the row is refused.
  const slice = exactSpan(shaped, sourceText);
  if (!slice) return { admit: false, reason: "slice_unresolved" };
  return { admit: true, excerpt: slice.text, offset: slice.offset, length: slice.length, model_text: shaped };
}

// READ-DATE derivation (task_13983caf, 2026-08-27): the true read date of an outside signal is the
// day its basis page was crawled (outside_page_snapshots.crawled_at). Return the YYYY-MM-DD date part,
// or null when the basis carries no timestamp — dates are REAL or HIDDEN, never a convenience value.
// deriveSourceTag renders "· read <date>" from event_date; a null here keeps the honest date-less tag.
export function snapshotReadDate(crawledAt: string | null | undefined): string | null {
  if (!crawledAt) return null;
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(String(crawledAt));
  return m ? m[1] : null;
}
