// GATE C-2 — GapAct. A failed / hung open-questions read renders the signed error instead of
// "The outside read left no open questions for this company." (reachable ONLY on a successful
// zero-question read — byte-identical). useSetAsideIdentities is a secondary read.
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, act } from "@testing-library/react";

const h = vi.hoisted(() => ({ q: { rows: [] as unknown[], questions: [] as string[], loading: false, error: null as string | null } }));
vi.mock("@/hooks/useFirstReadOpenQuestions", () => ({ useFirstReadOpenQuestions: () => h.q }));
vi.mock("@/hooks/useSetAsideIdentities", () => ({ useSetAsideIdentities: () => ({ identities: new Set() }) }));

import GapAct from "./GapAct";
import { ACT_DATA_ERROR } from "./ActData";

const GAP_EMPTY = "The outside read left no open questions for this company.";

afterEach(() => { vi.useRealTimers(); h.q = { rows: [], questions: [], loading: false, error: null }; });

describe("GapAct — Gate C-2 failure handling", () => {
  it("(a) returning error → signed error; \"The outside read left no open questions…\" ABSENT", () => {
    h.q = { rows: [], questions: [], loading: false, error: "PostgREST 500" };
    const { container } = render(<GapAct companyId="co-1" />);
    expect(container.textContent).toContain(ACT_DATA_ERROR);
    expect(container.textContent).not.toContain(GAP_EMPTY);
  });
  it("(b) never-returning → error within the 10s deadline; not empty", async () => {
    vi.useFakeTimers();
    h.q = { rows: [], questions: [], loading: true, error: null };
    const { container } = render(<GapAct companyId="co-1" />);
    expect(container.textContent).not.toContain(GAP_EMPTY);
    await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
    expect(container.textContent).toContain(ACT_DATA_ERROR);
    expect(container.textContent).not.toContain(GAP_EMPTY);
  });
  it("(c) successful zero-question read → GAP_EMPTY byte-identical, no error", () => {
    h.q = { rows: [], questions: [], loading: false, error: null };
    const { container } = render(<GapAct companyId="co-1" />);
    expect(container.textContent).toContain(GAP_EMPTY);
    expect(container.textContent).not.toContain(ACT_DATA_ERROR);
  });
});
