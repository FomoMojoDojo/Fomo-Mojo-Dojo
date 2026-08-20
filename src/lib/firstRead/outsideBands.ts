// V2-5 — Act 3 "What the Outside Shows": the three-band framing, single-sourced so the
// screen (OutsideBand) and the leave-behind (exportHtml) render the SAME band headings
// and honest-absence lines. Act 3 is REGISTER-LOCKED PUBLIC — every band draws only from
// public-register rows; a band with no public rows renders its honest-absence line, never
// filler. All strings below are client-facing DRAFTS — PENDING OPERATOR SIGNATURE.

export type OutsideBandKey = "strategy" | "positioning" | "message";

export interface OutsideBandCopy {
  key: OutsideBandKey;
  /** Band heading (client-facing) — PENDING SIGNATURE. */
  heading: string;
  /** One framing line under the heading — PENDING SIGNATURE. */
  framing: string;
  /** Honest-absence line when the band has no public-register rows — PENDING SIGNATURE. */
  empty: string;
}

// Order matches the signed act framing: "…your strategy, positioning, and message."
export const OUTSIDE_BANDS: readonly OutsideBandCopy[] = [
  {
    key: "strategy",
    heading: "Strategy",
    // PUBLIC-ONLY reword (2026-08-20, DRAFT): told-us reference removed.
    framing: "Where the public record shows you're playing — read from the outside alone.",
    empty: "We haven't found where you play in what we've read.",
  },
  {
    key: "positioning",
    heading: "Positioning",
    framing: "What you claim only you offer — and where the outside echoes it back.",
    empty: "We haven't found a distinct position in what we've read.",
  },
  {
    key: "message",
    heading: "Message",
    framing: "How the world describes you — in its words, not yours.",
    empty: "We haven't found this company described in its own words.",
  },
] as const;

export const outsideBand = (key: OutsideBandKey): OutsideBandCopy =>
  OUTSIDE_BANDS.find((b) => b.key === key)!;
