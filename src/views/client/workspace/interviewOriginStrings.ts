// The INTERVIEW ORIGIN chip's words, signed by the operator.
//
// These were literals inside InterviewOrigin.tsx until U6-27 (2026-11-10), which split the attested
// chip in two: the speaker's NAME is interview text now, so a reader without interview.readText gets
// a chip with no name in it. That second form is a new client-visible string and needs signing like
// every other door's words — hence this module and interviewOriginStrings.parity.test.ts, which pins
// them verbatim.
//
// The date is always the short UTC month + day formatInterviewDate() produces, so an interview date
// never shifts by timezone.
export const INTERVIEW_ORIGIN_STRINGS = {
  /** The head of the attested chip. Signed 2026-09-16; unchanged. */
  youToldUs: "You told us",

  /**
   * S-U6-1 form (signed 2026-09-16): the full chip, for a reader who holds interview.readText — the
   * speaker's name sits between the head and the date.
   */
  attestedWithName: (name: string, date: string) => `You told us · ${name} · ${date}`,

  /**
   * S-U6-4 (signed 2026-11-10): the chip WITHOUT the name, for a reader who does not hold
   * interview.readText. It says the same true thing the full chip says — the client told us this, on
   * this date — and withholds only the person. It is not a refusal notice: a line explaining that a
   * name is being held would tell the room there is a name to hold.
   */
  attestedDateOnly: (date: string) => `You told us · ${date}`,
} as const;
