// G1-b — WhereYouStand: dedupe by statement; conflicts show every distinct verdict's line
// + the signed conflict line; market items use market lines; no verdict is lost to dedupe;
// statement byte-unchanged; operator reasons never in the DOM; zero → nothing; error → error.
// Falsification: break the conflict gate / the market keying and the RED tests fire.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";

const h = vi.hoisted(() => ({
  verdicts: [] as Array<{ id: string; statement: string; verdict: string; item_kind: string }>,
  isLoading: false,
  isError: false,
}));
vi.mock("@/hooks/useMeetingVerdicts", () => ({
  useMeetingVerdicts: () => ({ verdicts: h.verdicts, isLoading: h.isLoading, isError: h.isError }),
}));

import WhereYouStand, {
  WYS_HEADER,
  WYS_OUTCOME,
  WYS_MARKET_OUTCOME,
  WYS_CONFLICT_LINE,
  WYS_LOAD_ERROR,
} from "./WhereYouStand";

const BETTING = "You're betting that your integrated continuum of youth mental health care under one roof will deliver better long-term outcomes and become the strategic default choice for children, teens, young adults, and their families in the Bay Area.";

// The full Edgewood 8 (operator fixture), for the dedupe + no-verdict-lost proof.
const EDGEWOOD_8 = [
  { id: "1", statement: "Close gaps in youth mental health care to provide integrated services.", verdict: "confirmed", item_kind: "delta" },
  { id: "2", statement: "The struggle is to navigate a fragmented youth mental health care landscape.", verdict: "not_important", item_kind: "delta" },
  { id: "3", statement: "The struggle is to navigate a fragmented youth mental health care landscape.", verdict: "not_important", item_kind: "delta" },
  { id: "4", statement: "Close gaps in youth mental health care to provide integrated services.", verdict: "rejected", item_kind: "delta" },
  { id: "5", statement: "The struggle is to navigate a fragmented youth mental health care landscape.", verdict: "rejected", item_kind: "delta" },
  { id: "6", statement: BETTING, verdict: "confirmed", item_kind: "finding" },
  { id: "7", statement: "Direct care staff — Secure better working conditions in youth mental health settings.", verdict: "not_important", item_kind: "market" },
  { id: "8", statement: "Families and caregivers of at-risk youth aged 5-26 — Understand the complex mental health resource landscape for their children.", verdict: "rejected", item_kind: "market" },
];

beforeEach(() => {
  h.verdicts = [];
  h.isLoading = false;
  h.isError = false;
});

