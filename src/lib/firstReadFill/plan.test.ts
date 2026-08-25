// The per-company First Read fill runner's decision layer: step order, resume, skip-with-reason,
// frozen refusal, and the dry-run write gate.
import { describe, it, expect } from "vitest";
import {
  FILL_STEP_ORDER, stepsFrom, skipReason, refuseReason, ledgerEnabled, HELD_FROM_ALL, CB1_FROZEN_ID,
  parseSkip, type FillCounts,
} from "./plan";

const FULL: FillCounts = { hasWebsite: true, ownWords: 5, outsideSignals: 100 };

describe("fill plan — step order + resume", () => {
  it("runs the seven steps in dependency order", () => {
    expect([...FILL_STEP_ORDER]).toEqual([
      "own_words", "recurrence", "deltas_public", "conflict_explanations", "open_questions", "status_conflict", "score", "our_read",
    ]);
  });
  it("stepsFrom() with no arg returns the full order; --from resumes; unknown throws", () => {
    expect(stepsFrom(null)).toEqual([...FILL_STEP_ORDER]);
    expect(stepsFrom("deltas_public")).toEqual(["deltas_public", "conflict_explanations", "open_questions", "status_conflict", "score", "our_read"]);
    expect(stepsFrom("score")).toEqual(["score", "our_read"]);
    expect(() => stepsFrom("nope")).toThrow(/not a step/);
  });
});

describe("fill plan — skip with reason", () => {
  it("full inputs → every step RUNs (null skip)", () => {
    for (const s of FILL_STEP_ORDER) expect(skipReason(s, FULL)).toBeNull();
  });
  it("no website → own_words skips no_website", () => {
    expect(skipReason("own_words", { ...FULL, hasWebsite: false })).toBe("no_website");
  });
  it("<2 outside signals → recurrence skips insufficient_signals", () => {
    expect(skipReason("recurrence", { ...FULL, outsideSignals: 1 })).toBe("insufficient_signals");
    expect(skipReason("recurrence", { ...FULL, outsideSignals: 2 })).toBeNull();
  });
  it("no own-words → deltas_public skips no_own_words", () => {
    expect(skipReason("deltas_public", { ...FULL, ownWords: 0 })).toBe("no_own_words");
  });
  it("<10 outside signals → score skips ineligible_lt10_signals", () => {
    expect(skipReason("score", { ...FULL, outsideSignals: 9 })).toBe("ineligible_lt10_signals");
    expect(skipReason("score", { ...FULL, outsideSignals: 10 })).toBeNull();
  });
  it("open_questions + status_conflict always run (never skip on counts)", () => {
    const bare: FillCounts = { hasWebsite: false, ownWords: 0, outsideSignals: 0 };
    expect(skipReason("open_questions", bare)).toBeNull();
    expect(skipReason("status_conflict", bare)).toBeNull();
  });
});

describe("fill plan — frozen refusal (even via --company)", () => {
  it("CB1 is refused", () => {
    expect(refuseReason({ id: CB1_FROZEN_ID, frozen: true })).toBe("frozen");
    expect(refuseReason({ id: CB1_FROZEN_ID, frozen: false })).toBe("frozen"); // by id even if flag drifted
  });
  it("ANY frozen-flagged fixture is refused, whatever its id", () => {
    expect(refuseReason({ id: "some-fixture-uuid", frozen: true })).toBe("frozen");
  });
  it("a normal non-frozen company is allowed", () => {
    expect(refuseReason({ id: "3dd2cfbb-0792-4bf1-9cd4-15db9646874b", frozen: false })).toBeNull();
  });
  it("held-from-all fixtures (916 empty dup + CB2) are NOT frozen — refusal is separate from --all holding", () => {
    for (const id of HELD_FROM_ALL) expect(refuseReason({ id, frozen: false })).toBeNull();
    expect(HELD_FROM_ALL.has("916ce5f4-8ab3-4908-907e-570dc294e330")).toBe(true);
    expect(HELD_FROM_ALL.has("fd3f7f63-968b-4698-b946-3d6b6450d79d")).toBe(true);
  });
});

describe("fill plan — dry-run writes nothing", () => {
  it("ledgerEnabled is false in dry-run, true otherwise", () => {
    expect(ledgerEnabled(true)).toBe(false);
    expect(ledgerEnabled(false)).toBe(true);
  });
});

describe("fill plan — --skip parsing", () => {
  it("empty/absent → empty set", () => {
    expect(parseSkip(null).size).toBe(0);
    expect(parseSkip("").size).toBe(0);
  });
  it("parses one or many steps (trims whitespace)", () => {
    expect([...parseSkip("recurrence")]).toEqual(["recurrence"]);
    expect([...parseSkip("recurrence, score")].sort()).toEqual(["recurrence", "score"]);
  });
  it("throws on an unknown step", () => {
    expect(() => parseSkip("recurrence,bogus")).toThrow(/not a step/);
  });
});
