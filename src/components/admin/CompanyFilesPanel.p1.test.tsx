// P1 (2026-11-16): Admin → Companies → Files is the one page for upload and review.
//   (a) each file row shows the Inputs surfaces' analysis badge and reason lines (FileAnalysisBadge)
//   (b) "Analyze again" calls runDifyAnalyzeFile — the Inputs page's path — and nothing else
//   (c) the legacy Re-run chain (analyze-file → needs insert → local-alignment score rewrite →
//       run-agent-flow / research-company / refresh-*) cannot be started from this page
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { render, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import CompanyFilesPanel from "./CompanyFilesPanel";
import { runDifyAnalyzeFile } from "@/hooks/useInputActions";
import type { FileProposalRow } from "@/hooks/useFileProposals";

const calls = vi.hoisted(() => ({ invoke: [] as string[], from: [] as string[] }));
vi.mock("@/hooks/useInputActions", () => ({ runDifyAnalyzeFile: vi.fn(async () => {}) }));
vi.mock("@/integrations/supabase/client", () => {
  const empty = { data: null, error: null };
  const builder: Record<string, unknown> = {};
  const handler: ProxyHandler<Record<string, unknown>> = { get: (_t, prop) => (prop === "then" ? (resolve: (v: unknown) => void) => resolve(empty) : () => new Proxy(builder, handler)) };
  return { supabase: {
    from: (t: string) => { calls.from.push(t); return new Proxy(builder, handler); },
    functions: { invoke: async (name: string) => { calls.invoke.push(name); return empty; } },
    rpc: async () => empty,
    auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) },
  } };
});
vi.mock("@/hooks/useCompany", () => ({ useCompany: () => ({ refetch: async () => {} }) }));
vi.mock("@/components/FileUploadDialog", () => ({ default: () => null }));
vi.mock("@/components/admin/VoiceGatePanel", () => ({ default: () => null }));
vi.mock("@/hooks/useProposalSync", () => ({ useProposalSync: () => {} }));

