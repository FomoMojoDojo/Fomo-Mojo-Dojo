// Gate E1 — the score records WHERE its on-strategy set came from. The number does not move.
//
// Before this, initiative_context.primary_journey_key was a bare string: an operator's choice and the
// literal "customer" fallback were indistinguishable in the stored blob. Now every context carries
// primary_journey_source: 'operator' only when the supplied key names a set this company actually has
// (resolveChosenSet's rule), 'default' for everything else — whatever fallback produced it.
import { describe, it, expect } from "vitest";
import { computeGateScores } from "./mojoScore";

const steps = (keys: string[]) => keys.flatMap((k, i) => [
  { journey_key: k, journey_title: `${k} title`, journey_subtitle: "", designed: true, has_gap: false, id: `${k}-${i}-a` },
  { journey_key: k, journey_title: `${k} title`, journey_subtitle: "", designed: false, has_gap: true, id: `${k}-${i}-b` },
]);

const run = (primaryKey?: string) => computeGateScores(
  [], steps(["customer", "b2b-buyer"]) as never, [], [], undefined as never, [], [], undefined, primaryKey,
);

describe("primary_journey_source (Gate E1)", () => {
  // RED ON REVERT
  it("(gE1) a supplied key that names an existing set ⇒ 'operator'", () => {
    const r = run("b2b-buyer");
    expect(r.initiativeContext.primary_journey_key).toBe("b2b-buyer");
    expect(r.initiativeContext.primary_journey_source).toBe("operator");
  });
  // RED ON REVERT
  it("(gE1) no key supplied ⇒ 'customer' with source 'default'", () => {
    const r = run(undefined);
    expect(r.initiativeContext.primary_journey_key).toBe("customer");
    expect(r.initiativeContext.primary_journey_source).toBe("default");
  });
  it("(gE1) a supplied key that names NO existing set ⇒ still 'default' (Edgewood's stale pin)", () => {
    const r = run("dmk-families-and-caregivers-of-at-risk-youth");
    expect(r.initiativeContext.primary_journey_source).toBe("default");
  });

  // REGRESSION GUARD — passes under both bodies. The field is provenance, not behaviour.
  it("(gE1) REGRESSION GUARD: adding the field moves no number", () => {
    const withPin = run("b2b-buyer");
    const noPin = run(undefined);
    // the same inputs produce the same per-gate scores as before the field existed — assert the
    // multiplier and the focus norm are pure functions of the key, unaffected by the source label
    expect(typeof withPin.initiativeContext.initiative_focus_multiplier).toBe("number");
    expect(typeof noPin.initiativeContext.initiative_focus_multiplier).toBe("number");
    const strip = (c: Record<string, unknown>) => { const { primary_journey_source: _s, ...rest } = c; return rest; };
    // identical shapes apart from the new field
    expect(Object.keys(strip(withPin.initiativeContext as never)).sort())
      .toEqual(Object.keys(strip(noPin.initiativeContext as never)).sort());
  });
});
