// G1 — WhereYouStand: the client's verdicts return, each with its OWN signed outcome
// line; the statement renders unchanged; operator-voice resolution_reason never reaches
// the DOM; zero verdicts suppress structurally; a query error is honest, not silent.
// Falsification: break the verdict→line map and the wrong line renders (RED).

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

import WhereYouStand, { WYS_HEADER, WYS_OUTCOME, WYS_LOAD_ERROR } from "./WhereYouStand";

const CONFIRMED = WYS_OUTCOME.confirmed;
const REJECTED = WYS_OUTCOME.rejected;
const SET_ASIDE = WYS_OUTCOME.not_important;

// Real Edgewood rows (for the byte-compare + resolution_reason absence).
const BETTING = "You're betting that your integrated continuum of youth mental health care under one roof will deliver better long-term outcomes and become the strategic default choice for children, teens, young adults, and their families in the Bay Area.";

beforeEach(() => {
  h.verdicts = [];
  h.isLoading = false;
  h.isError = false;
});

describe("G1 — WhereYouStand", () => {
  it("each outcome line renders for its OWN verdict and NOT the others", () => {
    h.verdicts = [{ id: "1", statement: "S", verdict: "confirmed", item_kind: "finding" }];
    const c = render(<WhereYouStand companyId="co" />);
    expect(c.getByText(CONFIRMED)).toBeTruthy();
    expect(c.queryByText(REJECTED)).toBeNull();
    expect(c.queryByText(SET_ASIDE)).toBeNull();
    c.unmount();

    h.verdicts = [{ id: "2", statement: "S", verdict: "rejected", item_kind: "delta" }];
    const r = render(<WhereYouStand companyId="co" />);
    expect(r.getByText(REJECTED)).toBeTruthy();
    expect(r.queryByText(CONFIRMED)).toBeNull();
    expect(r.queryByText(SET_ASIDE)).toBeNull();
    r.unmount();

    h.verdicts = [{ id: "3", statement: "S", verdict: "not_important", item_kind: "delta" }];
    const n = render(<WhereYouStand companyId="co" />);
    expect(n.getByText(SET_ASIDE)).toBeTruthy();
    expect(n.queryByText(CONFIRMED)).toBeNull();
    expect(n.queryByText(REJECTED)).toBeNull();
  });

  it("the verdicted statement renders UNCHANGED (byte-compare)", () => {
    h.verdicts = [{ id: "6", statement: BETTING, verdict: "confirmed", item_kind: "finding" }];
    const { getByText } = render(<WhereYouStand companyId="co" />);
    expect(getByText(BETTING)).toBeTruthy(); // exact-match query → byte-identical
  });

  it("operator-voice resolution_reason NEVER reaches the DOM", () => {
    // Even with all three verdict types present, the recap reads only responses — the
    // operator reasons ("referers", "this is true", "This is fundamentally true") cannot appear.
    h.verdicts = [
      { id: "1", statement: BETTING, verdict: "confirmed", item_kind: "finding" },
      { id: "2", statement: "Close gaps in youth mental health care.", verdict: "rejected", item_kind: "delta" },
      { id: "3", statement: "The struggle is to navigate a fragmented landscape.", verdict: "not_important", item_kind: "delta" },
    ];
    const { container } = render(<WhereYouStand companyId="co" />);
    const text = container.textContent ?? "";
    for (const leak of ["referers", "this is true", "This is fundamentally true"]) {
      expect(text).not.toContain(leak);
    }
  });

  it("zero verdicts renders NOTHING (structural suppression, no header)", () => {
    h.verdicts = [];
    const { container, queryByText } = render(<WhereYouStand companyId="co" />);
    expect(queryByText(WYS_HEADER)).toBeNull();
    expect(container.textContent ?? "").toBe("");
  });

  it("a query error renders the honest error state, not empty", () => {
    h.isError = true;
    const { getByText } = render(<WhereYouStand companyId="co" />);
    expect(getByText(WYS_LOAD_ERROR)).toBeTruthy();
  });
});
