// Signed empty-state notes shared across surfaces. Byte-identical to the First Read's own
// (acts.tsx imports from here); no surface may render a nothing-to-report line that is not signed.
/** The ONE line a no-evidence company shows where a score / projection / progress narrative would sit. */
export const NOT_ENOUGH_SIGNAL_NOTE = "Not enough public signal to score yet."; // signed (outside-v1.0.0 ruling)
/** The line shown where a score would sit when none has been written and the scorer did NOT find the
 *  company ineligible. Moved here from acts.tsx, byte-identical (SP-686 ruling 4, 2026-11-25), so the
 *  client story's score card and the First Read export can show the First Read's own note. */
export const NO_SCORE_NOTE = "No score snapshot yet."; // signed (Phase A ruling)

/** Which of the two signed notes stands in for a missing score. The scorer's own record decides:
 *  scored and found not eligible → NOT_ENOUGH_SIGNAL_NOTE; every other case → NO_SCORE_NOTE. The same
 *  choice the First Read's score beat makes. */
export function outsideScoreEmptyNote(state: "scored" | "ineligible" | null | undefined): string {
  return state === "ineligible" ? NOT_ENOUGH_SIGNAL_NOTE : NO_SCORE_NOTE;
}
