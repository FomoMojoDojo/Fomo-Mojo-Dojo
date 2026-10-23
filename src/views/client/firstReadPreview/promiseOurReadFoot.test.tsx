// Ruling 39/40 (2026-10-22): a promise stamped our_read (its words are not its cited rows') renders its foot as the
// signed "Our read · Public read · {date}"; a record/you promise keeps the plain "Public read · {date}" tag.
//   P37-6  the render drops the marker → the our-read promise renders as a plain source line → RED
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { ActPromise } from "./acts";
import { promiseOurReadTag } from "./primitives";
import { EMPTY_FIRST_READ, type FirstReadPreviewData } from "./types";

const TAG = { label: "Public read · October 22, 2026" };
const TEXT = "Spectrum promises reliable and affordable services plus 24/7 customer service.";
const read = (ourRead: boolean | undefined): FirstReadPreviewData => ({
  ...EMPTY_FIRST_READ,
  company: { name: "Spectrum", website: "https://www.spectrum.com/" },
  promise: { text: TEXT, sourceTag: TAG, ...(ourRead === undefined ? {} : { ourRead }) },
});

describe("beat 08 — the our-read promise foot (ruling 40)", () => {
  it("the signed string, exactly", () => {
    expect(promiseOurReadTag(TAG).label).toBe("Our read · Public read · October 22, 2026");
  });
  it("an our_read promise renders 'Our read · Public read · {date}' (P37-6)", () => {
    const text = render(<ActPromise read={read(true)} />).container.textContent ?? "";
    expect(text).toContain(TEXT);
    expect(text).toContain("Our read · Public read · October 22, 2026");
  });
  it("a record/you promise (or a read written before the rule) keeps the plain tag — no 'Our read'", () => {
    for (const r of [read(false), read(undefined)]) {
      const text = render(<ActPromise read={r} />).container.textContent ?? "";
      expect(text).toContain("Public read · October 22, 2026");
      expect(text).not.toContain("Our read");
    }
  });
});
