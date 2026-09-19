// Gate A guard (b) — ruling M2 (2026-09-19): a market map's row carries evidence_confidence NULL (not
// measured) and the scaffold as its basis. The drawer renders "Unclear" with NO percentage for NULL and
// the basis line as the scaffold; a numeric confidence still renders its percentage. No new string.
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { EvidenceDrawer } from "./jobMapShared";
import type { JobStepRow } from "@/hooks/useJobSteps";

function row(extra: Partial<JobStepRow>): JobStepRow {
  return {
    id: "m1", company_id: "c", user_id: "u", journey_key: "pmk-philanthropic-organizations-and-grant-ma", journey_title: "Funders",
    journey_subtitle: "", step_number: 1, step_label: "Clarify mission need", description: "", designed: false, has_gap: false,
    evidence_status: "unclear", evidence_basis: "industry_anchor:grantmaking", evidence_confidence: null, gap_note: "", created_at: "2026-09-19T00:00:00Z", conditions_json: null,
    ...extra,
  } as JobStepRow;
}

describe("EvidenceDrawer — market map evidence (M2)", () => {
  it("NULL confidence: 'Unclear', no percentage, the scaffold basis line", () => {
    const html = render(<EvidenceDrawer step={row({})} />).container;
    expect(html.textContent).toContain("Unclear");
    expect(html.textContent).not.toMatch(/%/);
    expect(html.textContent).toContain("industry_anchor:grantmaking");
  });
  it("a numeric confidence still renders its percentage (a customer row is unchanged)", () => {
    const html = render(<EvidenceDrawer step={row({ journey_key: "customer", evidence_status: "implied", evidence_basis: "Families describe calling three programs before one answers.", evidence_confidence: 62 })} />).container;
    expect(html.textContent).toContain("Implied");
    expect(html.textContent).toContain("· 62%");
  });
  it("0 is a number, not NULL: it still renders (the legacy meaning of 0 is untouched)", () => {
    const html = render(<EvidenceDrawer step={row({ evidence_confidence: 0 })} />).container;
    expect(html.textContent).toContain("· 0%");
  });
});
