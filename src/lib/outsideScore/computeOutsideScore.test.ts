import { describe, it, expect } from "vitest";
import {
  computeOutsideScore,
  strengthOf,
  OUTSIDE_ANCHOR,
  OUTSIDE_MIN_SIGNALS,
  type OutsideScoreInput,
  type OutsideSignalInput,
} from "./computeOutsideScore";

const NOW = "2026-08-19T00:00:00Z";

function sig(over: Partial<OutsideSignalInput> = {}, i = 0): OutsideSignalInput {
  return {
    id: `s${i}`,
    sourceType: "public_baseline_run",
    eventDate: null,
    confidence: "medium",
    recurrenceConfirmed: false,
    ...over,
  };
}

function base(n: number, over: Partial<OutsideScoreInput> = {}): OutsideScoreInput {
  return {
    companyId: "c1",
    signals: Array.from({ length: n }, (_, i) => sig({}, i)),
    deltas: [],
    computedAt: NOW,
    ...over,
  };
}

describe("outside-v1.0.0 — eligibility", () => {
  it(`fewer than ${OUTSIDE_MIN_SIGNALS} outside-voice signals → NO score`, () => {
    const r = computeOutsideScore(base(9));
    expect(r.eligible).toBe(false);
    if (!r.eligible) expect(r.signalCount).toBe(9);
  });
  it("exactly 10 signals → eligible", () => {
    expect(computeOutsideScore(base(10)).eligible).toBe(true);
  });
});

describe("outside-v1.0.0 — anchor and bounds by construction", () => {
  it("all-zero moves → anchor 15 exactly", () => {
    const r = computeOutsideScore(base(10));
    if (!r.eligible) throw new Error("expected eligible");
    expect(r.anchor).toBe(OUTSIDE_ANCHOR);
    expect(r.totalScore).toBe(15);
  });
  it("worst case → floor 11 (echo −4; silence never penalizes)", () => {
    const r = computeOutsideScore(
      base(10, {
        deltas: Array.from({ length: 6 }, () => ({
          deltaType: "divergent" as const,
          declaredClaimId: "d1",
          declaredTopic: "positioning",
        })),
      }),
    );
    if (!r.eligible) throw new Error("expected eligible");
    expect(r.moves.find((m) => m.key === "echo_integrity")!.value).toBe(-4); // clamped
    expect(r.totalScore).toBe(11);
  });
  it("best case → ceiling 25", () => {
    const signals = Array.from({ length: 10 }, (_, i) =>
      sig({ recurrenceConfirmed: true, eventDate: "2026-06-01", sourceType: `type${i % 4}` }, i),
    );
    const deltas = [
      ...Array.from({ length: 6 }, (_, i) => ({
        deltaType: "echoed" as const,
        declaredClaimId: `d${i}`,
        declaredTopic: i < 3 ? "positioning" : "market",
      })),
    ];
    const r = computeOutsideScore(base(10, { signals, deltas }));
    if (!r.eligible) throw new Error("expected eligible");
    expect(r.totalScore).toBe(25);
  });
});

