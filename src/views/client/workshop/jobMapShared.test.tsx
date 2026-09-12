// PARITY — EvidenceDrawer (and its status-dot table) moved out of tabs/JobMapOrgPanel into
// ./jobMapShared (Job Map Tier 1 lift, 2026-09-11) with no logic change. The snapshot was written by
// rendering the PRE-MOVE panel's EvidenceDrawer over the same fixtures; the moved component must
// render byte-identically over every branch (basis prose, hidden run-tag basis, unassessed, gap
// truncation at 90, gap without a note).
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import fs from "node:fs";
import path from "node:path";
import { EvidenceDrawer, EVIDENCE_DOT } from "./jobMapShared";
import { DRAWER_FIXTURES } from "./jobMapShared.fixtures";

describe("EvidenceDrawer parity after the move", () => {
  it("renders byte-identically to the pre-move snapshot over every branch", () => {
    const html = DRAWER_FIXTURES.map((s) => render(<EvidenceDrawer step={s} />).container.innerHTML).join("\n<!-- fixture -->\n");
    expect(html).toBe(fs.readFileSync(path.join(__dirname, "jobMapShared.evidenceDrawer.parity.html"), "utf8"));
    expect(html).toContain("Families describe calling three programs");
    expect(html).not.toContain("run_mojo_analysis"); // internal metadata hidden at the boundary
    expect(html).toContain("Not assessed");
    expect(html).toContain("…"); // the 90-char gap truncation
  });
  it("keeps the four status words", () => {
    expect(Object.values(EVIDENCE_DOT).map((d) => d.label)).toEqual(["Evidenced", "Implied", "Unclear", "Declared"]);
  });
});
