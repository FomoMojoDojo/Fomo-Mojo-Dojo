// OC-3 — kind-appropriate controls (GOAL 3) as a pure, falsifiable law.

import { describe, it, expect } from "vitest";
import { resolutionOptionsFor, KIND_LABEL, RESOLVED_LABEL } from "./contestCopy";

describe("OC-3 — resolutionOptionsFor (kind-appropriate controls only)", () => {
  it("disputed offers Strike + Dismiss, NEVER set-aside", () => {
    const rs = resolutionOptionsFor("disputed").map((o) => o.resolution);
    expect(rs).toContain("strike_resolved");
    expect(rs).toContain("dismissed");
    expect(rs).not.toContain("set_aside"); // FALSIFICATION: disputed never offers set-aside
    expect(rs.length).toBe(2);
  });

  it("immaterial offers Set-aside + Dismiss, NEVER strike (amendment: Dismiss is lawful)", () => {
    const rs = resolutionOptionsFor("immaterial").map((o) => o.resolution);
    expect(rs).toContain("set_aside");
    expect(rs).toContain("dismissed");
    expect(rs).not.toContain("strike_resolved"); // FALSIFICATION: immaterial never offers strike
    expect(rs.length).toBe(2);
  });

  it("every option carries a consequences-before-act line (GOAL 4)", () => {
    for (const kind of ["disputed", "immaterial"] as const) {
      for (const o of resolutionOptionsFor(kind)) {
        expect(o.consequence.trim().length).toBeGreaterThan(0);
        expect(o.label.trim().length).toBeGreaterThan(0);
      }
    }
  });

  it("kind labels are plain English (GOAL 1)", () => {
    expect(KIND_LABEL.disputed).toMatch(/false/i);
    expect(KIND_LABEL.immaterial).toMatch(/not a focus/i);
    expect(RESOLVED_LABEL.strike_resolved).toBe("Struck");
    expect(RESOLVED_LABEL.set_aside).toBe("Set aside");
    expect(RESOLVED_LABEL.dismissed).toBe("Dismissed");
  });
});
