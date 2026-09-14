// Workspace Inputs — "View analysis →" on an ACCEPTED row (2026-09-13), component level.
//   gated (operator ON + evidence.manage)  ⇒ the control renders in the analysis cell with the operator mark;
//                                            clicking mounts ProposalReviewPanel in its decided mode (record +
//                                            Close, no Accept/Reject) and NO input action / supabase write runs
//   operator OFF                            ⇒ the "Analysis ready" chip, zero data-fr-operator nodes in the cell
//   capability FALSE (operator ON)          ⇒ no control (the standing local-admin-bypass gap: capability-false
//                                            negatives are proven here, not in Playwright)
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import InputsPage from "./InputsPage";
import { OperatorControlsContext } from "@/views/client/firstReadPreview/operatorControls";
import type { FileProposalRow } from "@/hooks/useFileProposals";

const actions = vi.hoisted(() => ({
  runDifyAnalyzeFile: vi.fn(async () => {}), acceptFileProposal: vi.fn(async () => {}), rejectFileProposal: vi.fn(async () => {}),
  dismissFileProposal: vi.fn(async () => {}), unlinkNeedsFromFilePath: vi.fn(async () => {}),
}));
vi.mock("@/hooks/useInputActions", () => actions);
const supabaseCalls = vi.hoisted(() => [] as string[]);
vi.mock("@/integrations/supabase/client", () => {
  const empty = { data: null, error: null };
  const builder: Record<string, unknown> = {};
  const handler: ProxyHandler<Record<string, unknown>> = { get: (_t, prop) => (prop === "then" ? (resolve: (v: unknown) => void) => resolve(empty) : (...a: unknown[]) => { supabaseCalls.push(`${String(prop)} ${JSON.stringify(a)}`); return new Proxy(builder, handler); }) };
  return { supabase: { from: (t: string) => { supabaseCalls.push(`from ${t}`); return new Proxy(builder, handler); }, functions: { invoke: async (n: string) => { supabaseCalls.push(`invoke ${n}`); return empty; } }, rpc: async (n: string) => { supabaseCalls.push(`rpc ${n}`); return empty; } } };
});
const capability = vi.hoisted(() => ({ value: true }));
vi.mock("@/hooks/useCapability", () => ({ useCapability: () => capability.value }));
vi.mock("@/hooks/useCompany", () => ({ useCompany: () => ({ activeCompany: { id: "c1", name: "Edgewood" } }) }));
const FILE = { id: "file-1", input_id: "in-1", file_name: "Strategy Review.md", file_type: "text/markdown", file_path: "c1/review.md", tags: ["__area:jobmap", "__area:odi"], uploaded_at: "2026-06-01T00:00:00Z", archived_at: null, archive_reason: null, archive_source: null };
vi.mock("@/hooks/useCompanyFiles", () => ({ useCompanyFiles: () => ({ data: [FILE], refetch: async () => {} }) }));
vi.mock("@/hooks/useInputs", () => ({ useArchiveInputFile: () => ({ mutateAsync: async () => {} }), useRestoreInputFile: () => ({ mutateAsync: async () => {} }), useArchivedInputFiles: () => ({ data: [], refetch: async () => {} }), getFileSignedUrl: async () => "" }));
vi.mock("@/hooks/useOdiNeeds", () => ({ useOdiNeeds: () => ({ needs: [] }) }));
vi.mock("@/hooks/useRoutes", () => ({ useRoutes: () => ({ items: [] }) }));
vi.mock("@/hooks/useSignalLandscape", () => ({ useSignalLandscape: () => ({ landscape: null }) }));
vi.mock("@/components/FileUploadDialog", () => ({ default: () => null }));
const PROPOSAL: FileProposalRow = {
  id: "prop-1", company_id: "c1", file_id: "file-1", file_name: FILE.file_name, source_type: "uploaded_file",
  summary: "The document outlines a strategic review session.", evidence: ["Funds it on a shoestring."], signal_type: "document", framework_results: [],
  suggested_areas: ["job_map"], candidate_positioning_updates: [], candidate_job_steps: [], candidate_needs: [{ desired_outcome: "A structured approach.", importance: 0, satisfaction: 0 }],
  candidate_outcomes: [], possible_gaps: [], possible_routes: [], experiments_to_run: [], contradictions: [], confidence: "medium", confidence_reason: "", analysis_version: 1, extraction_chars: null, extraction_images: null, extraction_pages: null, questions_to_verify: [],
  status: "accepted", processing_state: "ready", processing_error: null, processing_started_at: null, processing_completed_at: "2026-07-16T17:05:00Z",
  applied_areas: ["jobmap", "odi"], created_at: "2026-07-16T17:00:00Z", reviewed_at: "2026-07-16T17:08:04Z",
};
vi.mock("@/hooks/useFileProposals", () => ({ useFileProposals: () => ({ data: [PROPOSAL], refetch: async () => {} }) }));

