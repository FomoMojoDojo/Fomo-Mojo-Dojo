// No vertical accent bars on the client-story surface (standing law 2026-07-23, now
// global). Asserted against the STYLESHEET itself: a vertical rail is a `border-left` or
// `border-inline-start` with a real value. Horizontal hairlines (border-top/bottom) and
// `border-*: none/0` are allowed. jsdom applies no computed layout and the ClientStoryView
// tests mock the CSS import, so a rendered-tree computed-border assertion isn't available
// for these CSS-driven bars — this file-level check is the substitute; the look is owed to
// operator visual acceptance.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const CSS = readFileSync(resolve(process.cwd(), "src/styles/client-story.css"), "utf8");

describe("client-story surface — no vertical accent bars", () => {
  it("client-story.css has NO border-left / border-inline-start (vertical rails)", () => {
    const offenders = CSS.split("\n")
      .map((line, i) => ({ line: line.trim(), n: i + 1 }))
      .filter(({ line }) => /(border-left|border-inline-start)\s*:/i.test(line))
      .filter(({ line }) => !/:\s*(none|0)\b/i.test(line));
    expect(offenders).toEqual([]);
  });
});
