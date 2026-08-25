import { describe, expect, it } from "vitest";
import { excerptTracesToSource, applyExcerptGuard } from "./evidenceExcerptGuard";

// GATE 2 · E4 ingest guard. evidence_excerpt is admitted only when it traces (normalizeForHash
// substring) to the source the extractor saw; an appended analytic conclusion the source never
// stated is dropped (attributed-summary path), never stored as the source's words.

describe("GATE 2 · E4 ingest guard — evidence_excerpt must trace to the retained source", () => {
  // The real Wine+Eggs source sentence (the source the extractor actually saw).
  const SOURCE = "Wine + Eggs sells Cafe Barra's 'Machado de Assis Brazil' - medium/dark roast whole beans, espresso/pour-over";

  it("FAIL — a real source sentence + an appended conclusion NOT in the source is refused", () => {
    const fabricated = SOURCE + " - confirming active wholesale/retail account"; // append absent from source
    expect(excerptTracesToSource(fabricated, SOURCE)).toBe(false);
    const g = applyExcerptGuard({ evidence_excerpt: fabricated, claim_text: fabricated }, SOURCE);
    expect(g.dropped).toBe(true);
    expect(g.evidence_excerpt).toBe(""); // no excerpt stored…
    expect(g.claim_text).toBe("");       // …and no claim seeded from the fabricated text
  });

  it("PASS — a clean lifted sentence (a substring of the source) is stored unchanged", () => {
    const clean = "Wine + Eggs sells Cafe Barra's 'Machado de Assis Brazil'"; // real substring
    expect(excerptTracesToSource(clean, SOURCE)).toBe(true);
    const g = applyExcerptGuard({ evidence_excerpt: clean, claim_text: clean }, SOURCE);
    expect(g.dropped).toBe(false);
    expect(g.evidence_excerpt).toBe(clean);
    expect(g.claim_text).toBe(clean);
  });

  it("substring check ignores whitespace/case (normalizeForHash), not content", () => {
    expect(excerptTracesToSource("MEDIUM/DARK   roast   whole beans", SOURCE)).toBe(true);
    expect(excerptTracesToSource("medium/dark roast decaf beans", SOURCE)).toBe(false);
  });

  it("no retained source basis → leave the draft AS-IS (honest limit; gate-3 supplies the basis)", () => {
    const excerpt = "Some analyst read with no citation basis.";
    const g = applyExcerptGuard({ evidence_excerpt: excerpt, claim_text: excerpt }, null);
    expect(g.dropped).toBe(false);
    expect(g.evidence_excerpt).toBe(excerpt); // untouched — nothing to verify against
  });

  it("empty excerpt is a no-op (nothing is claimed as the source's words)", () => {
    expect(excerptTracesToSource("", SOURCE)).toBe(true);
    const g = applyExcerptGuard({ evidence_excerpt: "", claim_text: "" }, SOURCE);
    expect(g.dropped).toBe(false);
  });
});
