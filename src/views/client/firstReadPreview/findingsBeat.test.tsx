// "What stands out" (findings) beat — the empty state is INTEGRITY-DERIVED, never array emptiness
// alone (STEP 2, operator ruling 2026-09-02). Same three-state shape as offering/gap/questions:
// not-yet / looked-and-none / couldn't-check, from first_read_findings integrity (evidencePhase1
// capture, which records seen/captured counts). The load-bearing proof: the SAME empty findings array
// renders THREE DIFFERENT lines by integrity state — so it cannot be reading emptiness. A "7 seen, 0
// captured" run (an E4-style upstream drop) lands as looked_none with the counts on the integrity row.
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { ActFindings } from "./acts";
import { EMPTY_FIRST_READ, type FirstReadPreviewData, type FRFinding } from "./types";

const S = {
  notYet: "No public findings surfaced yet.",
  lookedNone: "We read the outside record and nothing stood out on its own yet.",
  couldnt: "We couldn't read the record for what stands out this time.",
} as const;

const empty = (state: FirstReadPreviewData["findingsIntegrity"]): FirstReadPreviewData => ({
  ...EMPTY_FIRST_READ,
  findings: [],
  statusConflicts: [],
  findingsIntegrity: state,
});

const renderF = (read: FirstReadPreviewData) => render(<ActFindings read={read} />).container;

describe("Findings beat empty state — integrity, not emptiness", () => {
  it("not-yet (no integrity row) → the not-yet line, no findings list", () => {
    const c = renderF(empty("not_yet"));
    expect(c.textContent).toContain(S.notYet);
    expect(c.querySelectorAll("main > *").length).toBeGreaterThan(0); // the Absent block mounts
  });

  it("looked-and-none (a '7 seen, 0 captured' completed run) → the looked line, no list", () => {
    const c = renderF(empty("looked_none"));
    expect(c.textContent).toContain(S.lookedNone);
    expect(c.textContent).not.toContain(S.notYet);
  });

  it("couldn't-check (integrity failed) → the failed-read line, no list", () => {
    const c = renderF(empty("couldnt_check"));
    expect(c.textContent).toContain(S.couldnt);
  });

  it("INTEGRITY-NOT-EMPTINESS: the same empty array renders three DISTINCT lines by state", () => {
    const t = (s: FirstReadPreviewData["findingsIntegrity"]) => renderF(empty(s)).textContent ?? "";
    const lines = new Set([t("not_yet"), t("looked_none"), t("couldnt_check")]);
    expect(lines.size).toBe(3); // if it read array emptiness, all three would be identical
  });

  it("with findings present, the list renders and no empty line shows", () => {
    const f: FRFinding = { id: "f1", body: "Geniant's roll-up M&A is its primary capability-assembly mechanism.", recurrence: 0, sourceTag: null, quotes: [], stale: false, ageMarker: null, statusDisputed: false };
    const c = renderF({ ...EMPTY_FIRST_READ, findings: [f], findingsIntegrity: "looked_none" });
    expect(c.textContent).toContain(f.body);
    expect(c.textContent).not.toContain(S.lookedNone);
  });
});
