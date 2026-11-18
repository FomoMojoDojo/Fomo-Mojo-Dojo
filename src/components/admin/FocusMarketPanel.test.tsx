// F-1: the panel offers EVERY live market (decision 3), writes nothing on open, and signs the ordered set
// through the one write path.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, fireEvent, waitFor } from "@testing-library/react";
import FocusMarketPanel from "./FocusMarketPanel";

const rpc = vi.hoisted(() => vi.fn());
const pending = vi.hoisted(() => ({ row: null as null | { id: string; proposed_state: unknown } }));
vi.mock("@/integrations/supabase/client", () => {
  const chain: Record<string, unknown> = {};
  for (const m of ["select", "eq", "order", "limit"]) chain[m] = () => chain;
  chain.maybeSingle = async () => ({ data: pending.row, error: null });
  return { supabase: { rpc, from: () => chain } };
});

const OPTIONS = [
  { market_definition_id: "m-donors", journey_key: "pmk-donors", job_executor: "Individual donors", jtbd: null, relationship_kind: "funder", market_register: "public_inferred", validation_state: "unvalidated", needs: 0, job_steps: 8, outcomes: 0, evidence: 8, signed_rank: null },
  { market_definition_id: "m-families", journey_key: "customer", job_executor: "Families", jtbd: null, relationship_kind: null, market_register: "internal_inferred", validation_state: "unvalidated", needs: 31, job_steps: 8, outcomes: 0, evidence: 39, signed_rank: null },
  { market_definition_id: "m-schools", journey_key: "mkt-schools", job_executor: "Schools", jtbd: null, relationship_kind: "partner", market_register: "internal_inferred", validation_state: "unvalidated", needs: 0, job_steps: 0, outcomes: 0, evidence: 0, signed_rank: null },
];

beforeEach(() => {
  pending.row = null;
  rpc.mockReset();
  rpc.mockImplementation(async (name: string) => (name === "focus_market_options" ? { data: OPTIONS, error: null } : { data: [], error: null }));
});

describe("F-1 FocusMarketPanel", () => {
  it("offers every live market, including those with no evidence, and writes nothing on open", async () => {
    const { container } = render(<FocusMarketPanel companyId="co" />);
    await waitFor(() => expect(container.querySelectorAll("[data-testid=focus-market-option]").length).toBe(3));
    expect(rpc.mock.calls.map((c) => c[0])).toEqual(["focus_market_options"]);
    expect((container.querySelector("[data-testid=focus-market-sign]") as HTMLButtonElement).disabled).toBe(true);
  });

  it("signs MORE THAN ONE market, in the order chosen", async () => {
    const { container, getByLabelText } = render(<FocusMarketPanel companyId="co" />);
    await waitFor(() => expect(container.querySelectorAll("[data-testid=focus-market-option]").length).toBe(3));
    fireEvent.click(getByLabelText("Families"));
    fireEvent.click(getByLabelText("Individual donors"));
    // donors first (decision 2): move it up
    fireEvent.click(container.querySelectorAll("[data-testid=focus-market-order] button[aria-label=up]")[1]);
    fireEvent.click(container.querySelector("[data-testid=focus-market-sign]")!);
    await waitFor(() => expect(rpc).toHaveBeenCalledWith("sign_focus_markets", { p_company_id: "co", p_market_ids: ["m-donors", "m-families"] }));
  });

  it("F-2: with nothing signed, the system's proposal is the starting order and says how much evidence it rests on", async () => {
    pending.row = { id: "p1", proposed_state: { evidence_total: 47, ranking: [
      { market_definition_id: "m-families", journey_key: "customer", job_executor: "Families", evidence: 39 },
      { market_definition_id: "m-donors", journey_key: "pmk-donors", job_executor: "Individual donors", evidence: 8 },
      { market_definition_id: "m-schools", journey_key: "mkt-schools", job_executor: "Schools", evidence: 0 },
    ] } };
    const { container } = render(<FocusMarketPanel companyId="co" />);
    await waitFor(() => expect(container.querySelector("[data-testid=focus-market-proposed]")?.textContent).toBe("Proposed by the system from 47 pieces of evidence"));
    expect(Array.from(container.querySelectorAll("[data-testid=focus-market-order] li")).map((li) => li.textContent)).toEqual([
      expect.stringContaining("Families"), expect.stringContaining("Individual donors"),
    ]);
    // nothing is signed until the operator presses Sign
    expect(rpc.mock.calls.map((c) => c[0])).toEqual(["focus_market_options"]);
    fireEvent.click(container.querySelector("[data-testid=focus-market-sign]")!);
    await waitFor(() => expect(rpc).toHaveBeenCalledWith("sign_focus_markets", { p_company_id: "co", p_market_ids: ["m-families", "m-donors"] }));
  });

  it("F-2: Propose asks the system, through its one function", async () => {
    const { container } = render(<FocusMarketPanel companyId="co" />);
    await waitFor(() => expect(container.querySelectorAll("[data-testid=focus-market-option]").length).toBe(3));
    fireEvent.click(container.querySelector("[data-testid=focus-market-propose]")!);
    await waitFor(() => expect(rpc).toHaveBeenCalledWith("propose_focus_markets", { p_company_id: "co" }));
  });
});
