// R3 junk filter — falsification-validated. A planted page-title / research-note row
// is hidden; a planted substantive observation is shown. The real CB2 shapes are used
// as fixtures so the test tracks the data the operator reviewed.
import { describe, it, expect } from "vitest";
import { isChannelJunk } from "./channelJunk";

describe("isChannelJunk — R3 deterministic hide", () => {
  it("HIDES the three junk classes (real CB2 shapes)", () => {
    // "Page titled '…'" research note (CB2 28fecd37)
    expect(isChannelJunk("Page titled 'Where to find CB Coffee' - confirms retail/wholesale placement", null)).toBe(true);
    // no readable content note (CB2 e947d014)
    expect(isChannelJunk("Cafe Barra DTC online ordering site hosted on Square; content not publicly indexable at time of research", null)).toBe(true);
    // pipe title shape (CB2 44f4dd77)
    expect(isChannelJunk("Order Online | CAFE BARRA - Square online ordering storefront for Cafe Barra.", null)).toBe(true);
    // exact page title match
    expect(isChannelJunk("Get in Touch — Cafe Barra", "Get in Touch — Cafe Barra")).toBe(true);
    // empty
    expect(isChannelJunk("   ", null)).toBe(true);
  });

  it("SHOWS substantive observations (must NOT be over-hidden)", () => {
    // FALSIFICATION: these are our third-person reads, not titles/notes — they render.
    expect(isChannelJunk("Cafe Barra distributes its products locally in Los Angeles and Todos Santos and supports direct sales via its website.", "Cafe Barra 2 public baseline")).toBe(false);
    expect(isChannelJunk("Cafe Barra sells branded merchandise including a Coffee Mug ($20) and T-Shirt ($25).", null)).toBe(false);
    expect(isChannelJunk("Dedicated partnerships page exists at cafebarra.com/partnerships, signaling active B2B wholesale.", null)).toBe(false);
    expect(isChannelJunk("Be the first to own this first edition Cafe Barra T-shirt Designed by Malcolm Maginnis.", null)).toBe(false);
  });

  it("the source_title baseline label never causes a false exact-match hide", () => {
    // The stored client-voice title is the useless baseline label; a substantive statement
    // must not equal it, so the exact-match branch stays inert on real data.
    expect(isChannelJunk("Cafe Barra operates an online ordering portal via Square.", "Cafe Barra 2 public baseline")).toBe(false);
  });
});
