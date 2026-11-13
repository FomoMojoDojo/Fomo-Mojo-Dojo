// S-ING-1 on the workspace Inputs row (SP-93, SP-94; 2026-11-13), component level.
//   pages_read < pages_total  ⇒ the line renders, AND the state chip still renders beside it
//   pages_read == pages_total ⇒ nothing extra: a whole read says nothing
//   both NULL (a row written before the columns existed) ⇒ nothing, because its truth is unknown
//
// The render half of ingest-partial-honesty-guard. The storage half is proven in the guard itself,
// against the served worker and a real capped PDF.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import InputsPage from "./InputsPage";
import { OperatorControlsContext } from "@/views/client/firstReadPreview/operatorControls";
import { INGEST_STRINGS } from "@/lib/ingest/ingestStrings";
import type { FileProposalRow } from "@/hooks/useFileProposals";

vi.mock("@/hooks/useInputActions", () => ({
  runDifyAnalyzeFile: vi.fn(async () => {}), acceptFileProposal: vi.fn(async () => {}), rejectFileProposal: vi.fn(async () => {}),
  dismissFileProposal: vi.fn(async () => {}), unlinkNeedsFromFilePath: vi.fn(async () => {}),
}));
vi.mock("@/integrations/supabase/client", () => {
  const empty = { data: null, error: null };
  const builder: Record<string, unknown> = {};
  const handler: ProxyHandler<Record<string, unknown>> = { get: (_t, prop) => (prop === "then" ? (resolve: (v: unknown) => void) => resolve(empty) : () => new Proxy(builder, handler)) };
  return { supabase: { from: () => new Proxy(builder, handler), functions: { invoke: async () => empty }, rpc: async () => empty } };
});
vi.mock("@/hooks/useCapability", () => ({ useCapability: () => true }));
vi.mock("@/hooks/useCompany", () => ({ useCompany: () => ({ activeCompany: { id: "c1", name: "Edgewood" } }) }));
const FILE = { id: "file-1", input_id: "in-1", file_name: "Quarterly filing.pdf", file_type: "application/pdf", file_path: "c1/filing.pdf", tags: ["__area:jobmap"], uploaded_at: "2026-06-01T00:00:00Z", archived_at: null, archive_reason: null, archive_source: null };
vi.mock("@/hooks/useCompanyFiles", () => ({ useCompanyFiles: () => ({ data: [FILE], refetch: async () => {} }) }));
vi.mock("@/hooks/useInputs", () => ({ useArchiveInputFile: () => ({ mutateAsync: async () => {} }), useRestoreInputFile: () => ({ mutateAsync: async () => {} }), useArchivedInputFiles: () => ({ data: [], refetch: async () => {} }), getFileSignedUrl: async () => "" }));
vi.mock("@/hooks/useOdiNeeds", () => ({ useOdiNeeds: () => ({ needs: [] }) }));
vi.mock("@/hooks/useRoutes", () => ({ useRoutes: () => ({ items: [] }) }));
vi.mock("@/hooks/useSignalLandscape", () => ({ useSignalLandscape: () => ({ landscape: null }) }));
vi.mock("@/hooks/usePublicBaseline", () => ({ usePublicBaseline: () => ({ run: null, preferredRun: null, loading: false }) }));
vi.mock("@/components/FileUploadDialog", () => ({ default: () => null }));
vi.mock("@/hooks/useInterviewUploads", () => ({ useInterviewUploads: () => ({ records: [], markets: [], loading: false, refetch: () => {}, changeMarket: async () => ({ ok: true }) }) }));
vi.mock("@/lib/firstReadMarks/useFirstReadMarks", async (orig) => ({ ...(await orig() as object), useFirstReadMarks: () => ({ marks: [], byAnchor: new Map(), frozen: false, loaded: true, refetch: () => {}, create: async () => ({ ok: true }), append: async () => ({ ok: true }), withdraw: async () => ({ ok: true }) }) }));

