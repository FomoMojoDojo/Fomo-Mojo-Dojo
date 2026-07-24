// FR-V2-11 — Act 4 verdict simplification + set-aside relabel.
//
// The verdict control renders exactly THREE buttons — Confirm / Reject / "True, but
// not a focus now" — for BOTH the findings list (CheckItemRow) and the say-vs-see
// delta list (DeltaItemRow), from ONE shared label constant (no forks). The
// correct/refine path is REMOVED FROM RENDER but its stored machinery stays DORMANT:
// a legacy 'corrected' verdict still annotates in place and still plays back in the
// heard record. Each block is falsification-validated.

import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import CheckItemRow from "./CheckItemRow";
import DeltaItemRow from "./DeltaItemRow";
import CheckControl, { NOT_IMPORTANT_LABEL } from "./CheckControl";
import { checkItemAnnotation } from "@/lib/firstRead/checkItemView";
import { groupHeardItems, HEARD_GROUPS } from "@/lib/firstRead/heard";
import type { CheckItem } from "@/hooks/useFirstReadCapture";

const finding: CheckItem = {
  kind: "finding", ref: "f1", text: "Referral gatekeepers shape access.",
  identity: "ci-f", verdict: null, correctionText: null, capturedAt: null,
};
const delta: CheckItem = {
  kind: "delta", ref: "d1", text: "We close gaps.", identity: "ci-d",
  verdict: null, correctionText: null, capturedAt: null,
  delta: { deltaType: "echoed", say: "We close gaps.", see: "A leading provider.", quote: null, quoteSourceText: null, eventDate: null },
};

const labelsOf = (c: HTMLElement) =>
  Array.from(c.querySelectorAll(".cvs-check-btn")).map((b) => (b.textContent || "").trim());

describe("FR-V2-11 GOAL 1 — three verdict buttons, no Correct, on BOTH row types", () => {
  it("CheckItemRow (findings) renders Confirm / Reject / focus — exactly three, Correct absent", () => {
    const { container } = render(<CheckItemRow item={finding} onSet={() => {}} />);
    const labels = labelsOf(container);
    expect(labels).toEqual(["Confirm", "Reject", NOT_IMPORTANT_LABEL]);
    // Correct is gone (plant it back → this absence assertion fails)
    expect(labels).not.toContain("Correct");
    expect(container.querySelector(".cvs-check-correct")).toBeNull();
    expect(container.querySelector(".cvs-check-correction")).toBeNull();
  });

  it("DeltaItemRow (say-vs-see) renders the SAME three buttons — no fork", () => {
    const { container } = render(<DeltaItemRow item={delta} onSet={() => {}} />);
    expect(labelsOf(container)).toEqual(["Confirm", "Reject", NOT_IMPORTANT_LABEL]);
    expect(container.querySelector(".cvs-check-correct")).toBeNull();
  });
});

describe("FR-V2-11 GOAL 1/label — the fourth label is the operator-signed constant, exact", () => {
  it("the constant is exactly 'True, but not a focus now' and the old label is gone everywhere", () => {
    expect(NOT_IMPORTANT_LABEL).toBe("True, but not a focus now");
    const { container } = render(<CheckControl verdict={null} onSet={() => {}} />);
    const text = container.textContent || "";
    expect(text).toContain(NOT_IMPORTANT_LABEL);
    // FALSIFICATION: the retired label must not survive anywhere in the control
    expect(text).not.toContain("not important to us");
    expect(text).not.toContain("True — but not important");
  });
});

describe("FR-V2-11 GOAL 1 — the correction machinery stays DORMANT (legacy verdicts round-trip)", () => {
  const corrected: CheckItem = {
    kind: "finding", ref: "f2", text: "Original outside reading.",
    identity: "ci-c", verdict: "corrected", correctionText: "the client's fix", capturedAt: "2026-07-24T00:00:00Z",
  };

  it("a legacy corrected verdict still annotates in place (the corrected render path is not deleted)", () => {
    // the shared annotation derivation still yields the corrected branch...
    const ann = checkItemAnnotation(corrected);
    expect(ann).toEqual({ kind: "corrected", text: "the client's fix" });
    // ...and CheckItemRow still shows it verbatim
    const { container } = render(<CheckItemRow item={corrected} onSet={() => {}} />);
    expect(container.querySelector(".cvs-check-corrected-note")?.textContent).toContain("the client's fix");
  });

  it("a legacy corrected verdict still plays back in the heard record under 'What you refined'", () => {
    const grouped = groupHeardItems([corrected]);
    expect(grouped.corrected).toHaveLength(1);
    expect(grouped.corrected[0].text).toBe("the client's fix"); // their words, not the original
    // the refined group heading still exists in the single-source group list (dormant, not removed)
    expect(HEARD_GROUPS.some((g) => g.key === "corrected")).toBe(true);
  });
});

describe("FR-V2-11 GOAL 4 — the heard 'What you refined' group renders only when count > 0", () => {
  const confirmed: CheckItem = { ...finding, verdict: "confirmed", capturedAt: "2026-07-24T00:00:00Z" };

  it("with no corrected items, the corrected group is empty (HeardAct omits empty groups)", () => {
    const grouped = groupHeardItems([confirmed]);
    expect(grouped.corrected).toHaveLength(0); // → HeardAct's `rows.length === 0` guard drops the heading
    expect(grouped.confirmed).toHaveLength(1);
  });

  it("with a corrected item present, the corrected group has rows (heading would render)", () => {
    const grouped = groupHeardItems([{ ...finding, verdict: "corrected", correctionText: "fix" }]);
    expect(grouped.corrected).toHaveLength(1);
  });
});
