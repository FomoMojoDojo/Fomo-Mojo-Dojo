// Register parity — the workspace's signed strings are byte-identical to what was signed. Same idiom as
// chosenJobStepSet.test.ts "(gE1) the signed strings": one assertion per string, the literal spelled out
// here so a drift in workspaceNav.ts fails the run and names the string.
import { describe, expect, it } from "vitest";
import { WORKSPACE_STRINGS } from "./workspaceNav";

describe("Job Map register — Tier 1 (signed by use, 2026-09-11)", () => {
  it("switcher", () => {
    expect(WORKSPACE_STRINGS.showAllMarkets).toBe("Show all markets");
    expect(WORKSPACE_STRINGS.switchMarketViewingOnly).toBe("Switch market — viewing only");
  });
  it("choose / conditions / working", () => {
    expect(WORKSPACE_STRINGS.chooseSet).toBe("Choose this as the on-strategy set");
    expect(WORKSPACE_STRINGS.generateConditions).toBe("Generate conditions");
    expect(WORKSPACE_STRINGS.regenerateConditions).toBe("Regenerate conditions");
    expect(WORKSPACE_STRINGS.working).toBe("Working…");
  });
});

describe("Job Map register — market door (signed 2026-09-15, item 2, R2)", () => {
  it("the three new strings, byte-identical", () => {
    expect(WORKSPACE_STRINGS.generateJobMap).toBe("Generate job map");
    expect(WORKSPACE_STRINGS.notMapped).toBe("Not mapped");
    expect(WORKSPACE_STRINGS.jobMapGenerationFailed).toBe("Generation did not complete — no steps were written for this market.");
  });
  it("the working state REUSES Working… — no second spelling exists in the register", () => {
    const values = Object.values(WORKSPACE_STRINGS) as string[];
    expect(values.filter((v) => /^working(\.\.\.|…)?$/i.test(v))).toEqual(["Working…"]);
  });
  it("the empty state stays wordless (absent.tsx renders no text)", () => {
    expect(Object.values(WORKSPACE_STRINGS)).not.toContain("No steps");
  });
});
