// GATE C-2 — OutsideFindingsAct. A failed / hung standing-findings read renders the signed
// error instead of "Nothing else is standing out from the outside read yet." (reachable ONLY
// on a successful zero-finding read — byte-identical).
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, act } from "@testing-library/react";

const h = vi.hoisted(() => ({ f: { data: null as unknown, isLoading: false, error: null as string | null } }));
vi.mock("@/hooks/useCompany", () => ({ useCompany: () => ({ activeCompany: { id: "co-1" } }) }));
vi.mock("@/hooks/useStandingFindings", async (orig) => {
  const actual = (await orig()) as Record<string, unknown>;
  return { ...actual, useStandingFindings: () => h.f };
});

import OutsideFindingsAct from "./OutsideFindingsAct";
import { ACT_DATA_ERROR } from "./ActData";

const EMPTY = "Nothing else is standing out from the outside read yet.";
const LOADING = "Reading the outside signals";

afterEach(() => { vi.useRealTimers(); h.f = { data: null, isLoading: false, error: null }; });

describe("OutsideFindingsAct — Gate C-2 failure handling", () => {
  it("(a) returning error → signed error; \"Nothing else is standing out…\" ABSENT", () => {
    h.f = { data: null, isLoading: false, error: "PostgREST 500" };
    const { container } = render(<OutsideFindingsAct />);
    expect(container.textContent).toContain(ACT_DATA_ERROR);
    expect(container.textContent).not.toContain(EMPTY);
  });
  it("(b) never-returning → error within the 10s deadline; not loading, not empty", async () => {
    vi.useFakeTimers();
    h.f = { data: null, isLoading: true, error: null };
    const { container } = render(<OutsideFindingsAct />);
    expect(container.textContent).toContain(LOADING);
    await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
    expect(container.textContent).toContain(ACT_DATA_ERROR);
    expect(container.textContent).not.toContain(EMPTY);
  });
  it("(c) successful zero-finding read → EMPTY byte-identical, no error", () => {
    h.f = { data: { findings: [], primaryId: null, companyDomain: null }, isLoading: false, error: null };
    const { container } = render(<OutsideFindingsAct />);
    expect(container.textContent).toContain(EMPTY);
    expect(container.textContent).not.toContain(ACT_DATA_ERROR);
  });
});
