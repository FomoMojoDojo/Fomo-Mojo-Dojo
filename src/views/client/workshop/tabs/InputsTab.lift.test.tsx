// LIFT PARITY (Inputs Tier 1, 2026-09-11) — the analyze invoke and the proposal accept / reject writes
// moved out of InputsTab into @/hooks/useInputActions. This mounts the real InputsTab with one file
// row and proves its controls call the lifted functions with the same arguments the tab passed before
// the lift (fileId / filePath / fileName / fileType / companyId / sourceType; fileId / rawTags /
// proposalId / areas; proposalId).
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, fireEvent, waitFor } from "@testing-library/react";
import InputsTab from "./InputsTab";
import type { FileProposalRow } from "@/hooks/useFileProposals";

const actions = vi.hoisted(() => ({
  runDifyAnalyzeFile: vi.fn(async (_input: unknown) => {}),
  acceptFileProposal: vi.fn(async (_args: unknown) => {}),
  rejectFileProposal: vi.fn(async (_id: unknown) => {}),
  dismissFileProposal: vi.fn(async (_p: unknown) => {}),
}));
vi.mock("@/hooks/useInputActions", () => actions);

// A self-returning, thenable query-builder stub: every chained method returns the builder and awaiting
// it resolves to an empty result — the tab's side probes (baseline, run locks…) all settle harmlessly.
vi.mock("@/integrations/supabase/client", () => {
  const empty = { data: null, error: null };
  const builder: Record<string, unknown> = {};
  const handler: ProxyHandler<Record<string, unknown>> = {
    get: (_t, prop) => {
      if (prop === "then") return (resolve: (v: unknown) => void) => resolve(empty);
      return () => new Proxy(builder, handler);
    },
  };
  return { supabase: { from: () => new Proxy(builder, handler), functions: { invoke: async () => empty }, auth: { getUser: async () => ({ data: { user: null } }) } } };
});
vi.mock("@tanstack/react-query", () => ({ useQuery: () => ({ data: [] }), useQueryClient: () => ({ invalidateQueries: () => {} }) }));
const FILE = { id: "file-1", input_id: "in-1", file_name: "Edgewood Strategy Review.md", file_type: "text/markdown", file_path: "c1/review.md", tags: ["__area:jobmap"], uploaded_at: "2026-06-01T00:00:00Z", archived_at: null, archive_reason: null, archive_source: null };
vi.mock("@/hooks/useCompanyFiles", () => ({ useCompanyFiles: () => ({ data: [FILE], refetch: async () => {} }) }));
vi.mock("@/hooks/useCapability", () => ({ useCapability: () => true }));
vi.mock("@/hooks/useInputs", () => ({
  useUpdateFileTags: () => ({ mutateAsync: async () => {} }),
  useArchiveInputFile: () => ({ mutateAsync: async () => {} }),
  useRestoreInputFile: () => ({ mutateAsync: async () => {} }),
  useArchivedInputFiles: () => ({ data: [] }),
  getFileSignedUrl: async () => "",
}));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ isAdmin: true }) }));
vi.mock("@/lib/pollPublicBaseline", () => ({ pollPublicBaselineTerminal: async () => "completed" }));
vi.mock("@/components/FileUploadDialog", () => ({ default: () => null }));
vi.mock("./SocialSignalsPanel", () => ({ default: () => null }));
vi.mock("mammoth", () => ({ default: {} }));
vi.mock("sonner", () => ({ toast: Object.assign(() => {}, { loading: () => {}, success: () => {}, error: () => {}, message: () => {} }) }));
vi.mock("@/hooks/usePublicBaseline", () => ({ usePublicBaseline: () => ({ loading: false, run: { id: 1, created_at: "2026-07-20T00:00:00Z", result_json: {} }, preferredRun: null, error: null, refetch: () => {} }) }));

let proposals: FileProposalRow[] = [];
vi.mock("@/hooks/useFileProposals", () => ({ useFileProposals: () => ({ data: proposals, refetch: async () => {} }) }));

const PROPOSAL: FileProposalRow = {
  id: "prop-1", company_id: "c1", file_id: "file-1", file_name: FILE.file_name, source_type: "uploaded_file", summary: "A summary.",
  evidence: [], signal_type: "", framework_results: [], suggested_areas: ["jobmap"], candidate_positioning_updates: [],
  candidate_job_steps: [], candidate_needs: [{ desired_outcome: "Minimize wait", tier: "need", step_label: "Define", importance: 8, satisfaction: 3, rationale: "" } as never],
  candidate_outcomes: [], possible_gaps: [], possible_routes: [], experiments_to_run: [], contradictions: [], confidence: "high",
  confidence_reason: "", questions_to_verify: [], status: "pending", processing_state: "ready", processing_error: null,
  processing_started_at: null, processing_completed_at: "2026-07-01T00:00:00Z", applied_areas: [], created_at: "2026-07-01T00:00:00Z", reviewed_at: null,
};
const props = { companyId: "c1", companyName: "Edgewood", companyWebsite: "https://edgewood.org", socialNeeds: [], onAdded: () => {}, hasHierarchy: true, companyHasSpine: true, birthRunning: false, onBirthSpine: () => {} };
const button = (c: HTMLElement, text: string) => Array.from(c.querySelectorAll("button")).find((b) => (b.textContent || "").includes(text)) as HTMLButtonElement | undefined;

beforeEach(() => { proposals = []; Object.values(actions).forEach((f) => f.mockClear()); });

describe("InputsTab calls the lifted input actions with the same arguments", () => {
  it("Run analysis → runDifyAnalyzeFile with the row's file fields", async () => {
    const { container } = render(<InputsTab {...props} />);
    const btn = button(container, "Run analysis →");
    expect(btn).toBeTruthy();
    fireEvent.click(btn!);
    await waitFor(() => expect(actions.runDifyAnalyzeFile).toHaveBeenCalledTimes(1));
    expect(actions.runDifyAnalyzeFile).toHaveBeenCalledWith({ fileId: "file-1", filePath: "c1/review.md", fileName: FILE.file_name, fileType: "text/markdown", companyId: "c1", sourceType: "uploaded_file" });
  });

  it("Review proposal → Accept calls acceptFileProposal with file, tags, proposal and the chosen areas", async () => {
    proposals = [PROPOSAL];
    const { container } = render(<InputsTab {...props} />);
    fireEvent.click(button(container, "Review proposal →")!);
    const accept = await waitFor(() => { const b = button(container, "Accept"); expect(b).toBeTruthy(); return b!; });
    fireEvent.click(accept);
    await waitFor(() => expect(actions.acceptFileProposal).toHaveBeenCalledTimes(1));
    const arg = actions.acceptFileProposal.mock.calls[0][0] as { fileId: string; rawTags: string[] | null; proposalId: string; areas: string[] };
    expect(arg.fileId).toBe("file-1");
    expect(arg.rawTags).toEqual(["__area:jobmap"]);
    expect(arg.proposalId).toBe("prop-1");
    expect(arg.areas).toEqual(["Opportunities"]); // the panel's own inference: a candidate need → Opportunities
  });

  it("Review proposal → Reject calls rejectFileProposal with the proposal id", async () => {
    proposals = [PROPOSAL];
    const { container } = render(<InputsTab {...props} />);
    fireEvent.click(button(container, "Review proposal →")!);
    const reject = await waitFor(() => { const b = button(container, "Reject"); expect(b).toBeTruthy(); return b!; });
    fireEvent.click(reject);
    await waitFor(() => expect(actions.rejectFileProposal).toHaveBeenCalledWith("prop-1"));
  });
});