describe("outside-v1.0.0 — individual moves", () => {
  it("echo_integrity: confirmed − contradicted, unspoken contributes zero", () => {
    const r = computeOutsideScore(
      base(10, {
        deltas: [
          { deltaType: "echoed", declaredClaimId: "a", declaredTopic: "job" },
          { deltaType: "echoed", declaredClaimId: "b", declaredTopic: "job" },
          { deltaType: "divergent", declaredClaimId: "c", declaredTopic: "job" },
          { deltaType: "internally_silent", declaredClaimId: null, declaredTopic: null },
          { deltaType: "internally_silent", declaredClaimId: null, declaredTopic: null },
        ],
      }),
    );
    if (!r.eligible) throw new Error("expected eligible");
    expect(r.moves.find((m) => m.key === "echo_integrity")!.value).toBe(1);
  });

  it("record_strength: 2 × strong-share; R4 strength mapping honored", () => {
    const signals = [
      ...Array.from({ length: 5 }, (_, i) => sig({ recurrenceConfirmed: true }, i)), // strong
      ...Array.from({ length: 5 }, (_, i) => sig({ confidence: "low" }, i + 5)), // thin
    ];
    expect(strengthOf(signals[0])).toBe("strong");
    expect(strengthOf(signals[9])).toBe("thin");
    const r = computeOutsideScore(base(10, { signals }));
    if (!r.eligible) throw new Error("expected eligible");
    expect(r.moves.find((m) => m.key === "record_strength")!.value).toBe(1); // 2 × 0.5
  });

  it("differentiation_echo: positioning/market echoed claims only, distinct, capped at 2", () => {
    const r = computeOutsideScore(
      base(10, {
        deltas: [
          { deltaType: "echoed", declaredClaimId: "p1", declaredTopic: "positioning" },
          { deltaType: "echoed", declaredClaimId: "p1", declaredTopic: "positioning" }, // dup claim
          { deltaType: "echoed", declaredClaimId: "m1", declaredTopic: "market" },
          { deltaType: "echoed", declaredClaimId: "m2", declaredTopic: "Market" }, // case-insensitive
          { deltaType: "echoed", declaredClaimId: "j1", declaredTopic: "job" }, // wrong topic
          { deltaType: "divergent", declaredClaimId: "p9", declaredTopic: "positioning" }, // not echoed
        ],
      }),
    );
    if (!r.eligible) throw new Error("expected eligible");
    expect(r.moves.find((m) => m.key === "differentiation_echo")!.value).toBe(2); // 3 distinct, capped
  });

  it("coverage_breadth: 1 type → 0; 4+ types → 1; linear between", () => {
    const one = computeOutsideScore(base(10));
    if (!one.eligible) throw new Error("expected eligible");
    expect(one.moves.find((m) => m.key === "coverage_breadth")!.value).toBe(0);

    const three = computeOutsideScore(
      base(10, {
        signals: Array.from({ length: 10 }, (_, i) => sig({ sourceType: `t${i % 3}` }, i)),
      }),
    );
    if (!three.eligible) throw new Error("expected eligible");
    expect(three.moves.find((m) => m.key === "coverage_breadth")!.value).toBeCloseTo(2 / 3, 10);
  });

  it("freshness: undated counts NOT fresh (stated rule); 18-month window", () => {
    const signals = [
      ...Array.from({ length: 4 }, (_, i) => sig({ eventDate: "2026-05-01" }, i)), // fresh
      ...Array.from({ length: 2 }, (_, i) => sig({ eventDate: "2020-01-01" }, i + 4)), // stale
      ...Array.from({ length: 4 }, (_, i) => sig({ eventDate: null }, i + 6)), // undated → NOT fresh
    ];
    const r = computeOutsideScore(base(10, { signals }));
    if (!r.eligible) throw new Error("expected eligible");
    expect(r.moves.find((m) => m.key === "freshness")!.value).toBeCloseTo(0.4, 10);
  });
});

describe("outside-v1.0.0 — precision rule", () => {
  it("total rounds HALF-UP; components stay unrounded", () => {
    // 5 strong of 10 → record_strength exactly 1.0; craft a 0.5 tail via freshness:
    // 5 fresh of 10 → 0.5. Total = 15 + 1 + 0.5 = 16.5 → rounds UP to 17.
    const signals = [
      ...Array.from({ length: 5 }, (_, i) => sig({ recurrenceConfirmed: true, eventDate: "2026-05-01" }, i)),
      ...Array.from({ length: 5 }, (_, i) => sig({}, i + 5)),
    ];
    const r = computeOutsideScore(base(10, { signals }));
    if (!r.eligible) throw new Error("expected eligible");
    expect(r.totalUnrounded).toBeCloseTo(16.5, 10);
    expect(r.totalScore).toBe(17); // half-up
    expect(r.moves.find((m) => m.key === "freshness")!.value).toBeCloseTo(0.5, 10); // unrounded
  });
});
