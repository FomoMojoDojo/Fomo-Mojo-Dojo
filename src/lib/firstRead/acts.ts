// FR-V2-1 — the v2 First Read act registry, single-sourced so the rail (FirstReadView)
// and the leave-behind (exportHtml) render the SAME act titles in the SAME order and
// can never diverge (the export-single-source law the whole flow ships under).
//
// The five approved v2 acts (docs/design/FR_V2_decomposition.md). Acts 1–2 are
// placeholders this gate (honest under-construction, no fabricated content); Acts 3–5
// re-slot today's Mirror / Check / (Gap+Proposal+job-map) content.
//
// Titles + framing lines are NEW client-facing strings — PENDING OPERATOR SIGNATURE.
// (`check`'s line is carried forward from the shipped Check act.)

export interface FirstReadAct {
  key: "say" | "why_outside" | "outside_shows" | "check" | "help";
  /** Nav title (client-facing) — PENDING SIGNATURE. */
  title: string;
  /** One framing sentence (client-facing) — PENDING SIGNATURE. */
  line: string;
  /** Placeholder acts have no substance this gate; the export omits them. */
  placeholder?: boolean;
}

export const FR_ACTS: readonly FirstReadAct[] = [
  { key: "say", title: "What You Say",
    line: "The problem you tell the world you solve — in your own words.", placeholder: true },
  { key: "why_outside", title: "Why We Start Outside",
    line: "Why we read the outside record before asking you for anything.", placeholder: true },
  { key: "outside_shows", title: "What the Outside Shows",
    line: "What the public record shows about your strategy, positioning, and message." },
  { key: "check", title: "The Check",
    line: "Now you tell us where we're right, where we're close, and where we're wrong." },
  { key: "help", title: "How We Can Help",
    line: "Where this goes — the opportunities we see and how we'd work them with you." },
] as const;

// The acts that carry real content into the leave-behind (placeholders omitted).
export const FR_EXPORT_ACTS = FR_ACTS.filter((a) => !a.placeholder);
