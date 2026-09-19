// Gate A guard (i) — ruling T1 (2026-09-19): a title longer than LONG_TITLE_CHARS (40) carries
// data-fr-long-title (the 26ch measure); a short one does not. Never truncated: the full text renders.
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { LONG_TITLE_CHARS, WorkspaceWorkingPage } from "./WorkspaceWorkingPage";

const FUNDER_TITLE = "Philanthropic organizations and grant-making bodies supporting youth mental health initiatives";
const mount = (title: string) => render(<MemoryRouter><WorkspaceWorkingPage eyebrow="JOB MAP" title={title} count={8} unit="stages">x</WorkspaceWorkingPage></MemoryRouter>).container.querySelector("h1")!;

describe("WorkspaceWorkingPage — long title measure (T1)", () => {
  it("a >40-char title gets the wide measure and renders in full", () => {
    const h1 = mount(FUNDER_TITLE);
    expect(h1.hasAttribute("data-fr-long-title")).toBe(true);
    expect(h1.textContent).toContain(FUNDER_TITLE);
    expect(FUNDER_TITLE.length).toBeGreaterThan(LONG_TITLE_CHARS);
  });
  it("a short title does not", () => {
    const h1 = mount("The customer job");
    expect(h1.hasAttribute("data-fr-long-title")).toBe(false);
    expect(h1.textContent).toContain("The customer job");
  });
  it("the threshold is exact: 40 chars → short, 41 → wide", () => {
    expect(mount("a".repeat(40)).hasAttribute("data-fr-long-title")).toBe(false);
    expect(mount("a".repeat(41)).hasAttribute("data-fr-long-title")).toBe(true);
  });
});
