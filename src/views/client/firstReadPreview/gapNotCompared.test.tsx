// Ruling 2026-10-22 (fleet-wide): the gap beat says when the comparison has not run. Looked-none ("We compared your
// public voice with the record — no disagreements stand right now.") is true only when a COMPLETED gap comparison ran
// after the company's latest own-words claim; otherwise the beat renders the signed not-compared string.
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { gapIntegrityState } from "./mapping";
import { ActGap } from "./acts";
import { EMPTY_FIRST_READ } from "./types";

const NOT_COMPARED = "We haven't compared your own words with the record yet.";
const LOOKED_NONE = "We compared your public voice with the record — no disagreements stand right now.";

describe("gapIntegrityState", () => {
  it("Spectrum: a 2026-10-13 skipped row and 142 own-words claims from 2026-10-22 ⇒ not_compared", () => {
    expect(gapIntegrityState({ latestStatus: "skipped_empty_input", latestOwnWordsAt: "2026-10-22T01:07:00Z", latestCompletedAt: null })).toBe("not_compared");
  });
  it("a completed comparison after the latest own-words claim ⇒ looked_none (unchanged)", () => {
    expect(gapIntegrityState({ latestStatus: "completed", latestOwnWordsAt: "2026-10-01T00:00:00Z", latestCompletedAt: "2026-10-02T00:00:00Z" })).toBe("looked_none");
  });
  it("a completed comparison BEFORE newer own-words ⇒ not_compared", () => {
    expect(gapIntegrityState({ latestStatus: "completed", latestOwnWordsAt: "2026-10-03T00:00:00Z", latestCompletedAt: "2026-10-02T00:00:00Z" })).toBe("not_compared");
  });
  it("no own-words at all ⇒ the persisted state decides, as before; failed and absent are unchanged", () => {
    expect(gapIntegrityState({ latestStatus: "skipped_empty_input", latestOwnWordsAt: null, latestCompletedAt: null })).toBe("looked_none");
    expect(gapIntegrityState({ latestStatus: "failed", latestOwnWordsAt: "2026-10-03T00:00:00Z", latestCompletedAt: null })).toBe("couldnt_check");
    expect(gapIntegrityState({ latestStatus: null, latestOwnWordsAt: "2026-10-03T00:00:00Z", latestCompletedAt: null })).toBe("not_yet");
  });
});

describe("ActGap renders the signed string for each state", () => {
  const txt = (gapIntegrity: "not_compared" | "looked_none") => render(<ActGap read={{ ...EMPTY_FIRST_READ, gapIntegrity }} />).container.textContent ?? "";
  it("not_compared ⇒ the signed not-compared string, never looked-none", () => {
    const t = txt("not_compared");
    expect(t).toContain(NOT_COMPARED);
    expect(t).not.toContain(LOOKED_NONE);
  });
  it("looked_none ⇒ unchanged", () => {
    expect(txt("looked_none")).toContain(LOOKED_NONE);
  });
});
