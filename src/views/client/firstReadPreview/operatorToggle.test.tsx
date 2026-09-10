// RULE (a) — operator controls are OFF by default on the First Read preview (operator ruling 2026-09-03):
// the preview is the meeting-screen surface, so the default render must be byte-identical to the client
// render. Proves, on DOM structure (each fails if its branch is removed):
//   (a) default mount on the gap beat, with an operator-decided pair AND a struck pair present → ZERO
//       [data-fr-operator] nodes and ZERO provenance tags (RED before this gate: the provider was always on);
//   (b) the header switch ON → controls, struck block and the provenance tag are present;
//   (c) unmount + remount (a reload) → OFF again;
//   (d) no storage API is touched by the toggle (localStorage / sessionStorage spies untouched, URL unchanged);
//   (e) the switch is glyph-only: no text node, an SVG inside, aria-label + aria-pressed reflecting state, focusable.
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { fireEvent, render } from "@testing-library/react";
import { EMPTY_FIRST_READ, type FirstReadPreviewData, type FRGapPair } from "./types";
import { groupGapStatements, orderGapPairs } from "./mapping";
import { OPERATOR_MARK, OPERATOR_STRINGS } from "./operatorStrings";

const pair = (over: Partial<FRGapPair>): FRGapPair => ({
  id: "p", statementId: "s1", verdict: "confirmed",
  declared: "We don't train on your data.", record: "geniant does not train models on client data.",
  sourceTag: { label: "example.com · read September 2, 2026" }, eventDate: "2026-09-01",
  evidenceRank: 2, contentIdentity: "ident", relevanceVerdict: "relevant", ...over,
});
const pairs = orderGapPairs([
  pair({ id: "op-spared", relevanceProvider: "operator", relevanceModel: "operator_override", relevanceReason: "spared", relevanceDecidedAt: "2026-09-03" }),
  pair({ id: "struck", relevanceVerdict: "orthogonal", relevanceProvider: "deterministic", relevanceModel: "router", relevanceReason: "no distinctive token shared with the claim" }),
]);
const gapStatements = groupGapStatements(pairs);
const READ = {
  ...EMPTY_FIRST_READ,
  company: { name: "Geniant", website: "https://geniant.com" },
  gapPairs: pairs, gapStatements,
  gapCounts: { contradicted: 0, unechoed: 0, confirmed: 1, reverifying: 0 },
} as unknown as FirstReadPreviewData;

// The header's way out ("All companies", 2026-09-09) is a react-router <Link>, so the stub has to
// provide one. A plain anchor keeps the DOM assertions below unchanged.
vi.mock("react-router-dom", () => ({
  useParams: () => ({ companyId: "co-1" }),
  Link: ({ to, children, ...rest }: { to: string; children?: unknown }) =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ({ type: "a", props: { href: to, ...rest, children }, key: null, ref: null, $$typeof: Symbol.for("react.element") }) as any,
}));
vi.mock("./useFirstReadPreviewData", () => ({ useFirstReadPreviewData: () => ({ data: READ, loading: false, error: null }) }));
vi.mock("@/hooks/useFirstReadOpenQuestions", () => ({ useFirstReadOpenQuestions: () => ({ questions: [] }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: vi.fn(), functions: { invoke: vi.fn() } } }));

import FirstReadPreviewView, { BEATS } from "./FirstReadPreviewView";

beforeAll(() => { window.scrollTo = vi.fn() as unknown as typeof window.scrollTo; });
afterEach(() => vi.restoreAllMocks());

const gapIndex = BEATS.findIndex((b) => b.key === "gap");
const toGap = () => { for (let i = 0; i < gapIndex; i++) fireEvent.keyDown(window, { key: "ArrowRight" }); };
const SEL = "[data-fr-operator]";
const SEL_PROV = "[data-fr-operator-provenance]";
const SEL_SWITCH = "[data-fr-operator-switch]";
const SEL_ALL = `[${OPERATOR_MARK.attr}="${OPERATOR_MARK.allCompanies}"]`;
// The gap beat's operator surface with the toggle on: total / controls / struck-blocks. Measured,
// not assumed: 2 relevance controls + 1 struck block + the 1 new link = 4. Before the link it was 3.
const COUNTS = "4/2/1";

