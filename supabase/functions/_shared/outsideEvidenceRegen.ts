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
import { retainConcreteEvidence, extractConcreteTokens } from "../../../src/lib/evidenceMappers.ts";

export type AdmitReason =
  | "empty"
  | "e4_not_verbatim"
  | "e2_overbroad"
  | "e2_too_short"
  | "e2_overthinned"
  | "e2_thin_broke_verbatim";

export type AdmitResult =
  | { admit: true; excerpt: string }
  | { admit: false; reason: AdmitReason };

const MIN_WORDS = 4;

/** Admit a single candidate outside excerpt against the page text the model saw.
 *  Returns the excerpt to store (post-E2 shaping) or the refusal reason. */
export function admitOutsideEvidence(rawExcerpt: string, sourceText: string): AdmitResult {
  const raw = String(rawExcerpt ?? "").replace(/\s+/g, " ").trim();
  if (!raw) return { admit: false, reason: "empty" };

  // E4 — verbatim substring of the page (default-deny). Blocks fabricated appends.
  if (!excerptTracesToSource(raw, sourceText)) return { admit: false, reason: "e4_not_verbatim" };

  // E2 — concrete-retaining thinning + the outside/customer-band cap.
  const shaped = retainConcreteEvidence(raw);
  const multiSentence = /[.!?]\s+\S/.test(shaped);
  const carriesConcrete = extractConcreteTokens(shaped).size > 0;
  const maxLen = multiSentence && carriesConcrete ? 480 : 160;
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

  return { admit: true, excerpt: shaped };
}
