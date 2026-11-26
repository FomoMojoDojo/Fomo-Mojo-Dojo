// GATE C-2 — OutsideHeroAct has TWO independent reads (findings, score) feeding two
// independent sections, each with its own failure string. TWO <ActData> boundaries: a
// findings failure shows the signed error in the hero copy (HERO_EMPTY absent) while the
// score section renders on its own, and vice versa. Each empty is reachable ONLY on a
// successful zero read — byte-identical.
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, act } from "@testing-library/react";

const h = vi.hoisted(() => ({
  outside: { state: null as "scored" | "ineligible" | null, settled: true, loading: false, error: null as string | null },
  score: { score: null as unknown, loading: false, error: null as string | null },
  find: { data: null as unknown, isLoading: false, error: null as string | null },
}));
vi.mock("@/hooks/useCompany", () => ({ useCompany: () => ({ activeCompany: { id: "co-1" } }) }));
vi.mock("@/hooks/useMojoScore", () => ({ useMojoScore: () => h.score }));
vi.mock("@/hooks/useOutsideScoreState", () => ({ useOutsideScoreState: () => h.outside }));
vi.mock("@/hooks/useStandingFindings", async (orig) => {
  const actual = (await orig()) as Record<string, unknown>;
  return { ...actual, useStandingFindings: () => h.find };
});

import OutsideHeroAct from "./OutsideHeroAct";
import { ACT_DATA_ERROR } from "./ActData";
import { NOT_ENOUGH_SIGNAL_NOTE, NO_SCORE_NOTE, outsideScoreEmptyNote } from "@/views/client/firstReadPreview/signedNotes";

const HERO_EMPTY = "The outside read hasn't surfaced a lead finding for this company yet.";
// SP-686 ruling 4: with no record from the scorer, the card's empty line is the First Read's signed
// "No score snapshot yet." — by key, not a string of the card's own.
const SCORE_EMPTY = NO_SCORE_NOTE;
// The card's copy that SP-686 / SP-688 retired. None of it may appear in any state.
const RETIRED = ["No score has been computed yet.", "It appears once the first analysis runs.", "every lens added moves it"];

afterEach(() => {
  vi.useRealTimers();
  h.score = { score: null, loading: false, error: null };
  h.find = { data: null, isLoading: false, error: null };
  h.outside = { state: null, settled: true, loading: false, error: null };
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

// ── SP-686 rulings 4 and 5, SP-688 (2026-11-25): the card says nothing false ─────────────────────
describe("OutsideHeroAct — the score card's copy is existing signed strings, true of the score it reads", () => {
  const found = { findings: [], primaryId: null, companyDomain: null };
  const card = (c: HTMLElement) => c.querySelector(".cvs-score-card")!;

  it("with a score: the label, the number, the one caveat — and the retired caveat is gone", () => {
    h.find = { data: found, isLoading: false, error: null };
    h.score = { score: { total_score: 12 }, loading: false, error: null };
    h.outside = { state: "scored", settled: true, loading: false, error: null };
    const { container } = render(<OutsideHeroAct />);
    const lines = [...card(container).querySelectorAll(".cvs-score-line")].map((n) => n.textContent);
    expect(lines).toEqual(["This is an early likelihood read, not a settled answer."]);
    expect(card(container).querySelector(".cvs-score-label")!.textContent).toBe("Mojo Score");
    expect(card(container).querySelector(".cvs-score-num")!.textContent).toBe("12");
    for (const gone of RETIRED) expect(container.textContent).not.toContain(gone);
    expect(container.textContent).not.toContain(NO_SCORE_NOTE);
    expect(container.textContent).not.toContain(NOT_ENOUGH_SIGNAL_NOTE);
  });

  it("no score, scored and found NOT ELIGIBLE: the First Read's \"Not enough public signal to score yet.\"", () => {
    h.find = { data: found, isLoading: false, error: null };
    h.outside = { state: "ineligible", settled: true, loading: false, error: null };
    const { container, getByTestId } = render(<OutsideHeroAct />);
    expect(getByTestId("score-card-empty").textContent).toBe("Not enough public signal to score yet.");
    expect(getByTestId("score-card-empty").textContent).toBe(NOT_ENOUGH_SIGNAL_NOTE);
    expect(container.textContent).not.toContain(NO_SCORE_NOTE);
    for (const gone of RETIRED) expect(container.textContent).not.toContain(gone);
  });

  it("no score, in EVERY OTHER case — never ran, frozen, no record: the First Read's \"No score snapshot yet.\"", () => {
    h.find = { data: found, isLoading: false, error: null };
    for (const state of [null, "scored"] as const) {          // "scored" with no row is still "no snapshot"
      h.outside = { state, settled: true, loading: false, error: null };
      const { container, getByTestId, unmount } = render(<OutsideHeroAct />);
      expect(getByTestId("score-card-empty").textContent).toBe("No score snapshot yet.");
      expect(getByTestId("score-card-empty").textContent).toBe(NO_SCORE_NOTE);
      expect(container.textContent).not.toContain(NOT_ENOUGH_SIGNAL_NOTE);
      for (const gone of RETIRED) expect(container.textContent).not.toContain(gone);
      unmount();
    }
    // a failed read of the reason is not a verdict of "not eligible": the card says only what it knows
    h.outside = { state: null, settled: false, loading: false, error: "PostgREST 500" };
    const failed = render(<OutsideHeroAct />);
    expect(failed.getByTestId("score-card-empty").textContent).toBe(NO_SCORE_NOTE);
  });

  it("the note is not chosen before the reason has been read: the card stays loading, and shows neither note", () => {
    h.find = { data: found, isLoading: false, error: null };
    h.outside = { state: null, settled: false, loading: true, error: null };
    const { container } = render(<OutsideHeroAct />);
    expect(container.querySelector('[data-testid="score-card-empty"]')).toBeNull();
    expect(card(container).textContent).toContain("Loading");
    expect(container.textContent).not.toContain(NO_SCORE_NOTE);
    expect(container.textContent).not.toContain(NOT_ENOUGH_SIGNAL_NOTE);
  });

  it("the two notes are the First Read's own signed strings, and the choice is the First Read's own", () => {
    expect(NOT_ENOUGH_SIGNAL_NOTE).toBe("Not enough public signal to score yet.");
    expect(NO_SCORE_NOTE).toBe("No score snapshot yet.");
    expect([outsideScoreEmptyNote("ineligible"), outsideScoreEmptyNote("scored"), outsideScoreEmptyNote(null), outsideScoreEmptyNote(undefined)])
      .toEqual([NOT_ENOUGH_SIGNAL_NOTE, NO_SCORE_NOTE, NO_SCORE_NOTE, NO_SCORE_NOTE]);
  });
});