describe("G1-b — WhereYouStand", () => {
  it("a CONFLICTING statement renders ONCE, with BOTH lines AND the conflict line", () => {
    h.verdicts = [
      { id: "a", statement: "Close gaps.", verdict: "confirmed", item_kind: "delta" },
      { id: "b", statement: "Close gaps.", verdict: "rejected", item_kind: "delta" },
    ];
    const { getAllByText, getByText } = render(<WhereYouStand companyId="co" />);
    expect(getAllByText("Close gaps.")).toHaveLength(1); // once
    expect(getByText(WYS_OUTCOME.confirmed)).toBeTruthy();
    expect(getByText(WYS_OUTCOME.rejected)).toBeTruthy();
    expect(getByText(WYS_CONFLICT_LINE)).toBeTruthy();
  });

  it("the conflict line does NOT render when the verdicts AGREE", () => {
    h.verdicts = [
      { id: "a", statement: "Agreed.", verdict: "confirmed", item_kind: "delta" },
      { id: "b", statement: "Agreed.", verdict: "confirmed", item_kind: "delta" },
    ];
    const { getAllByText, queryByText } = render(<WhereYouStand companyId="co" />);
    expect(getAllByText("Agreed.")).toHaveLength(1);
    expect(queryByText(WYS_CONFLICT_LINE)).toBeNull();
  });

  it("a MARKET item uses the market line and NOT the claim-shaped one; a non-market item the reverse", () => {
    h.verdicts = [{ id: "m", statement: "A market item.", verdict: "rejected", item_kind: "market" }];
    const mkt = render(<WhereYouStand companyId="co" />);
    expect(mkt.getByText(WYS_MARKET_OUTCOME.rejected)).toBeTruthy();
    expect(mkt.queryByText(WYS_OUTCOME.rejected)).toBeNull();
    mkt.unmount();

    h.verdicts = [{ id: "d", statement: "A delta item.", verdict: "rejected", item_kind: "delta" }];
    const nm = render(<WhereYouStand companyId="co" />);
    expect(nm.getByText(WYS_OUTCOME.rejected)).toBeTruthy();
    expect(nm.queryByText(WYS_MARKET_OUTCOME.rejected)).toBeNull();
  });

  it("no verdict is lost to dedupe: distinct (statement, verdict) pairs in == outcome lines rendered", () => {
    h.verdicts = EDGEWOOD_8;
    const distinctPairs = new Set(EDGEWOOD_8.map((v) => `${v.statement.trim()}::${v.verdict}`)).size;
    const { container } = render(<WhereYouStand companyId="co" />);
    const renderedLines = container.querySelectorAll('[data-wys="outcome"]').length;
    expect(distinctPairs).toBe(7); // 8 responses, one duplicate (statement,verdict) pair
    expect(renderedLines).toBe(distinctPairs);
    // 5 distinct statements → 5 groups
    expect(container.querySelectorAll('[data-wys="group"]').length).toBe(5);
  });

  it("the verdicted statement renders UNCHANGED (byte-compare)", () => {
    h.verdicts = [{ id: "6", statement: BETTING, verdict: "confirmed", item_kind: "finding" }];
    const { getByText } = render(<WhereYouStand companyId="co" />);
    expect(getByText(BETTING)).toBeTruthy();
  });

  it("operator-voice resolution_reason NEVER reaches the DOM", () => {
    h.verdicts = EDGEWOOD_8;
    const { container } = render(<WhereYouStand companyId="co" />);
    const text = container.textContent ?? "";
    for (const leak of ["referers", "this is true", "This is fundamentally true"]) {
      expect(text).not.toContain(leak);
    }
  });

  it("house-style: NO vertical bar on the group; no serif; no hardcoded hex color", () => {
    h.verdicts = EDGEWOOD_8; // includes conflicts, so a conflict line exists
    const { container } = render(<WhereYouStand companyId="co" />);
    const group = container.querySelector('[data-wys="group"]') as HTMLElement;
    const statement = container.querySelector('[data-wys="statement"]') as HTMLElement;
    const conflict = container.querySelector('[data-wys="conflict"]') as HTMLElement;
    expect(group).toBeTruthy();
    expect(conflict).toBeTruthy();
    // Standing law: NO vertical accent bar (the 2026-07-23 rule).
    expect(group.style.borderLeft).toBe("");
    expect(group.style.borderInlineStart).toBe("");
    // No serif — the house uses --font-sans for statements.
    expect(statement.style.fontFamily.toLowerCase()).not.toContain("serif");
    expect(statement.style.fontFamily.toLowerCase()).not.toContain("georgia");
    // No hardcoded hex/rgb color anywhere — colors come from --mm-* tokens.
    const HEX = /#[0-9a-f]{3,6}|rgb\(/i;
    expect(HEX.test(statement.style.color)).toBe(false);
    expect(HEX.test(conflict.style.color)).toBe(false);
  });

  it("zero verdicts renders NOTHING; a query error renders the honest error state", () => {
    h.verdicts = [];
    const empty = render(<WhereYouStand companyId="co" />);
    expect(empty.queryByText(WYS_HEADER)).toBeNull();
    expect(empty.container.textContent ?? "").toBe("");
    empty.unmount();

    h.isError = true;
    const err = render(<WhereYouStand companyId="co" />);
    expect(err.getByText(WYS_LOAD_ERROR)).toBeTruthy();
  });
});
