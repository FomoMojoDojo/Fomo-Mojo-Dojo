// SP-329 (BRIEF-17): the strengths list never carries a contradicted attribute, and an editor that
// shows only the strengths never drops the contradicted ones from storage.
import { describe, it, expect } from "vitest";
import { contradictedAttributes, isContradictedAttribute, strengthAttributes, withContradicted } from "./attributeVerdict";

type Item = { id: string; evidence_status?: string };
const A: Item = { id: "a", evidence_status: "corroborated" };
const B: Item = { id: "b", evidence_status: "contradicted" };
const C: Item = { id: "c", evidence_status: "self_reported" };
const D: Item = { id: "d" };

describe("strengths and disagreements (SP-329)", () => {
  it("only `contradicted` is taken out of the strengths, in order", () => {
    expect(strengthAttributes([A, B, C, D]).map((x) => x.id)).toEqual(["a", "c", "d"]);
    expect(contradictedAttributes([A, B, C, D]).map((x) => x.id)).toEqual(["b"]);
    expect(isContradictedAttribute(B)).toBe(true);
    expect(isContradictedAttribute(D)).toBe(false);
    expect(strengthAttributes(null)).toEqual([]);
  });
  it("saving the visible strengths carries the contradicted items along", () => {
    expect(withContradicted([A], [A, B, C]).map((x) => x.id)).toEqual(["a", "b"]);
    // a contradicted item smuggled into the edited list is not duplicated
    expect(withContradicted([A, B], [A, B]).map((x) => x.id)).toEqual(["a", "b"]);
  });
});
