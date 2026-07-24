// V2-4 — the open-question surfaces read the TABLE (not result_json.open_questions[]),
// and the anchor packer honors the wall-clock cap. Falsification-validated.

import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { packAnchorChunks, ANCHOR_CHUNK_CAP } from "@/lib/firstRead/packAnchors";

describe("V2-4 — packAnchorChunks (wall-clock cap)", () => {
  it("splits into cap-sized chunks in stable order; drops blanks; empty → []", () => {
    expect(ANCHOR_CHUNK_CAP).toBe(3);
    const ids = ["a", "b", "c", "d", "e", "f", "g"];
    const chunks = packAnchorChunks(ids);
    expect(chunks).toEqual([["a", "b", "c"], ["d", "e", "f"], ["g"]]);
    expect(packAnchorChunks(["a", "", "  ", "b"])).toEqual([["a", "b"]]);
    expect(packAnchorChunks([])).toEqual([]);
    // FALSIFICATION: no chunk may exceed the cap
    for (const c of packAnchorChunks(ids)) expect(c.length).toBeLessThanOrEqual(ANCHOR_CHUNK_CAP);
  });
});

// Both surfaces read the SAME hook — mock it to drive the render + prove the source.
let hookState: { questions: string[]; loading: boolean } = { questions: [], loading: false };
vi.mock("@/hooks/useFirstReadOpenQuestions", () => ({
  useFirstReadOpenQuestions: () => ({ ...hookState, rows: [] }),
}));
import GapAct from "@/components/client-view/story/GapAct";
import OutsideQuestionAct from "@/components/client-view/story/OutsideQuestionAct";

describe("V2-4 — GapAct (Act 5) reads the open-question table, not result_json", () => {
  it("renders the full live list from the hook; honest-empty when none; null while loading", () => {
    hookState = { questions: ["Do rural families reach Edgewood in time?", "Is the kinship result recognized outside?"], loading: false };
    const { container } = render(<GapAct companyId="c1" />);
    const items = container.querySelectorAll(".cvs-gap-item");
    expect(items.length).toBe(2);
    expect(container.textContent).toContain("Do rural families reach Edgewood in time?");

    hookState = { questions: [], loading: false };
    expect(render(<GapAct companyId="c1" />).container.textContent).toContain("left no open questions");

    hookState = { questions: ["x?"], loading: true };
    expect(render(<GapAct companyId="c1" />).container.innerHTML).toBe("");
  });

  it("SOURCE ASSERTION: a result_json.open_questions payload can NOT feed GapAct (no such prop)", () => {
    // The old json path is gone: GapAct takes only companyId. A run object is inert.
    hookState = { questions: [], loading: false };
    // @ts-expect-error — preferredRun/result_json is no longer a GapAct prop (compile-time proof)
    const { container } = render(<GapAct companyId="c1" preferredRun={{ result_json: { open_questions: ["ghost?"] } }} />);
    expect(container.textContent).not.toContain("ghost?");
  });
});

describe("V2-4 — OutsideQuestionAct reads the table lead question", () => {
  it("renders the first live question; collapses when none", () => {
    hookState = { questions: ["The lead question?", "second?"], loading: false };
    const { container } = render(<OutsideQuestionAct companyId="c1" />);
    expect(container.textContent).toContain("The lead question?");
    expect(container.textContent).not.toContain("second?"); // single lead only

    hookState = { questions: [], loading: false };
    expect(render(<OutsideQuestionAct companyId="c1" />).container.innerHTML).toBe("");
  });
});
