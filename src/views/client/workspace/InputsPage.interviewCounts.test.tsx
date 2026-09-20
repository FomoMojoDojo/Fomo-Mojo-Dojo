// Gate B guard (t) — R13 (2026-09-19): the workspace Inputs header counts evidence files only. 3 ordinary
// rows (2 with area tags) + 2 interview rows → "Evidence files 3" and "Partially integrated 2 / 3"; the
// interview rows stay listed. All ordinary rows assigned → the band is hidden even with interview rows
// present. Plant: the filter removed → 5 and 2 / 5.
import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import InputsPage from "./InputsPage";
import { OperatorControlsContext } from "@/views/client/firstReadPreview/operatorControls";

vi.mock("@/hooks/useInputActions", () => ({ runDifyAnalyzeFile: async () => {}, acceptFileProposal: async () => {}, rejectFileProposal: async () => {}, dismissFileProposal: async () => {}, unlinkNeedsFromFilePath: async () => {} }));
vi.mock("@/integrations/supabase/client", () => {
  const empty = { data: null, error: null };
  const builder: Record<string, unknown> = {};
  const handler: ProxyHandler<Record<string, unknown>> = { get: (_t, prop) => (prop === "then" ? (resolve: (v: unknown) => void) => resolve(empty) : () => new Proxy(builder, handler)) };
  return { supabase: { from: () => new Proxy(builder, handler), functions: { invoke: async () => empty }, rpc: async () => empty } };
});
vi.mock("@/hooks/useCapability", () => ({ useCapability: () => true }));
vi.mock("@/hooks/useCompany", () => ({ useCompany: () => ({ activeCompany: { id: "c1", name: "Edgewood" } }) }));
const FILES = vi.hoisted(() => ({ rows: [] as Array<Record<string, unknown>> }));
vi.mock("@/hooks/useCompanyFiles", () => ({ useCompanyFiles: () => ({ data: FILES.rows, refetch: async () => {} }) }));
vi.mock("@/hooks/useInputs", () => ({ useArchiveInputFile: () => ({ mutateAsync: async () => {} }), useRestoreInputFile: () => ({ mutateAsync: async () => {} }), useArchivedInputFiles: () => ({ data: [], refetch: async () => {} }), getFileSignedUrl: async () => "" }));
vi.mock("@/hooks/useOdiNeeds", () => ({ useOdiNeeds: () => ({ needs: [] }) }));
vi.mock("@/hooks/useRoutes", () => ({ useRoutes: () => ({ items: [] }) }));
vi.mock("@/hooks/useSignalLandscape", () => ({ useSignalLandscape: () => ({ landscape: null }) }));
vi.mock("@/hooks/usePublicBaseline", () => ({ usePublicBaseline: () => ({ run: null, preferredRun: null, loading: false }) }));
vi.mock("@/components/FileUploadDialog", () => ({ default: () => null }));
vi.mock("@/hooks/useFileProposals", () => ({ useFileProposals: () => ({ data: [], refetch: async () => {} }) }));
vi.mock("@/hooks/useInterviewUploads", () => ({ useInterviewUploads: () => ({ records: [{ id: "r1", input_file_id: "iv-1", speaker_role: "market_participant", market_state: "unplaced", journey_key: null, market_basis: [], review_state: "unreviewed", retracted_at: null }], markets: [], loading: false, refetch: () => {}, changeMarket: async () => ({ ok: true }) }) }));

const file = (id: string, tags: string[], is_interview = false) => ({ id, input_id: "in-1", file_name: `${id}.txt`, file_type: "text/plain", file_path: `c1/${id}.txt`, tags, uploaded_at: "2026-06-01T00:00:00Z", archived_at: null, archive_reason: null, archive_source: null, is_interview });
const mount = () => render(<OperatorControlsContext.Provider value={null}><InputsPage /></OperatorControlsContext.Provider>).container;

describe("Inputs header counts exclude interview rows (R13)", () => {
  it("(t) 3 ordinary (2 assigned) + 2 interview → Evidence files 3, Partially integrated 2 / 3; five rows listed", () => {
    FILES.rows = [file("o1", ["__area:jobmap"]), file("o2", ["__area:odi"]), file("o3", []), file("iv-1", [], true), file("iv-2", [], true)];
    const c = mount();
    expect(c.querySelector("[data-testid=inputs-evidence-files]")!.textContent).toBe("3");
    expect(c.querySelector("[data-testid=inputs-assigned]")!.textContent).toBe("2");
    expect(c.querySelector("[data-testid=inputs-counted]")!.textContent).toBe("3");
    expect(c.querySelectorAll("[data-testid=inputs-file-row]").length).toBe(5);
    expect(c.querySelectorAll("[data-testid=inputs-interview]").length).toBe(2);
  });
  it("all ordinary rows assigned + interview rows → the band is hidden", () => {
    FILES.rows = [file("o1", ["__area:jobmap"]), file("o2", ["__area:odi"]), file("iv-1", [], true)];
    const c = mount();
    expect(c.querySelector("[data-testid=inputs-evidence-files]")!.textContent).toBe("2");
    expect(c.querySelector("[data-testid=inputs-assigned]")).toBeNull();
  });
});
