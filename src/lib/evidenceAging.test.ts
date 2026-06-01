import { describe, expect, it } from "vitest";
import {
  classifySignalAge,
  worstCustomerProofAge,
  deriveValidationCadencePressure,
  canStrengthenFromAge,
  type EvidenceAgingState,
} from "./evidenceAging";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function daysAgo(days: number, now: Date = new Date()): string {
  return new Date(now.getTime() - days * 86_400_000).toISOString();
}

function makeSignal(
  band: string,
  updatedDaysAgo: number,
  opts: {
    createdDaysAgo?: number;
    validationStatus?: string;
    now?: Date;
  } = {},
) {
  const now = opts.now ?? new Date();
  const createdDaysAgo = opts.createdDaysAgo ?? updatedDaysAgo;
  return {
    signal_band: band,
    created_at: daysAgo(createdDaysAgo, now),
    updated_at: daysAgo(updatedDaysAgo, now),
    validation_status: opts.validationStatus ?? "directional",
  };
}

// ─── classifySignalAge — customer band ────────────────────────────────────────

describe("classifySignalAge — customer band (aging=14d, stale=30d)", () => {
  it("fresh: updated 5 days ago", () => {
    expect(classifySignalAge(makeSignal("customer", 5))).toBe("fresh");
  });

  it("aging: updated exactly 14 days ago", () => {
    expect(classifySignalAge(makeSignal("customer", 14))).toBe("aging");
  });

  it("aging: updated 25 days ago", () => {
    expect(classifySignalAge(makeSignal("customer", 25))).toBe("aging");
  });

  it("stale: updated exactly 30 days ago", () => {
    expect(classifySignalAge(makeSignal("customer", 30))).toBe("stale");
  });

  it("stale: updated 60 days ago", () => {
    expect(classifySignalAge(makeSignal("customer", 60))).toBe("stale");
  });
});

// ─── classifySignalAge — organization band ────────────────────────────────────

describe("classifySignalAge — organization band (aging=28d, stale=56d)", () => {
  it("fresh: updated 10 days ago", () => {
    expect(classifySignalAge(makeSignal("organization", 10))).toBe("fresh");
  });

  it("aging: updated 28 days ago", () => {
    expect(classifySignalAge(makeSignal("organization", 28))).toBe("aging");
  });

  it("still aging at 55 days", () => {
    expect(classifySignalAge(makeSignal("organization", 55))).toBe("aging");
  });

  it("stale: updated 56 days ago", () => {
    expect(classifySignalAge(makeSignal("organization", 56))).toBe("stale");
  });
});

// ─── classifySignalAge — outside band ────────────────────────────────────────

describe("classifySignalAge — outside band (aging=56d, stale=90d)", () => {
  it("fresh: updated 30 days ago", () => {
    expect(classifySignalAge(makeSignal("outside", 30))).toBe("fresh");
  });

  it("aging: updated 56 days ago", () => {
    expect(classifySignalAge(makeSignal("outside", 56))).toBe("aging");
  });

  it("stale: updated 90 days ago", () => {
    expect(classifySignalAge(makeSignal("outside", 90))).toBe("stale");
  });
});

// ─── classifySignalAge — customer ages faster ─────────────────────────────────

describe("customer proof ages faster than org signals", () => {
  it("customer signal is aging at 14d; org signal at 14d is still fresh", () => {
    expect(classifySignalAge(makeSignal("customer", 14))).toBe("aging");
    expect(classifySignalAge(makeSignal("organization", 14))).toBe("fresh");
  });

  it("customer signal is stale at 30d; org signal at 30d is still aging", () => {
    expect(classifySignalAge(makeSignal("customer", 30))).toBe("stale");
    expect(classifySignalAge(makeSignal("organization", 30))).toBe("aging");
  });
});

// ─── classifySignalAge — recently_reinforced ──────────────────────────────────

describe("classifySignalAge — recently reinforced", () => {
  it("created 60 days ago but updated 3 days ago → recently_reinforced", () => {
    expect(
      classifySignalAge(makeSignal("customer", 3, { createdDaysAgo: 60 })),
    ).toBe("recently_reinforced");
  });

  it("created 60 days ago and updated 20 days ago → aging (past threshold, reinforcement window closed)", () => {
    expect(
      classifySignalAge(makeSignal("customer", 20, { createdDaysAgo: 60 })),
    ).toBe("aging");
  });
});

// ─── classifySignalAge — unconfirmed ──────────────────────────────────────────

