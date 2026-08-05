// GATE C-2 — OutsideQuestionAct. This act renders NO false-absence string: on a genuine empty
// it COLLAPSES to nothing (signed design ruling). The migration only surfaces a FAILED / hung
// read as the signed error (previously it collapsed SILENTLY). Genuine empty still collapses.
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, act } from "@testing-library/react";

const h = vi.hoisted(() => ({ q: { rows: [] as unknown[], questions: [] as string[], loading: false, error: null as string | null } }));
vi.mock("@/hooks/useFirstReadOpenQuestions", () => ({ useFirstReadOpenQuestions: () => h.q }));

import OutsideQuestionAct from "./OutsideQuestionAct";
import { ACT_DATA_ERROR } from "./ActData";

afterEach(() => { vi.useRealTimers(); h.q = { rows: [], questions: [], loading: false, error: null }; });

describe("OutsideQuestionAct — Gate C-2 failure handling", () => {
  it("(a) returning error → signed error (previously collapsed silently)", () => {
    h.q = { rows: [], questions: [], loading: false, error: "PostgREST 500" };
    const { container } = render(<OutsideQuestionAct companyId="co-1" />);
    expect(container.textContent).toContain(ACT_DATA_ERROR);
  });
  it("(b) never-returning → error within the 10s deadline (previously collapsed forever)", async () => {
    vi.useFakeTimers();
    h.q = { rows: [], questions: [], loading: true, error: null };
    const { container } = render(<OutsideQuestionAct companyId="co-1" />);
    expect(container.textContent).not.toContain(ACT_DATA_ERROR); // collapsed while loading
    await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
    expect(container.textContent).toContain(ACT_DATA_ERROR);
  });
  it("(c) successful zero-question read → collapses to nothing (byte-identical), no error", () => {
    h.q = { rows: [], questions: [], loading: false, error: null };
    const { container } = render(<OutsideQuestionAct companyId="co-1" />);
    expect(container.textContent).toBe("");
    expect(container.textContent).not.toContain(ACT_DATA_ERROR);
  });
  it("successful with a question → renders it, no error", () => {
    h.q = { rows: [{ question_text: "Which segment do you defend first?" }], questions: ["Which segment do you defend first?"], loading: false, error: null };
    const { container } = render(<OutsideQuestionAct companyId="co-1" />);
    expect(container.textContent).toContain("Which segment do you defend first?");
    expect(container.textContent).not.toContain(ACT_DATA_ERROR);
  });
});
