// V2-3 — Act 2 "Why We Start Outside": the method explanation.
//
// This act is hand-authored method copy (NO model, no register concern — it explains
// how we work, it is not a company read). Two constants, single-sourced so the screen
// (WhyOutsideAct + the journey SVG) and the leave-behind (exportHtml) render the SAME
// words and can never diverge:
//   • WHY_OUTSIDE_RATIONALE — the three Q&A blocks. OPERATOR-AUTHORED-AND-SIGNED,
//     evergreen, verbatim.
//   • JOURNEY_VISUAL_LABELS — the labels on the journey exhibit. Drafted this gate,
//     PENDING OPERATOR SIGNATURE (each listed for signing in the gate report).

// ── The rationale — OPERATOR-AUTHORED-AND-SIGNED 2026-07-23 (evergreen, verbatim) ──
export interface RationaleBlock {
  /** Section heading (client-facing) — SIGNED. */
  q: string;
  /** The answer (client-facing) — SIGNED. */
  a: string;
}

export const WHY_OUTSIDE_RATIONALE: readonly RationaleBlock[] = [
  {
    q: "Why start with public signals?",
    a: "Media coverage, customer reviews, employee comments, public filings — anything anyone can already see or search about your business. It's neutral ground: not our opinion, not yours. Reading it first gives us an observable starting point before the internal conversation begins.",
  },
  {
    q: "What do we do with it?",
    a: "It's one layer of the map. Lay it next to how you see your own business, and the gaps show themselves — strengths, inconsistencies, opportunities. Add what your customers are actually trying to get done, and the picture locks together: assumptions become hypotheses to test, and decisions rest on evidence everyone can see.",
  },
  {
    q: "What's the payoff?",
    a: "When what the world sees, what you believe, and what your customers need all point the same direction, decisions get lighter and teams stop pulling against each other. That's mojo — alignment working as a market advantage instead of a goal.",
  },
] as const;

// ── The journey exhibit labels — PENDING OPERATOR SIGNATURE (V2-3) ────────────────
// Plain English, no framework names. Three beats, left→right; the same three stations
// carry the forward pass, the reverse pass, and the live-monitoring loop.
export interface JourneyNode {
  /** Station title — PENDING SIGNATURE. */
  title: string;
  /** One-line gloss under the station — PENDING SIGNATURE. */
  sub: string;
}

export const JOURNEY_VISUAL_LABELS = {
  // Beat headings (the three passes) — PENDING SIGNATURE.
  beats: {
    start: "Start outside",
    backward: "Work backwards",
    live: "Watch it live",
  },
  // The three stations, left→right — PENDING SIGNATURE.
  nodes: [
    { title: "The outside record", sub: "What anyone can already see" },
    { title: "How you see yourselves", sub: "Intentions, outcomes, plans, positioning, message" },
    { title: "What customers need", sub: "The jobs they're trying to get done" },
  ] as readonly JourneyNode[],
  // The three flow captions (forward pass / reverse pass / live loop) — PENDING SIGNATURE.
  flows: {
    forward: "Outside first, read against how you see yourselves — landing on customer needs.",
    reverse: "Then backwards from validated needs, through plans, to message and positioning.",
    monitor: "Once live, we keep watching. Drift raises a flag — never a silent reset.",
  },
} as const;
