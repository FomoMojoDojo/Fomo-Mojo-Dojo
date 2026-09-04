// OPERATOR RULINGS 2026-09-04 (second pass, after the 101-claim rebuild):
//  (2) page-level anchoring reads ONLY genuine page metadata — og:title and the normalized URL slug (H1 if stored).
//      source_title is EXCLUDED: for baseline signals it holds the RUN LABEL ("Cafe Barra 2 public baseline"), which
//      names the company and had made every baseline signal page-anchored.
//  (3) ROLE_REFERENCES is EXACTLY the signed six — a signed string list is exact, nothing added.
//  (4) the 18: un-judged baseline paraphrases in the 161–210 band minted because the E2 raise reached the claim layer for
//      everything; the raise belongs to judge-admitted verbatim only — un-judged single sentences keep 160 at the claim layer.
import { describe, expect, it } from "vitest";
import { anchorBasisFor, ROLE_REFERENCES, ROLE_REFERENCE_PHRASES } from "../../supabase/functions/_shared/outsideRecrawlAnchors";
import { mapSignalsToClaimCandidates, signalAnchorBasis } from "./evidenceMappers";
import { E2_SINGLE_SENTENCE_MAX, E2_UNJUDGED_SINGLE_SENTENCE_MAX } from "./evidenceCaps";
import type { SignalDraft } from "./evidenceDomain";

const ANCHORS = ["cafe barra", "cafebarra.com", "le french rooster", "lefrenchrooster.com", "2221 w olive"];
const sig = (over: Record<string, unknown>): SignalDraft & { id?: string } => ({
  company_id: "co", source_id: null, source_type: "public_baseline_run", source_title: "Cafe Barra 2 public baseline", source_url: "https://swell.is/blog/specialty-coffee-margins",
  signal_band: "outside", evidence_type: "market_signal", claim_text: "DTC online sales deliver 40-60% profit margins for specialty roasters.", evidence_excerpt: "DTC online sales deliver 40-60% profit margins for specialty roasters.",
  topic: "market", framework: null, directness: "direct", recency: "recent", framing_fit: "partial", structure_level: "extracted", validation_status: "directional", confidence_to_use: "medium",
  voice_class: "market_context", raw_payload: {}, ...over,
} as unknown as SignalDraft & { id?: string });

describe("(2) source_title is not page metadata", () => {
  it("a baseline signal whose ONLY company reference is its run label is refused", () => {
    expect(signalAnchorBasis(sig({}), ANCHORS)).toBeNull();
    expect(mapSignalsToClaimCandidates("co", [sig({})], ANCHORS)).toHaveLength(0);
  });
  it("the joe.coffee page still anchors via its normalized slug (basis 'page'); og:title anchors too", () => {
    expect(anchorBasisFor({ text: "x", sourceUrl: "https://joe.coffee/locations/ca/burbank/cafe-barra-and-le-french-rooster-burbank-78a63605/", ogTitle: null }, ANCHORS)).toBe("page");
    expect(anchorBasisFor({ text: "x", sourceUrl: "https://example.com/p/1", ogTitle: "Cafe Barra Machado de Assis Brazil – Wine + Eggs" }, ANCHORS)).toBe("page");
  });
});
describe("(3) ROLE_REFERENCES is exactly the signed six", () => {
  it("byte-exact phrase list", () => {
    expect(ROLE_REFERENCE_PHRASES).toEqual(["this roastery", "this cafe", "this shop", "this community favorite", "this roaster", "this restaurant"]);
    expect(ROLE_REFERENCES).toHaveLength(6);
  });
  it("'This place …' and 'The restaurant's …' do NOT match; the six do (case-insensitive)", () => {
    const hit = (t: string) => ROLE_REFERENCES.some((re) => re.test(t));
    expect(hit("This place is so good.")).toBe(false);
    expect(hit("The restaurant's success reflects the area's appreciation.")).toBe(false);
    expect(hit("This independent roastery has earned its stellar reputation")).toBe(false); // 'this independent roastery' is not 'this roastery'
    for (const p of ["This roastery", "this cafe", "This shop", "this community favorite", "This roaster", "this restaurant"]) expect(hit(`${p} is great`)).toBe(true);
  });
});
describe("(4) the 18 — un-judged paraphrases keep 160 at the claim layer; judged verbatim gets 210", () => {
  const long190 = "Le French Rooster's own About Us page states that Le French Rooster is teaming up with Cafe Barra, a local coffee roaster, and documents the change of ownership in 2024 for the venue.";
  it("constants", () => { expect(E2_UNJUDGED_SINGLE_SENTENCE_MAX).toBe(160); expect(E2_SINGLE_SENTENCE_MAX).toBe(210); expect(long190.length).toBeGreaterThan(160); expect(long190.length).toBeLessThanOrEqual(210); });
  it("a 161–210 char baseline paraphrase (un-judged) does NOT mint; the same text as an R3-admitted row DOES", () => {
    const base = { claim_text: long190, evidence_excerpt: long190, source_url: "https://www.lefrenchrooster.com/about-us/", voice_class: "outside_voice_about_client" };
    expect(mapSignalsToClaimCandidates("co", [sig(base)], ANCHORS)).toHaveLength(0);
    expect(mapSignalsToClaimCandidates("co", [sig({ ...base, source_type: "outside_recrawl_regen", source_title: null })], ANCHORS)).toHaveLength(1);
  });
});
