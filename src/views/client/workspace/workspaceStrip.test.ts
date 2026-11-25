// ── SP-679 (2026-11-25): the fixed bottom strip of the workspace shell ───────────────────────────
//
// The cluster used to float over the page; it now sits in an opaque bar the width of the window, and
// every page frame ends above it. These read the stylesheet and the shell's source, the way the
// colour tests do, because the test environment computes neither custom properties nor layout. The
// geometry itself — where the strip and the squares land, that no text is under them, that focus is
// never left under the strip — is asserted in a real browser by tests/workspace/b-cluster,
// h-rail-collision and h2-hidden-focus.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { WORKSPACE_STRINGS } from "./workspaceNav";

const css = readFileSync(join(__dirname, "..", "firstReadPreview/firstRead.css"), "utf8");
const shell = readFileSync(join(__dirname, "WorkspaceShell.tsx"), "utf8");
/** The body of the FIRST rule whose selector is exactly `selector`. */
const rule = (selector: string): string => {
  const at = css.indexOf(`\n${selector} {`);
  expect(at, `no rule for ${selector}`).toBeGreaterThan(-1);
  return css.slice(at, css.indexOf("}", at));
};
/** A rule written on one line, found by its selector at the start of that line. */
const line = (selector: string): string => {
  const hit = css.split("\n").find((l) => l.startsWith(`${selector} {`) && l.trimEnd().endsWith("}"));
  expect(hit, `no one-line rule for ${selector}`).toBeTruthy();
  return hit ?? "";
};
const decl = (body: string, prop: string): string => body.match(new RegExp(`(?:^|[\\s;{])${prop}:\\s*([^;]+);`))?.[1].trim() ?? "";

