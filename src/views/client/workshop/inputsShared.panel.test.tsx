// ProposalReviewPanel is STATUS-AWARE (2026-09-13). The same panel serves review (status pending) and
// reading (accepted / rejected). Proven on a proposal built in the shape of a real accepted Edgewood row
// (ready, accepted 2026-07-16, applied_areas {jobmap,odi,strategy,routes}, 3 needs / 3 steps / 3 outcomes /
// 3 routes / 2 evidence quotes / framework findings) — synthetic text, real structure:
//   pending  ⇒ today's footer: Accept … / Reject / Cancel, selection checkboxes present
//   accepted ⇒ the decision record (status + reviewed_at + applied areas) and Close; NO Accept, NO Reject,
//              NO checkboxes — the same content sections render in both modes
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { ProposalReviewPanel } from "./inputsShared";
import type { FileProposalRow } from "@/hooks/useFileProposals";

const ACCEPTED: FileProposalRow = {
  id: "prop-accepted", company_id: "c1", file_id: "file-1", file_name: "Strategy Review.md", source_type: "uploaded_file",
  summary: "The document outlines a strategic review session focusing on current operational challenges.",
  evidence: ["Does high-value, category-leading work and funds it on a shoestring.", "The counseling service launched fast and now has a waiting list."],
  signal_type: "document",
  framework_results: [
    { framework: "strategy_cascade", findings: [{ claim: "Aims to address operational challenges by proposing new executive roles.", evidence: "Needs a deal-team model.", confidence: "medium", mojo_area: "strategy", suggested_update: "Add executive roles.", risk_if_ignored: "Fragmented execution." }] },
    { framework: "jtbd", findings: [{ claim: "Families need a structured path to services.", evidence: "Waiting list.", confidence: "medium", mojo_area: "jobmap", suggested_update: "Map the intake job.", risk_if_ignored: "Drop-off." }] },
  ],
  suggested_areas: ["job_map", "opportunities"], candidate_positioning_updates: [],
  candidate_job_steps: [
    { step_label: "Define strategic function", step_description: "Build a defined strategic function.", evidence: "Wants a defined strategic function.", confidence: "medium" },
    { step_label: "Track client journeys", step_description: "Adopt a CRM.", evidence: "Needs a CRM.", confidence: "medium" },
    { step_label: "Fund the work", step_description: "Structured fundraising.", evidence: "Underfunded.", confidence: "medium" },
  ],
  candidate_needs: [
    { desired_outcome: "A structured approach to implementing good ideas with discipline.", importance: 0, satisfaction: 0, customer_validated: false, evidence: "Wants discipline." },
    { desired_outcome: "A deal-team model and CRM for tracking client journeys.", importance: 0, satisfaction: 0, customer_validated: false, evidence: "Needs a deal-team model." },
    { desired_outcome: "Evidence-based decision-making.", importance: 0, satisfaction: 0, customer_validated: false, evidence: "Fragmented data." },
  ],
  candidate_outcomes: [
    { outcome: "Fewer ideas lost between sessions", related_opportunities: ["Define strategic function"], evidence: "Ideas lack follow-through.", confidence: "medium" },
    { outcome: "Client journeys visible in one place", related_opportunities: ["Track client journeys"], evidence: "Needs a CRM.", confidence: "medium" },
    { outcome: "Funding matched to programme value", related_opportunities: ["Fund the work"], evidence: "Underfunded.", confidence: "medium" },
  ],
  possible_gaps: [],
  possible_routes: [
    { title: "Define strategic function", why_this_could_matter: "Implementation discipline.", linked_opportunity: "Define strategic function", evidence: "Wants a defined strategic function.", confidence: "medium" },
    { title: "Adopt a CRM", why_this_could_matter: "Client journey visibility.", linked_opportunity: "Track client journeys", evidence: "Needs a CRM.", confidence: "medium" },
    { title: "Structured fundraising", why_this_could_matter: "Funding gap.", linked_opportunity: "Fund the work", evidence: "Underfunded.", confidence: "medium" },
  ],
  experiments_to_run: [], contradictions: [], confidence: "medium",
  confidence_reason: "Detailed insights but no timelines or budgets.", questions_to_verify: [],
  status: "accepted", processing_state: "ready", processing_error: null,
  processing_started_at: "2026-07-16T17:00:00Z", processing_completed_at: "2026-07-16T17:05:00Z",
  applied_areas: ["jobmap", "odi", "strategy", "routes"], created_at: "2026-07-16T17:00:00Z", reviewed_at: "2026-07-16T17:08:04.105+00:00",
};
const PENDING: FileProposalRow = { ...ACCEPTED, id: "prop-pending", status: "pending", applied_areas: [], reviewed_at: null };

