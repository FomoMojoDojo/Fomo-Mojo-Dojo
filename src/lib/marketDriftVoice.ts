// B2.2c — Client-Facing Voice for the market-definition drift row.
//
// The reconciler's structured findings render in plain English on the inbox row:
// headline, one sentence per DIVERGED dimension (real names interpolated), closing
// question — the operator-signed phrasing pattern (2026-06-11, "observe → name the
// tension → open"). Composition is DETERMINISTIC from the structured per-dimension
// findings — saying structured results plainly, never keyword-matched canned insight
// (the buildTemplate scar). Aligned and insufficient-evidence dimensions render
// nothing. Scores, model attributions, and dimension keys stay in assessment_basis
// and the View-surface path; they never appear here.

type DimensionFinding = {
  dimension?: string;
  verdict?: string;
  competitors?: Array<{ name?: string; verdict?: string }>;
};

export type MarketDriftSummary = {
  headline: string;
  sentences: string[];
  closing: string;
};

export function renderMarketDriftSummary(assessmentBasis: unknown): MarketDriftSummary | null {
  const basis = assessmentBasis as { latest?: { dimensions?: DimensionFinding[] } } | null;
  const dimensions = Array.isArray(basis?.latest?.dimensions) ? basis.latest.dimensions : [];
  const diverged = new Map<string, DimensionFinding>();
  for (const d of dimensions) {
    if (d?.verdict === "divergent" && d.dimension) diverged.set(d.dimension, d);
  }
  if (diverged.size === 0) return null;

  const sentences: string[] = [];

  if (diverged.has("category_frame")) {
    sentences.push("The public evidence describes a different category than the one your strategy names.");
  }

  const competitive = diverged.get("competitive_set_coherence");
  if (competitive) {
    const names = (Array.isArray(competitive.competitors) ? competitive.competitors : [])
      .filter((c) => c?.verdict === "incoherent")
      .map((c) => String(c?.name || "").trim())
      .filter(Boolean);
    sentences.push(
      names.length > 0
        ? `The businesses showing up around you — ${names.join(", ")} — appear to be competing for a different job than the one you've defined.`
        : "The businesses showing up around you appear to be competing for a different job than the one you've defined.",
    );
  }

  // Buyer split (operator-signed sentences, 2026-06-11) — each renders only when its
  // own dimension diverges.
  if (diverged.has("buyer_beneficiary_alignment")) {
    sentences.push("The people your strategy says you serve aren't yet visible in how the public talks about you.");
  }
  if (diverged.has("buyer_chooser_alignment")) {
    sentences.push("The people the public shows choosing services like yours aren't the buyers your strategy names.");
  }
  // Legacy compound dimension (retired 2026-06-11): historical assessment rows still
  // render honestly; new runs never produce it.
  if (diverged.has("buyer_executor_alignment")) {
    sentences.push(
      sentences.length > 0
        ? "And the buyers the market describes don't quite match the people your strategy says you serve."
        : "The buyers the market describes don't quite match the people your strategy says you serve.",
    );
  }

  if (diverged.has("locale_territory")) {
    sentences.push("The territory the public evidence describes isn't the one your strategy names.");
  }

  return {
    headline: "The market the public sees may no longer match the one your strategy defines.",
    sentences,
    closing: "Worth deciding: has the market moved, or has your strategy?",
  };
}