const BASE: FileProposalRow = {
  id: "prop-1", company_id: "c1", file_id: "file-1", file_name: FILE.file_name, source_type: "uploaded_file",
  summary: "The filing sets out the quarter.", evidence: [], signal_type: "document", framework_results: [],
  suggested_areas: ["job_map"], candidate_positioning_updates: [], candidate_job_steps: [], candidate_needs: [],
  candidate_outcomes: [], possible_gaps: [], possible_routes: [], experiments_to_run: [], contradictions: [],
  confidence: "medium", confidence_reason: "", analysis_version: 1,
  // extraction_pages keeps its old meaning: the DOCUMENT's count. The read is the new pair.
  extraction_chars: 41_000, extraction_images: 0, extraction_pages: 77,
  pages_read: null, pages_total: null, chars_total: null, questions_to_verify: [],
  status: "accepted", processing_state: "ready", processing_error: null, processing_started_at: null,
  processing_completed_at: "2026-11-13T17:05:00Z", applied_areas: ["jobmap"],
  created_at: "2026-11-13T17:00:00Z", reviewed_at: "2026-11-13T17:08:04Z",
};
const row = vi.hoisted(() => ({ value: null as unknown as FileProposalRow }));
vi.mock("@/hooks/useFileProposals", () => ({ useFileProposals: () => ({ data: [row.value], refetch: async () => {} }) }));

const mount = () => render(
  // operator OFF, so the cell shows the "Analysis ready" chip rather than the View-analysis control
  <OperatorControlsContext.Provider value={null}><InputsPage /></OperatorControlsContext.Provider>,
);
const cell = (c: HTMLElement) => c.querySelector("tr[data-testid=inputs-file-row] .fr-ws-table-analysis") as HTMLElement;
beforeEach(() => { row.value = { ...BASE }; });

describe("InputsPage — a partial read says so", () => {
  it("30 of 77: the line renders verbatim, with the numbers substituted", () => {
    row.value = { ...BASE, pages_read: 30, pages_total: 77 };
    const c = mount().container;
    const line = cell(c).querySelector("[data-testid=inputs-analysis-partial]");
    expect(line).not.toBeNull();
    expect(line!.textContent).toBe("Only the first 30 of 77 pages were read.");
    // and it is the signed string, not a lookalike assembled on the page
    expect(line!.textContent).toBe(INGEST_STRINGS.partialRead.replace("{n}", "30").replace("{m}", "77"));
  });

  it("SP-94: \"Analysis ready\" never appears ALONE on such a document", () => {
    row.value = { ...BASE, pages_read: 30, pages_total: 77 };
    const c = mount().container;
    const text = cell(c).textContent ?? "";
    expect(text).toContain("Analysis ready");
    expect(text).toContain("pages were read.");
  });

  it("a whole read says nothing — no line at 77 of 77", () => {
    row.value = { ...BASE, pages_read: 77, pages_total: 77 };
    const c = mount().container;
    expect(cell(c).querySelector("[data-testid=inputs-analysis-partial]")).toBeNull();
    expect(cell(c).textContent).toContain("Analysis ready");
  });

  it("a row written before the columns existed says nothing (no backfill, no guess)", () => {
    row.value = { ...BASE, pages_read: null, pages_total: null };
    const c = mount().container;
    expect(cell(c).querySelector("[data-testid=inputs-analysis-partial]")).toBeNull();
  });

  it("half a pair renders no fraction", () => {
    row.value = { ...BASE, pages_read: 30, pages_total: null };
    expect(cell(mount().container).querySelector("[data-testid=inputs-analysis-partial]")).toBeNull();
  });

  it("the state the row IS in is never replaced by the partial line", () => {
    row.value = { ...BASE, pages_read: 30, pages_total: 77, processing_state: "failed", status: "pending" };
    const c = mount().container;
    const text = cell(c).textContent ?? "";
    expect(text).toContain("Analysis failed");
    expect(text).toContain("Only the first 30 of 77 pages were read.");
  });
});
