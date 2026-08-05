// GATE C-2 — OutsideHeroAct has TWO independent reads (findings, score) feeding two
// independent sections, each with its own failure string. TWO <ActData> boundaries: a
// findings failure shows the signed error in the hero copy (HERO_EMPTY absent) while the
// score section renders on its own, and vice versa. Each empty is reachable ONLY on a
// successful zero read — byte-identical.
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, act } from "@testing-library/react";

const h = vi.hoisted(() => ({
  score: { score: null as unknown, loading: false, error: null as string | null },
  find: { data: null as unknown, isLoading: false, error: null as string | null },
}));
vi.mock("@/hooks/useCompany", () => ({ useCompany: () => ({ activeCompany: { id: "co-1" } }) }));
vi.mock("@/hooks/useMojoScore", () => ({ useMojoScore: () => h.score }));
vi.mock("@/hooks/useStandingFindings", async (orig) => {
  const actual = (await orig()) as Record<string, unknown>;
  return { ...actual, useStandingFindings: () => h.find };
});

import OutsideHeroAct from "./OutsideHeroAct";
import { ACT_DATA_ERROR } from "./ActData";

const HERO_EMPTY = "The outside read hasn't surfaced a lead finding for this company yet.";
const SCORE_EMPTY = "No score has been computed yet.";

afterEach(() => {
  vi.useRealTimers();
  h.score = { score: null, loading: false, error: null };
  h.find = { data: null, isLoading: false, error: null };
});

describe("OutsideHeroAct — Gate C-2 two-boundary failure handling", () => {
  it("(a) findings error → signed error in hero copy; HERO_EMPTY absent; score section still renders its own state", () => {
    h.find = { data: null, isLoading: false, error: "PostgREST 500" };
    h.score = { score: null, loading: false, error: null }; // score genuinely empty
    const { container } = render(<OutsideHeroAct />);
    expect(container.textContent).toContain(ACT_DATA_ERROR);
    expect(container.textContent).not.toContain(HERO_EMPTY);
    expect(container.textContent).toContain(SCORE_EMPTY); // score section independent, genuine empty
  });

  it("(a) score error → signed error in score card; SCORE_EMPTY absent; findings section renders its own state", () => {
    h.score = { score: null, loading: false, error: "PostgREST 500" };
    h.find = { data: { findings: [], primaryId: null, companyDomain: null }, isLoading: false, error: null };
    const { container } = render(<OutsideHeroAct />);
    expect(container.textContent).toContain(ACT_DATA_ERROR);
    expect(container.textContent).not.toContain(SCORE_EMPTY);
    expect(container.textContent).toContain(HERO_EMPTY); // findings section independent, genuine empty
  });

  it("(b) findings never-returning → error within the 10s deadline; HERO_EMPTY absent", async () => {
    vi.useFakeTimers();
    h.find = { data: null, isLoading: true, error: null };
    const { container } = render(<OutsideHeroAct />);
    expect(container.textContent).toContain("Reading the outside signals");
    await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
    expect(container.textContent).toContain(ACT_DATA_ERROR);
    expect(container.textContent).not.toContain(HERO_EMPTY);
  });

  it("(c) both successful zero-row → HERO_EMPTY + SCORE_EMPTY byte-identical, no error", () => {
    h.find = { data: { findings: [], primaryId: null, companyDomain: null }, isLoading: false, error: null };
    h.score = { score: null, loading: false, error: null };
    const { container } = render(<OutsideHeroAct />);
    expect(container.textContent).toContain(HERO_EMPTY);
    expect(container.textContent).toContain(SCORE_EMPTY);
    expect(container.textContent).not.toContain(ACT_DATA_ERROR);
  });
});
