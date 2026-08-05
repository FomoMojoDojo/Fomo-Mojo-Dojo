// GATE C-2 — FrontDoorMapAct failure handling. A failed / hung industry-maps read renders the
// signed error instead of "That industry map isn't published yet." (reachable ONLY on a
// successful read that returned no published maps — byte-identical). The FALLBACK selector is
// a genuine no-MATCH affordance on a successful read, not a read failure.
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, act } from "@testing-library/react";

const h = vi.hoisted(() => ({ m: { maps: new Map(), keys: [] as string[], loading: false, error: null as string | null } }));
vi.mock("@/hooks/useCompany", () => ({ useCompany: () => ({ activeCompany: { id: "co-1", industry_key: null } }) }));
vi.mock("@/hooks/useIndustryReferenceMaps", () => ({ useIndustryReferenceMaps: () => h.m }));

import FrontDoorMapAct from "./FrontDoorMapAct";
import { ACT_DATA_ERROR } from "@/components/client-view/story/ActData";

const DEFENSIVE_EMPTY = "That industry map isn't published yet.";

afterEach(() => { vi.useRealTimers(); h.m = { maps: new Map(), keys: [], loading: false, error: null }; });

describe("FrontDoorMapAct — Gate C-2 failure handling", () => {
  it("(a) returning error → signed error; \"That industry map isn't published yet.\" ABSENT", () => {
    h.m = { maps: new Map(), keys: [], loading: false, error: "PostgREST 500" };
    const { container } = render(<FrontDoorMapAct />);
    expect(container.textContent).toContain(ACT_DATA_ERROR);
    expect(container.textContent).not.toContain(DEFENSIVE_EMPTY);
  });
  it("(b) never-returning → error within the 10s deadline; not loading, not empty", async () => {
    vi.useFakeTimers();
    h.m = { maps: new Map(), keys: [], loading: true, error: null };
    const { container } = render(<FrontDoorMapAct />);
    expect(container.textContent).toContain("Loading the standard map");
    await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
    expect(container.textContent).toContain(ACT_DATA_ERROR);
    expect(container.textContent).not.toContain(DEFENSIVE_EMPTY);
  });
  it("(c) successful no-published-maps read → DEFENSIVE_EMPTY byte-identical, no error", () => {
    h.m = { maps: new Map(), keys: [], loading: false, error: null };
    const { container } = render(<FrontDoorMapAct />);
    expect(container.textContent).toContain(DEFENSIVE_EMPTY);
    expect(container.textContent).not.toContain(ACT_DATA_ERROR);
  });
});
