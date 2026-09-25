// The front door's signed strings — pinned verbatim.
import { describe, expect, it } from "vitest";
import { FRONT_DOOR_STRINGS as S } from "./frontDoorStrings";

describe("front door strings", () => {
  it("pins every signed string", () => {
    expect(S.allCompanies).toBe("All companies");
    expect(S.legacySite).toBe("Legacy site");
    expect(S.loadFailed).toBe("Couldn't load companies — try reloading.");
    // signed 2026-09-25 (4g-1)
    expect(S.workspace).toBe("Workspace");
    expect(Object.keys(S).length).toBe(4);
  });
});
