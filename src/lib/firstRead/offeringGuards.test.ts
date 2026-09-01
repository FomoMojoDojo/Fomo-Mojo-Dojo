// Gate 6a — OFFERING kind falsification probes (2026-09-01). Two load-bearing criteria for the public
// offering read, each shown to REJECT a planted-bad input:
//   (1) ENTITY ATTRIBUTION — an item describing a co-located / partner / third-party entity's offering
//       (the CB2 "Le French Rooster" shape from the diagnostic: French pastries belong to the
//       co-located bakery, not to Cafe Barra) must be rejected. Enforced by the judge's
//       entity_attribution_ok criterion; the pure accept logic fails-closed on it.
//   (2) UNCITED ITEM — an item with an empty refs array must be rejected by the deterministic
//       structure gate (cite-or-omit floor), independent of the judge.
// The accompanying script run demonstrates each criterion FAILING when its clause is deliberately
// removed from the source, then passing when restored.
import { describe, expect, it } from "vitest";
import {
  offeringStructureViolations,
  offeringAcceptFromVerdict,
} from "../../../supabase/functions/_shared/publicReadGuards.ts";

// A valid ledger ref-token set (what buildCatalogue produces: S/O/F/D + integer).
const VALID_REFS = new Set(["S1", "S2", "S3", "O1", "O2", "F1", "D1"]);

// A clean offering payload — every item cited, valid kind_hint, no banned vocab.
const CLEAN_PAYLOAD = {
  items: [
    { label: "Small-batch roasted coffee", statement: "Hand-roasted small-batch coffee beans sold to customers.", refs: ["O1", "S1"], kind_hint: "product" },
    { label: "Wholesale café partnerships", statement: "Wholesale coffee supply for café partners.", refs: ["S2"], kind_hint: "service" },
  ],
  open_questions: [
    { text: "A 2026 review reports the location changed management and briefly closed — is the offering current?", refs: ["S3"], reason: "currency" },
  ],
};

// The judge verdict for a CLEAN offering read — all four offering criteria affirmed.
const CLEAN_VERDICT = {
  grounding_ok: true, sanity_ok: true, consistency_ok: true, accept: true,
  offering: { enumerable_ok: true, entity_attribution_ok: true, doubts_placed_ok: true, banned_vocab_ok: true },
};

describe("offering probe 1 — ENTITY ATTRIBUTION rejects a co-located entity's offering", () => {
  it("the Le French Rooster shape (judge sets entity_attribution_ok:false) is REJECTED", () => {
    // The judge, seeing an item whose refs describe the co-located bakery's pastries rather than the
    // company's own offering, returns entity_attribution_ok:false. The pure accept must fail-close.
    const entityBadVerdict = {
      ...CLEAN_VERDICT,
      offering: { ...CLEAN_VERDICT.offering, entity_attribution_ok: false },
    };
    expect(offeringAcceptFromVerdict(entityBadVerdict)).toBe(false);
  });

  it("a clean offering verdict is accepted", () => {
    expect(offeringAcceptFromVerdict(CLEAN_VERDICT)).toBe(true);
  });

  it("a missing offering block fails-closed (never silently accepts)", () => {
    expect(offeringAcceptFromVerdict({ grounding_ok: true, accept: true })).toBe(false);
    expect(offeringAcceptFromVerdict(null)).toBe(false);
  });
});

describe("offering probe 2 — UNCITED item is rejected by the structure gate", () => {
  it("an item with an empty refs array yields an item_uncited violation", () => {
    const uncited = {
      ...CLEAN_PAYLOAD,
      items: [
        ...CLEAN_PAYLOAD.items,
        { label: "Latte art", statement: "Signature latte art served in-house.", refs: [], kind_hint: "format" },
      ],
    };
    const v = offeringStructureViolations(uncited, VALID_REFS);
    expect(v.some((x) => x.code === "item_uncited")).toBe(true);
  });

  it("a fully-cited payload has zero structure violations", () => {
    expect(offeringStructureViolations(CLEAN_PAYLOAD, VALID_REFS)).toEqual([]);
  });

  it("an item citing a ref outside the ledger is rejected", () => {
    const bad = { ...CLEAN_PAYLOAD, items: [{ label: "X", statement: "Y offered.", refs: ["Z9"], kind_hint: "product" }] };
    const v = offeringStructureViolations(bad, VALID_REFS);
    expect(v.some((x) => x.code === "item_ref_outside_ledger")).toBe(true);
  });

  it("a banned currency/verdict word in a statement is rejected", () => {
    const bad = { items: [{ label: "X", statement: "This program is now retired.", refs: ["S1"], kind_hint: "program" }], open_questions: [] };
    const v = offeringStructureViolations(bad, VALID_REFS);
    expect(v.some((x) => x.code === "item_statement_banned_vocab")).toBe(true);
  });

  it("an empty items array is allowed (earned-empty renders from the ledger, not a violation)", () => {
    expect(offeringStructureViolations({ items: [], open_questions: [] }, VALID_REFS)).toEqual([]);
  });
});
