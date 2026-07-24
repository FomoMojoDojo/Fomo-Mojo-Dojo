// OC-3 RIDER — SignalQuote renders decoded HTML entities; the stored/passed quote stays
// byte-unchanged (presentational only). The V2-6d "&amp;" case.

import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import SignalQuote, { decodeQuoteEntities } from "./SignalQuote";

const STORED = "Edgewood Center For Children &amp; Families ranks among the top 20% of private schools.";

describe("OC-3 rider — decodeQuoteEntities (presentational)", () => {
  it("decodes common entities; &amp; last so escaped entities survive", () => {
    expect(decodeQuoteEntities("Children &amp; Families")).toBe("Children & Families");
    expect(decodeQuoteEntities("a &lt;b&gt; c")).toBe("a <b> c");
    expect(decodeQuoteEntities("&quot;q&quot; &#39;a&#39;")).toBe("\"q\" 'a'");
    // &amp;lt; must become &lt;, NEVER < (decode order)
    expect(decodeQuoteEntities("x &amp;lt; y")).toBe("x &lt; y");
  });

  it("does NOT mutate its input (storage byte-unchanged)", () => {
    const input = STORED;
    const out = decodeQuoteEntities(input);
    expect(input).toBe(STORED); // input string untouched
    expect(out).not.toBe(STORED); // a new, decoded string
    expect(out).toContain("Children & Families");
  });
});

describe("OC-3 rider — SignalQuote renders decoded, stores nothing", () => {
  it("rendered text shows & (not &amp;); the quote prop is byte-unchanged", () => {
    const quoteProp = STORED;
    const { container } = render(<SignalQuote quote={quoteProp} />);
    const text = container.querySelector(".cvs-signal-quote-text")?.textContent ?? "";
    expect(text).toContain("Children & Families");
    expect(text).not.toContain("&amp;");
    // The value we passed in is unchanged — the decode happened at render, not on storage.
    expect(quoteProp).toBe(STORED);
  });
});
