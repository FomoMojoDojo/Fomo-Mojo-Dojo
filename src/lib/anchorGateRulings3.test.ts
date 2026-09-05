// OPERATOR RULINGS 2026-09-04 (third pass, after the 56-would-mint dry run):
//  (1) basis 'page' RETIRED — a sentence is anchored by NAME in the sentence, or by PAGE anchoring (og:title / H1 /
//      normalized slug) PLUS a signed role phrase; nothing else. Review filler on a slug-anchored URL is refused.
//  (3) role phrase SHAPE signed: "this" + up to two intervening words + one of EXACTLY six role nouns
//      [roastery, cafe, shop, roaster, restaurant, community favorite]. "This independent roastery" matches;
//      "this place" / "the restaurant's" / a three-word gap do not. Signed lists and shapes are exact.
import { describe, expect, it } from "vitest";
import { anchorBasisFor, ROLE_NOUNS, ROLE_PHRASE_RE, hasRolePhrase, buildAnchors } from "../../supabase/functions/_shared/outsideRecrawlAnchors";
import { mapSignalsToClaimCandidates } from "./evidenceMappers";
import type { SignalDraft } from "./evidenceDomain";

const ANCHORS = buildAnchors({ name: "Cafe Barra 2", website: "https://cafebarra.com", entityAnchors: ["Cafe Barra", "cafebarra.com", "Le French Rooster", "lefrenchrooster.com", "2221 W Olive"] });
const JOE_URL = "https://joe.coffee/locations/ca/burbank/cafe-barra-and-le-french-rooster-burbank-78a63605-d48a-4991-b04b-330ed03928e4/";
const RJI_URL = "https://www.restaurantji.com/ca/burbank/le-french-rooster-/";
const S1 = "This independent roastery has earned its stellar reputation by serving up exceptional espresso, delicious sandwiches, and irresistible desserts that keep neighbors coming back.";
const S2 = "Unlike chain coffee shops, this community favorite sources and roasts their beans with care, creating a warm gathering space where every visit feels personal and special.";
const sig = (text: string, over: Record<string, unknown> = {}): SignalDraft & { id?: string } => ({
  company_id: "co", source_id: null, source_type: "outside_recrawl_regen", source_title: null, source_url: JOE_URL, signal_band: "outside",
  evidence_type: "market_signal", claim_text: text, evidence_excerpt: text, topic: "outside_voice_signal", framework: null, directness: "direct",
  recency: "recent", framing_fit: "partial", structure_level: "extracted", validation_status: "directional", confidence_to_use: "medium",
  voice_class: "outside_voice_about_client", raw_payload: { page_url: JOE_URL }, ...over,
} as unknown as SignalDraft & { id?: string });

describe("(1) basis 'page' is retired — admission bases are exactly 'name' and 'page+role'", () => {
  it("filler on the joe.coffee page is refused: 'This place is so good'", () => {
    expect(anchorBasisFor({ text: "This place is so good.", sourceUrl: JOE_URL, ogTitle: null }, ANCHORS)).toBeNull();
    expect(mapSignalsToClaimCandidates("co", [sig("This place is so good and the staff is said to be pleasant here.")], ANCHORS)).toHaveLength(0);
  });
  it("'It truly is a special place' on a slug-anchored restaurantji page is refused", () => {
    expect(anchorBasisFor({ text: "It truly is a special place.", sourceUrl: RJI_URL, ogTitle: null }, ANCHORS)).toBeNull();
    expect(anchorBasisFor({ text: "It truly is a special place.", sourceUrl: "https://example.com/p/1", ogTitle: "Cafe Barra Machado de Assis Brazil – Wine + Eggs" }, ANCHORS)).toBeNull();
  });
  it("the two admitted bases still admit: name in the sentence; page + signed role phrase", () => {
    expect(anchorBasisFor({ text: "Cafe Barra roasts every bean with care.", sourceUrl: "https://example.com/x", ogTitle: null }, ANCHORS)).toBe("name");
    expect(anchorBasisFor({ text: S2, sourceUrl: JOE_URL, ogTitle: null }, ANCHORS)).toBe("page+role");
    expect(anchorBasisFor({ text: "This roastery is great.", sourceUrl: "https://example.com/blog/post-1", ogTitle: "A blog" }, ANCHORS)).toBeNull(); // role phrase on an un-anchored page
  });
});

describe("(3) role phrase shape: this + ≤2 words + signed role noun", () => {
  it("ROLE_NOUNS is byte-exact", () => {
    expect(ROLE_NOUNS).toEqual(["roastery", "cafe", "shop", "roaster", "restaurant", "community favorite"]);
    expect(ROLE_NOUNS).toHaveLength(6);
    expect(ROLE_PHRASE_RE.flags).toContain("i");
  });
  it("matches: 'This independent roastery', 'this community favorite', 'this warm little cafe'", () => {
    expect(hasRolePhrase("This independent roastery has earned its stellar reputation")).toBe(true);
    expect(hasRolePhrase("Unlike chain coffee shops, this community favorite sources and roasts")).toBe(true);
    expect(hasRolePhrase("We love this warm little cafe on Olive.")).toBe(true);
    for (const n of ["roastery", "cafe", "shop", "roaster", "restaurant", "community favorite"]) expect(hasRolePhrase(`This ${n} is great.`)).toBe(true);
  });
  it("fails: 'this place', 'the restaurant's', three intervening words", () => {
    expect(hasRolePhrase("This place is so good.")).toBe(false);
    expect(hasRolePhrase("The restaurant's success reflects the area's appreciation.")).toBe(false);
    expect(hasRolePhrase("this wonderful cozy quiet cafe")).toBe(false);
    expect(hasRolePhrase("the weather")).toBe(false);
    expect(hasRolePhrase("this shopkeeper")).toBe(false); // noun must be a whole word
  });
  it("5431517f's text (S1) passes as 'page+role' on the joe.coffee page by the shape", () => {
    expect(anchorBasisFor({ text: S1, sourceUrl: JOE_URL, ogTitle: null }, ANCHORS)).toBe("page+role");
    const out = mapSignalsToClaimCandidates("co", [sig(S1), sig(S2)], ANCHORS);
    expect(out).toHaveLength(2);
    expect(out.map((c) => (c.claim.raw_payload as { anchor_basis?: string }).anchor_basis)).toEqual(["page+role", "page+role"]);
  });
});