const mount = (operatorOn: boolean) => render(
  <OperatorControlsContext.Provider value={operatorOn ? { decide: async () => {} } : null}><InputsPage /></OperatorControlsContext.Provider>,
);
const cell = (c: HTMLElement) => c.querySelector("tr[data-testid=inputs-file-row] .fr-ws-table-analysis") as HTMLElement;
beforeEach(() => { capability.value = true; supabaseCalls.length = 0; Object.values(actions).forEach((f) => f.mockClear()); });

describe("InputsPage — View analysis → on an accepted row", () => {
  it("gated: the control renders with the operator mark; click mounts the decided-mode panel; zero writes", () => {
    const { container } = mount(true);
    const btn = cell(container).querySelector("[data-testid=inputs-view-analysis]") as HTMLButtonElement;
    expect(btn).not.toBeNull();
    expect(btn.textContent).toBe("View analysis →");
    expect(btn.getAttribute("data-fr-operator")).toBe("view-analysis");
    expect(cell(container).querySelector(".fr-chip")).toBeNull();
    fireEvent.click(btn);
    expect(container.textContent).toContain(PROPOSAL.summary);
    expect(container.querySelector("[data-testid=proposal-decision-record]")).not.toBeNull();
    const labels = Array.from(container.querySelectorAll("button")).map((b) => (b.textContent || "").trim());
    expect(labels.some((t) => /^Accept/.test(t))).toBe(false);
    expect(labels).not.toContain("Reject");
    expect(labels).toContain("Close");
    expect(container.querySelectorAll("input[type=checkbox]")).toHaveLength(0);
    // the whole interaction ran no input action and touched no table
    for (const f of Object.values(actions)) expect(f).not.toHaveBeenCalled();
    expect(supabaseCalls.filter((c) => /^(from|invoke|rpc)/.test(c))).toEqual([]);
    fireEvent.click(container.querySelector("[data-testid=proposal-close]")!);
    expect(container.querySelector("[data-testid=proposal-decision-record]")).toBeNull();
  });
  it("operator OFF: the 'Analysis ready' chip, zero operator nodes in the cell", () => {
    const { container } = mount(false);
    const c = cell(container);
    expect(c.querySelector("[data-testid=inputs-view-analysis]")).toBeNull();
    expect(c.querySelectorAll("[data-fr-operator]")).toHaveLength(0);
    // Ruling 9 (2026-09-14): the cell also carries Dify's proposal-level confidence, ungated — same string as the panel chip.
    expect(c.querySelector("[data-testid=inputs-analysis-confidence]")?.textContent).toBe("medium confidence");
    expect(c.textContent?.replace("medium confidence", "").trim()).toBe("Analysis ready");
    expect(c.firstElementChild?.tagName).toBe("SPAN");
  });
  it("capability FALSE with operator ON: no control, the chip", () => {
    capability.value = false;
    const { container } = mount(true);
    const c = cell(container);
    expect(c.querySelector("[data-testid=inputs-view-analysis]")).toBeNull();
    expect(c.querySelectorAll("[data-fr-operator]")).toHaveLength(0);
    // Ruling 9 (2026-09-14): the cell also carries Dify's proposal-level confidence, ungated — same string as the panel chip.
    expect(c.querySelector("[data-testid=inputs-analysis-confidence]")?.textContent).toBe("medium confidence");
    expect(c.textContent?.replace("medium confidence", "").trim()).toBe("Analysis ready");
  });
});
