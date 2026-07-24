// FR-V2-1 — the v2 First Read act registry, single-sourced so the rail (FirstReadView)
// and the leave-behind (exportHtml) render the SAME act titles in the SAME order and
// can never diverge (the export-single-source law the whole flow ships under).
//
// The five approved v2 acts (docs/design/FR_V2_decomposition.md). Act 1 carries the
// stated-problem distillation (V2-2/2b); Act 2 carries the journey exhibit + signed
// rationale (V2-3); Acts 3–5 re-slot today's Mirror / Check / (Gap+Proposal+job-map).
// No placeholder acts remain — every act reaches the leave-behind.
//
// Titles + framing lines are NEW client-facing strings — PENDING OPERATOR SIGNATURE.
// (`check`'s line is carried forward from the shipped Check act.)

export interface FirstReadAct {
  key: "say" | "why_outside" | "outside_shows" | "check" | "help";
  /** Nav title (client-facing) — PENDING SIGNATURE. */
  title: string;
  /** One framing sentence (client-facing) — PENDING SIGNATURE. */
  line: string;
}

export const FR_ACTS: readonly FirstReadAct[] = [
  // V2-2 — `say` now carries content (the stated-problem distillation); no longer a
  // placeholder, so it reaches the leave-behind.
  { key: "say", title: "What You Say",
    line: "The problem you tell the world you solve — in your own words." },
  { key: "why_outside", title: "Why We Start Outside",
    line: "Why we read the outside record before asking you for anything." },
  { key: "outside_shows", title: "What the Outside Shows",
    line: "What the public record shows about your strategy, positioning, and message." },
  { key: "check", title: "The Check",
    line: "Now you tell us where we're right, where we're close, and where we're wrong." },
  { key: "help", title: "How We Can Help",
    line: "Where this goes — the opportunities we see and how we'd work them with you." },
] as const;

// V2-10 — every act carries substance (the placeholder-omission branch is retired; the
// `placeholder` field and the `.filter(!placeholder)` are removed). The leave-behind
// follows ALL five acts, in order.
export const FR_EXPORT_ACTS = FR_ACTS;