const buttons = (c: HTMLElement) => Array.from(c.querySelectorAll("button")).map((b) => (b.textContent || "").trim());
const sectionLabels = (c: HTMLElement) => Array.from(c.querySelectorAll("div")).map((d) => (d.textContent || "").trim()).filter((t) => /^(Evidence Analysis|Evidence from file|Signal patterns|Suggested foundation areas|Job map updates|Opportunities \/ needs|Outcomes|Routes)$/i.test(t));
const handlers = () => ({ onClose: vi.fn(), onAccept: vi.fn(), onReject: vi.fn(), onDismiss: vi.fn() });

describe("ProposalReviewPanel — status-aware", () => {
  it("pending: Accept / Reject / Cancel and selection checkboxes (today's review footer)", () => {
    const h = handlers();
    const { container } = render(<ProposalReviewPanel proposal={PENDING} {...h} />);
    const b = buttons(container);
    expect(b.some((t) => /^Accept \d+ selected$/.test(t))).toBe(true);
    expect(b).toContain("Reject");
    expect(b).toContain("Cancel");
    expect(container.querySelectorAll("input[type=checkbox]").length).toBeGreaterThan(0);
    expect(container.querySelector("[data-testid=proposal-decision-record]")).toBeNull();
  });
  it("accepted: the decision record + Close; NO Accept, NO Reject, NO checkboxes", () => {
    const h = handlers();
    const { container } = render(<ProposalReviewPanel proposal={ACCEPTED} {...h} />);
    const b = buttons(container);
    expect(b.some((t) => /^Accept/.test(t))).toBe(false);
    expect(b).not.toContain("Reject");
    expect(b).not.toContain("Cancel");
    expect(b).toContain("Close");
    expect(container.querySelectorAll("input[type=checkbox]")).toHaveLength(0);
    const record = container.querySelector("[data-testid=proposal-decision-record]")!;
    expect(record).not.toBeNull();
    const text = (record.textContent || "").replace(/\s+/g, " ");
    expect(text).toMatch(/accepted Jul 16, 2026/);
    expect(text).toMatch(/Job Map · Opportunities · Strategy · Routes/); // applied_areas {jobmap,odi,strategy,routes} as labelled elsewhere
    fireEvent.click(container.querySelector("[data-testid=proposal-close]")!);
    expect(h.onClose).toHaveBeenCalledTimes(1);
    expect(h.onAccept).not.toHaveBeenCalled();
    expect(h.onReject).not.toHaveBeenCalled();
  });
  it("both modes render the same content sections with the same stored text", () => {
    const a = render(<ProposalReviewPanel proposal={ACCEPTED} {...handlers()} />).container;
    const p = render(<ProposalReviewPanel proposal={PENDING} {...handlers()} />).container;
    expect(sectionLabels(a)).toEqual(sectionLabels(p));
    expect(sectionLabels(a)).toEqual(expect.arrayContaining(["Evidence Analysis", "Evidence from file", "Signal patterns", "Suggested foundation areas", "Job map updates", "Opportunities / needs", "Outcomes", "Routes"]));
    for (const t of [ACCEPTED.summary, ACCEPTED.evidence[0], ACCEPTED.candidate_needs[0].desired_outcome, ACCEPTED.candidate_job_steps[1].step_label, ACCEPTED.possible_routes[2].title, ACCEPTED.framework_results[0].findings[0].claim]) {
      expect(a.textContent).toContain(t);
      expect(p.textContent).toContain(t);
    }
  });
  it("rejected is decided too: no Accept / Reject, the record names the status", () => {
    const { container } = render(<ProposalReviewPanel proposal={{ ...ACCEPTED, id: "prop-rejected", status: "rejected", applied_areas: [] }} {...handlers()} />);
    expect(buttons(container)).toEqual(["Close"]);
    expect(container.querySelector("[data-testid=proposal-decision-record]")!.textContent).toMatch(/rejected Jul 16, 2026/);
  });
});
