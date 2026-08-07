// First Read ROLLUP (Gate 1) — the theme render shell + signed strings.
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { ThemeHeadline, ThemeMore } from "./ThemeSection";
import {
  THEME_1_HEADLINE, THEME_2_HEADLINE, THEME_3_HEADLINE,
  EXPANSION_FRAMING, ASK_MOMENT_PROMPT, moreLabel,
} from "@/lib/firstRead/themeCopy";

describe("themeCopy — operator-signed strings (byte-exact)", () => {
  it("headlines are the signed text", () => {
    expect(THEME_1_HEADLINE).toBe("What you say, and what the record says back");
    expect(THEME_2_HEADLINE).toBe("What the outside raised that you haven't spoken to");
    expect(THEME_3_HEADLINE).toBe("What we found");
  });
  it("framing + ask-moment are the signed text", () => {
    expect(EXPANSION_FRAMING).toBe(
      "The full set, for when the conversation goes deeper. Nothing here needs a decision today.",
    );
    expect(ASK_MOMENT_PROMPT).toBe("Where do you land on this?");
  });
  it("moreLabel substitutes the count into the signed template (single U+2026 ellipsis)", () => {
    expect(moreLabel(1)).toBe("…and 1 more like this");
    expect(moreLabel(17)).toBe("…and 17 more like this");
    expect(moreLabel(1).charCodeAt(0)).toBe(0x2026); // real ellipsis, not "..."
    // FALSIFICATION: the count must actually appear (not a stray literal "{N}").
    expect(moreLabel(5)).not.toContain("{N}");
  });
});

describe("ThemeMore — collapse behavior", () => {
  it("count > 0 → a collapsed <details> with the '…and N more' summary + framing + children", () => {
    const { container } = render(
      <ThemeMore count={3}><p>TAIL_CHILD</p></ThemeMore>,
    );
    const details = container.querySelector("details");
    expect(details).not.toBeNull();
    expect(details!.hasAttribute("open")).toBe(false); // collapsed by default
    expect(container.textContent).toContain("…and 3 more like this");
    expect(container.textContent).toContain(EXPANSION_FRAMING);
    expect(container.textContent).toContain("TAIL_CHILD");
  });

  it("count <= 0 → children render directly, NO details/toggle (never '…and 0 more')", () => {
    const { container } = render(
      <ThemeMore count={0}><p>DIRECT_CHILD</p></ThemeMore>,
    );
    expect(container.querySelector("details")).toBeNull();
    expect(container.textContent).toContain("DIRECT_CHILD");
    expect(container.textContent).not.toContain("more like this");
  });

  it("ThemeHeadline renders the headline text", () => {
    const { container } = render(<ThemeHeadline>{THEME_3_HEADLINE}</ThemeHeadline>);
    expect(container.querySelector("h3")?.textContent).toBe("What we found");
  });
});
