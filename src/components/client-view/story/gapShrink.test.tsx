// V2-8 — Gap shrink: set-aside demotes linked questions (visible, reversible, never
// deleted); linkless questions unshrinkable; export reflects issuance state. RED-validated.

import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { partitionByShrink, setAsideGroupHeading, type ShrinkableQuestion } from "@/lib/firstRead/gapShrink";
import { buildFirstReadExportHtml, type FirstReadExportData } from "@/lib/firstRead/exportHtml";

const q = (text: string, anchor: string | null): ShrinkableQuestion => ({ question_text: text, anchor_identity: anchor });

describe("V2-8 — partitionByShrink (demote linked, keep the rest, never delete)", () => {
  it("demotes questions whose anchor_identity is set aside; others stay active", () => {
    const rows = [q("A?", "find-1"), q("B?", "find-2"), q("C?", "delta-1")];
    const { active, demoted } = partitionByShrink(rows, new Set(["find-1", "delta-1"]));
    expect(active.map((r) => r.question_text)).toEqual(["B?"]);
    expect(demoted.map((r) => r.question_text)).toEqual(["A?", "C?"]);
    // NOTHING is lost — every row is in exactly one partition (no delete)
    expect(active.length + demoted.length).toBe(rows.length);
  });

  it("a LINKLESS question (anchor null) can never be demoted", () => {
    const rows = [q("orphan?", null)];
    expect(partitionByShrink(rows, new Set([""])).demoted).toHaveLength(0);
    expect(partitionByShrink(rows, new Set([""])).active).toHaveLength(1);
  });

  it("a market/differentiator set-aside with no anchored question shrinks nothing (honest)", () => {
    const rows = [q("A?", "find-1"), q("B?", "find-2")];
    // the set-aside identity is a market identity — no question anchors to it
    const { active, demoted } = partitionByShrink(rows, new Set(["market-xyz"]));
    expect(demoted).toHaveLength(0);
    expect(active).toHaveLength(2);
  });
});

// GapAct reads two hooks — mock both to drive the shrink render.
let questionsState: { rows: ShrinkableQuestion[]; loading: boolean } = { rows: [], loading: false };
let setAsideState: { identities: Set<string> } = { identities: new Set() };
vi.mock("@/hooks/useFirstReadOpenQuestions", () => ({ useFirstReadOpenQuestions: () => ({ ...questionsState, questions: questionsState.rows.map((r) => r.question_text) }) }));
vi.mock("@/hooks/useSetAsideIdentities", () => ({ useSetAsideIdentities: () => ({ ...setAsideState, loading: false }) }));
import GapAct from "@/components/client-view/story/GapAct";

describe("V2-8 — GapAct shrink render (live in-session, toggle restores)", () => {
  const rows = [q("Do rural families reach them?", "find-1"), q("Is the kinship result recognized?", "find-2")];

  it("set-aside demotes the linked question into a counted group; the rest stay active", () => {
    questionsState = { rows, loading: false };
    setAsideState = { identities: new Set(["find-1"]) };
    const { container } = render(<GapAct companyId="c1" sessionId="s1" />);
    // active list has ONLY the non-set-aside question
    const active = Array.from(container.querySelectorAll(".cvs-gap-list:not(.cvs-gap-list-demoted) .cvs-gap-text")).map((e) => e.textContent);
    expect(active).toEqual(["Is the kinship result recognized?"]);
    // the demoted group exists with the count, and still CONTAINS the set-aside question (not deleted)
    expect(container.querySelector(".cvs-gap-setaside")).toBeTruthy();
    expect(container.textContent).toContain(setAsideGroupHeading(1));
    expect(container.querySelector(".cvs-gap-item.is-demoted")?.textContent).toContain("Do rural families reach them?");
  });

  it("TOGGLE OFF (empty set-aside) restores all questions to the active list; no demoted group", () => {
    questionsState = { rows, loading: false };
    setAsideState = { identities: new Set() };
    const { container } = render(<GapAct companyId="c1" sessionId="s1" />);
    expect(container.querySelectorAll(".cvs-gap-item").length).toBe(2);
    expect(container.querySelector(".cvs-gap-setaside")).toBeNull(); // no demoted group
  });
});

describe("V2-8 — export reflects issuance-time shrink", () => {
  const data = (gap: string[], gapSetAside: string[]): FirstReadExportData => ({
    company: { name: "Acme" }, session: { id: "s1", date: "2026-07-23", presenter: null },
    statedProblem: null, standard: null, mirror: { score: null, bet: null, findings: [] }, perception: [],
    check: { items: [], tally: { confirmed: 0, corrected: 0, rejected: 0, not_important: 0 } },
    gap, gapSetAside, proposal: null, exportedAt: "2026-07-23T00:00:00Z",
  });
  it("renders the active questions + a labeled set-aside group (both present, none dropped)", () => {
    const html = buildFirstReadExportHtml(data(["Active question?"], ["Set aside question?"]));
    expect(html).toContain("Active question?");
    expect(html).toContain(setAsideGroupHeading(1));
    expect(html).toContain("Set aside question?"); // demoted, not deleted
  });
});
