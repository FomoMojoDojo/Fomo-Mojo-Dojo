// Gate 5c — the FOUR fresh-basis vacuous-proofs, on real CB2-corpus values. Each is
// load-bearing: it MUST fail if its rule is reverted. The module lives under
// supabase/functions/_shared (edge-mounted, no Deno/crypto at value level here); this
// test lives under src/** so the vitest suite (include: src/**) runs it.
import { describe, expect, it } from "vitest";
import {
  anchorNorm,
  companyEntityAnchor,
  dedupKey,
  deriveFindingCentricRow,
  idfBodyCoherence,
  IDF_COHERENCE_MIN,
  isEntityAnchored,
  type FCMember,
} from "../../../supabase/functions/_shared/findingCentricMembership.ts";

const ANCHOR = companyEntityAnchor("Cafe Barra 2", "cafebarra.com"); // phrase "cafe barra", concat "cafebarra"
// Measured CB2 eligible-corpus IDF (N=103): coffee 63/103→0.49, cafe 21→1.59, barra 20→1.64,
// burbank 27→1.34, specialty 19→1.69; distinctive/rare tokens carry ~2–4.
const IDF = new Map<string, number>([
  ["coffee", 0.49], ["cafe", 1.59], ["barra", 1.64], ["burbank", 1.34], ["specialty", 1.69],
  ["roaster", 2.4], ["origin", 3.1], ["batch", 3.2], ["property", 3.6], ["story", 3.6],
]);
const BODY = "Cafe Barra specialty coffee roaster small-batch property-master origin story"; // a finding body

describe("5c proof 1 — wrong-entity rows are EXCLUDED (tight anchor, not bare 'barra')", () => {
  it("excludes Brothers Coffee / Cafe de Olla / Barra Picaresca", () => {
    expect(isEntityAnchored("BROTHERS COFFEE LA — Temp. CLOSED — 447 S Glenoaks Blvd, Burbank", "yelp.com", ANCHOR)).toBe(false);
    expect(isEntityAnchored("Coffee shop in Boyle Heights, 90023. Home of the Cafe de Olla", "google.com", ANCHOR)).toBe(false);
    // "Barra Picaresca" contains 'barra' but NOT the adjacency 'cafe barra' → excluded (the Picaresca boundary)
    expect(isEntityAnchored("Barra Picaresca — Evergreen, Los Angeles", "yelp.com", ANCHOR)).toBe(false);
    expect(isEntityAnchored("Picaresca Evergreen 2931 E 4th St", "barrapicaresca.com", ANCHOR)).toBe(false);
  });
  it("admits real Cafe Barra rows incl. accented name + @handle", () => {
    expect(isEntityAnchored("Cafe Barra & Le French Rooster, 2221 W Olive Ave, Burbank", "yelp.com", ANCHOR)).toBe(true);
    expect(isEntityAnchored("Café Barra (@cafebarracoffee): 265 Followers, 17 Following", "instagram.com", ANCHOR)).toBe(true);
    expect(anchorNorm("Café Barra")).toBe("cafe barra");
  });
});

describe("5c proof 2 — a cafe+barra+coffee-only bridge is REJECTED by the IDF floor", () => {
  it("scores below the ΣIDF≥6 floor (the vacuous brand bridge carries ~nothing)", () => {
    const s = idfBodyCoherence("cafe barra coffee", BODY, IDF); // shares only cafe+barra+coffee
    expect(s).toBeLessThan(IDF_COHERENCE_MIN); // ≈ 1.59+1.64+0.49 = 3.72
  });
  it("a member sharing several genuinely-distinctive tokens CLEARS the floor", () => {
    const s = idfBodyCoherence("Cafe Barra specialty roaster small-batch origin story", BODY, IDF);
    expect(s).toBeGreaterThanOrEqual(IDF_COHERENCE_MIN);
  });
});

describe("5c proof 3 — near-duplicate collapse: same-host identical counts once", () => {
  const dup = "265 Followers, 17 Following, 39 Posts - Café Barra (@cafebarracoffee)";
  it("three same-host identical texts collapse to ONE key; cross-host identical stay separate", () => {
    expect(new Set([dedupKey("instagram.com", dup), dedupKey("instagram.com", dup), dedupKey("instagram.com", dup)]).size).toBe(1);
    expect(new Set([dedupKey("instagram.com", dup), dedupKey("pixelfed.com", dup)]).size).toBe(2);
  });
  it("deriveFindingCentricRow collapses a same-host triplicate that clears the floor", () => {
    const mk = (id: string, t: string, d: string): FCMember => ({ id, claim_text: t, domain: d });
    // a review text that clears entity+IDF, scraped 3× from the SAME host → must count once
    const rev = "Cafe Barra specialty roaster small-batch origin story batch property";
    const members = [
      mk("a", rev, "yelp.com"), mk("b", rev, "yelp.com"), mk("c", rev, "yelp.com"), // 3 identical same-host → 1
      mk("d", "Cafe Barra & Le French Rooster specialty coffee roaster origin story batch", "joe.coffee"),
    ];
    const row = deriveFindingCentricRow("f1", BODY, members, IDF, ANCHOR, true, 2);
    expect(row).not.toBeNull();
    // the triplicate collapses to one representative → 2 members, not 4
    expect(row!.cluster_signal_ids.length).toBe(2);
  });
});

describe("5c proof 4 — no transitivity: a body-incoherent / wrong-entity signal never becomes a member", () => {
  const mk = (id: string, t: string, d: string): FCMember => ({ id, claim_text: t, domain: d });
  it("a wrong-entity neighbor is excluded regardless of any signal↔signal link (union-find retired)", () => {
    const members = [
      mk("barra1", "Cafe Barra specialty roaster small-batch origin property story", "yelp.com"),
      mk("barra2", "Cafe Barra & Le French Rooster specialty coffee roaster origin story batch", "joe.coffee"),
      mk("brothers", "BROTHERS COFFEE LA — Temp. CLOSED — Burbank", "google.com"), // would only join via union-find chaining
    ];
    const row = deriveFindingCentricRow("f1", BODY, members, IDF, ANCHOR, true, 2);
    expect(row).not.toBeNull();
    expect(row!.cluster_signal_ids).not.toContain("brothers");
    expect(row!.cluster_signal_ids.sort()).toEqual(["barra1", "barra2"]);
  });
  it("judge-anchor gate: an unanchored finding (no accepted fcv) gets NO row", () => {
    const members = [
      mk("barra1", "Cafe Barra specialty roaster small-batch origin property story", "yelp.com"),
      mk("barra2", "Cafe Barra specialty coffee roaster origin story batch", "joe.coffee"),
    ];
    expect(deriveFindingCentricRow("f2", BODY, members, IDF, ANCHOR, false, 0)).toBeNull();
  });
});