describe("(a) default render is the client render", () => {
  it("gap beat with an operator-decided pair and a struck pair: zero operator nodes, zero provenance tags", () => {
    const { container } = render(<FirstReadPreviewView />);
    toGap();
    // the fixture DID reach the beat: the spared pair's record is on screen
    expect(container.textContent).toContain("geniant does not train models on client data.");
    expect(container.querySelectorAll(SEL)).toHaveLength(0);
    expect(container.querySelectorAll(SEL_PROV)).toHaveLength(0);
    // the switch is present, OFF, fixed bottom-left OUTSIDE the nav/shell copy, and is not itself an operator node
    const sw = container.querySelector(SEL_SWITCH)!;
    expect(sw.getAttribute("data-fr-operator-switch")).toBe("off");
    expect(sw.closest("nav")).toBeNull();
    expect(sw.closest(".first-read-shell")).toBeNull();
    expect(sw.className).toContain("fixed");
    expect(sw.className).toContain("bottom-");
    expect(sw.className).toContain("left-");
  });
});

describe("(b) switch on → operator nodes present", () => {
  it("controls in the tag line, the struck block, and the provenance tag all render", () => {
    const { container } = render(<FirstReadPreviewView />);
    toGap();
    fireEvent.click(container.querySelector(SEL_SWITCH)!);
    expect(container.querySelector(SEL_SWITCH)!.getAttribute("data-fr-operator-switch")).toBe("on");
    expect(container.querySelectorAll('[data-fr-operator="relevance-controls"]').length).toBeGreaterThan(0);
    expect(container.querySelectorAll('[data-fr-operator="struck-pairs"]')).toHaveLength(1);
    expect(container.querySelectorAll(SEL_PROV)).toHaveLength(1);
    // and off again on a second click
    fireEvent.click(container.querySelector(SEL_SWITCH)!);
    expect(container.querySelectorAll(SEL)).toHaveLength(0);
    expect(container.querySelectorAll(SEL_PROV)).toHaveLength(0);
  });
});

describe("(c) a remount (reload) lands on the client render", () => {
  it("toggle on, unmount, mount again → off", () => {
    const first = render(<FirstReadPreviewView />);
    toGap();
    fireEvent.click(first.container.querySelector(SEL_SWITCH)!);
    expect(first.container.querySelectorAll(SEL).length).toBeGreaterThan(0);
    first.unmount();
    const second = render(<FirstReadPreviewView />);
    toGap();
    expect(second.container.querySelector(SEL_SWITCH)!.getAttribute("data-fr-operator-switch")).toBe("off");
    expect(second.container.querySelectorAll(SEL)).toHaveLength(0);
    expect(second.container.querySelectorAll(SEL_PROV)).toHaveLength(0);
  });
});

describe("(d) the toggle touches no storage and no URL", () => {
  it("localStorage / sessionStorage never read or written; location unchanged", () => {
    const ls = { get: vi.spyOn(Storage.prototype, "getItem"), set: vi.spyOn(Storage.prototype, "setItem"), rm: vi.spyOn(Storage.prototype, "removeItem") };
    const hrefBefore = window.location.href;
    const { container } = render(<FirstReadPreviewView />);
    toGap();
    fireEvent.click(container.querySelector(SEL_SWITCH)!);
    fireEvent.click(container.querySelector(SEL_SWITCH)!);
    fireEvent.click(container.querySelector(SEL_SWITCH)!);
    expect(ls.get).not.toHaveBeenCalled();
    expect(ls.set).not.toHaveBeenCalled();
    expect(ls.rm).not.toHaveBeenCalled();
    expect(window.location.href).toBe(hrefBefore);
  });
});

describe("(e) the switch is a glyph, not a label", () => {
  it("no text content, one inline SVG, aria-label signed, aria-pressed tracks state, keyboard focusable", () => {
    const { container } = render(<FirstReadPreviewView />);
    toGap();
    const sw = container.querySelector(SEL_SWITCH) as HTMLButtonElement;
    expect(sw.textContent?.trim()).toBe("");
    expect(sw.querySelectorAll("svg")).toHaveLength(1);
    expect(sw.getAttribute("aria-label")).toBe(OPERATOR_STRINGS.switchAriaLabel);
    expect(sw.getAttribute("aria-pressed")).toBe("false");
    expect(sw.tabIndex).toBe(0);
    sw.focus();
    expect(document.activeElement).toBe(sw);
    fireEvent.click(sw);
    expect(sw.getAttribute("aria-pressed")).toBe("true");
    expect(sw.textContent?.trim()).toBe("");
  });
});

