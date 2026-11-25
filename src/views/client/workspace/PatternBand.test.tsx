// ── SP-465 / SP-463 / SP-459 / SP-458: the pattern band, and the proposed-need mark ──────────────
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PatternBand } from "./PatternBand";
import { BriefPanel } from "./BriefPanel";
import {
  WORKSPACE_STRINGS, allQuotesLine, claimForDisplay, mentionedOnceHeader, orderMentionedOnce, orderShownPatterns,
  panelPositionLine, patternCoverageLine, patternSupportLine, patternsHeader, polaritySplit, sitesLine, strengthLabel, strengthLevel,
} from "./workspaceNav";
import { SPAN_QUOTE_SHORT_CHARS, spanExcerpt } from "@/lib/quoteSpan";
import type { NeedPattern } from "@/hooks/useNeedPatterns";

const CA = "https://www.consumeraffairs.com/internet/spectrum.html";
const p = (over: Partial<NeedPattern> = {}): NeedPattern => ({
  id: over.id ?? "p1", needId: "n1",
  name: over.name ?? "The app logs you out and asks for a sign-in each time",
  parts: over.parts ?? ["the app signs the customer out", "a sign-in is required each time"],
  strength: over.strength ?? "likely rule",
  polarity: over.polarity ?? "not working",
  draft: over.draft ?? true,
  ceilingHit: over.ceilingHit ?? false,
  supporting: over.supporting ?? 7,
  sites: over.sites ?? 3,
  representative: over.representative === undefined
    ? { signalId: "s1", quote: "Report\n\nJessicaSaginaw, MI\n\nThe app logs me out every single time.", brand: "", sourceUrl: CA, eventDate: "2026-09-30" }
    : over.representative,
  representativeSpan: over.representativeSpan ?? null,
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
    // SP-674: the support reads across — one tick per supporting quote, the number, the sites — and
    // the group's name is still the signed support line
    expect(getByTestId("pattern-support").getAttribute("aria-label")).toBe("7 supporting quotes · 3 sites");
    expect(getByTestId("pattern-ticks").children.length).toBe(7);
    expect(getByTestId("pattern-supporting").textContent).toBe("7");
    expect(getByTestId("pattern-sites").textContent).toBe("3 sites");
    expect(getByTestId("pattern-band-label").textContent).toBe("What keeps happening \u00b7 1");
  });

  it("SP-456's singular forms hold here too", () => {
    // a 2-quote pattern from ONE site: 'possible failure' stays a row, so the singular site form shows
    const { getByTestId } = render(<PatternBand patterns={[p({ supporting: 2, sites: 1, strength: "possible failure" })]} brands={[]} />);
    expect(getByTestId("pattern-support").getAttribute("aria-label")).toBe("2 supporting quotes · 1 site");
    expect(getByTestId("pattern-sites").textContent).toBe("1 site");
    expect(getByTestId("pattern-strength").textContent).toBe("Possible failure");
  });

  const panelOf = (pat: NeedPattern, quotes: NeedPattern["quotes"] = []) =>
    render(<BriefPanel pattern={pat} index={1} total={3} quotes={quotes ?? []} brands={["Spectrum"]} onClose={() => {}} />);

  it("SP-459 / SP-674: the draft mark is in the PANEL — an unsigned pattern carries it, a signed one does not — and no row carries it", () => {
    const row = render(<PatternBand patterns={[p()]} brands={[]} />);
    expect(row.container.querySelector('[data-testid="pattern-draft"]')).toBeNull();
    const draft = panelOf(p());
    expect(draft.getByTestId("pattern-draft").textContent).toBe(WORKSPACE_STRINGS.briefDraftMark);
    const signed = panelOf(p({ id: "p2", draft: false }));
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
    // NOT `.map(strengthLabel)`: strengthLabel takes a second argument now, and map would pass the
    // INDEX as the polarity. It would still have passed here, which is exactly why it is spelled out.
    const four = ["confirmed rule", "likely rule", "possible failure", "too thin"].map((v) => strengthLabel(v));
    expect(new Set(four).size).toBe(4);
    expect(four.every((s) => s.length > 0 && !s.includes("_"))).toBe(true);
  });

  // ── v3: the parts, the polarity-aware strength and the SP-488 group ───────────────────────────
  it("SP-502 / SP-674: the parts the judge ruled on are shown in the panel, in order; the row shows the claim alone", () => {
    const pat = p({ parts: ["the final month is billed in full", "no proration is applied"] });
    const row = render(<PatternBand patterns={[pat]} brands={[]} />);
    expect(row.container.querySelector('[data-testid="pattern-part"]')).toBeNull();
    expect(row.getByTestId("pattern-name").textContent).toBe("The app logs you out and asks for a sign-in each time");
    const { container } = panelOf(pat);
    const parts = [...container.querySelectorAll('[data-testid="pattern-part"]')].map((n) => n.textContent);
    expect(parts).toEqual(["the final month is billed in full", "no proration is applied"]);
  });

  it("a pre-v3 row has no parts and shows the claim alone — not an empty list", () => {
    const { container } = render(<PatternBand patterns={[p({ parts: [] })]} brands={[]} />);
    expect(container.querySelector('[data-testid="pattern-parts"]')).toBeNull();
    expect(container.querySelector('[data-testid="pattern-name"]')).toBeTruthy();
  });

  it("SP-508: 'possible failure' reads with the pattern's own polarity", () => {
    // the whole point: a POSITIVE pattern resting on two quotes is not a failure of anything
    expect(strengthLabel("possible failure", "working")).toBe("Possible strength");
    expect(strengthLabel("possible failure", "mixed")).toBe("Possible tension");
    expect(strengthLabel("possible failure", "not working")).toBe("Possible failure");
    // a v1 row carries no polarity, and every v1 pattern was a complaint
    expect(strengthLabel("possible failure", null)).toBe("Possible failure");
    expect(strengthLabel("possible failure", "nonsense")).toBe("Possible failure");
    // the two evidence strengths say how WELL EVIDENCED a pattern is, not what it says, so they do not vary
    for (const pol of ["working", "not working", "mixed", null]) {
      expect(strengthLabel("confirmed rule", pol)).toBe("Confirmed rule");
      expect(strengthLabel("likely rule", pol)).toBe("Likely rule");
    }
    // and it reaches the screen through the band, not only the helper
    const { getByTestId } = render(
      <PatternBand patterns={[p({ strength: "possible failure", polarity: "working", supporting: 2, sites: 2 })]} brands={[]} />);
    expect(getByTestId("pattern-strength").textContent).toBe("Possible strength");
  });

  it("SP-488: a one-quote pattern is grouped as a mention, not listed as a rule", () => {
    const { container, getByTestId } = render(
      <PatternBand brands={[]} patterns={[
        p({ id: "p1", strength: "likely rule" }),
        p({ id: "p2", strength: "too thin", name: "The outage was never explained", supporting: 1, sites: 1 }),
        p({ id: "p3", strength: "too thin", name: "The technician did not arrive", supporting: 1, sites: 1 }),
      ]} />);
    // only the real rule is a row
    expect(container.querySelectorAll('[data-testid="pattern-row"]').length).toBe(1);
    // SP-674: the mentions start behind "Show" — the summary row is what stands on the page
    expect(container.querySelectorAll('[data-testid="pattern-once-row"]').length).toBe(0);
    expect(getByTestId("pattern-once-toggle").textContent).toContain(WORKSPACE_STRINGS.show);
    fireEvent.click(getByTestId("pattern-once-toggle"));
    expect(getByTestId("pattern-once-toggle").textContent).toContain(WORKSPACE_STRINGS.hide);
    expect(getByTestId("pattern-once-toggle").getAttribute("aria-expanded")).toBe("true");
    // the mentions are NAMED — grouped, never hidden
    const once = [...container.querySelectorAll('[data-testid="pattern-once-row"]')].map((n) => n.textContent);
    const onceNames = [...container.querySelectorAll('[data-testid="pattern-once-name"]')].map((n) => n.textContent);
    expect(onceNames).toEqual(["The outage was never explained", "The technician did not arrive"]);
    expect(once.length).toBe(2);
    // SP-665: ONE header, the label with its count — the doubled wording is gone
    expect(getByTestId("pattern-once-label").textContent).toBe("Mentioned once \u00b7 2");
    expect(container.querySelector('[data-testid="pattern-once-count"]')).toBeNull();
    expect((getByTestId("pattern-mentioned-once").textContent ?? "").match(/mentioned once/gi)?.length).toBe(1);
    // and a mention shows no strength and no representative quote: nothing dresses it as a rule
    expect(container.querySelectorAll('[data-testid="pattern-strength"]').length).toBe(1);
    expect(container.querySelectorAll('[data-testid="pattern-quote"]').length).toBe(1);
  });

  it("SP-488: with no one-quote pattern there is no group at all", () => {
    const { container } = render(<PatternBand patterns={[p()]} brands={[]} />);
    expect(container.querySelector('[data-testid="pattern-mentioned-once"]')).toBeNull();
  });

  it("SP-512: the four signed strings are the ones the register holds", () => {
    expect(WORKSPACE_STRINGS.strengthPossibleStrength).toBe("Possible strength");
    expect(WORKSPACE_STRINGS.strengthPossibleTension).toBe("Possible tension");
    expect(WORKSPACE_STRINGS.strengthMentionedOnce).toBe("Mentioned once");
    // SP-665: the group header is one label with its count
    expect(WORKSPACE_STRINGS.mentionedOnceHeader).toBe("Mentioned once \u00b7 {n}");
    expect(mentionedOnceHeader(1)).toBe("Mentioned once \u00b7 1");
    expect(mentionedOnceHeader(10)).toBe("Mentioned once \u00b7 10");
    expect("mentionedOnceCount" in WORKSPACE_STRINGS).toBe(false);
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

  // ── SP-665 (2026-11-24): the band shows the evidence ─────────────────────────────────────────────
  const LONG = "They advertise that they have fiber optic in our area and no, they do not. When asked when they were going to put it in, they have no idea. "
    + "If you call for help the AI computer answers, and it lies to you. It will never connect you to a person. I gave up after an hour and drove to the store instead.";
  const rep = (quote: string) => ({ signalId: "s9", quote, brand: "", sourceUrl: CA, eventDate: "2026-09-30" });

  it("SP-665 (a) / SP-668: a span in sentence 3 of 5 shows sentences 2 and 3, the span's exact words marked, an ellipsis on both sides", () => {
    const span = "the AI computer answers, and it lies to you";
    expect(LONG.length).toBeGreaterThan(SPAN_QUOTE_SHORT_CHARS);
    const { getByTestId } = render(<PatternBand patterns={[p({ representative: rep(LONG), representativeSpan: span })]} brands={[]} />);
    expect(getByTestId("pattern-quote-span").textContent).toBe(span);
    // the First Read's own matched-phrase treatment, not a new one
    expect(getByTestId("pattern-quote-span").className).toBe("fr-unstated-product");
    const shown = getByTestId("pattern-quote").textContent ?? "";
    expect(shown).toBe("\u2026 When asked when they were going to put it in, they have no idea. If you call for help the AI computer answers, and it lies to you. \u2026");
    expect(shown).not.toContain("fiber optic");                      // the start of the review is no longer what shows
    expect(getByTestId("pattern-quote").getAttribute("data-fr-clipped")).toBe("true");
    // nothing on screen but slices of the quote and the visible ellipsis
    expect(LONG.includes(shown.replace(/\u2026/g, "").trim())).toBe(true);
  });

  it("SP-665 (a): a short quote is shown whole, with the span marked and no ellipsis", () => {
    const quote = "The app logs me out every single time. I have to sign in again.";
    const { getByTestId } = render(<PatternBand patterns={[p({ representative: rep(quote), representativeSpan: "logs me out every single time" })]} brands={[]} />);
    expect(getByTestId("pattern-quote").textContent).toBe(quote);
    expect(getByTestId("pattern-quote-span").textContent).toBe("logs me out every single time");
    expect(getByTestId("pattern-quote").getAttribute("data-fr-clipped")).toBeNull();
  });

  it("SP-665 (a) / SP-668: a span that runs across sentences shows those sentences and the one before the first of them", () => {
    const span = "it lies to you. It will never connect you to a person";
    const ex = spanExcerpt(LONG, span)!;
    expect(ex.marked).toBe(span);
    expect(`${ex.before}${ex.marked}${ex.after}`).toBe("When asked when they were going to put it in, they have no idea. If you call for help the AI computer answers, and it lies to you. It will never connect you to a person.");
    expect([ex.cutStart, ex.cutEnd]).toEqual([true, true]);
    // the first and the last sentence: cut on one side only
    expect(spanExcerpt(LONG, "fiber optic")!.cutStart).toBe(false);
    const last = spanExcerpt(LONG, "drove to the store")!;
    expect([last.cutEnd, `${last.before}${last.marked}${last.after}`]).toEqual([false, "It will never connect you to a person. I gave up after an hour and drove to the store instead."]);
  });

  it("SP-668: a span in the first sentence has nothing before it — no leading ellipsis, and no extra sentence after", () => {
    const { getByTestId } = render(<PatternBand patterns={[p({ representative: rep(LONG), representativeSpan: "fiber optic" })]} brands={[]} />);
    expect(getByTestId("pattern-quote").textContent).toBe("They advertise that they have fiber optic in our area and no, they do not. \u2026");
  });

  it("SP-668: never more than ONE sentence before the span's own, and white space between sentences is not a sentence", () => {
    const ex = spanExcerpt(LONG, "drove to the store")!;
    expect(ex.before).toBe("It will never connect you to a person. I gave up after an hour and ");
    // a blank line between two sentences does not use up the one sentence allowed
    const spaced = LONG.replace("no idea. If you", "no idea.\n\nIf you");
    const sp = spanExcerpt(spaced, "the AI computer answers")!;
    expect(sp.before).toBe("When asked when they were going to put it in, they have no idea.\n\nIf you call for help ");
    expect(sp.cutStart).toBe(true);
  });

  it("SP-668: the sentence before is cut from the MASKED text too — a reviewer's name in it stays masked", () => {
    const quote = `Report\n\nJessicaSaginaw, MI\n\n${LONG}`;
    const { getByTestId } = render(<PatternBand patterns={[p({ representative: rep(quote), representativeSpan: "fiber optic" })]} brands={["Spectrum"]} />);
    const shown = getByTestId("pattern-quote").textContent ?? "";
    expect(getByTestId("pattern-quote-span").textContent).toBe("fiber optic");
    expect(shown).not.toContain("Jessica");
    expect(shown).toContain("[reviewer]");
    expect(shown).toContain("They advertise that they have fiber optic in our area and no, they do not.");
    expect(shown).not.toContain("When asked");
  });

  it("SP-675: the three polarity colors are the three tokens — amber, grey, green — and magenta is only the mark", () => {
    const css = readFileSync(join(__dirname, "..", "firstReadPreview/firstRead.css"), "utf8");
    const colorOf = (selector: string) => {
      const at = css.indexOf(`${selector} {`);
      expect(at, `no rule for ${selector}`).toBeGreaterThan(-1);
      return css.slice(at, css.indexOf("}", at)).match(/color:\s*([^;]+);/)![1].trim();
    };
    expect(colorOf(".fr-ws-pattern-polarity")).toBe("hsl(var(--fr-electric-sol))");
    expect(colorOf('.fr-ws-pattern-polarity[data-fr-polarity="mixed"]')).toBe("hsl(var(--fr-faint))");
    expect(colorOf('.fr-ws-pattern-polarity[data-fr-polarity="working"]')).toBe("hsl(var(--fr-lime))");
    // each token holds bare HSL numbers, so each rule is a color only because it sits inside hsl()
    for (const token of ["--fr-electric-sol", "--fr-faint", "--fr-lime", "--fr-electric"]) {
      const value = css.match(new RegExp(`${token}:\\s*([^;]+);`))![1].trim();
      expect(`hsl(${value})`).toMatch(/^hsl\(\d{1,3} \d{1,3}% \d{1,3}%\)$/);
    }
    // SP-673: no bare var(--fr-electric) is left anywhere in the sheet
    expect(css.match(/(?<!hsl\()var\(--fr-electric[,)]/g)).toBeNull();
    // the strength word, the bar mark, the thin-spot reason and the draft mark are grey
    for (const sel of [".fr-ws-pattern-strength", ".fr-ws-bar-mark", ".fr-ws-brief-reason", ".fr-ws-brief-draft"]) expect(colorOf(sel)).toBe("hsl(var(--fr-faint))");
    // magenta: the mark, and — in the Brief's own rules — nothing else
    expect(colorOf(".fr-unstated-product")).toBe("hsl(var(--fr-electric))");
    const brief = css.split("\n").filter((l) => /\.fr-ws-(brief|pattern|hot|pol|dot|bar-mark)/.test(l)).join("\n");
    expect(brief).not.toMatch(/--fr-electric\)/);
    // SP-674 ruling 6: the proposed tag carries no color of its own — it is the green tag
    expect(css).not.toMatch(/\.fr-ws-review-tag--proposed\s*\{/);
  });

  it("SP-665 (a): where the reviewer's own words end in an ellipsis, a second one is not added", () => {
    const quote = `${"The first thing went wrong and then the second thing went wrong after that. ".repeat(3)}Nobody on the phone can tell me when it will be done... I gave up and left it there for the week.`;
    const { getByTestId } = render(<PatternBand patterns={[p({ representative: rep(quote), representativeSpan: "Nobody on the phone can tell me" })]} brands={[]} />);
    expect(getByTestId("pattern-quote").textContent).toBe("\u2026 The first thing went wrong and then the second thing went wrong after that. Nobody on the phone can tell me when it will be done...");
  });

  it("SP-665 (a): a span that is not in its quote shows the quote as before, unmarked, and says so in the log", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { getByTestId, container } = render(<PatternBand patterns={[p({ representative: rep(LONG), representativeSpan: "words nobody wrote" })]} brands={[]} />);
    expect(getByTestId("pattern-quote").textContent).toBe(LONG);
    expect(container.querySelector('[data-testid="pattern-quote-span"]')).toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
    expect(spanExcerpt(LONG, "words nobody wrote")).toBeNull();
    expect(spanExcerpt(LONG, "")).toBeNull();
    expect(spanExcerpt(null, "x")).toBeNull();
    // a pre-v3 row has no span: the quote shows as before and nothing is logged
    const quiet = vi.spyOn(console, "warn").mockImplementation(() => {});
    render(<PatternBand patterns={[p({ id: "p-old", representative: rep(LONG), representativeSpan: null })]} brands={[]} />);
    expect(quiet).not.toHaveBeenCalled();
    quiet.mockRestore();
  });

  it("SP-665 (a): the excerpt is cut from the MASKED text, so a reviewer's name stays masked", () => {
    const { getByTestId } = render(<PatternBand patterns={[p({ representativeSpan: "logs me out every single time" })]} brands={["Spectrum"]} />);
    expect(getByTestId("pattern-quote-span").textContent).toBe("logs me out every single time");
    expect(getByTestId("pattern-quote").textContent).not.toContain("Jessica");
  });

  it("SP-665 (b): shown patterns sort by strength, then by supporting quotes, then a stable tiebreak", () => {
    const list = [
      p({ id: "a", name: "Possible, two quotes", strength: "possible failure", supporting: 2 }),
      p({ id: "b", name: "Likely, five quotes", strength: "likely rule", supporting: 5 }),
      p({ id: "c", name: "Possible strength, four quotes", strength: "possible failure", polarity: "working", supporting: 4 }),
      p({ id: "d", name: "Confirmed, nine quotes", strength: "confirmed rule", supporting: 9 }),
      p({ id: "e", name: "Likely, seven quotes", strength: "likely rule", supporting: 7 }),
      p({ id: "g", name: "Beta tie", strength: "possible failure", supporting: 3 }),
      p({ id: "f", name: "Alpha tie", strength: "possible failure", supporting: 3 }),
    ];
    const want = ["Confirmed, nine quotes", "Likely, seven quotes", "Likely, five quotes", "Possible strength, four quotes", "Alpha tie", "Beta tie", "Possible, two quotes"];
    expect(orderShownPatterns(list).map((x) => x.name)).toEqual(want);
    // the same whatever order the rows arrive in
    expect(orderShownPatterns([...list].reverse()).map((x) => x.name)).toEqual(want);
    const { container } = render(<PatternBand patterns={list} brands={[]} />);
    expect([...container.querySelectorAll('[data-testid="pattern-name"]')].map((n) => n.textContent)).toEqual(want);
  });

  it("SP-665 (d): every mentioned-once item carries its polarity, in the shown patterns' tag, ordered not working, mixed, working", () => {
    const list = [
      p({ id: "w", strength: "too thin", polarity: "working", name: "Agents diagnose issues quickly", supporting: 1, sites: 1 }),
      p({ id: "n2", strength: "too thin", polarity: "not working", name: "Third-party work is left unmanaged", supporting: 1, sites: 1 }),
      p({ id: "m", strength: "too thin", polarity: "mixed", name: "Support staff deny outage reports", supporting: 1, sites: 1 }),
      p({ id: "n1", strength: "too thin", polarity: "not working", name: "Equipment provided is defective", supporting: 1, sites: 1 }),
    ];
    const { container, getByTestId } = render(<PatternBand patterns={list} brands={[]} />);
    // SP-674: the summary row divides the mentions by polarity, in the same order, before any is shown
    expect([...container.querySelectorAll('[data-testid="pattern-once-split"]')].map((n) => n.textContent)).toEqual(["2 not working", "1 mixed", "1 working"]);
    fireEvent.click(getByTestId("pattern-once-toggle"));
    const rows = [...container.querySelectorAll('[data-testid="pattern-once-row"]')];
    expect(rows.map((r) => r.querySelector('[data-testid="pattern-once-name"]')!.textContent)).toEqual(
      ["Equipment provided is defective", "Third-party work is left unmanaged", "Support staff deny outage reports", "Agents diagnose issues quickly"]);
    const tags = rows.map((r) => r.querySelector('[data-testid="pattern-once-polarity"]')!);
    expect(tags.map((t) => t.textContent)).toEqual(["not working", "not working", "mixed", "working"]);
    expect(tags.map((t) => t.getAttribute("data-fr-polarity"))).toEqual(["not working", "not working", "mixed", "working"]);
    for (const t of tags) expect(t.className).toContain("fr-ws-pattern-polarity");   // the shown patterns' own tag
    expect(getByTestId("pattern-once-label").textContent).toBe("Mentioned once \u00b7 4");
    expect(orderMentionedOnce(list).map((x) => x.id)).toEqual(["n1", "n2", "m", "w"]);
  });

  it("SP-665 (e) / SP-674: a pattern with exactly one part shows no part line anywhere; two or three show in the panel", () => {
    const one = panelOf(p({ parts: ["outages are not fixed promptly"] }));
    expect(one.container.querySelector('[data-testid="pattern-parts"]')).toBeNull();
    expect(one.container.querySelector('[data-testid="pattern-part"]')).toBeNull();
    const two = panelOf(p({ id: "p2", parts: ["the final month is billed in full", "no proration is applied"] }));
    expect([...two.container.querySelectorAll('[data-testid="pattern-part"]')].map((n) => n.textContent)).toEqual(["the final month is billed in full", "no proration is applied"]);
    const three = panelOf(p({ id: "p3", parts: ["a", "b", "c"] }));
    expect(three.container.querySelectorAll('[data-testid="pattern-part"]').length).toBe(3);
  });

  it("SP-665 (f): a claim's trailing period is trimmed at render, for shown patterns and mentions alike", () => {
    expect(claimForDisplay("Charges appear for services not authorized by the customer.")).toBe("Charges appear for services not authorized by the customer");
    expect(claimForDisplay("No period here")).toBe("No period here");
    expect(claimForDisplay("Trailing space. ")).toBe("Trailing space");
    expect(claimForDisplay("An ellipsis stays...")).toBe("An ellipsis stays...");
    const { container, getByTestId } = render(<PatternBand brands={[]} patterns={[
      p({ id: "s", name: "The provider fails to honor the promotional rate." }),
      p({ id: "o", name: "A single mention.", strength: "too thin", supporting: 1, sites: 1 }),
    ]} />);
    fireEvent.click(getByTestId("pattern-once-toggle"));
    expect(container.querySelector('[data-testid="pattern-name"]')!.textContent).toBe("The provider fails to honor the promotional rate");
    expect(container.querySelector('[data-testid="pattern-once-name"]')!.textContent).toBe("A single mention");
  });

  // ── SP-674 (2026-11-25): board BR4 — the row read across, and the BR1b panel ────────────────────
  it("SP-674: three strength bars, filled by the strength, named by the strength's own label", () => {
    expect([strengthLevel("confirmed rule"), strengthLevel("likely rule"), strengthLevel("possible failure"), strengthLevel("too thin"), strengthLevel("nonsense"), strengthLevel(null)])
      .toEqual([3, 2, 1, 0, 0, 0]);
    const { container } = render(<PatternBand brands={[]} patterns={[
      p({ id: "a", strength: "confirmed rule" }), p({ id: "b", strength: "likely rule" }),
      p({ id: "c", strength: "possible failure", polarity: "working" }),
    ]} />);
    const bars = [...container.querySelectorAll(".fr-ws-pattern-bars")];
    expect(bars.map((b) => b.getAttribute("data-fr-level"))).toEqual(["3", "2", "1"]);
    expect(bars.map((b) => b.getAttribute("aria-label"))).toEqual(["Confirmed rule", "Likely rule", "Possible strength"]);
    expect(bars.every((b) => b.getAttribute("role") === "img" && b.children.length === 3)).toBe(true);
  });

  it("SP-674: the polarity is a dot in the polarity's color, and the word is still there for a reader who cannot see color", () => {
    const { getByTestId } = render(<PatternBand patterns={[p({ polarity: "mixed" })]} brands={[]} />);
    const dot = getByTestId("pattern-polarity");
    expect(dot.className).toContain("fr-ws-pattern-polarity");
    expect(dot.getAttribute("data-fr-polarity")).toBe("mixed");
    expect(dot.textContent).toBe("mixed");
    expect(dot.getAttribute("title")).toBe("mixed");
    // the ticks carry the same polarity, so they take the same color from the same rule
    expect(getByTestId("pattern-ticks").getAttribute("data-fr-polarity")).toBe("mixed");
  });

  it("SP-674: the first pattern's quote starts open; each toggle is a button that says its state and names what it controls", () => {
    const { container } = render(<PatternBand brands={[]} patterns={[
      p({ id: "a", strength: "confirmed rule", representative: rep("First quote."), representativeSpan: "First" }),
      p({ id: "b", strength: "likely rule", representative: rep("Second quote."), representativeSpan: "Second" }),
    ]} />);
    const toggles = [...container.querySelectorAll('[data-testid="pattern-quote-toggle"]')] as HTMLButtonElement[];
    expect(toggles.map((t) => t.tagName)).toEqual(["BUTTON", "BUTTON"]);
    expect(toggles.map((t) => t.getAttribute("aria-expanded"))).toEqual(["true", "false"]);
    expect(toggles[0].textContent).toContain(WORKSPACE_STRINGS.quoteHide);
    expect(toggles[1].textContent).toContain(WORKSPACE_STRINGS.quoteShow);
    expect([...container.querySelectorAll('[data-testid="pattern-quote"]')].map((n) => n.textContent)).toEqual(["First quote."]);
    // the open toggle's aria-controls is the quote's own id
    expect(container.querySelector('[data-testid="pattern-quote"]')!.id).toBe(toggles[0].getAttribute("aria-controls"));
    fireEvent.click(toggles[1]);
    expect(toggles[1].getAttribute("aria-expanded")).toBe("true");
    expect(container.querySelectorAll('[data-testid="pattern-quote"]').length).toBe(2);
    fireEvent.click(toggles[0]);
    expect([...container.querySelectorAll('[data-testid="pattern-quote"]')].map((n) => n.textContent)).toEqual(["Second quote."]);
    // a pattern with no representative quote has no toggle to press
    const none = render(<PatternBand brands={[]} patterns={[p({ id: "z", representative: null })]} />);
    expect(none.container.querySelector('[data-testid="pattern-quote-toggle"]')).toBeNull();
  });

  it("SP-674: the claim is a button that opens the panel for ITS pattern, and the open row is marked", () => {
    const picked: string[] = [];
    const list = [p({ id: "a", strength: "confirmed rule", name: "First claim" }), p({ id: "b", strength: "likely rule", name: "Second claim" })];
    const { container, rerender } = render(<PatternBand brands={[]} patterns={list} selectedId={null} onSelect={(id) => picked.push(id)} />);
    const names = [...container.querySelectorAll('[data-testid="pattern-name"]')] as HTMLButtonElement[];
    expect(names.map((n) => [n.tagName, n.getAttribute("aria-expanded")])).toEqual([["BUTTON", "false"], ["BUTTON", "false"]]);
    fireEvent.click(names[1]);
    expect(picked).toEqual(["b"]);
    rerender(<PatternBand brands={[]} patterns={list} selectedId="b" onSelect={(id) => picked.push(id)} panelSlot={<div data-testid="slot" />} />);
    const rows = [...container.querySelectorAll('[data-testid="pattern-row"]')];
    expect(rows.map((r) => r.getAttribute("data-fr-selected"))).toEqual([null, "true"]);
    expect(names[1].getAttribute("aria-expanded")).toBe("true");
    // below 1024px the panel sits in the flow, inside the row it belongs to and no other
    expect(rows[1].querySelector('[data-testid="slot"]')).not.toBeNull();
    expect(rows[0].querySelector('[data-testid="slot"]')).toBeNull();
  });

  it("SP-674: the signed strings of the board, byte for byte (SP-676)", () => {
    expect(WORKSPACE_STRINGS.briefStatWithPatterns).toBe("With patterns");
    expect(WORKSPACE_STRINGS.briefOpenQuestionsShort).toBe("Open questions");
    expect(WORKSPACE_STRINGS.briefNotBuiltYet).toBe("Not built yet");
    expect(WORKSPACE_STRINGS.briefNotBuiltSections).toBe("So what \u00b7 Says versus customers \u00b7 Practices \u00b7 Merger signals \u00b7 Questions to ask");
    expect(WORKSPACE_STRINGS.briefHotspotsLede).toBe("Every need at or above the evidence bar, most counted quotes first.");
    expect(WORKSPACE_STRINGS.patternsTag).toBe("Patterns");
    expect(WORKSPACE_STRINGS.countedQuotesLabel).toBe("Counted quotes");
    expect([WORKSPACE_STRINGS.quoteShow, WORKSPACE_STRINGS.quoteHide, WORKSPACE_STRINGS.show, WORKSPACE_STRINGS.hide]).toEqual(["Quote", "Hide quote", "Show", "Hide"]);
    expect(WORKSPACE_STRINGS.panelSupportingQuotes).toBe("Supporting quotes");
    expect(WORKSPACE_STRINGS.panelSites).toBe("Sites");
    expect(WORKSPACE_STRINGS.panelQuoteLabel).toBe("The quote the judge picked");
    expect(WORKSPACE_STRINGS.panelNote).toBe("Marked words are the exact words the judge matched.");
    expect([WORKSPACE_STRINGS.panelAria, WORKSPACE_STRINGS.close, WORKSPACE_STRINGS.briefSectionsAria]).toEqual(["Pattern evidence", "Close", "Sections"]);
    expect([patternsHeader(8), allQuotesLine(54), panelPositionLine(1, 5), sitesLine(1), sitesLine(7)])
      .toEqual(["What keeps happening \u00b7 8", "All 54 quotes", "Pattern \u00b7 1 of 5", "1 site", "7 sites"]);
    // ruling 5: no visible string says "span"
    expect((Object.values(WORKSPACE_STRINGS) as string[]).filter((v) => /\bspan\b/i.test(v))).toEqual([]);
    expect(polaritySplit([{ polarity: "working" }, { polarity: "not working" }, { polarity: "not working" }, { polarity: null }]))
      .toEqual([{ polarity: "not working", n: 2 }, { polarity: "working", n: 1 }]);
  });

  it("SP-674: the panel — position, strength, polarity word, the two numbers, the quote with its mark, the note, every supporting quote", () => {
    const quotes = [
      { signalId: "s9", quote: LONG, brand: "spectrum", sourceUrl: CA, eventDate: "2026-09-30" },
      { signalId: "s8", quote: "Report\n\nJessicaSaginaw, MI\n\nThe robot never lets me through.", brand: "brand_not_recorded", sourceUrl: CA, eventDate: null },
    ];
    const pat = p({ strength: "confirmed rule", polarity: "not working", supporting: 2, sites: 1, representative: rep(LONG), representativeSpan: "the AI computer answers, and it lies to you" });
    const { getByTestId, container } = render(<BriefPanel pattern={pat} index={2} total={5} quotes={quotes} brands={["Spectrum"]} onClose={() => {}} />);
    const panel = getByTestId("brief-panel");
    expect(panel.tagName).toBe("ASIDE");
    expect(panel.getAttribute("aria-label")).toBe("Pattern evidence");
    // a region beside the page, never a dialog: nothing is trapped and nothing is covered
    expect(panel.getAttribute("role")).toBeNull();
    expect(panel.getAttribute("aria-modal")).toBeNull();
    expect(getByTestId("brief-panel-position").textContent).toBe("Pattern \u00b7 2 of 5");
    expect(getByTestId("brief-panel-strength").textContent).toBe("Confirmed rule");
    expect(getByTestId("brief-panel-polarity").textContent).toBe("not working");
    expect(getByTestId("brief-panel-title").textContent).toBe("The app logs you out and asks for a sign-in each time");
    expect(getByTestId("brief-panel-supporting").textContent).toBe("2");
    expect(getByTestId("brief-panel-sites").textContent).toBe("1");
    expect(panel.textContent).toContain(WORKSPACE_STRINGS.panelQuoteLabel);
    expect(getByTestId("pattern-quote-span").textContent).toBe("the AI computer answers, and it lies to you");
    expect(getByTestId("brief-panel-note").textContent).toBe(WORKSPACE_STRINGS.panelNote);
    // opening it puts focus on its heading
    expect(document.activeElement).toBe(getByTestId("brief-panel-title"));
    // every supporting quote, behind one opener, through QuoteList: masked, brand · site · date
    expect(container.querySelector('[data-testid="brief-panel-quotes"]')).toBeNull();
    const opener = getByTestId("brief-panel-all-quotes");
    expect(opener.textContent).toContain("All 2 quotes");
    expect(opener.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(opener);
    expect(opener.getAttribute("aria-expanded")).toBe("true");
    const list = getByTestId("brief-panel-quotes");
    expect(list.querySelectorAll('[data-testid="quote"]').length).toBe(2);
    expect(list.textContent).not.toContain("Jessica");
    expect([...list.querySelectorAll(".fr-ws-quote-meta")].map((n) => n.textContent))
      .toEqual(["spectrum \u00b7 ConsumerAffairs \u00b7 September 30, 2026", "Brand not recorded \u00b7 ConsumerAffairs \u00b7 date not shown"]);
  });

  it("SP-674: the panel's close button is named, and a pattern with no marked words shows no note about marked words", () => {
    let closed = 0;
    const { getByTestId, container } = render(<BriefPanel pattern={p({ representativeSpan: null })} index={1} total={1} quotes={[]} brands={[]} onClose={() => { closed += 1; }} />);
    expect(getByTestId("brief-panel-close").getAttribute("aria-label")).toBe("Close");
    fireEvent.click(getByTestId("brief-panel-close"));
    expect(closed).toBe(1);
    expect(container.querySelector('[data-testid="brief-panel-note"]')).toBeNull();
    expect(container.querySelector('[data-testid="brief-panel-all-quotes"]')).toBeNull();
    expect(getByTestId("brief-panel").getAttribute("data-fr-inflow")).toBeNull();
    const inflow = render(<BriefPanel pattern={p({ id: "q" })} index={1} total={1} quotes={[]} brands={[]} inflow onClose={() => {}} />);
    expect(inflow.container.querySelector('[data-testid="brief-panel"]')!.getAttribute("data-fr-inflow")).toBe("true");
  });
});
