// SELF-CONSISTENCY — the curated single-instance exhibit's copy + render shape.
//
// A CURATED operator record: the flagship declared promise beside the public record's own
// admitted difficulty. NOT a machine finding — no judge, no criterion, no verdict. The
// strings below are OPERATOR-SIGNED (2026-08-07), byte-exact; screen and export both read
// them here so they can never fork. The framing NEVER says "the site contradicts itself" —
// it says the record admits a difficulty beneath the flagship promise.

export const CURATED_TENSION_HEADING = "A promise, and a difficulty beneath it";

export const CURATED_TENSION_FRAMING =
  "You lead with a seamless, continuous pathway of care. Elsewhere in your own public record there's a candid admission of how hard part of that is to deliver. Both can be true — we're setting them side by side because it's worth a conversation, not because either is wrong.";

// Register labels — declared vs public, labeled and NEVER blended.
export const CURATED_TENSION_PROMISE_LABEL = "What you lead with"; // declared register
export const CURATED_TENSION_DIFFICULTY_LABEL = "The record shows"; // public register

// The honest "this is a curation, not an automated finding" provenance line.
export const CURATED_TENSION_CURATION_LINE =
  "We noticed this pairing and chose to put it in front of you since it's a judgment call.";

// The render payload for ONE curated pair. `difficulty*` fields feed the single-home
// source-host formatter (formatSourceAttribution) exactly as the 25dce78 pattern: host+date
// from the SAME backing signal, quote-less (no byte-exact quote exists on this pair).
export interface CuratedTensionRender {
  promiseText: string; // declared side — the flagship promise (verbatim claim statement)
  difficultyText: string; // public side — the record's admitted difficulty (verbatim)
  difficultySourceUrl: string | null; // backing signal's source_url (host attribution)
  difficultyEventDate: string | null; // backing signal's event_date (null → host-only line)
  difficultyCapturedAt: string | null; // backing signal's created_at ("read by us")
}
