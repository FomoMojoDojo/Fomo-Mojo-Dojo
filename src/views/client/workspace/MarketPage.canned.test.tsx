// SP-300 (S-MKT-1): the Market page never shows the canned jtbdFromJourneyTitle sentence as if it were a
// finding. It rests on no evidence (SP-F46 — 9 of 27 companies rendered it). Both branches are asserted,
// so the check cannot pass by always hiding the band or by always showing the sentence.
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const CANNED =
  "When trying to complete this job, every member of the household want to move from defining outcomes to executing and monitoring progress, so they can achieve the intended result with less risk and rework.";
const REAL = "When choosing and managing a coffee partner, cafe owners want to secure consistent quality.";
const state: { jtbd: string | null } = { jtbd: CANNED };

vi.mock("@/hooks/useCompany", () => ({ useCompany: () => ({ activeCompany: { id: "co", name: "Test Co" } }) }));
vi.mock("./viewedSet", () => ({ useViewedSet: () => ({ loading: false, viewedKey: "customer" }) }));
vi.mock("@/hooks/useOdiNeeds", () => ({
  useOdiNeeds: () => ({ loading: false, needs: [], marketDefinition: { job_executor: "Test executor", jtbd: state.jtbd } }),
}));

import MarketPage from "./MarketPage";
import { WORKSPACE_STRINGS } from "./workspaceNav";

const mount = () => render(<MemoryRouter><MarketPage /></MemoryRouter>);

describe("S-MKT-1 replaces the canned hiring-for sentence (SP-300)", () => {
  it("the canned default-branch sentence is NOT rendered; S-MKT-1 is, under the same label", () => {
    state.jtbd = CANNED;
    const { container } = mount();
    expect(container.textContent).not.toContain("move from defining outcomes");
    expect(screen.getByTestId("market-hiring-for-unknown").textContent).toBe(WORKSPACE_STRINGS.marketNotEnoughEvidence);
    expect(container.textContent).toContain(WORKSPACE_STRINGS.whatTheyAreHiringFor);
  });

  it("a real hiring-for statement is still rendered as it is — the check is not a blanket", () => {
    state.jtbd = REAL;
    const { container } = mount();
    expect(container.textContent).toContain("cafe owners want to secure consistent quality");
    expect(screen.queryByTestId("market-hiring-for-unknown")).toBeNull();
  });
});
