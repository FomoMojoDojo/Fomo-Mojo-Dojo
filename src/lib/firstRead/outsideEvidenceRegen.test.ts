// R3 birth-guard tests — each MUST fail if its guard is removed (load-bearing).
// The guard-composition module lives under supabase/functions/_shared (it must be edge-mounted,
// and it imports the already-mounted gate-2 primitives); this test lives under src/** so the
// vitest suite (include: src/**) actually runs it.
import { describe, expect, it } from "vitest";
import { admitOutsideEvidence } from "../../../supabase/functions/_shared/outsideEvidenceRegen.ts";

const PAGE =
  "Wine + Eggs actively lists and sells Cafe Barra's Machado de Assis Brazil roast in 12 oz bags. " +
  "Adorable little French bakery and coffee shop. Every single thing we ordered was delicious and the staff were kind. " +
  "The espresso pour-over flight is available to go.";

describe("R3 birth guard — E4 verbatim-substring (default-deny)", () => {
  it("ADMITS a verbatim substring of the page", () => {
    const r = admitOutsideEvidence("Adorable little French bakery and coffee shop.", PAGE);
    expect(r.admit).toBe(true);
    if (r.admit) expect(r.excerpt.toLowerCase()).toContain("adorable little french bakery");
  });

  it("REFUSES a fabricated append the page never stated (E4 load-bearing)", () => {
    // Lead clause is real; the appended analyst conclusion ("confirming an active wholesale
    // account") is NOT in the page → not a substring → refused. Exactly the 13-row class this
    // gate must never rebirth.
    const r = admitOutsideEvidence(
      "Wine + Eggs actively lists and sells Cafe Barra's Machado de Assis Brazil roast confirming an active wholesale account",
      PAGE,
    );
    expect(r).toEqual({ admit: false, reason: "e4_not_verbatim" });
  });

  it("REFUSES an empty excerpt", () => {
    expect(admitOutsideEvidence("   ", PAGE)).toEqual({ admit: false, reason: "empty" });
  });
});

describe("R3 birth guard — E2 specificity (cap + min length)", () => {
  it("REFUSES an over-broad verbatim excerpt beyond the 160-char single-clause cap (E2 load-bearing)", () => {
    const longClause = "x ".repeat(120).trim() + " end"; // >160 chars, single clause, no concrete token
    const page = `prefix ${longClause} suffix`;
    expect(admitOutsideEvidence(longClause, page)).toEqual({ admit: false, reason: "e2_overbroad" });
  });

  it("REFUSES a too-short verbatim excerpt (< 4 words)", () => {
    expect(admitOutsideEvidence("delicious and the", PAGE)).toEqual({ admit: false, reason: "e2_too_short" });
  });

  it("ADMITS a multi-word verbatim review sentence within cap", () => {
    const r = admitOutsideEvidence("Every single thing we ordered was delicious and the staff were kind.", PAGE);
    expect(r.admit).toBe(true);
  });
});
