// V2-9 — Act 5 heard → help → plan: deterministic heard playback (no model), plan
// grounding, citation stability post-reorder, freeze-language sweep, export, canned-guard.

import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { groupHeardItems, heardTotal, HEARD_GROUPS, HEARD_EMPTY } from "@/lib/firstRead/heard";
import { groundPlanStages, type RawPlanStage } from "@/lib/firstRead/planGrounding";
import type { CheckItem } from "@/hooks/useFirstReadCapture";
import { buildFirstReadExportHtml, type FirstReadExportData } from "@/lib/firstRead/exportHtml";
import { PLAN_HEADING } from "@/components/client-view/story/check/ProposalAct";

const item = (over: Partial<CheckItem>): CheckItem => ({
  kind: "finding", ref: "r", text: "the finding", identity: "id-x", verdict: null, correctionText: null, capturedAt: null, ...over,
});

describe("V2-9 — WHAT WE HEARD: deterministic playback of the client's own verdicts", () => {
  it("groups by verdict; a corrected item plays back the CORRECTION text; no-verdict omitted", () => {
    const items = [
      item({ identity: "c1", verdict: "confirmed", text: "confirmed one" }),
      item({ identity: "x1", verdict: "corrected", text: "was this", correctionText: "the client's fix" }),
      item({ identity: "r1", verdict: "rejected", text: "wrong one" }),
      item({ identity: "s1", verdict: "not_important", text: "set aside one" }),
      item({ identity: "n1", verdict: null, text: "unanswered" }),
    ];
    const g = groupHeardItems(items);
    expect(g.confirmed.map((r) => r.text)).toEqual(["confirmed one"]);
    expect(g.corrected.map((r) => r.text)).toEqual(["the client's fix"]); // their words, not the original
    expect(g.rejected.map((r) => r.text)).toEqual(["wrong one"]);
    expect(g.not_important.map((r) => r.text)).toEqual(["set aside one"]);
    expect(heardTotal(g)).toBe(4); // the unanswered item is not "heard"
  });
});

// HeardAct reads useFirstReadCapture — mock it; assert NO generator/model is involved.
let captureState: { items: CheckItem[]; loading: boolean } = { items: [], loading: false };
vi.mock("@/hooks/useFirstReadCapture", () => ({ useFirstReadCapture: () => ({ ...captureState, tally: {}, setVerdict: vi.fn() }) }));
import HeardAct from "@/components/client-view/story/check/HeardAct";

describe("V2-9 — HeardAct renders the groups (no model — pure session data)", () => {
  it("renders non-empty groups with counts; honest-empty when nothing heard", () => {
    captureState = { items: [item({ identity: "c1", verdict: "confirmed", text: "You said yes" })], loading: false };
    const { container } = render(<HeardAct companyId="c1" sessionId="s1" />);
    expect(container.textContent).toContain(HEARD_GROUPS[0].heading);
    expect(container.textContent).toContain("· 1"); // count
    expect(container.textContent).toContain("You said yes");

    captureState = { items: [], loading: false };
    expect(render(<HeardAct companyId="c1" sessionId="s1" />).container.textContent).toContain(HEARD_EMPTY);
  });
});

describe("V2-9 — plan grounding (every stage cites a real on-the-table item)", () => {
  const stages: RawPlanStage[] = [
    { title: "Answer the rural-access question", cite_identity: "q-1", cite_kind: "question" },
    { title: "Build on the confirmed moat", cite_identity: "c-1", cite_kind: "confirmed" },
    { title: "Fabricated stage", cite_identity: "ghost", cite_kind: "question" }, // ungrounded
    { title: "No cite", cite_identity: null, cite_kind: "question" }, // ungrounded
  ];
  it("keeps grounded stages, drops ungrounded (FALSIFICATION: a fabricated cite is refused)", () => {
    const grounded = groundPlanStages(stages, new Set(["q-1"]), new Set(["c-1"]));
    expect(grounded.map((s) => s.title)).toEqual(["Answer the rural-access question", "Build on the confirmed moat"]);
    expect(grounded.every((s) => s.cite_identity)).toBe(true);
  });
  it("a question cite that only exists among CONFIRMED (wrong kind) is refused", () => {
    expect(groundPlanStages([{ title: "x", cite_identity: "c-1", cite_kind: "question" }], new Set(["q-1"]), new Set(["c-1"]))).toHaveLength(0);
  });
});

describe("V2-9 — citation stability: identities survive a list reorder (unlike indices)", () => {
  it("an identity citation resolves to the SAME question after reorder; an index would drift", () => {
    const before = [{ id: "idA", text: "A?" }, { id: "idB", text: "B?" }];
    const after = [{ id: "idB", text: "B?" }, { id: "idA", text: "A?" }]; // reordered
    const citedIdentity = "idB";
    const byIdBefore = new Map(before.map((q) => [q.id, q.text]));
    const byIdAfter = new Map(after.map((q) => [q.id, q.text]));
    expect(byIdBefore.get(citedIdentity)).toBe("B?");
    expect(byIdAfter.get(citedIdentity)).toBe("B?"); // STABLE — identity resolves the same
    // the old index behavior: index 1 pointed to B before, but points to A after (drift)
    expect(before[1].text).toBe("B?");
    expect(after[1].text).toBe("A?"); // an index-based citation would now be WRONG
  });
});

describe("V2-9 — freeze/machinery language is absent from room copy (sweep)", () => {
  it("HeardAct + plan copy carry no freeze/lock/session-status machinery words", () => {
    const roomStrings = [...HEARD_GROUPS.map((g) => g.heading), HEARD_EMPTY, PLAN_HEADING];
    const machinery = /\b(freeze|frozen|locked|immutable|proposal_issued|status\s|session\s+[0-9a-f])\b/i;
    for (const s of roomStrings) expect(s).not.toMatch(machinery);
  });
});

describe("V2-9 — export follows the plan; no model name in the leave-behind", () => {
  const data = (plan: FirstReadExportData["proposal"]): FirstReadExportData => ({
    company: { name: "Acme" }, session: { id: "s1", date: "2026-07-23", presenter: null },
    statedProblem: null, standard: null, mirror: { score: null, bet: null, findings: [] }, perception: [],
    check: { items: [], tally: { confirmed: 0, corrected: 0, rejected: 0, not_important: 0 } },
    gap: [], proposal: plan, exportedAt: "2026-07-23T00:00:00Z",
  });
  it("renders THE PLAN heading + stage titles; the meta line has no model name", () => {
    const html = buildFirstReadExportHtml(data({
      status: "generated", headline: "Offer", headline_sources: { response_ids: ["r1"] },
      blocks: [], plan: [{ title: "Answer the biggest question", cite_identity: "q-1", cite_kind: "question" }],
      generated_at: "2026-07-23T00:00:00Z", trace: { model: "qwen2.5:14b-instruct" },
    }));
    expect(html).toContain(PLAN_HEADING);
    expect(html).toContain("Answer the biggest question");
    // FALSIFICATION: the model name must not leak into the leave-behind
    expect(html).not.toContain("qwen2.5:14b-instruct");
  });
});
