// The interview-origin chip's signed strings — pinned verbatim.
import { describe, expect, it } from "vitest";
import { INTERVIEW_ORIGIN_STRINGS as S } from "./interviewOriginStrings";

describe("interview origin strings", () => {
  it("pins every signed string", () => {
    // signed 2026-09-16
    expect(S.youToldUs).toBe("You told us");
    expect(S.attestedWithName("Lynn Dolce", "Sep 22")).toBe("You told us · Lynn Dolce · Sep 22");
    // S-U6-4, signed 2026-11-10 — the no-capability form
    expect(S.attestedDateOnly("Sep 22")).toBe("You told us · Sep 22");
    expect(Object.keys(S).length).toBe(3);
  });

  it("S-U6-4 carries no name and no refusal language", () => {
    const line = S.attestedDateOnly("Sep 22");
    expect(line).not.toMatch(/held|hidden|restricted|permission|redact/i);
    expect(line).toBe(`${S.youToldUs} · Sep 22`);
  });
});
