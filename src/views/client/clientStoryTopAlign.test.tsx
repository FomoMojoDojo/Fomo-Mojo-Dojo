// Top-align-first-act — structural proof that the SHIPPED selector
//   .cvs-story main > .cvs-act:first-child
// resolves to the LEADING act in each phase and FOLLOWS suppression (a null-returning
// leader hands first-child to the next act). jsdom applies no layout and the stylesheet
// is mocked, so the computed `justify-content: flex-start` cannot be asserted here — the
// VISUAL top-alignment is owed to operator visual acceptance. What IS asserted: the exact
// selector, run via querySelector against the mounted tree, matches the right element and
// exactly one element — the "silently mis-targets" risk from the gate.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, fireEvent } from "@testing-library/react";

// The exact selector shipped in client-story.css.
const SELECTOR = ".cvs-story main > .cvs-act:first-child";

const t = vi.hoisted(() => ({ recap: true, recapLeavesWrapper: false }));

vi.mock("@/hooks/useCompany", () => ({ useCompany: () => ({ activeCompany: { id: "3dd2cfbb" } }) }));
vi.mock("@/hooks/usePublicBaseline", () => ({ usePublicBaseline: () => ({ preferredRun: null, loading: false }) }));
vi.mock("@/styles/client-story.css", () => ({}));
// The leading act: renders a cvs-act section when there are verdicts; null on suppression
// — unless recapLeavesWrapper (RED) forces an empty wrapper to stay behind.
vi.mock("@/components/client-view/story/WhereYouStand", () => ({
  default: () =>
    t.recap || t.recapLeavesWrapper ? <section className="cvs-act" data-act="recap" /> : null,
}));
// Real cvs-act sections with identifiable data-act, so querySelector can name the match.
vi.mock("@/components/client-view/story/OutsideHeroAct", () => ({ default: () => <section className="cvs-act" data-act="hero" /> }));
vi.mock("@/components/client-view/story/OutsideFindingsAct", () => ({ default: () => <section className="cvs-act" data-act="findings" /> }));
vi.mock("@/components/client-view/story/OutsideQuestionAct", () => ({ default: () => <section className="cvs-act" data-act="question" /> }));
vi.mock("@/components/client-view/story/OutsideNextMoveAct", () => ({ default: () => <section className="cvs-act" data-act="nextmove" /> }));
// MovementShell wraps its acts in a div — its inner cvs-acts are grandchildren of main,
// so the child-combinator selector must NOT match them.
vi.mock("@/components/client-view/story/movement/MovementShell", () => ({ default: ({ children }: { children?: unknown }) => <div className="cvs-mov">{children as never}</div> }));
vi.mock("@/components/client-view/story/movement/MarketAct", () => ({ default: () => <section className="cvs-act" data-act="market" /> }));
vi.mock("@/components/client-view/story/movement/PositionAct", () => ({ default: () => <section className="cvs-act" data-act="position" /> }));
// StandardsShell wraps the job map (cvs-std, NOT cvs-act).
vi.mock("@/components/client-view/story/standards/StandardsShell", () => ({ default: ({ children }: { children?: unknown }) => <div className="cvs-std">{children as never}</div> }));
vi.mock("@/components/client-view/story/standards/FrontDoorMapAct", () => ({ default: () => <div className="cvs-std-map" data-act="jobmap" /> }));
vi.mock("@/components/client-view/story/diagnose/DiagnoseMarketAct", () => ({ default: () => <section className="cvs-act" data-act="diagnose" /> }));

import ClientStoryView from "./ClientStoryView";

beforeEach(() => {
  t.recap = true;
  t.recapLeavesWrapper = false;
});

describe("top-align — the selector resolves to the leading act, follows suppression", () => {
  it("Outside, recap present: the selector matches the recap (leading), and ONLY it", () => {
    t.recap = true;
    const { container } = render(<ClientStoryView />);
    const match = container.querySelector(SELECTOR) as HTMLElement | null;
    expect(match?.dataset.act).toBe("recap");
    // Exactly one first-child act matches — MovementShell's inner acts (grandchildren) are not hit.
    expect(container.querySelectorAll(SELECTOR).length).toBe(1);
    // A non-leading act (hero) is NOT the matched element.
    expect(match?.dataset.act).not.toBe("hero");
  });

  it("Outside, recap SUPPRESSED (zero-verdict): the selector follows to the next act (hero)", () => {
    t.recap = false; // WhereYouStand returns null → no node
    const { container } = render(<ClientStoryView />);
    const match = container.querySelector(SELECTOR) as HTMLElement | null;
    expect(match?.dataset.act).toBe("hero");
    expect(container.querySelector('[data-act="recap"]')).toBeNull(); // no leftover wrapper
  });

  it("Diagnose phase: the selector matches DiagnoseMarketAct (leading)", () => {
    t.recap = true;
    const { container, getByText } = render(<ClientStoryView />);
    fireEvent.click(getByText("Diagnose"));
    const match = container.querySelector(SELECTOR) as HTMLElement | null;
    expect(match?.dataset.act).toBe("diagnose");
    expect(container.querySelectorAll(SELECTOR).length).toBe(1);
  });
});