describe("the workspace's bottom strip (SP-679)", () => {
  it("is fixed to the bottom edge at the full width of the window, above the page and below the launcher", () => {
    const strip = rule(".fr-ws-strip");
    expect([decl(strip, "position"), decl(strip, "left"), decl(strip, "right"), decl(strip, "bottom")]).toEqual(["fixed", "0", "0", "0"]);
    expect(Number(decl(strip, "z-index"))).toBe(40);
    expect(Number(decl(rule(".fr-launcher"), "z-index"))).toBeGreaterThan(40);
    // the cluster is a row inside it now — it no longer positions itself
    const cluster = rule(".fr-ws-cluster");
    expect(decl(cluster, "position")).toBe("");
    expect(decl(cluster, "bottom")).toBe("");
  });

  it("its height lives in ONE variable, 76px, and the strip, the three frames and the Brief panel all read it", () => {
    const root = rule("html:has(.fr-workspace-page)");
    expect(decl(root, "--fr-ws-strip-h")).toBe("76px");
    expect(css.match(/--fr-ws-strip-h:/g)).toHaveLength(1);
    const strip = rule(".fr-ws-strip");
    expect(decl(strip, "height")).toBe("var(--fr-ws-strip-h)");
    expect(decl(strip, "box-sizing")).toBe("border-box");
    // 76 = the hairline + 13 above the squares + 48 + 14 below
    expect(decl(strip, "padding-bottom")).toBe("14px");
    expect(decl(strip, "align-items")).toBe("flex-end");
    const reserve = "calc(var(--fr-ws-strip-h) + 24px)";
    expect(decl(rule(".fr-ws-working"), "padding")).toBe(`0 0 ${reserve}`);
    expect(decl(rule(".fr-ws-hero"), "padding")).toBe(`0 0 ${reserve}`);
    expect(decl(rule(".fr-ws-read-inner"), "padding")).toBe(`64px 20px ${reserve}`);
    expect(css).toContain(`.fr-ws-read-inner { padding: 96px 48px ${reserve}; }`);
    // the Brief panel ends exactly where the strip begins (ruling 10)
    expect(css).toContain("height: calc(100vh - var(--fr-shell-h) - var(--fr-ws-strip-h)); overflow-y: auto;");
    // and the old 92px reserve is written nowhere
    expect(css).not.toContain("92px");
  });

  it("its ground follows the page and is opaque: a tint laid over the page's own solid color", () => {
    const paper = rule(".fr-ws-strip");
    expect(decl(paper, "background")).toBe("linear-gradient(hsl(var(--fr-line) / 0.5), hsl(var(--fr-line) / 0.5)), hsl(var(--fr-paper))");
    expect(decl(paper, "border-top")).toBe("1px solid hsl(var(--fr-line))");
    const slate = rule(".fr-workspace-page:has(.fr-ws-read) .fr-ws-strip");
    expect(decl(slate, "background")).toBe("linear-gradient(hsl(var(--fr-ink) / 0.25), hsl(var(--fr-ink) / 0.25)), hsl(var(--fr-slate))");
    expect(decl(slate, "border-top-color")).toBe("hsl(var(--fr-paper) / 0.15)");
    // the last layer of each — the color under the tint — has no alpha
    for (const bg of [decl(paper, "background"), decl(slate, "background")]) expect(bg).toMatch(/, hsl\(var\(--fr-(paper|slate)\)\)$/);
  });

  it("the squares keep their size and lose the translucency's blur and shadows", () => {
    const both = css.slice(css.indexOf("\n.fr-ws-arrow,\n.fr-ws-map {"), css.indexOf("/* Hover label above the arrow"));
    expect(both).toContain("width: 48px;");
    expect(both).toContain("height: 48px;");
    expect(both).not.toMatch(/backdrop-filter/);
    expect(both).not.toMatch(/box-shadow/);
    // paper strip: paper arrows, the filled map square; slate strip: paper tints, ink glyphs
    expect(decl(line(".fr-ws-arrow"), "background")).toBe("hsl(var(--fr-paper))");
    expect(decl(line(".fr-ws-map"), "background")).toBe("hsl(var(--fr-ink))");
    expect(decl(line(".fr-ws-map"), "color")).toBe("hsl(var(--fr-paper))");
    expect(decl(line(".fr-workspace-page:has(.fr-ws-read) .fr-ws-arrow"), "background")).toBe("hsl(var(--fr-paper) / 0.35)");
    expect(decl(line(".fr-workspace-page:has(.fr-ws-read) .fr-ws-map"), "background")).toBe("hsl(var(--fr-paper) / 0.8)");
    // a hovered map square must never become a paper glyph on paper
    expect(decl(line(".fr-ws-map:hover"), "background")).toBe("hsl(var(--fr-ink) / 0.85)");
  });

  it("the arrow's hover label carries the outlined control's ground, so it reads over any page", () => {
    const label = rule(".fr-ws-arrow-label");
    const control = rule(".fr-ws-filter, .fr-ws-control");
    expect(decl(label, "background")).toBe("hsl(var(--fr-paper))");
    expect(decl(label, "border")).toBe("1px solid hsl(var(--fr-line))");
    expect(decl(label, "color")).toBe("hsl(var(--fr-ink))");
    // the same three values the control it borrows from uses
    expect(control).toContain("border: 1px solid hsl(var(--fr-line));");
    expect(control).toContain("background: hsl(var(--fr-paper));");
    expect(control).toContain("color: hsl(var(--fr-ink));");
  });

  it("scroll padding keeps a focused control out from under the strip and the header, only while a workspace page is mounted", () => {
    const root = rule("html:has(.fr-workspace-page)");
    expect(decl(root, "scroll-padding-bottom")).toBe("var(--fr-ws-strip-h)");
    const top = parseInt(decl(root, "scroll-padding-top"), 10);
    const shellH = parseInt(css.match(/--fr-shell-h:\s*(\d+)px;/)![1], 10);
    // never less than the header's own variable; 70 is the header with the operator's scan control
    expect(top).toBeGreaterThanOrEqual(shellH);
    expect(top).toBe(70);
    // no unscoped scroll padding anywhere: other surfaces are untouched
    expect(css.match(/scroll-padding/g)).toHaveLength(2);
  });

  it("the shell wraps the same cluster in a named nav — no new string, the three controls unchanged", () => {
    expect(shell).toContain('<nav className="fr-ws-strip" aria-label={WORKSPACE_STRINGS.navigation} data-testid="workspace-strip">');
    expect(WORKSPACE_STRINGS.navigation).toBe("Workspace navigation");
    const nav = shell.slice(shell.indexOf('<nav className="fr-ws-strip"'), shell.indexOf("</nav>"));
    // prev · map · next, in that order, the cluster's own test id still on the three-square group
    const order = ['data-testid="workspace-cluster"', '<Arrow dir="prev"', 'data-testid="workspace-square"', '<Arrow dir="next"'].map((s) => nav.indexOf(s));
    expect(order.every((i) => i > -1)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(nav).toContain("aria-label={WORKSPACE_STRINGS.openMap}");
  });
});
