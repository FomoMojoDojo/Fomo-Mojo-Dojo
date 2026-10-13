// ── R-A2 (operator ruling, 2026-10-12): the attested chip's name and date ───────────────────────
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { attestedOrigin, attestedOriginOf } from "./InterviewOrigin";

const claim = (rp: Record<string, unknown>) => ({
  provenance: "client_attested",
  statement: "Level 14 is retired terminology; the current California designation is STRTP (AB 403).",
  raw_payload: { origin: "interview_correction", ...rp },
});
const FULL = {
  person_name: "Lynn Dolce", speaker_label: "Lynn D.",
  attested_at: "2026-09-22T00:00:00Z", item_raw_words: "We're no longer level 14.",
};

describe("attestedOrigin — R-A2", () => {
  it("person_name present → the name is the record's person_name", () => {
    const o = attestedOrigin(claim(FULL))!;
    expect(o.chip).toBe("You told us · Lynn Dolce · Sep 22");
    expect(o.attribution).toBe("Lynn Dolce");
  });

  it("person_name null → falls back to the ITEM's speaker_label", () => {
    const o = attestedOrigin(claim({ ...FULL, person_name: null }))!;
    expect(o.chip).toBe("You told us · Lynn D. · Sep 22");
    expect(o.attribution).toBe("Lynn D.");
  });

  it("neither name → the bare signed head, no dangling separator", () => {
    const o = attestedOrigin(claim({ ...FULL, person_name: null, speaker_label: null }))!;
    expect(o.chip).toBe("You told us · Sep 22");
  });

  it("interviewed_at null → the NAME renders with NO date", () => {
    const o = attestedOrigin(claim({ ...FULL, attested_at: null }))!;
    expect(o.chip).toBe("You told us · Lynn Dolce");
    expect(o.chip).not.toMatch(/·\s*$/);
  });

  it("parsed_at is NEVER used — a payload carrying only parsed_at gets no date", () => {
    const o = attestedOrigin(claim({ ...FULL, attested_at: null, parsed_at: "2026-09-25T00:16:25Z" }))!;
    expect(o.chip).toBe("You told us · Lynn Dolce");
    expect(o.chip).not.toContain("Sep 25");
    // and the reader does not even surface it
    expect(attestedOriginOf(claim({ ...FULL, parsed_at: "2026-09-25T00:16:25Z" }).raw_payload))
      .not.toHaveProperty("parsed_at");
  });

  it("the source names interviewed_at and never reads parsed_at", () => {
    const src = readFileSync(join(__dirname, "InterviewOrigin.tsx"), "utf8");
    const fn = src.slice(src.indexOf("export function attestedOrigin("), src.indexOf("export function AttestedOriginChip"));
    expect(fn).not.toContain("parsed_at");
  });

  it("the date uses the existing UTC formatter, so it never shifts by timezone", () => {
    // 2026-09-22T00:00:00Z is Sep 21 in any negative offset; the UTC formatter must still say Sep 22
    expect(attestedOrigin(claim({ ...FULL, attested_at: "2026-09-22T00:00:00Z" }))!.chip).toContain("Sep 22");
  });

  it("any other provenance → no frame at all", () => {
    expect(attestedOrigin({ ...claim(FULL), provenance: "public_observed" })).toBeNull();
    expect(attestedOrigin({ ...claim(FULL), provenance: "publicly_declared" })).toBeNull();
    expect(attestedOrigin(null)).toBeNull();
  });

  it("a client_attested claim that did NOT come from a correction gets no frame data", () => {
    const o = attestedOrigin({ provenance: "client_attested", raw_payload: { session_id: "s1" }, statement: "x" })!;
    expect(o.chip).toBe("You told us");
  });
});
