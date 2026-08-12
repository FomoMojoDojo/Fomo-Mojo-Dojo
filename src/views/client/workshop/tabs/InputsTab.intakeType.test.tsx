// Gate M — Evidence Memory renders an intake-tagged file as INTAKE (not FILE), the type filter
// isolates intake, and the human-readable "Client Intake — {company} — {date}.md" name shows.
// Falsification: a plain upload still renders FILE and is hidden when the filter is set to intake.

import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import InputsTab from "./InputsTab";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }), maybeSingle: async () => ({ data: null }), order: () => ({ limit: () => ({ maybeSingle: async () => ({ data: null }) }) }) }) }) }),
    functions: { invoke: async () => ({ data: null, error: null }) },
  },
}));
vi.mock("@tanstack/react-query", () => ({ useQuery: () => ({ data: [] }), useQueryClient: () => ({ invalidateQueries: () => {} }) }));

const INTAKE_FILE = {
  id: "intake-1", file_name: "Client Intake — Acme — 2026-08-12.md", file_type: "text/markdown",
  file_path: "u/acme/customer-research/i/2026-08-12-client-intake.md",
  tags: ["Company", "Strategy", "Intake"], uploaded_at: "2026-08-12T00:00:00Z",
};
const PLAIN_FILE = {
  id: "file-1", file_name: "deck.pdf", file_type: "application/pdf", file_path: "u/acme/deck.pdf",
  tags: ["Company"], uploaded_at: "2026-08-11T00:00:00Z",
};
vi.mock("@/hooks/useCompanyFiles", () => ({ useCompanyFiles: () => ({ data: [INTAKE_FILE, PLAIN_FILE], refetch: () => {} }) }));
vi.mock("@/hooks/useCapability", () => ({ useCapability: () => true }));
vi.mock("@/hooks/useInputs", () => ({
  useUpdateFileTags: () => ({ mutate: () => {}, mutateAsync: async () => {} }), useArchiveInputFile: () => ({ mutateAsync: async () => {} }),
  useRestoreInputFile: () => ({ mutateAsync: async () => {} }), useArchivedInputFiles: () => ({ data: [] }), getFileSignedUrl: async () => "",
}));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ isAdmin: true }) }));
vi.mock("@/hooks/usePublicBaseline", () => ({ usePublicBaseline: () => ({ loading: false, run: null, preferredRun: null, error: null, refetch: () => {} }) }));
vi.mock("@/components/FileUploadDialog", () => ({ default: () => null }));
vi.mock("./SocialSignalsPanel", () => ({ default: () => null }));
vi.mock("mammoth", () => ({ default: {} }));
vi.mock("sonner", () => ({ toast: Object.assign(() => {}, { loading: () => {}, success: () => {}, error: () => {}, message: () => {} }) }));
vi.mock("@/hooks/useFullRefresh", async (orig) => {
  const actual = (await orig()) as Record<string, unknown>;
  return { ...actual, useFullRefresh: () => ({ state: { stage: "idle", message: "", running: false }, start: async () => {} }) };
});

const props = {
  companyId: "e55ac325-2897-4d06-9fbd-d9ddd776be3b", companyName: "Acme", companyWebsite: "https://acme.com",
  socialNeeds: [], onAdded: () => {}, companyHasSpine: true, birthRunning: false, onBirthSpine: () => {},
  hasHierarchy: false,
};

const typeCellTexts = (c: HTMLElement) =>
  Array.from(c.querySelectorAll("td")).map((td) => (td.textContent || "").trim()).filter((t) => t === "intake" || t === "file");

describe("Evidence Memory — INTAKE vs FILE (Gate M)", () => {
  it("intake-tagged file renders type 'intake', plain upload renders 'file', with the readable name", () => {
    const { container } = render(<InputsTab {...props} />);
    const texts = typeCellTexts(container);
    expect(texts).toContain("intake"); // the 'Intake'-tagged row
    expect(texts).toContain("file");   // the plain upload
    expect(container.textContent).toContain("Client Intake — Acme — 2026-08-12.md");
  });

  it("the type filter isolates intake (upload row hidden)", () => {
    const { container } = render(<InputsTab {...props} />);
    const typeFilter = container.querySelector("select") as HTMLSelectElement; // first select = type filter
    fireEvent.change(typeFilter, { target: { value: "intake" } });
    const texts = typeCellTexts(container);
    expect(texts).toContain("intake");
    expect(texts).not.toContain("file");
  });

  it("intake rows get a 'View intake →' link to the page; plain uploads do not", () => {
    const { container } = render(<InputsTab {...props} />);
    const intakeLinks = Array.from(container.querySelectorAll("a")).filter((a) => (a.textContent || "").includes("View intake"));
    expect(intakeLinks.length).toBe(1); // only the 'Intake'-tagged row
    expect(intakeLinks[0].getAttribute("href")).toBe(`/intake/${props.companyId}`);
  });
});
