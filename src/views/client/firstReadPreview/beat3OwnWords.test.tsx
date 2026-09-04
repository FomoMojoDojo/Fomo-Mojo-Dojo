// OW-3 (2026-08-20): beat 3 "What you say" LEADS with the company's own verbatim words, demotes
// the inference rows to a labelled sub-row, renders the tri-state, and grounds its empty state in
// the own-words integrity record (ownWordsLooked), not array emptiness.
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { ActWhatYouSay } from "./acts";
import { EMPTY_FIRST_READ, type FirstReadPreviewData, type FROwnWord } from "./types";

const ow = (id: string, quote: string, fidelity: "verbatim" | "paraphrased", host = "cafebarra.com"): FROwnWord =>
  ({ id, quote, pageUrl: `https://${host}/x`, pageHost: host, fidelity, sourceTag: { label: `${host} · read August 20, 2026` } });

const base = (over: Partial<FirstReadPreviewData>): FirstReadPreviewData => ({
  ...EMPTY_FIRST_READ, company: { name: "Co", website: "https://cafebarra.com" }, ...over,
});

describe("beat 3 — own words (OW-3)", () => {
  it("leads with a verbatim quote (quoted) and its page + read-date tag", () => {
    const { container } = render(<ActWhatYouSay read={base({
      ownWords: [ow("o1", "This is the Barra Method.", "verbatim")], ownWordsLooked: true,
    })} />);
    const text = container.textContent ?? "";
    expect(text).toContain("In your words");
    expect(text).toContain("This is the Barra Method.");
    expect(text).toContain("cafebarra.com · read August 20, 2026");
    // quoted rows carry the decorative quote mark
    expect(container.querySelector(".fr-quote-mark")).not.toBeNull();
  });

  it("paraphrased renders as 'As stated on {page}', NOT quoted", () => {
    const { container } = render(<ActWhatYouSay read={base({
      ownWords: [ow("o2", "We roast to order", "paraphrased")], ownWordsLooked: true,
    })} />);
    expect(container.textContent).toContain("As stated on cafebarra.com");
    // the only row is paraphrased → no quote mark
    expect(container.querySelector(".fr-quote-mark")).toBeNull();
  });

  it("demotes the inference rows to the 'Your channels, as we read them' sub-row, BELOW own words", () => {
    const { container } = render(<ActWhatYouSay read={base({
      ownWords: [ow("o1", "This is the Barra Method.", "verbatim")], ownWordsLooked: true, ownWordsRun: true,
      declared: [{ id: "d1", topic: "market", facet: "Market", statement: "Sells coffee online", sourceTag: { label: "Public read · June 1, 2026" } }],
    })} />);
    const text = container.textContent ?? "";
    expect(text).toContain("Your channels, as we read them");
    // own words come before the demoted read
    expect(text.indexOf("This is the Barra Method.")).toBeLessThan(text.indexOf("Your channels, as we read them"));
    expect(text.indexOf("Your channels, as we read them")).toBeLessThan(text.indexOf("Sells coffee online"));
  });

  // R2 (2026-09-04): the former not-read-yet line is RETIRED — not-looked renders NO client copy at all.
  it("empty state is integrity-grounded: looked → 'no verbatim' note; not-looked → no client copy (retired line absent)", () => {
    const looked = render(<ActWhatYouSay read={base({ ownWords: [], ownWordsLooked: true })} />).container.textContent ?? "";
    const notYet = render(<ActWhatYouSay read={base({ ownWords: [], ownWordsLooked: false })} />).container;
    expect(looked).toContain("found no verbatim self-descriptions");
    expect(notYet.textContent ?? "").not.toContain("read your own channels");
    expect(notYet.textContent ?? "").not.toContain("found no verbatim self-descriptions");
    expect(notYet.querySelector(".fr-absent, [data-fr-absent]")).toBeNull();
  });
});
