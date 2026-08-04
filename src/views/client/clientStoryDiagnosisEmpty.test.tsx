// FR-DIAG-EMPTY — the six CV-0 diagnosis scaffolds + the "CV-0 shell" rail chip are
// gone from the MOUNTED render; the diagnosis phase now shows DiagnoseMarketAct plus
// ONE operator-signed honest-empty (a sibling act, never nested, never in Outside).
//
// Rendered-tree absence law: asserted against the mounted output, not a file grep.
// Falsification: re-inject any scaffold string and the "no scaffold language" checks RED.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, fireEvent } from "@testing-library/react";

// G2: control whether the verdict recap renders (true) or self-suppresses like a
// zero-verdict company (false).
const g2 = vi.hoisted(() => ({ recap: true }));

vi.mock("@/hooks/useCompany", () => ({ useCompany: () => ({ activeCompany: { id: "3dd2cfbb" } }) }));
vi.mock("@/hooks/usePublicBaseline", () => ({ usePublicBaseline: () => ({ preferredRun: null, loading: false }) }));
vi.mock("@/styles/client-story.css", () => ({}));
// G2: WhereYouStand renders its marker when there are verdicts, else null (its real
// suppression is proven in whereYouStand.test.tsx against the hook).
vi.mock("@/components/client-view/story/WhereYouStand", () => ({ default: () => (g2.recap ? <div>WHERE-YOU-STAND</div> : null) }));
// Child acts stubbed to leaves — so if the empty's copy appears, it is necessarily a
// SIBLING of DiagnoseMarketAct (this leaf renders no children), proving non-nesting.
vi.mock("@/components/client-view/story/standards/StandardsShell", () => ({ default: ({ children }: { children?: unknown }) => <div>{children as never}</div> }));
vi.mock("@/components/client-view/story/standards/FrontDoorMapAct", () => ({ default: () => <div>JOB-MAP</div> }));
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

beforeEach(() => {
  g2.recap = true;
});

describe("G2 — Outside phase order + recap suppression", () => {
  it("the recap renders FIRST in the Outside phase; the job map renders AFTER the client-specific acts", () => {
    g2.recap = true;
    const { container } = render(<ClientStoryView />);
    const t = container.textContent ?? "";
    const iRecap = t.indexOf("WHERE-YOU-STAND");
    const iHero = t.indexOf("hero");
    const iMovement = t.indexOf("market"); // MarketAct, last client-specific block
    const iJobMap = t.indexOf("JOB-MAP");
    expect(iRecap).toBeGreaterThanOrEqual(0);
    // recap is first (before the first client act)
    expect(iRecap).toBeLessThan(iHero);
    // job map is near the end — after the recap AND after the client-specific acts
    expect(iJobMap).toBeGreaterThan(iRecap);
    expect(iJobMap).toBeGreaterThan(iHero);
    expect(iJobMap).toBeGreaterThan(iMovement);
  });

  it("a zero-verdict company: no recap and no gap, and the job map still renders in its new position", () => {
    g2.recap = false; // WhereYouStand self-suppresses
    const { container, queryByText } = render(<ClientStoryView />);
    expect(queryByText("WHERE-YOU-STAND")).toBeNull();
    const t = container.textContent ?? "";
    // Outside opens with the first client act (hero) — no empty recap block before it.
    expect(t.indexOf("hero")).toBeGreaterThanOrEqual(0);
    // The job map still renders, still after the client acts.
    expect(t.indexOf("JOB-MAP")).toBeGreaterThan(t.indexOf("hero"));
  });

  it("the recap does NOT render in the Diagnosis phase", () => {
    g2.recap = true;
    const { getByText, queryByText } = render(<ClientStoryView />);
    fireEvent.click(getByText("Diagnose"));
    expect(queryByText("WHERE-YOU-STAND")).toBeNull();
  });
});

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
