// Gate S — the Intake page renders the structured capture, shows an honest absence line when
// completion_view is null, renders it when present, and offers a prior-submission switcher.

import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import IntakeView, { COMPLETION_ABSENT_NOTE } from "./IntakeView";

vi.mock("react-router-dom", () => ({ useParams: () => ({ companyId: "c1" }) }));
vi.mock("@/hooks/useCompanyFiles", () => ({
  useCompanyFiles: () => ({ data: [{ id: "f1", file_name: "Client Intake — Acme — 2026-08-10.md", file_path: "p/x.md", tags: ["Company", "Strategy", "Intake"], file_type: "text/markdown", uploaded_at: "2026-08-10T00:00:00Z" }] }),
}));
vi.mock("@/hooks/useInputs", () => ({ getFileSignedUrl: async () => "" }));

const base = {
  id: "r1", company_id: "c1", user_id: "u1", submission_key: null, source: "intake",
  where_stuck: "We're growing, but it feels fragile", where_stuck_other: null,
  decision_slowdowns: ["We don't have enough customer evidence"], customer_confidence: "Somewhat confident",
  last_customer_input: null, momentum_drag: "Conflicting priorities", momentum_drag_other: null,
  explicit_strategic_problem: "creating onramps is hard", desired_outcome: "Improve adoption",
  desired_outcome_other: null, success_definition: null, notes: "small business",
  run_initial_public_signal_pass: true, mojo_snapshot: { starting_mode: "Customer Truth first", customer_truth_signal: "Mixed", top_focus_areas: ["fragility"] },
  completion_view: null as Record<string, unknown> | null, created_at: "2026-08-10T16:21:27Z", submitted_at: "2026-08-10T16:21:27Z",
};

let RESPONSES: unknown[] = [];
vi.mock("@/hooks/useIntakeResponses", () => ({ useIntakeResponses: () => ({ data: RESPONSES, isLoading: false }) }));

describe("IntakeView (Gate S)", () => {
  it("renders answers + honest absence for null completion_view + verbatim-file link", () => {
    RESPONSES = [base];
    const { container } = render(<IntakeView />);
    const text = container.textContent || "";
    expect(text).toContain("creating onramps is hard");            // the stated problem
    expect(text).toContain("We don't have enough customer evidence"); // a decision slowdown
    expect(text).toContain("Customer Truth first");                // mojo snapshot
    expect(text).toContain("Submitted 2026-08-10");                // submission date
    expect(text).toContain(COMPLETION_ABSENT_NOTE);                // honest absence (null completion_view)
    expect(text).toContain("View verbatim file");                  // link to the record
  });

  it("renders completion_view when present, and a switcher for multiple submissions", () => {
    RESPONSES = [
      { ...base, id: "r2", submitted_at: "2026-09-01T00:00:00Z", created_at: "2026-09-01T00:00:00Z", completion_view: { interpretation: { headline: "Fragile growth pattern" } } },
      base,
    ];
    const { container } = render(<IntakeView />);
    const text = container.textContent || "";
    expect(text).toContain("Fragile growth pattern");   // completion_view rendered
    expect(text).not.toContain(COMPLETION_ABSENT_NOTE); // present → no absence line
    expect(container.querySelectorAll("select").length).toBe(1); // prior-submission switcher
    expect(container.querySelectorAll("select option").length).toBe(2);
  });
});
