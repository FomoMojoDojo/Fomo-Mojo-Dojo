// ── R3b CLIENT-VOICE BIRTH GUARD (2026-08-27) ─────────────────────────────────
// The client_voice regenerator (extract-client-voice) lifts self-descriptive channel statements
// from a stored own_words_page_snapshots.clean_text (the client's OWN site). Before ANY new
// client_voice signal is minted, each candidate passes TWO guards, default-deny:
//
//   1. CLASSIFICATION (item-31 test — "would an org say this about ITSELF on its own channels?"):
//      reject analysis-flavored / non-self-descriptive content. The generator's judge is the primary
//      gate; THIS is the deterministic BACKSTOP that catches the unmistakable artifacts the item-31
//      leak was made of — numbered-list fragments ("6. The 2019-2020 crisis…") and analysis phrasing
//      ("growth constraint", "brand invisibility", "near-monopoly", "reputational damage", a
//      review/market read). No company promotes itself with those; they are OUR reading, not its voice.
//
//   2. FAITHFULNESS (gate-2): the excerpt must be a verbatim substring of the page (E4) within the
//      specificity cap (E2). Reuses the SAME admitOutsideEvidence rail as R3 — one faithfulness law.
//
// Deterministic — ZERO model calls. The classification backstop runs FIRST so an analysis-flavored
// lift is refused even if it happens to be verbatim on the page.
import { admitOutsideEvidence } from "./outsideEvidenceRegen.ts";

// Unmistakable analysis / non-self-descriptive markers. Kept NARROW so legitimate self-description
// ("we partner with…", "our coffees are available for wholesale") passes; the model judge handles
// the nuanced cases. Every marker here is something an org does not say to promote itself.
const ANALYSIS_MARKERS: RegExp[] = [
  /\bnear-monopoly\b/i,
  /\bgrowth constraint\b/i,
  /\bbrand (in)?visibility\b/i,
  /\breputational (damage|risk)\b/i,
  /\bmisconduct\b/i,
  /\bhypothesis\b/i,
  /\bmarket position\b/i,
  /\bcompetitive (advantage|threat|landscape)\b/i,
  /\baccording to (reviews|the record|sources|multiple)\b/i,
  /\breviews? (suggest|indicate|show|reveal)\b/i,
  /\b(strengths?|weakness(es)?|threats?)\b.*\b(and|,)\b.*\b(strengths?|weakness(es)?|threats?|opportunit)/i,
];
const NUMBERED_ARTIFACT = /^\s*\d+\s*[.)]\s/; // "6. The 2019-2020…" list artifact

export type ClientVoiceAdmit =
  | { admit: true; excerpt: string }
  | { admit: false; reason: string };

/** Admit a candidate self-descriptive channel excerpt against the page text the model saw. */
export function admitClientVoice(rawExcerpt: string, sourceText: string): ClientVoiceAdmit {
  const raw = String(rawExcerpt ?? "").replace(/\s+/g, " ").trim();
  if (!raw) return { admit: false, reason: "empty" };

  // 1. CLASSIFICATION BACKSTOP (default-deny for the clear item-31 shapes).
  if (NUMBERED_ARTIFACT.test(raw)) return { admit: false, reason: "class_numbered_artifact" };
  for (const m of ANALYSIS_MARKERS) if (m.test(raw)) return { admit: false, reason: "class_analysis_marker" };

  // 2. FAITHFULNESS (verbatim substring + specificity) — the shared R3 rail.
  const f = admitOutsideEvidence(raw, sourceText);
  if (f.admit) return { admit: true, excerpt: f.excerpt };
  return { admit: false, reason: (f as { admit: false; reason: string }).reason };
}
