// ── "ONLY THE OUTSIDE SHOWS IT" (SP-433 / SP-404, 2026-11-19) ────────────────────────────────────
//
// A need read out of customers' own public words carries source_path 'outside_voice_read'. The mark
// is RENDERED from that value — there is no new column and no stored label, so the mark can never
// disagree with what the row actually rests on (the proposal's rule).
//
// Before accept the same fact lives on the pending card as proposed_state.origin, which is the value
// accept_candidate_proposal() writes into source_path. One predicate for each, one string for both.
//
// THE VALUE IS PRIVATE. 'outside_voice_read' is absent from PUBLIC_NEED_SOURCE_PATHS, so
// needRestsOnPrivateSource is true for such a need; the row also carries source_proposal_id, which
// makes it private a second, independent way. The mark says where the need came FROM, never that it
// may be sent anywhere.

export const OUTSIDE_VOICE_SOURCE_PATH = "outside_voice_read";
/** Operator-facing, admin surfaces only (SP-424). */
export const OUTSIDE_VOICE_MARK = "Only the outside shows it";

/** An accepted need whose source is the outside-voice read. */
export function isOutsideVoiceSourced(sourcePath?: string | null): boolean {
  return String(sourcePath ?? "").trim() === OUTSIDE_VOICE_SOURCE_PATH;
}

/** A PENDING card that will become one on accept. */
export function isOutsideVoiceCard(proposedState?: { origin?: unknown } | null): boolean {
  const origin = proposedState?.origin;
  return typeof origin === "string" && origin.trim() === OUTSIDE_VOICE_SOURCE_PATH;
}
