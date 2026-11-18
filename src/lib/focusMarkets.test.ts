// F-1: the pure parts of the focus-market set — rank ↔ domain, the signed order, reordering.
import { describe, it, expect } from "vitest";
import { FOCUS_STRINGS, focusDomain, focusRank, moveInOrder, proposedIds, signedFromOptions, type FocusMarketOption } from "./focusMarkets";

const opt = (id: string, signed_rank: number | null): FocusMarketOption => ({
  market_definition_id: id, journey_key: `j-${id}`, job_executor: id, jtbd: null, relationship_kind: null,
  market_register: null, validation_state: null, needs: 0, job_steps: 0, outcomes: 0, evidence: 0, signed_rank,
});

describe("F-1 focus markets", () => {
  it("rank and domain round-trip, two digits, 1..20", () => {
    expect(focusDomain(1)).toBe("focus_market_01");
    expect(focusDomain(12)).toBe("focus_market_12");
    expect(focusRank("focus_market_07")).toBe(7);
    expect(focusRank("job_step_set")).toBeNull();
    expect(focusRank("focus_market_7")).toBeNull();
    expect(() => focusDomain(0)).toThrow();
    expect(() => focusDomain(21)).toThrow();
  });
  it("the signed set is read in rank order; unsigned markets are not in it", () => {
    expect(signedFromOptions([opt("a", null), opt("b", 2), opt("c", 1)]).map((o) => o.market_definition_id)).toEqual(["c", "b"]);
  });
  it("reordering swaps neighbours and ignores out-of-range moves", () => {
    expect(moveInOrder(["a", "b", "c"], "b", -1)).toEqual(["b", "a", "c"]);
    expect(moveInOrder(["a", "b", "c"], "c", 1)).toEqual(["a", "b", "c"]);
    expect(moveInOrder(["a", "b"], "z", 1)).toEqual(["a", "b"]);
  });
  it("the admin-only strings are the signed drafts (decision 8)", () => {
    expect(FOCUS_STRINGS.title).toBe("Focus market");
    expect(FOCUS_STRINGS.proposedFrom(12)).toBe("Proposed by the system from 12 pieces of evidence");
    expect(FOCUS_STRINGS.ranUnfocused).toBe("Ran unfocused");
    expect(FOCUS_STRINGS.otherParty(3)).toBe("3 findings were about another party and were not queued");
  });
  it("F-2: a proposal puts forward its ranked markets that have any evidence, in order", () => {
    expect(proposedIds({ id: "p", evidence_total: 9, ranking: [
      { market_definition_id: "a", journey_key: "a", job_executor: null, evidence: 8 },
      { market_definition_id: "b", journey_key: "b", job_executor: null, evidence: 1 },
      { market_definition_id: "c", journey_key: "c", job_executor: null, evidence: 0 },
    ] })).toEqual(["a", "b"]);
    expect(proposedIds(null)).toEqual([]);
  });
});

describe("F-3 focusRunLine", () => {
  it("an unfocused run says so; a focused one names its markets in rank order", async () => {
    const { focusRunLine } = await import("./focusMarkets");
    expect(focusRunLine(null)).toBe("Ran unfocused");
    expect(focusRunLine([])).toBe("Ran unfocused");
    expect(focusRunLine([{ job_executor: "Individual donors", journey_key: "d" }, { job_executor: "", journey_key: "customer" }])).toBe("Focus market: Individual donors · customer");
  });
});

describe("F-4 otherPartyLine", () => {
  it("says how many findings were about another party; says nothing at zero or unfocused", async () => {
    const { otherPartyLine } = await import("./focusMarkets");
    expect(otherPartyLine(3)).toBe("3 findings were about another party and were not queued");
    expect(otherPartyLine(0)).toBeNull();
    expect(otherPartyLine(null)).toBeNull();
  });
});
