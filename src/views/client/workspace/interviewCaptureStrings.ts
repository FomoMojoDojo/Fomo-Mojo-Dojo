// INTERVIEW CAPTURE — OPERATOR-FACING STRINGS (gate 4, 2026-09-16). PROPOSED — for the operator's look.
// One home, byte-exact, never inlined at a render site. The form renders ONLY behind the operator glyph
// (OperatorControlsContext) on the workspace Job Map; a client surface never sees these strings.
// The working state reuses WORKSPACE_STRINGS.working; the "Generate job map" link reuses
// WORKSPACE_STRINGS.generateJobMap; the two chip strings are the reader's (InterviewOrigin).
export const INTERVIEW_CAPTURE_STRINGS = {
  /** The control on the step panel (data-fr-operator="record-interview-finding"). */
  open: "Record interview finding",
  close: "Done",
  /** Record block. */
  reuse: "Reuse an interview",
  reuseNone: "New interview",
  speaker: "Speaker",
  speakerStakeholder: "Client stakeholder",
  speakerMarket: "Market participant",
  personName: "Person",
  personRole: "Role at their organisation (optional)",
  interviewedAt: "Interviewed on",
  interviewer: "Interviewer",
  consentBasis: "Consent basis",
  verbatim: "Verbatim",
  /** Mono hint under the record block while a required field is empty. */
  missingPrefix: "Missing · ",
  /** Placement block (read-only). */
  placementMarket: "Market",
  placementStep: "Step",
  placementNoStep: "No step — this market has no job map yet",
  /** Actions. */
  propose: "Propose statement",
  statement: "Statement — edit before saving",
  proposedBy: "Proposed by ",
  save: "Save finding",
  /** After a save: the row is on the step; the record stays selected for the next finding. */
  saved: "Saved — the row is on this step. The interview stays selected for the next finding.",
} as const;

/** Every operator-facing string the form can render, for the sign-off listing and the parity guard. */
export const INTERVIEW_CAPTURE_STRING_LIST: ReadonlyArray<readonly [keyof typeof INTERVIEW_CAPTURE_STRINGS, string]> =
  (Object.keys(INTERVIEW_CAPTURE_STRINGS) as Array<keyof typeof INTERVIEW_CAPTURE_STRINGS>).map((k) => [k, INTERVIEW_CAPTURE_STRINGS[k]] as const);
