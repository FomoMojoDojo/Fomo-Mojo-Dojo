// THE SCORE'S CLOCK (operator ruling P1, 2026-09-25). The live score may take its `now` from a
// test-only override, window.__FR_SCORE_NOW — but ONLY in a development build. This file pins all
// three halves of that rule: the override works in dev, is IGNORED outside dev, and is ignored when
// it is not a date. Nothing else in the page's clock is touched.
import { afterEach, describe, expect, it, vi } from "vitest";
import { SCORE_NOW_OVERRIDE_KEY, scoreComputedAt } from "./useLiveMojoScore";

const w = window as unknown as Record<string, unknown>;
const setOverride = (v: unknown) => { w[SCORE_NOW_OVERRIDE_KEY] = v; };
const clearOverride = () => { delete w[SCORE_NOW_OVERRIDE_KEY]; };

afterEach(() => { clearOverride(); vi.unstubAllEnvs(); vi.useRealTimers(); });

describe("the score's computedAt", () => {
  it("a. development build + an override -> computedAt IS the override", () => {
    vi.stubEnv("DEV", true);
    setOverride("2026-09-19T00:00:00.000Z");
    expect(scoreComputedAt()).toBe("2026-09-19T00:00:00.000Z");
  });

  it("b. NOT a development build + an override -> the override is ignored, the real clock is used", () => {
    vi.stubEnv("DEV", false);
    setOverride("2026-09-19T00:00:00.000Z");
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2027-03-04T05:06:07.000Z"));
    // the real clock, not the override — this is the guard the whole ruling rests on
    expect(scoreComputedAt()).toBe("2027-03-04T05:06:07.000Z");
    expect(scoreComputedAt()).not.toBe("2026-09-19T00:00:00.000Z");
  });

  it("c. an override that is not a date is ignored, in dev, and the real clock is used", () => {
    vi.stubEnv("DEV", true);
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2027-03-04T05:06:07.000Z"));
    for (const bad of ["not a date", "", "2026-13-45T99:99:99Z", NaN, {}, null, true]) {
      setOverride(bad);
      expect(scoreComputedAt()).toBe("2027-03-04T05:06:07.000Z");
    }
  });

  it("d. no override at all -> the real clock, in dev and out of it", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2027-03-04T05:06:07.000Z"));
    clearOverride();
    for (const dev of [true, false]) {
      vi.stubEnv("DEV", dev);
      expect(scoreComputedAt()).toBe("2027-03-04T05:06:07.000Z");
    }
  });

  it("e. a numeric override (epoch ms) is honoured in dev", () => {
    vi.stubEnv("DEV", true);
    setOverride(Date.parse("2026-09-19T00:00:00.000Z"));
    expect(scoreComputedAt()).toBe("2026-09-19T00:00:00.000Z");
  });
});