describe("classifySignalAge — unconfirmed", () => {
  it("unvalidated customer signal updated 15 days ago → unconfirmed", () => {
    expect(
      classifySignalAge(makeSignal("customer", 15, { validationStatus: "unvalidated" })),
    ).toBe("unconfirmed");
  });

  it("unvalidated signal updated 5 days ago → still fresh (not yet past aging threshold)", () => {
    expect(
      classifySignalAge(makeSignal("customer", 5, { validationStatus: "unvalidated" })),
    ).toBe("fresh");
  });

  it("directional customer signal updated 15 days ago → aging, not unconfirmed", () => {
    expect(
      classifySignalAge(makeSignal("customer", 15, { validationStatus: "directional" })),
    ).toBe("aging");
  });
});

// ─── worstCustomerProofAge ────────────────────────────────────────────────────

describe("worstCustomerProofAge", () => {
  it("no customer signals → unconfirmed", () => {
    expect(worstCustomerProofAge([])).toBe("unconfirmed");
  });

  it("ignores non-customer signals", () => {
    expect(
      worstCustomerProofAge([makeSignal("organization", 5), makeSignal("outside", 5)]),
    ).toBe("unconfirmed");
  });

  it("single fresh customer signal → fresh", () => {
    expect(worstCustomerProofAge([makeSignal("customer", 5)])).toBe("fresh");
  });

  it("mix of fresh and stale → worst is stale", () => {
    expect(
      worstCustomerProofAge([makeSignal("customer", 5), makeSignal("customer", 45)]),
    ).toBe("stale");
  });

  it("mix of fresh and aging → worst is aging", () => {
    expect(
      worstCustomerProofAge([makeSignal("customer", 5), makeSignal("customer", 20)]),
    ).toBe("aging");
  });
});

// ─── deriveValidationCadencePressure ─────────────────────────────────────────

describe("deriveValidationCadencePressure", () => {
  it("none when fresh proof and fresh gap", () => {
    expect(
      deriveValidationCadencePressure({ customerProofAgingState: "fresh", proofGapMaturity: "fresh" }),
    ).toBe("none");
  });

  it("none when recently reinforced even with aging gap", () => {
    expect(
      deriveValidationCadencePressure({ customerProofAgingState: "recently_reinforced", proofGapMaturity: "aging" }),
    ).toBe("none");
  });

  it("warming when proof is aging and gap is aging", () => {
    expect(
      deriveValidationCadencePressure({ customerProofAgingState: "aging", proofGapMaturity: "aging" }),
    ).toBe("warming");
  });

  it("none when proof is unconfirmed but gap is still fresh (new system, no customer research yet)", () => {
    expect(
      deriveValidationCadencePressure({ customerProofAgingState: "unconfirmed", proofGapMaturity: "fresh" }),
    ).toBe("none");
  });

  it("warming when proof is unconfirmed and gap has persisted (aging)", () => {
    expect(
      deriveValidationCadencePressure({ customerProofAgingState: "unconfirmed", proofGapMaturity: "aging" }),
    ).toBe("warming");
  });

  it("urgent when proof is stale and gap is aging", () => {
    expect(
      deriveValidationCadencePressure({ customerProofAgingState: "stale", proofGapMaturity: "aging" }),
    ).toBe("urgent");
  });

  it("urgent when proof is stale and gap is structural", () => {
    expect(
      deriveValidationCadencePressure({ customerProofAgingState: "stale", proofGapMaturity: "structural" }),
    ).toBe("urgent");
  });

  it("none when proof is stale but gap is fresh (isolated stale signal)", () => {
    expect(
      deriveValidationCadencePressure({ customerProofAgingState: "stale", proofGapMaturity: "fresh" }),
    ).toBe("none");
  });

  it("warming is not urgent — distinct pressure levels", () => {
    const warming = deriveValidationCadencePressure({ customerProofAgingState: "aging", proofGapMaturity: "aging" });
    const urgent = deriveValidationCadencePressure({ customerProofAgingState: "stale", proofGapMaturity: "aging" });
    expect(warming).toBe("warming");
    expect(urgent).toBe("urgent");
    expect(warming).not.toBe(urgent);
  });
});

// ─── canStrengthenFromAge ─────────────────────────────────────────────────────

describe("canStrengthenFromAge", () => {
  const states: EvidenceAgingState[] = ["fresh", "aging", "recently_reinforced", "unconfirmed", "stale"];

  it("returns false only for stale", () => {
    for (const state of states) {
      const result = canStrengthenFromAge(state);
      if (state === "stale") {
        expect(result, `expected false for ${state}`).toBe(false);
      } else {
        expect(result, `expected true for ${state}`).toBe(true);
      }
    }
  });
});