// FRONT DOOR (2026-09-09, re-ruled) — "All companies" is an OPERATOR affordance, not a client
// element. The client never navigates, so the way out lives behind the glyph toggle with every other
// control. Default render: no operator node and no "All companies" text anywhere on the page.
describe("(f) the way out is an operator affordance, behind the toggle", () => {
  it("default render: no 'All companies' node and no 'All companies' text, on every beat", () => {
    const { container, queryByTestId } = render(<FirstReadPreviewView />);
    for (let i = 0; i < BEATS.length; i++) {
      expect(queryByTestId("first-read-back")).toBeNull();
      expect(container.querySelectorAll(SEL_ALL)).toHaveLength(0);
      expect(container.querySelectorAll(SEL)).toHaveLength(0);
      expect(container.textContent).not.toContain(OPERATOR_STRINGS.allCompanies);
      fireEvent.keyDown(window, { key: "ArrowRight" });
    }
  });

  it("toggle ON: the link appears in the header, marked as an operator node, pointing at the front door", () => {
    const { container, getByTestId } = render(<FirstReadPreviewView />);
    fireEvent.click(container.querySelector(SEL_SWITCH)!);
    const back = getByTestId("first-read-back");
    expect(back.textContent).toBe(OPERATOR_STRINGS.allCompanies);
    expect(back.getAttribute("href")).toBe("/preview/client-refine");
    expect(back.getAttribute(OPERATOR_MARK.attr)).toBe(OPERATOR_MARK.allCompanies);
    expect(back.closest(".fr-shell-header")).toBeTruthy();
    expect(container.querySelectorAll(SEL_ALL)).toHaveLength(1);
  });

  it("toggle OFF again: the link is gone and the text with it", () => {
    const { container, queryByTestId } = render(<FirstReadPreviewView />);
    fireEvent.click(container.querySelector(SEL_SWITCH)!);
    expect(queryByTestId("first-read-back")).toBeTruthy();
    fireEvent.click(container.querySelector(SEL_SWITCH)!);
    expect(queryByTestId("first-read-back")).toBeNull();
    expect(container.querySelectorAll(SEL)).toHaveLength(0);
    expect(container.textContent).not.toContain(OPERATOR_STRINGS.allCompanies);
  });

  it("it is exactly one node, and the only operator node the cold open gains", () => {
    // The cold open carries no relevance controls, so with the toggle on the link is the whole
    // operator surface there: 0 by default, 1 with the toggle on.
    const { container } = render(<FirstReadPreviewView />);
    expect(container.querySelectorAll(SEL)).toHaveLength(0);
    fireEvent.click(container.querySelector(SEL_SWITCH)!);
    expect(container.querySelectorAll(SEL)).toHaveLength(1);
    expect(container.querySelectorAll(SEL_ALL)).toHaveLength(1);
  });

  it("on the gap beat the link adds exactly one node to the operator surface", () => {
    const { container } = render(<FirstReadPreviewView />);
    toGap();
    expect(container.querySelectorAll(SEL)).toHaveLength(0);
    fireEvent.click(container.querySelector(SEL_SWITCH)!);
    const total = container.querySelectorAll(SEL).length;
    const link = container.querySelectorAll(SEL_ALL).length;
    const controls = container.querySelectorAll(`[${OPERATOR_MARK.attr}="${OPERATOR_MARK.controls}"]`).length;
    const struck = container.querySelectorAll(`[${OPERATOR_MARK.attr}="${OPERATOR_MARK.struck}"]`).length;
    expect(link).toBe(1);
    expect(`${total}/${controls}/${struck}`).toBe(COUNTS);
    expect(total).toBe(controls + struck + link);
  });

  it("clicking it does not toggle the operator switch back off", () => {
    const { container, getByTestId } = render(<FirstReadPreviewView />);
    fireEvent.click(container.querySelector(SEL_SWITCH)!);
    fireEvent.click(getByTestId("first-read-back"));
    expect(container.querySelector(SEL_SWITCH)!.getAttribute("data-fr-operator-switch")).toBe("on");
  });
});
