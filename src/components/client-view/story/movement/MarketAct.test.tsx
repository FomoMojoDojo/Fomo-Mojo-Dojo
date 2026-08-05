// GATE C — MarketAct. A failed / hung PORTFOLIO read renders the signed error instead of
// "We haven't read your public markets yet." (reachable ONLY on a successful zero-market
// read — byte-identical). The options path is a secondary read (see gate notes).
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, act } from "@testing-library/react";

const h = vi.hoisted(() => ({
  pf: { loading: false, error: null as string | null, portfolio: null as unknown, hasInternalDeclared: false },
  opt: { loading: false, options: [] as unknown[] },
}));
vi.mock("@/hooks/useCompany", () => ({ useCompany: () => ({ activeCompany: { id: "co-1" } }) }));
vi.mock("@/hooks/useMarketPortfolio", () => ({ useMarketPortfolio: () => h.pf }));
vi.mock("@/hooks/useMarketOptions", () => ({ useMarketOptions: () => h.opt }));

import MarketAct from "./MarketAct";
import { ACT_DATA_ERROR } from "@/components/client-view/story/ActData";

const EMPTY_HEADLINE = "We haven't read your public markets yet.";
const LOADING = "Reading the public markets";

afterEach(() => {
  vi.useRealTimers();
  h.pf = { loading: false, error: null, portfolio: null, hasInternalDeclared: false };
  h.opt = { loading: false, options: [] };
});

describe("MarketAct — Gate C failure handling", () => {
  it("(a) portfolio error → signed error; \"We haven't read your public markets yet.\" ABSENT", () => {
    h.pf = { loading: false, error: "PostgREST 500", portfolio: null, hasInternalDeclared: false };
    const { container } = render(<MarketAct />);
    expect(container.textContent).toContain(ACT_DATA_ERROR);
    expect(container.textContent).not.toContain(EMPTY_HEADLINE);
  });

  it("(b) never-returning portfolio → error within the 10s deadline; not loading, not empty", async () => {
    vi.useFakeTimers();
    h.pf = { loading: true, error: null, portfolio: null, hasInternalDeclared: false };
    const { container } = render(<MarketAct />);
    expect(container.textContent).toContain(LOADING);
    await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
    expect(container.textContent).toContain(ACT_DATA_ERROR);
    expect(container.textContent).not.toContain(EMPTY_HEADLINE);
  });

  it("(c) successful zero-market read → EMPTY_HEADLINE byte-identical, no error", () => {
    h.pf = { loading: false, error: null, portfolio: { active: [], deferred: [] }, hasInternalDeclared: false };
    const { container } = render(<MarketAct />);
    expect(container.textContent).toContain(EMPTY_HEADLINE);
    expect(container.textContent).not.toContain(ACT_DATA_ERROR);
  });
});
