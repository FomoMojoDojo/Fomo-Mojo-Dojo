// FR-DIAG-EMPTY — the six CV-0 diagnosis scaffolds + the "CV-0 shell" rail chip are
// gone from the MOUNTED render; the diagnosis phase now shows DiagnoseMarketAct plus
// ONE operator-signed honest-empty (a sibling act, never nested, never in Outside).
//
// Rendered-tree absence law: asserted against the mounted output, not a file grep.
// Falsification: re-inject any scaffold string and the "no scaffold language" checks RED.

import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";

vi.mock("@/hooks/useCompany", () => ({ useCompany: () => ({ activeCompany: { id: "3dd2cfbb" } }) }));
vi.mock("@/hooks/usePublicBaseline", () => ({ usePublicBaseline: () => ({ preferredRun: null, loading: false }) }));
vi.mock("@/styles/client-story.css", () => ({}));
// Child acts stubbed to leaves — so if the empty's copy appears, it is necessarily a
// SIBLING of DiagnoseMarketAct (this leaf renders no children), proving non-nesting.
vi.mock("@/components/client-view/story/standards/StandardsShell", () => ({ default: ({ children }: { children?: unknown }) => <div>{children as never}</div> }));
vi.mock("@/components/client-view/story/standards/FrontDoorMapAct", () => ({ default: () => <div>OUTSIDE-REAL</div> }));
vi.mock("@/components/client-view/story/OutsideHeroAct", () => ({ default: () => <div>hero</div> }));
vi.mock("@/components/client-view/story/OutsideFindingsAct", () => ({ default: () => <div>findings</div> }));
vi.mock("@/components/client-view/story/OutsideQuestionAct", () => ({ default: () => <div>question</div> }));
vi.mock("@/components/client-view/story/OutsideNextMoveAct", () => ({ default: () => <div>nextmove</div> }));
vi.mock("@/components/client-view/story/movement/MovementShell", () => ({ default: ({ children }: { children?: unknown }) => <div>{children as never}</div> }));
vi.mock("@/components/client-view/story/movement/MarketAct", () => ({ default: () => <div>market</div> }));
vi.mock("@/components/client-view/story/movement/PositionAct", () => ({ default: () => <div>position</div> }));
vi.mock("@/components/client-view/story/diagnose/DiagnoseMarketAct", () => ({ default: () => <div>DIAGNOSE-MARKET-ACT</div> }));

import ClientStoryView from "./ClientStoryView";

const SCAFFOLD_STRINGS = [
  "CV-0 shell",
  "Scaffold · awaiting",
  "no data wired",
  "build-phase placeholder",
  "awaiting CV-3",
  "awaiting CV-4",
];
const EMPTY_HEADLINE = "The rest of your diagnosis is still being prepared.";
const EMPTY_PROMPT_FRAGMENT = "You've seen how your markets read against the outside";

describe("FR-DIAG-EMPTY — ClientStoryView diagnosis honest-empty", () => {
  it("no scaffold/build language anywhere in the mounted tree (Outside default view)", () => {
    const { container, queryByText } = render(<ClientStoryView />);
    for (const s of SCAFFOLD_STRINGS) {
      expect(container.textContent ?? "").not.toContain(s);
    }
    // The empty must NOT render where the real Outside content lives.
    expect(queryByText(EMPTY_HEADLINE)).toBeNull();
  });

  it("diagnosis phase: the signed honest-empty renders as a SIBLING of DiagnoseMarketAct, no scaffold language", () => {
    const { container, getByText } = render(<ClientStoryView />);
    fireEvent.click(getByText("Diagnose"));
    // Sibling proof: the (leaf-stubbed) markets act AND the empty both present.
    expect(getByText("DIAGNOSE-MARKET-ACT")).toBeTruthy();
    expect(getByText(EMPTY_HEADLINE)).toBeTruthy();
    expect(getByText(new RegExp(EMPTY_PROMPT_FRAGMENT))).toBeTruthy();
    for (const s of SCAFFOLD_STRINGS) {
      expect(container.textContent ?? "").not.toContain(s);
    }
  });
});
