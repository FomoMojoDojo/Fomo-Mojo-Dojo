// ProposalReviewPanel gate (Inputs Tier 1): without governance.proposal.apply the workspace passes
// canAccept=false and the Accept control is absent; the tab passes nothing and keeps it (default true).
import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { ProposalReviewPanel } from "./inputsShared";
import type { FileProposalRow } from "@/hooks/useFileProposals";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

const proposal: FileProposalRow = {
  id: "prop-1", company_id: "c1", file_id: "file-1", file_name: "review.md", source_type: "uploaded_file", summary: "A summary.",
  evidence: [], signal_type: "", framework_results: [], suggested_areas: [], candidate_positioning_updates: [], candidate_job_steps: [],
  candidate_needs: [{ desired_outcome: "Minimize wait", tier: "need", step_label: "Define", importance: 8, satisfaction: 3, rationale: "" } as never],
  candidate_outcomes: [], possible_gaps: [], possible_routes: [], experiments_to_run: [], contradictions: [], confidence: "high",
  confidence_reason: "", questions_to_verify: [], status: "pending", processing_state: "ready", processing_error: null,
  processing_started_at: null, processing_completed_at: "2026-07-01T00:00:00Z", applied_areas: [], created_at: "2026-07-01T00:00:00Z", reviewed_at: null,
};
const accept = (c: HTMLElement) => Array.from(c.querySelectorAll("button")).find((b) => (b.textContent || "").startsWith("Accept"));

describe("ProposalReviewPanel Accept gate", () => {
  it("renders Accept by default (the tab's behaviour)", () => {
    const { container } = render(<ProposalReviewPanel proposal={proposal} onClose={() => {}} onAccept={() => {}} onDismiss={() => {}} onReject={() => {}} />);
    expect(accept(container)).toBeTruthy();
  });
  it("hides Accept when canAccept is false (no governance.proposal.apply)", () => {
    const { container } = render(<ProposalReviewPanel proposal={proposal} canAccept={false} onClose={() => {}} onAccept={() => {}} onDismiss={() => {}} onReject={() => {}} />);
    expect(accept(container)).toBeUndefined();
    expect(container.textContent).toContain("Reject");
  });
});