const FILES = [
  { id: "f-ready", file_name: "Ready plan.docx", file_type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", file_url: "c1/ready.docx", tags: [], uploaded_at: "2026-11-15T00:00:00Z" },
  { id: "f-failed", file_name: "Failed scan.pdf", file_type: "application/pdf", file_url: "c1/failed.pdf", tags: [], uploaded_at: "2026-11-15T00:00:00Z" },
  { id: "f-interview", file_name: "Interview.txt", file_type: "text/plain", file_url: "c1/interview.txt", tags: [], uploaded_at: "2026-11-15T00:00:00Z" },
];
// Stable across renders: a fresh array per call re-fires the panel's selection effect forever.
const INPUTS_QUERY = vi.hoisted(() => ({ value: null as unknown }));
vi.mock("@/hooks/useInputs", () => ({
  useInputs: () => {
    INPUTS_QUERY.value ??= { query: { data: [{ id: "in-1", input_key: "customer-research", input_label: "Customer research", group_label: "Evidence", sub_group: "Research", group_key: "g", files: FILES }], refetch: async () => {} } };
    return INPUTS_QUERY.value;
  },
  useDeleteInputFile: () => ({ mutateAsync: async () => {}, isPending: false }),
  getFileSignedUrl: async () => "",
}));
const COMPANY_FILES = vi.hoisted(() => ({ data: [
  { id: "f-ready", is_interview: false }, { id: "f-failed", is_interview: false }, { id: "f-interview", is_interview: true },
], refetch: async () => {} }));
vi.mock("@/hooks/useCompanyFiles", () => ({ useCompanyFiles: () => COMPANY_FILES }));

const BASE: FileProposalRow = {
  id: "prop-ready", company_id: "c1", file_id: "f-ready", file_name: "Ready plan.docx", source_type: "uploaded_file",
  summary: "", evidence: [], signal_type: "document", framework_results: [], suggested_areas: [], candidate_positioning_updates: [],
  candidate_job_steps: [], candidate_needs: [], candidate_outcomes: [], possible_gaps: [], possible_routes: [], experiments_to_run: [],
  contradictions: [], confidence: "medium", confidence_reason: "", analysis_version: 1, extraction_chars: 1000, extraction_images: 0,
  extraction_pages: 1, pages_read: null, pages_total: null, chars_total: null, chars_capped: null, sections_total: null,
  sections_ready: null, sections_failed: null, items_extracted: null, items_interpreted: null, questions_to_verify: [],
  status: "pending", processing_state: "ready", processing_error: null, processing_started_at: null,
  processing_completed_at: "2026-11-15T01:00:00Z", applied_areas: [], created_at: "2026-11-15T00:30:00Z", reviewed_at: null,
};
const proposals = vi.hoisted(() => ({ rows: [] as FileProposalRow[] }));
vi.mock("@/hooks/useFileProposals", () => ({ useFileProposals: () => ({ data: proposals.rows, refetch: async () => {} }) }));

const mount = () => render(<MemoryRouter><CompanyFilesPanel companyId="c1" companyName="Throwaway" mode="full" /></MemoryRouter>);
const rowOf = (c: HTMLElement, fileId: string) => c.querySelector(`[data-testid=files-analysis][data-fr-file-id="${fileId}"]`) as HTMLElement | null;

beforeEach(() => {
  calls.invoke.length = 0; calls.from.length = 0;
  vi.mocked(runDifyAnalyzeFile).mockClear();
  proposals.rows = [
    { ...BASE },
    { ...BASE, id: "prop-failed", file_id: "f-failed", file_name: "Failed scan.pdf", processing_state: "failed", sections_total: 4, sections_failed: 2 },
  ];
});

describe("P1 — Admin Files shows the Inputs analysis badge and reason line", () => {
  it("a ready row carries the ready badge", () => {
    const c = mount().container;
    const cell = rowOf(c, "f-ready");
    expect(cell).not.toBeNull();
    expect(cell!.querySelector("[data-testid=files-analysis-badge]")!.textContent).toBe("Analysis ready");
  });

  it("a failed row carries the failed badge AND its reason line (the Inputs strings)", () => {
    const c = mount().container;
    const cell = rowOf(c, "f-failed")!;
    expect(cell.querySelector("[data-testid=files-analysis-badge]")!.textContent).toBe("Analysis failed");
    expect(cell.querySelector("[data-testid=files-analysis-sections]")!.textContent).toMatch(/2 of 4/);
  });
});

describe("P1 — \"Analyze again\" is the Inputs page's call and nothing else", () => {
  it("clicking it calls runDifyAnalyzeFile with the Inputs page's arguments; no other invoke, no table write", async () => {
    const { container } = mount();
    calls.invoke.length = 0; calls.from.length = 0;
    const buttons = Array.from(container.querySelectorAll("[data-testid=files-analyze-again]")) as HTMLButtonElement[];
    expect(buttons.map((b) => b.textContent)).toEqual(["Analyze again", "Analyze again"]);   // the interview row has none
    fireEvent.click(buttons[0]);
    await waitFor(() => expect(runDifyAnalyzeFile).toHaveBeenCalledTimes(1));
    expect(runDifyAnalyzeFile).toHaveBeenCalledWith({
      fileId: "f-ready", filePath: "c1/ready.docx", fileName: "Ready plan.docx",
      fileType: FILES[0].file_type, companyId: "c1", sourceType: "uploaded_file",
    });
    expect(calls.invoke).toEqual([]);
    expect(calls.from).toEqual([]);
  });

  it("a queued or running row cannot be started again", () => {
    proposals.rows = [{ ...BASE, processing_state: "running", processing_completed_at: null }];
    const c = mount().container;
    const first = c.querySelector("[data-testid=files-analyze-again]") as HTMLButtonElement;
    expect(first.disabled).toBe(true);
  });

  it("a newer run behind an older ready analysis still blocks a second start, and says Analyzing…", () => {
    proposals.rows = [{ ...BASE }, { ...BASE, id: "prop-rerun", processing_state: "running", processing_completed_at: null, created_at: "2026-11-16T00:00:00Z" }];
    const c = mount().container;
    const first = c.querySelector("[data-testid=files-analyze-again]") as HTMLButtonElement;
    expect(first.disabled).toBe(true);
    expect(first.textContent).toBe("Analyzing…");
    // the badge keeps the Inputs page's pick — the ready analysis
    expect(rowOf(c, "f-ready")!.querySelector("[data-testid=files-analysis-badge]")!.textContent).toBe("Analysis ready");
  });
});

describe("P1 — the legacy Re-run chain cannot be started from this page", () => {
  const src = readFileSync(join(__dirname, "CompanyFilesPanel.tsx"), "utf8");
  const code = src.split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n");
  for (const fn of ["analyze-file", "local-alignment", "run-agent-flow", "research-company"]) {
    it(`no invoke of ${fn}`, () => {
      expect(code).not.toMatch(new RegExp(`invoke\\(\\s*["'\`]${fn}["'\`]`));
    });
  }
  it("no invoke of any refresh-* function", () => {
    expect(code).not.toMatch(/invoke\(\s*["'`]refresh-/);
  });
  it("persistDerivedNeedsFromExistingFile is gone", () => {
    expect(src).not.toContain("persistDerivedNeedsFromExistingFile");
  });
  it("the page analyses through the one shared function", () => {
    expect(code).toMatch(/import \{ runDifyAnalyzeFile \} from "@\/hooks\/useInputActions"/);
  });
});
