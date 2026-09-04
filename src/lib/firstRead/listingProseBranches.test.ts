// LISTING CLASS (operator ruling 2026-09-04, step 8): every prose-only path excludes a listing row by an EXPLICIT
// branch — the router (relevanceBackstop), the paraphrase quote/E4 path (evidencePhase1), prose recurrence
// (signalRecurrence) — and the claim mapper turns a listing signal into an inference claim carrying the marker.
import { describe, expect, it } from "vitest";
import { backstopSkipsListingPair, isListingDraft, recurrenceEligibleRow } from "../../../supabase/functions/_shared/listingClass.ts";
import { mapSignalsToClaimCandidates } from "../evidenceMappers";
import type { SignalDraft } from "../evidenceDomain";

describe("prose-only branches", () => {
  it("relevanceBackstop: a listing-backed pair never enters the router", () => {
    const backed = new Set(["pub-listing"]);
    expect(backstopSkipsListingPair(backed, "pub-listing")).toBe(true);
    expect(backstopSkipsListingPair(backed, "pub-prose")).toBe(false);
    expect(backstopSkipsListingPair(backed, null)).toBe(false);
  });
  it("evidencePhase1: a listing draft skips the quote producer and the E4 guard", () => {
    expect(isListingDraft({ evidence_class: "listing" })).toBe(true);
    expect(isListingDraft({ evidence_class: "prose" })).toBe(false);
    expect(isListingDraft({})).toBe(false);
  });
  it("signalRecurrence: a listing row is not prose recurrence", () => {
    expect(recurrenceEligibleRow({ evidence_class: "listing" })).toBe(false);
    expect(recurrenceEligibleRow({ evidence_class: "prose" })).toBe(true);
    expect(recurrenceEligibleRow({})).toBe(true);
  });
});

describe("evidenceMappers: listing → inference claim with the marker", () => {
  const listingSig = {
    company_id: "co", source_id: null, source_type: "outside_listing_regen", source_title: null, source_url: "https://wineandeggs.com/p",
    signal_band: "outside", evidence_type: "market_signal", claim_text: "Cafe Barra Machado de Assis Brazil", evidence_excerpt: "Cafe Barra Machado de Assis Brazil",
    topic: "outside_listing", framework: null, directness: "direct", recency: "recent", framing_fit: "partial", structure_level: "extracted",
    validation_status: "directional", confidence_to_use: "medium", voice_class: "outside_voice_about_client",
    evidence_class: "listing", listing: { product_name: "Cafe Barra Machado de Assis Brazil", price: 22, currency: "USD", attribution_text: "Cafe Barra", listing_url: "https://wineandeggs.com/p", detected_from: "ld+json" },
    raw_payload: { source: "outside_listing_regen" },
  } as unknown as SignalDraft & { id?: string };
  it("statement = the title line; claim_type inference; raw_payload carries evidence_class listing + the listing", () => {
    const cands = mapSignalsToClaimCandidates("co", [listingSig], ["cafe barra"]);
    expect(cands).toHaveLength(1);
    expect(cands[0].claim).toMatchObject({ statement: "Cafe Barra Machado de Assis Brazil", claim_type: "inference", topic: "market" });
    expect((cands[0].claim.raw_payload as { evidence_class?: string; listing?: { price?: number } })).toMatchObject({ evidence_class: "listing", listing: { price: 22 } });
  });
  it("a prose signal is unchanged by the branch (no marker)", () => {
    const prose = { ...listingSig, evidence_class: "prose", listing: null, claim_text: "Wine + Eggs sells Cafe Barra coffee to Burbank locals every weekend.", evidence_excerpt: "Wine + Eggs sells Cafe Barra coffee to Burbank locals every weekend." } as unknown as SignalDraft & { id?: string };
    const cands = mapSignalsToClaimCandidates("co", [prose], ["cafe barra"]);
    expect(cands.length).toBeLessThanOrEqual(1);
    if (cands.length) expect((cands[0].claim.raw_payload as { evidence_class?: string }).evidence_class).toBeUndefined();
  });
});
