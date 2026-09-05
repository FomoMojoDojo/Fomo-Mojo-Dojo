// OPERATOR RULING 2026-09-04 (fourth pass): a third anchor basis 'host' — a sentence is anchored when its PAGE is the
// company's own host per the SINGLE authority isOwnDomainUrl (firstReadProvenance). No new hostname comparison lives in
// the anchor module. Own-host anchoring never touches corroboration: the same predicate that grants 'host' here is the one
// the delta compute uses to REFUSE an own-host observed side (self-echo gate), so the two can never disagree.
import { describe, expect, it } from "vitest";
import { anchorBasisFor, buildAnchors } from "../../supabase/functions/_shared/outsideRecrawlAnchors";
import { isOwnDomainUrl } from "../../supabase/functions/_shared/firstReadProvenance";
import { mapSignalsToClaimCandidates, signalAnchorBasis } from "./evidenceMappers";
import type { SignalDraft } from "./evidenceDomain";

const ANCHORS = buildAnchors({ name: "Cafe Barra 2", website: "https://cafebarra.com", entityAnchors: ["Cafe Barra", "cafebarra.com", "Le French Rooster", "lefrenchrooster.com", "2221 W Olive"] });
const HOST = "cafebarra.com";
const OWN_URL = "https://www.cafebarra.com/our-story";
const JOE_URL = "https://joe.coffee/locations/ca/burbank/cafe-barra-and-le-french-rooster-burbank-78a63605/";
const GLASSDOOR_URL = "https://www.glassdoor.com/Overview/Working-at-Cafe-Barra-EI_IE999.htm";
const T = "This is the Barra Method."; // no name, no role phrase
const sig = (text: string, url: string, over: Record<string, unknown> = {}): SignalDraft & { id?: string } => ({
  company_id: "co", source_id: null, source_type: "client_voice_regen", source_title: null, source_url: url, signal_band: "outside",
  evidence_type: "market_signal", claim_text: text, evidence_excerpt: text, topic: "outside_voice_signal", framework: null, directness: "direct",
  recency: "recent", framing_fit: "partial", structure_level: "extracted", validation_status: "directional", confidence_to_use: "medium",
  voice_class: "client_voice", raw_payload: { page_url: url }, ...over,
} as unknown as SignalDraft & { id?: string });

describe("basis 'host' — own-site sentences anchor by the page host (isOwnDomainUrl)", () => {
  it("a cafebarra.com sentence with no name or role passes as 'host'", () => {
    expect(anchorBasisFor({ text: T, sourceUrl: OWN_URL, ogTitle: null, companyHost: HOST }, ANCHORS)).toBe("host");
    expect(signalAnchorBasis(sig(T, OWN_URL), ANCHORS, HOST)).toBe("host");
    const out = mapSignalsToClaimCandidates("co", [sig(T, OWN_URL)], ANCHORS, HOST);
    expect(out).toHaveLength(1);
    expect((out[0].claim.raw_payload as { anchor_basis?: string }).anchor_basis).toBe("host");
  });
  it("the same text on joe.coffee is refused (slug anchors the page, but no role phrase, not own host)", () => {
    expect(anchorBasisFor({ text: T, sourceUrl: JOE_URL, ogTitle: null, companyHost: HOST }, ANCHORS)).toBeNull();
    expect(mapSignalsToClaimCandidates("co", [sig(T, JOE_URL)], ANCHORS, HOST)).toHaveLength(0);
  });
  it("an aggregator self-copy page (glassdoor) is NOT host — isOwnDomainUrl is false there", () => {
    expect(isOwnDomainUrl(GLASSDOOR_URL, HOST)).toBe(false);
    expect(anchorBasisFor({ text: T, sourceUrl: GLASSDOOR_URL, ogTitle: null, companyHost: HOST }, ANCHORS)).toBeNull();
  });
  it("without a company host nothing is 'host' (the pre-ruling behaviour); name still wins on the own site", () => {
    expect(anchorBasisFor({ text: T, sourceUrl: OWN_URL, ogTitle: null }, ANCHORS)).toBeNull();
    expect(anchorBasisFor({ text: "Cafe Barra roasts every bean.", sourceUrl: OWN_URL, ogTitle: null, companyHost: HOST }, ANCHORS)).toBe("name");
  });
  it("'host' ⇔ isOwnDomainUrl on the same URL: whatever anchors by host is exactly what the self-echo gate refuses as observed side", () => {
    for (const u of [OWN_URL, "https://shop.cafebarra.com/x", JOE_URL, GLASSDOOR_URL, "https://lefrenchrooster.com/about-us"]) {
      const b = anchorBasisFor({ text: T, sourceUrl: u, ogTitle: null, companyHost: HOST }, ANCHORS);
      expect(b === "host").toBe(isOwnDomainUrl(u, HOST));
    }
  });
});
