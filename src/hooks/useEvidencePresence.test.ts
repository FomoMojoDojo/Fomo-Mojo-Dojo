// Evidence presence — the client reader (2026-09-16). Only a persisted record can say "none";
// anything else (no record, malformed, other state) is unknown → render as today.
import { describe, it, expect } from "vitest";
import { evidencePresenceFromRecord } from "./useEvidencePresence";

describe("evidencePresenceFromRecord", () => {
  it("reads none / present from the record; everything else is unknown (null)", () => {
    expect(evidencePresenceFromRecord({ excluded_by_rule: { state: "none" } })).toBe("none");
    expect(evidencePresenceFromRecord({ excluded_by_rule: { state: "present" } })).toBe("present");
    expect(evidencePresenceFromRecord(null)).toBeNull();
    expect(evidencePresenceFromRecord({ excluded_by_rule: null })).toBeNull();
    expect(evidencePresenceFromRecord({ excluded_by_rule: { state: "ineligible" } })).toBeNull();
    expect(evidencePresenceFromRecord({ excluded_by_rule: {} })).toBeNull();
  });
});
