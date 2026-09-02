import { describe, expect, it } from "vitest";
import { excerptTracesToSource, applyExcerptGuard } from "./evidenceExcerptGuard";
import { isProvablyVerbatim } from "./firstRead/provableVerbatim";

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

// ANALYSIS CARVE-OUT (2026-09-02). E4 must not strip an analysis read (voice_class='analysis'): it is
// OUR reading, labeled in raw_payload.hypothesis, never a verbatim claim on the source's words, so it
// is never a substring — E4 would ALWAYS clear it, nuking the finding body. Keyed on voice_class ONLY.
describe("ANALYSIS CARVE-OUT · E4 preserves analysis reads, still clears non-analysis fabrications", () => {
  const SOURCE = "Wine + Eggs sells Cafe Barra's beans - medium/dark roast whole beans, espresso/pour-over";
  const analysisRead = "Geniant's roll-up M&A strategy is its primary mechanism for enterprise mandates."; // never on the page

  it("(i) analysis signal + basis retained + NON-substring text → claim_text PRESERVED (finding body kept)", () => {
    const g = applyExcerptGuard({ evidence_excerpt: analysisRead, claim_text: analysisRead, voice_class: "analysis" }, SOURCE);
    expect(g.dropped).toBe(false);
    expect(g.claim_text).toBe(analysisRead); // the finding body survives — findings capture can read it
    expect(g.evidence_excerpt).toBe(analysisRead);
  });

  it("(ii) an outside_voice signal of the SAME shape (non-substring + basis) is STILL cleared — E4 intact", () => {
    const g = applyExcerptGuard({ evidence_excerpt: analysisRead, claim_text: analysisRead, voice_class: "outside_voice_about_client" }, SOURCE);
    expect(g.dropped).toBe(true);
    expect(g.claim_text).toBe("");       // E4's real target is untouched by the carve-out
    expect(g.evidence_excerpt).toBe("");
  });

  it("carve-out keys on voice_class ONLY — a clean-substring analysis read is also left as-is (never gated)", () => {
    const clean = "medium/dark roast whole beans"; // a real substring — would pass anyway, but must not depend on that
    const g = applyExcerptGuard({ evidence_excerpt: clean, claim_text: clean, voice_class: "analysis" }, SOURCE);
    expect(g.dropped).toBe(false);
  });

  it("(iii) render-safety: a preserved analysis signal is NEVER quoted — its id is absent from the provable-verbatim (own-words) set", () => {
    const provable = new Set<string>(["ownwords-verified-1"]); // only own_words snapshot-verified ids are provable
    // An analysis signal (structure_level='interpreted', never own-words) is downgraded to un-quoted by
    // the SAME default-deny predicate all quote paths gate on — restoring claim_text can't leak a quote.
    expect(isProvablyVerbatim("analysis-signal-1", provable)).toBe(false);
    expect(isProvablyVerbatim(null, provable)).toBe(false);
  });
});
