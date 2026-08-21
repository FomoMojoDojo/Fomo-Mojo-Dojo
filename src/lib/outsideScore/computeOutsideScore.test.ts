import { describe, it, expect } from "vitest";
import {
  computeOutsideScore,
  strengthOf,
  OUTSIDE_ANCHOR,
  OUTSIDE_MIN_SIGNALS,
  RECORD_STRENGTH_NOT_COMPUTED,
  type OutsideScoreInput,
  type OutsideSignalInput,
} from "./computeOutsideScore";

const NOW = "2026-08-19T00:00:00Z";

function sig(over: Partial<OutsideSignalInput> = {}, i = 0): OutsideSignalInput {
  return {
    id: `s${i}`,
    sourceType: "public_baseline_run",
    sourceUrl: null, // default: no host → categorized "Other" → does not count toward breadth
    eventDate: null,
    confidence: "medium",
    recurrenceConfirmed: false,
    ...over,
  };
}

// One host per OUTSIDE kind (signed categories) — for coverage_breadth fixtures.
const KIND_HOST: Record<string, string> = {
  reviews: "https://www.yelp.com/biz/x",
  social: "https://www.instagram.com/x/",
  press: "https://www.mordorintelligence.com/x",
  directories: "https://www.chamberofcommerce.com/x",
  own: "https://www.cafebarra.com/", // excluded (Your own site)
  other: "https://www.lefrenchrooster.com/about-us/", // excluded (Other)
};

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
        // Six DISTINCT contradicted statements (unit = statement): 0 − 6 clamps to −4.
        deltas: Array.from({ length: 6 }, (_, i) => ({
          deltaType: "divergent" as const,
          declaredClaimId: `d${i}`,
          declaredTopic: "positioning",
        })),
      }),
    );
    if (!r.eligible) throw new Error("expected eligible");
    expect(r.moves.find((m) => m.key === "echo_integrity")!.value).toBe(-4); // clamped
    expect(r.totalScore).toBe(11);
  });
  it("best case → ceiling 25", () => {
    const hosts = [KIND_HOST.reviews, KIND_HOST.social, KIND_HOST.press, KIND_HOST.directories];
    const signals = Array.from({ length: 10 }, (_, i) =>
      sig({ recurrenceConfirmed: true, eventDate: "2026-06-01", sourceUrl: hosts[i % 4] }, i),
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

  it("echo_integrity counts distinct STATEMENTS, not pair rows (2026-08-21)", () => {
    // CB2 shape: many echoed pair rows collapse to a few own-words statements.
    // 11 echoed rows across 3 declaredClaimIds → 3, NOT 11 (which would clamp to 4).
    const deltas = [
      ...Array.from({ length: 7 }, (_, i) => ({ deltaType: "echoed" as const, declaredClaimId: "s1", declaredTopic: "job", id: `r${i}` })),
      ...Array.from({ length: 3 }, (_, i) => ({ deltaType: "echoed" as const, declaredClaimId: "s2", declaredTopic: "job", id: `r${i + 7}` })),
      { deltaType: "echoed" as const, declaredClaimId: "s3", declaredTopic: "job", id: "r10" },
    ];
    const r = computeOutsideScore(base(10, { deltas }));
    if (!r.eligible) throw new Error("expected eligible");
    // 3 distinct echoed statements − 0 contradicted = 3 (row counting would give 11 → clamp 4).
    expect(r.moves.find((m) => m.key === "echo_integrity")!.value).toBe(3);
    expect(r.inputLedger.echo_integrity.echoed_statement_ids.sort()).toEqual(["s1", "s2", "s3"]);
    expect(r.inputLedger.echo_integrity.echoed_delta_ids).toHaveLength(11); // every pair still traced
    expect(r.inputLedger.echo_integrity.divergent_statement_ids).toEqual([]);
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
    expect(r.moves.find((m) => m.key === "record_strength")!.computed).not.toBe(false); // computed
  });

  it("record_strength NOT COMPUTED when recurrence wasn't run (2026-08-22)", () => {
    const signals = Array.from({ length: 10 }, (_, i) => sig({ recurrenceConfirmed: true }, i)); // would be strong
    const withRec = computeOutsideScore(base(10, { signals })); // recurrenceComputed default true
    const noRec = computeOutsideScore(base(10, { signals, recurrenceComputed: false }));
    if (!withRec.eligible || !noRec.eligible) throw new Error("expected eligible");
    const rsWith = withRec.moves.find((m) => m.key === "record_strength")!;
    const rsNo = noRec.moves.find((m) => m.key === "record_strength")!;
    // with recurrence: strong → value 2, computed
    expect(rsWith.value).toBe(2);
    // without recurrence: value null, computed:false, the signed line, ledger not_computed
    expect(rsNo.value).toBeNull();
    expect(rsNo.computed).toBe(false);
    expect(rsNo.explanation).toBe(RECORD_STRENGTH_NOT_COMPUTED);
    expect(noRec.inputLedger.record_strength.not_computed).toBe(true);
    expect(noRec.inputLedger.record_strength.strong_signal_ids).toEqual([]); // no 0-strength stored as verdict
    // total EXCLUDES the not-computed lever: with-rec total = with + 2; no-rec omits that +2.
    expect(withRec.totalUnrounded - noRec.totalUnrounded).toBeCloseTo(2, 10);
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

  it("coverage_breadth: signed OUTSIDE kinds only; own-site & Other excluded (1/2/4-kind)", () => {
    // 1 kind → 0
    const one = computeOutsideScore(
      base(10, { signals: Array.from({ length: 10 }, (_, i) => sig({ sourceUrl: KIND_HOST.reviews }, i)) }),
    );
    if (!one.eligible) throw new Error("expected eligible");
    expect(one.moves.find((m) => m.key === "coverage_breadth")!.value).toBe(0);

    // 2 kinds (Reviews + Social); own-site, Other, and unmatched signals must NOT count → 1/3
    const twoSignals = [
      ...Array.from({ length: 4 }, (_, i) => sig({ sourceUrl: KIND_HOST.reviews }, i)),
      ...Array.from({ length: 3 }, (_, i) => sig({ sourceUrl: KIND_HOST.social }, i + 4)),
      sig({ sourceUrl: KIND_HOST.own }, 7), // Your own site — excluded
      sig({ sourceUrl: KIND_HOST.other }, 8), // Other — excluded
      sig({ sourceUrl: null }, 9), // unmatched → Other — excluded
    ];
    const two = computeOutsideScore(base(10, { signals: twoSignals }));
    if (!two.eligible) throw new Error("expected eligible");
    expect(two.moves.find((m) => m.key === "coverage_breadth")!.value).toBeCloseTo(1 / 3, 10);
    expect(two.inputLedger.coverage_breadth.kinds_present).toEqual(["Reviews & listings", "Social"]);

    // 4 kinds → 1
    const hosts = [KIND_HOST.reviews, KIND_HOST.social, KIND_HOST.press, KIND_HOST.directories];
    const four = computeOutsideScore(
      base(10, { signals: Array.from({ length: 10 }, (_, i) => sig({ sourceUrl: hosts[i % 4] }, i)) }),
    );
    if (!four.eligible) throw new Error("expected eligible");
    expect(four.moves.find((m) => m.key === "coverage_breadth")!.value).toBe(1);
    expect(four.inputLedger.coverage_breadth.kinds_present).toEqual([
      "Reviews & listings", "Social", "Press & articles", "Directories",
    ]);
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
