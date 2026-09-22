// "What we heard" (commit 2, 2026-09-22; fix pass): groups in order (Important · Interesting · Not important · Stood out to us),
// empty groups absent, entries in beat order then created_at, each with the anchored text + latest note + a jump
// to the anchor's beat; a row_gone mark appears only here, marked row_gone; FM19: a mark on an offering question whose
// key has not filled or has changed is listed here (row_gone) — never invisible; nothing renders without a provider
// or at 0 marks. Plants: orderMarks sorting by created_at only → the beat-order assertion is red; WhatWeHeard
// filtering out unplaced marks → the FM19 case is red.
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { MarksProvider, type MarksSurface } from "./MarksContext";
import { WhatWeHeard, orderMarks } from "./WhatWeHeard";
import { presentAnchorIds } from "./presentAnchors";
import type { LiveMark } from "./useFirstReadMarks";
import { EMPTY_FIRST_READ, type FirstReadPreviewData } from "@/views/client/firstReadPreview/types";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
const BEATS = [{ key: "record", label: "What the world sees and says" }, { key: "findings", label: "What stands out" }, { key: "questions", label: "Questions" }, { key: "heard", label: "What we heard" }, { key: "next", label: "Next move" }];
const READ: FirstReadPreviewData = { ...EMPTY_FIRST_READ, findings: [{ id: "f-1", body: "Fixture finding", recurrence: 0, sourceTag: null, quotes: [], stale: false, ageMarker: null }], questions: ["Q"], questionAnchors: [{ identity: "qi-1", text: "Q" }] } as FirstReadPreviewData;
const m = (id: string, over: Partial<LiveMark>): LiveMark => ({ id, company_id: "c1", kind: "our_mark", beat_key: "findings", anchor_kind: "finding", anchor_key: "f-1", anchor_text: "Fixture finding", anchor_text_sha256: "a".repeat(64), created_at: "2026-09-22T00:00:01Z", version: 1, note: "note", disposition: null, ...over });
const value = (marks: LiveMark[], goToBeat = vi.fn()): Omit<MarksSurface, "openId" | "setOpenId"> => ({ companyId: "c1", marks, byAnchor: new Map(), frozen: false, currentBeat: "heard", goToBeat, create: vi.fn(), append: vi.fn(), withdraw: vi.fn() });

