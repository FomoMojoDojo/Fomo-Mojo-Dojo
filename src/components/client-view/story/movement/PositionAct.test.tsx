// GATE C — PositionAct. A failed / hung positioning read renders the signed error instead of
// "We haven't read your positioning yet." (reachable ONLY on a successful no-canvas /
// zero-differentiator read — byte-identical).
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, act } from "@testing-library/react";

const h = vi.hoisted(() => ({ c: { loading: false, error: null as string | null, item: null as unknown } }));
vi.mock("@/hooks/useCompany", () => ({ useCompany: () => ({ activeCompany: { id: "co-1" } }) }));
vi.mock("@/hooks/usePositioningCanvas", () => ({ usePositioningCanvas: () => h.c }));

import PositionAct from "./PositionAct";
import { ACT_DATA_ERROR } from "@/components/client-view/story/ActData";

const EMPTY_HEADLINE = "We haven't read your positioning yet.";
const LOADING = "Reading your positioning";

afterEach(() => { vi.useRealTimers(); h.c = { loading: false, error: null, item: null }; });

describe("PositionAct — Gate C failure handling", () => {
  it("(a) returning error → signed error; \"We haven't read your positioning yet.\" ABSENT", () => {
    h.c = { loading: false, error: "PostgREST 500", item: null };
    const { container } = render(<PositionAct />);
    expect(container.textContent).toContain(ACT_DATA_ERROR);
    expect(container.textContent).not.toContain(EMPTY_HEADLINE);
  });

  it("(b) never-returning → error within the 10s deadline; not loading, not empty", async () => {
    vi.useFakeTimers();
    h.c = { loading: true, error: null, item: null };
    const { container } = render(<PositionAct />);
    expect(container.textContent).toContain(LOADING);
    await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
    expect(container.textContent).toContain(ACT_DATA_ERROR);
    expect(container.textContent).not.toContain(EMPTY_HEADLINE);
  });

  it("(c) successful no-canvas read → EMPTY_HEADLINE byte-identical, no error", () => {
    h.c = { loading: false, error: null, item: null };
    const { container } = render(<PositionAct />);
    expect(container.textContent).toContain(EMPTY_HEADLINE);
    expect(container.textContent).not.toContain(ACT_DATA_ERROR);
  });
});
