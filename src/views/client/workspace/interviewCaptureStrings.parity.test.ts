// Interview capture register (gate 4, 2026-09-16, PROPOSED — for the operator's look). One assertion per
// string; a drift fails the run and names the string. These are operator-only: none may appear in the
// client register (WORKSPACE_STRINGS) and the working / generate strings are reused, not re-spelled.
import { describe, expect, it } from "vitest";
import { INTERVIEW_CAPTURE_STRINGS as S, INTERVIEW_CAPTURE_STRING_LIST } from "./interviewCaptureStrings";
import { WORKSPACE_STRINGS } from "./workspaceNav";

describe("interview capture register", () => {
  it("byte-identical", () => {
    expect(S.open).toBe("Record interview finding"); expect(S.close).toBe("Done");
    expect(S.reuse).toBe("Reuse an interview"); expect(S.reuseNone).toBe("New interview");
    expect(S.speaker).toBe("Speaker"); expect(S.speakerStakeholder).toBe("Client stakeholder"); expect(S.speakerMarket).toBe("Market participant");
    expect(S.personName).toBe("Person"); expect(S.personRole).toBe("Role at their organisation (optional)");
    expect(S.interviewedAt).toBe("Interviewed on"); expect(S.interviewer).toBe("Interviewer"); expect(S.consentBasis).toBe("Consent basis"); expect(S.verbatim).toBe("Verbatim");
    expect(S.missingPrefix).toBe("Missing · ");
    expect(S.placementMarket).toBe("Market"); expect(S.placementStep).toBe("Step"); expect(S.placementNoStep).toBe("No step — this market has no job map yet");
    expect(S.propose).toBe("Propose statement"); expect(S.statement).toBe("Statement — edit before saving"); expect(S.proposedBy).toBe("Proposed by ");
    expect(S.save).toBe("Save finding");
    expect(S.saved).toBe("Saved — the row is on this step. The interview stays selected for the next finding.");
    expect(INTERVIEW_CAPTURE_STRING_LIST).toHaveLength(Object.keys(S).length);
  });
  it("none leaks into the client register; Working… and Generate job map are reused, never re-spelled", () => {
    const client = new Set(Object.values(WORKSPACE_STRINGS) as string[]);
    for (const [, v] of INTERVIEW_CAPTURE_STRING_LIST) expect(client.has(v), v).toBe(false);
    const values = Object.values(S) as string[];
    expect(values.some((v) => /^working/i.test(v))).toBe(false);
    expect(values.some((v) => /generate job map/i.test(v))).toBe(false);
  });
});