describe("What we heard", () => {
  it("renders nothing without a provider and nothing at 0 marks", () => {
    expect(render(<WhatWeHeard read={READ} beats={BEATS} />).container.querySelectorAll("[data-fr-mark]")).toHaveLength(0);
    expect(render(<MarksProvider value={value([])}><WhatWeHeard read={READ} beats={BEATS} /></MarksProvider>).container.querySelectorAll("[data-fr-mark]")).toHaveLength(0);
  });
  it("groups in order, empty groups absent, entries in beat order then created_at; the latest note; a jump to the beat; row_gone only here", () => {
    const go = vi.fn();
    const marks = [
      m("later-q", { kind: "client_reaction", disposition: "important", beat_key: "questions", anchor_kind: "question", anchor_key: "qi-1", anchor_text: "Q", created_at: "2026-09-22T00:00:00Z", note: "q note v3", version: 3 }),
      m("finding-a", { kind: "client_reaction", disposition: "important", created_at: "2026-09-22T00:00:05Z", note: "finding note" }),
      m("gone", { anchor_key: "f-gone", anchor_text: "A row that left", note: "" }),
      m("not-imp", { id: "not-imp", kind: "client_reaction", disposition: "not_important", created_at: "2026-09-22T00:00:06Z", note: "ni" }),
    ];
    const { container } = render(<MarksProvider value={value(marks, go)}><WhatWeHeard read={READ} beats={BEATS} /></MarksProvider>);
    expect([...container.querySelectorAll("[data-fr-heard-group]")].map((g) => g.getAttribute("data-fr-heard-group"))).toEqual(["important", "not_important", "our_mark"]); // Interesting absent
    expect([...container.querySelectorAll("[data-fr-heard-group] .fr-eyebrow")].map((g) => g.textContent)).toEqual(["Important", "Not important", "Stood out to us"]);
    const first = [...container.querySelectorAll("[data-fr-heard-group='important'] [data-fr-heard-entry]")].map((e) => e.getAttribute("data-fr-heard-entry"));
    expect(first).toEqual(["finding-a", "later-q"]); // beat order (findings before questions) beats created_at
    expect(container.querySelector("[data-fr-heard-entry='later-q'] .fr-heard-note")!.textContent).toBe("q note v3");
    expect(container.querySelector("[data-fr-heard-entry='gone']")!.getAttribute("data-fr-mark-state")).toBe("row_gone");
    expect(container.querySelector("[data-fr-heard-entry='gone'] .fr-heard-note")).toBeNull(); // no note → no note line
    expect(container.querySelector("[data-fr-heard-entry='finding-a']")!.getAttribute("data-fr-mark-state")).toBe("present");
    fireEvent.click(container.querySelector("[data-fr-heard-entry='later-q'] [data-fr-heard-jump]")!);
    expect(go).toHaveBeenCalledWith("questions");
    expect(container.querySelector("[data-fr-heard-entry='later-q'] [data-fr-heard-jump]")!.textContent).toBe("Questions"); // the beat's own label
  });
  it("FM19: a mark on an offering question whose key has not filled, or has changed, is listed here as row_gone; once the key fills it is present", () => {
    const marks = [m("oq", { beat_key: "questions", anchor_kind: "offering_question", anchor_key: "offering:abc", anchor_text: "Offer Q?", note: "" })];
    const unfilled = render(<MarksProvider value={value(marks)}><WhatWeHeard read={{ ...READ, offeringQuestionKeys: undefined }} beats={BEATS} /></MarksProvider>).container;
    expect(unfilled.querySelector("[data-fr-heard-entry='oq']")).not.toBeNull();
    expect(unfilled.querySelector("[data-fr-heard-entry='oq']")!.getAttribute("data-fr-mark-state")).toBe("row_gone");
    const changed = render(<MarksProvider value={value(marks)}><WhatWeHeard read={{ ...READ, offeringQuestionKeys: ["offering:zzz"] }} beats={BEATS} /></MarksProvider>).container;
    expect(changed.querySelector("[data-fr-heard-entry='oq']")!.getAttribute("data-fr-mark-state")).toBe("row_gone");
    const filled = render(<MarksProvider value={value(marks)}><WhatWeHeard read={{ ...READ, offeringQuestionKeys: ["offering:abc"] }} beats={BEATS} /></MarksProvider>).container;
    expect(filled.querySelector("[data-fr-heard-entry='oq']")!.getAttribute("data-fr-mark-state")).toBe("present");
  });
  it("orderMarks: beat order first, created_at second", () => {
    const idx = (k: string) => BEATS.findIndex((b) => b.key === k);
    const sorted = orderMarks([m("b", { beat_key: "questions", created_at: "2026-01-01T00:00:00Z" }), m("a", { beat_key: "record", created_at: "2026-12-01T00:00:00Z" }), m("c", { beat_key: "questions", created_at: "2026-02-01T00:00:00Z" })], idx);
    expect(sorted.map((x) => x.id)).toEqual(["a", "b", "c"]);
  });
  it("presentAnchorIds mirrors the page's keys (a sample) and never lists static sections", () => {
    const ids = presentAnchorIds(READ);
    expect(ids.has("finding|f-1")).toBe(true); expect(ids.has("question|qi-1")).toBe(true); expect(ids.has("section|findings")).toBe(true);
    expect(ids.has("section|score")).toBe(false); expect(ids.has("finding|f-gone")).toBe(false); expect(ids.has("score_value|score")).toBe(false); // no score in this read
  });
});
