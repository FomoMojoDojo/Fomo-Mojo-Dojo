// OPERATOR RULINGS 2026-09-04 on the claim mapper:
//  (1) an R3-judge-admitted verbatim outside signal (source_type outside_recrawl_regen) bypasses looksLikeFeatureList;
//      the rule stays for every un-judged path;
//  (2a) anchor comparison normalizes [-_]+ → space, collapses whitespace, lowercases, BOTH sides, in ONE authority;
//  (2b) page-level anchoring: page title / og:title / normalized slug anchors the company AND the sentence carries a
//      role reference (ROLE_REFERENCES, single-homed) → passes D3 with anchor_basis 'page+role'; a name-anchored
//      sentence passes as 'name'. VACUOUS PROOF: a role-reference sentence on an UN-anchored page fails.
import { describe, expect, it } from "vitest";
import { anchorBasisFor, normAnchor, ROLE_REFERENCES, buildAnchors } from "../../supabase/functions/_shared/outsideRecrawlAnchors";
import { mapSignalsToClaimCandidates, signalMatchesAnchor } from "./evidenceMappers";
import type { SignalDraft } from "./evidenceDomain";

const ANCHORS = buildAnchors({ name: "Cafe Barra 2", website: "https://cafebarra.com", entityAnchors: ["Cafe Barra", "cafebarra.com", "Le French Rooster", "lefrenchrooster.com", "2221 W Olive"] });
const JOE_URL = "https://joe.coffee/locations/ca/burbank/cafe-barra-and-le-french-rooster-burbank-78a63605-d48a-4991-b04b-330ed03928e4/";
const S1 = "This independent roastery has earned its stellar reputation by serving up exceptional espresso, delicious sandwiches, and irresistible desserts that keep neighbors coming back.";
const S2 = "Unlike chain coffee shops, this community favorite sources and roasts their beans with care, creating a warm gathering space where every visit feels personal and special.";
const sig = (text: string, over: Record<string, unknown> = {}): SignalDraft & { id?: string } => ({
  company_id: "co", source_id: null, source_type: "outside_recrawl_regen", source_title: null, source_url: JOE_URL, signal_band: "outside",
  evidence_type: "market_signal", claim_text: text, evidence_excerpt: text, topic: "outside_voice_signal", framework: null, directness: "direct",
  recency: "recent", framing_fit: "partial", structure_level: "extracted", validation_status: "directional", confidence_to_use: "medium",
  voice_class: "outside_voice_about_client", raw_payload: { page_url: JOE_URL }, ...over,
} as unknown as SignalDraft & { id?: string });

describe("(2a) normalization — one authority", () => {
  it("slug 'cafe-barra-and-le-french-rooster' anchors 'cafe barra'", () => {
    expect(normAnchor("cafe-barra-and-le-french-rooster")).toBe("cafe barra and le french rooster");
    expect(normAnchor("Cafe  Barra")).toBe("cafe barra");
    expect(signalMatchesAnchor({ claim_text: "x", evidence_excerpt: "x", source_url: JOE_URL }, ["cafe barra"])).toBe(true);
    // pre-existing law preserved and labelled: a non-role sentence on an anchored URL passes as basis 'page'
    expect(anchorBasisFor({ text: "x", sourceUrl: JOE_URL, ogTitle: null }, ["cafe barra"])).toBe("page");
    expect(signalMatchesAnchor({ claim_text: "x", evidence_excerpt: "x", source_url: "https://ritual.coffee/sweet-tooth" }, ["cafe barra"])).toBe(false);
  });
});

describe("(2b) page-level role attribution", () => {
  // HARD LINE (2026-09-04): the role list is EXACTLY the signed six. "this community favorite" is on it → 'page+role';
  // "This independent roastery" is not "this roastery" → the sentence anchors via the page slug alone → 'page'.
  it("S2 on the joe.coffee page → 'page+role'; S1 → 'page' (slug-anchored, no signed role phrase)", () => {
    expect(anchorBasisFor({ text: S2, sourceUrl: JOE_URL, ogTitle: null }, ANCHORS)).toBe("page+role");
    expect(anchorBasisFor({ text: S1, sourceUrl: JOE_URL, ogTitle: null }, ANCHORS)).toBe("page");
  });
  it("same sentence on a page anchored to Ritual Coffee → null (fails)", () => {
    expect(anchorBasisFor({ text: S2, sourceUrl: "https://joe.coffee/locations/ca/sf/ritual-coffee-roasters/", ogTitle: "Ritual Coffee Roasters" }, ANCHORS)).toBeNull();
  });
  it("a name-anchored sentence passes as 'name' regardless of page", () => {
    expect(anchorBasisFor({ text: "Cafe Barra roasts every bean with care.", sourceUrl: "https://example.com/x", ogTitle: null }, ANCHORS)).toBe("name");
  });
  it("VACUOUS PROOF: a role-reference sentence on an UN-anchored page fails", () => {
    expect(anchorBasisFor({ text: "This roastery sources and roasts their beans with care.", sourceUrl: "https://example.com/blog/post-1", ogTitle: "A blog" }, ANCHORS)).toBeNull();
  });
  it("ROLE_REFERENCES is the single-homed list and includes the signed roles", () => {
    for (const r of ["this roastery", "this cafe", "this shop", "this community favorite", "this roaster", "this restaurant"]) expect(ROLE_REFERENCES.some((re) => re.test(r))).toBe(true);
    expect(ROLE_REFERENCES.some((re) => re.test("This independent roastery"))).toBe(false); // not on the signed list
    expect(ROLE_REFERENCES.some((re) => re.test("the weather"))).toBe(false);
  });
});

describe("(1) R3-admitted verbatim skips the feature-list heuristic", () => {
  it("60ca6305's exact text mints when source_type is outside_recrawl_regen; refused as feature list when it is not", () => {
    expect(mapSignalsToClaimCandidates("co", [sig(S1)], ANCHORS)).toHaveLength(1);
    expect(mapSignalsToClaimCandidates("co", [sig(S1, { source_type: "public_baseline_run" })], ANCHORS)).toHaveLength(0);
  });
  it("a real 3-segment feature list on a non-judged path is still refused", () => {
    expect(mapSignalsToClaimCandidates("co", [sig("Cafe Barra offers espresso, drip, and cold brew.", { source_type: "public_baseline_run" })], ANCHORS)).toHaveLength(0);
  });
  it("the two minted claims carry anchor_basis in raw_payload: S1 'page', S2 'page+role'", () => {
    const out = mapSignalsToClaimCandidates("co", [sig(S1), sig(S2)], ANCHORS);
    expect(out).toHaveLength(2);
    expect(out.map((c) => (c.claim.raw_payload as { anchor_basis?: string }).anchor_basis).sort()).toEqual(["page", "page+role"]);
  });
});
