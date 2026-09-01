// "Where this points" numbered hanging-indent restyle (2026-08-31) — guards.
//
// PLANTED DIFFERENCE (what makes this designed-to-fail): the pre-restyle markup rendered each
// item as a literal "· "-prefixed <li> with NO index. Reverting the NumberedList swap brings the
// "· " prefix back and removes the padStart two-digit numerals — both assertion families below
// fail on exactly that. Copy is asserted VERBATIM (no sentenceCase/trim crept in).
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { ActOurRead } from "./acts";
import { EMPTY_FIRST_READ, type FirstReadPreviewData } from "./types";

const TAG = { label: "Public read · Aug 31, 2026" };
const readWith = (over: Partial<FirstReadPreviewData>): FirstReadPreviewData => ({
  ...EMPTY_FIRST_READ,
  company: { name: "Co", website: "https://co.com" },
  ...over,
});

const FULL = readWith({
  positioning: {
    category: "specialty coffee roaster",
    value: "great coffee",
    differentiators: [
      "dual-geography model with a Cross-Border story that wraps to a second line",
      "founder-developed roasting technique",
    ],
    sourceTag: TAG,
  },
  strategy: {
    aspiration: "the go-to roaster",
    whereToPlay: "cafes + DTC",
    howToWin: "provenance",
    capabilities: ["in-house small-batch roasting", "wholesale cafe relationships", "DTC e-commerce"],
    managementSystems: ["weekly roast-quality review"],
    sourceTag: TAG,
  },
  promise: { text: "The best version of the bean.", sourceTag: TAG },
});

describe("numbered hanging-indent — all three blocks (revert restores '· ' and fails here)", () => {
  it("differentiators + capabilities + management systems render two-digit indexes", () => {
    const { container } = render(<ActOurRead read={FULL} />);
    // Count index SPANS in the DOM (a bare text regex would false-match the "2026" in the
    // source-tag dates). 2 diffs + 3 caps + 1 mgmt ⇒ 01×3, 02×2, 03×1.
    const nums = [...container.querySelectorAll("ol li > span")].map((s) => s.textContent);
    expect(nums.filter((n) => n === "01").length).toBe(3);
    expect(nums.filter((n) => n === "02").length).toBe(2);
    expect(nums.filter((n) => n === "03").length).toBe(1);
  });
  it("no list item starts with the old '· ' bullet prefix", () => {
    // Scoped to items — the SourceTag's legitimate mid-dot ("Public read · Aug 31") stays.
    const { container } = render(<ActOurRead read={FULL} />);
    for (const li of container.querySelectorAll("li")) {
      expect((li.textContent ?? "").trimStart().startsWith("·")).toBe(false);
    }
  });
  it("strings render VERBATIM — no sentence-casing or trimming of items", () => {
    const { container } = render(<ActOurRead read={FULL} />);
    const text = container.textContent ?? "";
    expect(text).toContain("dual-geography model with a Cross-Border story that wraps to a second line");
    expect(text).toContain("in-house small-batch roasting"); // lowercase first letter preserved
  });
  it("index and text are separate flex items (hanging indent — wraps align under text)", () => {
    const { container } = render(<ActOurRead read={FULL} />);
    const rows = [...container.querySelectorAll("ol li")];
    expect(rows.length).toBe(6);
    for (const row of rows) {
      expect(row.className).toContain("flex");
      const num = row.querySelector("span");
      const body = row.querySelector("p");
      expect(num?.textContent).toMatch(/^\d{2}$/);
      expect(body?.textContent?.length).toBeGreaterThan(0);
    }
  });
});

describe("empty lists render nothing", () => {
  it("no numerals and no empty <ol> when every list is empty", () => {
    const empty = readWith({
      positioning: { category: "roaster", value: null, differentiators: [], sourceTag: TAG },
      strategy: {
        aspiration: "aspire", whereToPlay: "here", howToWin: "well",
        capabilities: [], managementSystems: [], sourceTag: TAG,
      },
      promise: null,
    });
    const { container } = render(<ActOurRead read={empty} />);
    expect(container.textContent).not.toMatch(/\b0\d\b/);
    expect(container.querySelector("ol")).toBeNull();
  });
});
