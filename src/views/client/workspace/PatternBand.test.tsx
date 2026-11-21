// ── SP-465 / SP-463 / SP-459 / SP-458: the pattern band, and the proposed-need mark ──────────────
import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { PatternBand } from "./PatternBand";
import { WORKSPACE_STRINGS, patternCoverageLine, patternSupportLine, strengthLabel } from "./workspaceNav";
import type { NeedPattern } from "@/hooks/useNeedPatterns";

const CA = "https://www.consumeraffairs.com/internet/spectrum.html";
const p = (over: Partial<NeedPattern> = {}): NeedPattern => ({
  id: over.id ?? "p1", needId: "n1",
  name: over.name ?? "The app logs you out and asks for a sign-in each time",
  strength: over.strength ?? "likely rule",
  polarity: over.polarity ?? "not working",
  draft: over.draft ?? true,
  ceilingHit: over.ceilingHit ?? false,
  supporting: over.supporting ?? 7,
  sites: over.sites ?? 3,
  representative: over.representative === undefined
    ? { signalId: "s1", quote: "Report\n\nJessicaSaginaw, MI\n\nThe app logs me out every single time.", brand: "", sourceUrl: CA, eventDate: "2026-09-30" }
    : over.representative,
  ...over,
});

describe("the pattern band", () => {
  it("renders nothing when a need has no patterns — the band is not an empty heading", () => {
    const { container } = render(<PatternBand patterns={[]} brands={["Spectrum"]} />);
    expect(container.querySelector('[data-testid="pattern-band"]')).toBeNull();
  });

  it("shows the label, the name, the strength and the derived counts", () => {
    const { getByTestId } = render(<PatternBand patterns={[p()]} brands={["Spectrum"]} />);
    expect(getByTestId("pattern-band").textContent).toContain(WORKSPACE_STRINGS.patternsLabel);
    expect(getByTestId("pattern-name").textContent).toBe("The app logs you out and asks for a sign-in each time");
    expect(getByTestId("pattern-strength").textContent).toBe("Likely rule");
    expect(getByTestId("pattern-support").textContent).toBe("7 supporting quotes · 3 sites");
  });

  it("SP-456's singular forms hold here too", () => {
    const { getByTestId } = render(<PatternBand patterns={[p({ supporting: 1, sites: 1, strength: "too thin" })]} brands={[]} />);
    expect(getByTestId("pattern-support").textContent).toBe("1 supporting quote · 1 site");
    expect(getByTestId("pattern-strength").textContent).toBe("Too thin");
  });

  it("SP-459: an unsigned pattern carries the draft mark, and a signed one does not", () => {
    const draft = render(<PatternBand patterns={[p()]} brands={[]} />);
    expect(draft.getByTestId("pattern-draft").textContent).toBe(WORKSPACE_STRINGS.briefDraftMark);
    const signed = render(<PatternBand patterns={[p({ id: "p2", draft: false })]} brands={[]} />);
    expect(signed.container.querySelector('[data-testid="pattern-draft"]')).toBeNull();
  });

  it("the representative quote goes through displayQuote — so the reviewer's name is masked", () => {
    const { getByTestId } = render(<PatternBand patterns={[p()]} brands={["Spectrum"]} />);
    const text = getByTestId("pattern-quote").textContent ?? "";
    expect(text).toContain("The app logs me out every single time.");
    expect(text).not.toContain("Jessica");
    expect(text).toContain("[reviewer]");
    // the city stays: the mask takes reviewer NAMES, which is what it was signed to take. If that
    // ever widens, this line is where the band's expectation changes with it.
  });

  it("a pattern with no representative signal still renders — the name is the finding", () => {
    const { getByTestId, container } = render(<PatternBand patterns={[p({ representative: null })]} brands={[]} />);
    expect(getByTestId("pattern-name")).toBeTruthy();
    expect(container.querySelector('[data-testid="pattern-quote"]')).toBeNull();
  });

  it("SP-456: no underscore-cased stored value reaches the screen", () => {
    const { getByTestId } = render(
      <PatternBand patterns={[p({ strength: "confirmed rule" }), p({ id: "p2", strength: "possible failure" })]} brands={[]} />,
    );
    expect(getByTestId("pattern-band").textContent ?? "").not.toMatch(/[a-z]+_[a-z]+/);
  });

  it("an unrecognised stored strength is shown, not hidden — a bad value must be visible", () => {
    expect(strengthLabel("something_else")).toBe("something_else");
    expect(strengthLabel(null)).toBe("");
  });

  it("every one of SP-428's four strengths has a label, and all four differ", () => {
    const four = ["confirmed rule", "likely rule", "possible failure", "too thin"].map(strengthLabel);
    expect(new Set(four).size).toBe(4);
    expect(four.every((s) => s.length > 0 && !s.includes("_"))).toBe(true);
  });

  it("SP-470: the pattern's polarity is shown, and coloured by its own value", () => {
    // each render is scoped to its OWN container: testing-library appends to one document, so a
    // document-wide query finds every previous render's node too.
    for (const pol of ["working", "not working", "mixed"]) {
      const { container } = render(<PatternBand patterns={[p({ id: `p-${pol}`, polarity: pol })]} brands={[]} />);
      const node = container.querySelector('[data-testid="pattern-polarity"]')!;
      expect(node.textContent).toBe(pol);
      expect(node.getAttribute("data-fr-polarity")).toBe(pol);
    }
  });

  it("a rubric-v1 row carries no polarity and shows none, rather than a guess", () => {
    const { container } = render(<PatternBand patterns={[p({ polarity: null })]} brands={[]} />);
    expect(container.querySelector('[data-testid="pattern-polarity"]')).toBeNull();
  });

  it("SP-476: the coverage line appears only when both numbers are given", () => {
    const none = render(<PatternBand patterns={[p()]} brands={[]} />);
    expect(none.container.querySelector('[data-testid="pattern-coverage"]')).toBeNull();
    const some = render(<PatternBand patterns={[p({ id: "p2" })]} brands={[]} counted={44} assigned={16} />);
    expect(some.container.querySelector('[data-testid="pattern-coverage"]')!.textContent).toBe("16 of 44 counted quotes under a pattern");
    // a need with no counted quotes shows no caveat about a band it cannot have
    const zero = render(<PatternBand patterns={[p({ id: "p3" })]} brands={[]} counted={0} assigned={0} />);
    expect(zero.container.querySelector('[data-testid="pattern-coverage"]')).toBeNull();
  });

  it("SP-476: the coverage string is the one the register holds", () => {
    expect(patternCoverageLine(16, 44)).toBe("16 of 44 counted quotes under a pattern");
    expect(WORKSPACE_STRINGS.patternCoverage).toBe("{n} of {m} counted quotes under a pattern");
    // SP-476 shortened the proposed mark
    expect(WORKSPACE_STRINGS.proposedNeedMark).toBe("Proposed");
  });

  it("patternSupportLine is the only place the counts become text", () => {
    expect(patternSupportLine(0, 0)).toBe("0 supporting quotes · 0 sites");
    expect(patternSupportLine(2, 1)).toBe("2 supporting quotes · 1 site");
  });
});
