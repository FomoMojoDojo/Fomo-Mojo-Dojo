// GATE C — DiagnoseMarketAct (the act a co-founder hit: hung → "Reading your markets…"
// forever, error → "There's nothing to compare yet."). After migration a failed / hung read
// renders the signed error; NOT_READY is reachable ONLY on a successful read with one side
// genuinely unread (byte-identical).
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, act } from "@testing-library/react";

const h = vi.hoisted(() => ({ pf: { loading: false, error: null as string | null, portfolio: null as unknown } }));
vi.mock("@/hooks/useCompany", () => ({ useCompany: () => ({ activeCompany: { id: "co-1" } }) }));
vi.mock("@/hooks/useMarketPortfolio", () => ({ useMarketPortfolio: () => h.pf }));

import DiagnoseMarketAct from "./DiagnoseMarketAct";
import { ACT_DATA_ERROR } from "../ActData";

const NOT_READY = "There's nothing to compare yet.";
const LOADING = "Reading your markets";

afterEach(() => { vi.useRealTimers(); h.pf = { loading: false, error: null, portfolio: null }; });

describe("DiagnoseMarketAct — Gate C failure handling", () => {
  it("(a) returning error → signed error; \"There's nothing to compare yet.\" ABSENT", () => {
    h.pf = { loading: false, error: "PostgREST 500", portfolio: null };
    const { container } = render(<DiagnoseMarketAct />);
    expect(container.textContent).toContain(ACT_DATA_ERROR);
    expect(container.textContent).not.toContain(NOT_READY);
  });

  it("(b) never-returning → error within the 10s deadline; not loading, not empty", async () => {
    vi.useFakeTimers();
    h.pf = { loading: true, error: null, portfolio: null };
    const { container } = render(<DiagnoseMarketAct />);
    expect(container.textContent).toContain(LOADING);
    await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
    expect(container.textContent).toContain(ACT_DATA_ERROR);
    expect(container.textContent).not.toContain(LOADING);
    expect(container.textContent).not.toContain(NOT_READY);
  });

  it("(c) successful zero-row (one side unread) → NOT_READY byte-identical, no error", () => {
    h.pf = { loading: false, error: null, portfolio: { active: [], deferred: [] } };
    const { container } = render(<DiagnoseMarketAct />);
    expect(container.textContent).toContain(NOT_READY);
    expect(container.textContent).not.toContain(ACT_DATA_ERROR);
  });
});
