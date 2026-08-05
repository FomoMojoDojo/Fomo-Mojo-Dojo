// GATE C-2 — StatedProblemAct. A failed / hung read renders the signed error instead of
// "We couldn't find a problem stated on this company's own public site yet." (reachable ONLY
// on a successful read with no declared brief and no signed fallback — byte-identical).
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, act } from "@testing-library/react";

const h = vi.hoisted(() => ({ s: { data: null as unknown, loading: false, error: null as string | null } }));
vi.mock("@/hooks/useFirstReadStatedProblem", () => ({ useFirstReadStatedProblem: () => h.s }));

import StatedProblemAct from "./StatedProblemAct";
import { ACT_DATA_ERROR } from "./ActData";

const HONEST_EMPTY = "We couldn't find a problem stated on this company's own public site yet.";

afterEach(() => { vi.useRealTimers(); h.s = { data: null, loading: false, error: null }; });

describe("StatedProblemAct — Gate C-2 failure handling", () => {
  it("(a) returning error → signed error; the honest-empty line ABSENT", () => {
    h.s = { data: null, loading: false, error: "PostgREST 500" };
    const { container } = render(<StatedProblemAct />);
    expect(container.textContent).toContain(ACT_DATA_ERROR);
    expect(container.textContent).not.toContain(HONEST_EMPTY);
  });
  it("(b) never-returning → error within the 10s deadline; not loading, not empty", async () => {
    vi.useFakeTimers();
    h.s = { data: null, loading: true, error: null };
    const { container } = render(<StatedProblemAct />);
    expect(container.textContent).toContain("Loading");
    await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
    expect(container.textContent).toContain(ACT_DATA_ERROR);
    expect(container.textContent).not.toContain(HONEST_EMPTY);
  });
  it("(c) successful no-problem read → honest-empty byte-identical, no error", () => {
    h.s = { data: null, loading: false, error: null };
    const { container } = render(<StatedProblemAct />);
    expect(container.textContent).toContain(HONEST_EMPTY);
    expect(container.textContent).not.toContain(ACT_DATA_ERROR);
  });
});
