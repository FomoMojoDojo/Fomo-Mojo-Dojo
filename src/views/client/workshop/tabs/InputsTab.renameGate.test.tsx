// Edit-company-name relocation (operator ruling 2026-08-18) — the rename
// control moved to the Company page (identity surface). InputsTab (evidence
// surface) must no longer render it, even for an admin.

import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import InputsTab from "./InputsTab";
import { RENAME_LABEL } from "../CompanyRenameControl";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }), maybeSingle: async () => ({ data: null }), order: () => ({ limit: () => ({ maybeSingle: async () => ({ data: null }) }) }) }) }) }),
    functions: { invoke: async () => ({ data: null, error: null }) },
  },
}));
vi.mock("@tanstack/react-query", () => ({ useQuery: () => ({ data: [] }), useQueryClient: () => ({ invalidateQueries: () => {} }) }));
vi.mock("@/hooks/useCompanyFiles", () => ({ useCompanyFiles: () => ({ data: [], refetch: () => {} }) }));
vi.mock("@/hooks/useCapability", () => ({ useCapability: () => true }));
vi.mock("@/hooks/useInputs", () => ({
  useUpdateFileTags: () => ({ mutate: () => {}, mutateAsync: async () => {} }), useArchiveInputFile: () => ({ mutateAsync: async () => {} }),
  useRestoreInputFile: () => ({ mutateAsync: async () => {} }), useArchivedInputFiles: () => ({ data: [] }), getFileSignedUrl: async () => "",
}));
vi.mock("@/hooks/usePublicBaseline", () => ({ usePublicBaseline: () => ({ loading: false, run: null, preferredRun: null, error: null, refetch: () => {} }) }));
vi.mock("@/components/FileUploadDialog", () => ({ default: () => null }));
vi.mock("./SocialSignalsPanel", () => ({ default: () => null }));
vi.mock("mammoth", () => ({ default: {} }));
vi.mock("sonner", () => ({ toast: Object.assign(() => {}, { loading: () => {}, success: () => {}, error: () => {}, message: () => {} }) }));
vi.mock("@/hooks/useFullRefresh", async (orig) => {
  const actual = (await orig()) as Record<string, unknown>;
  return { ...actual, useFullRefresh: () => ({ state: { stage: "idle", message: "", running: false }, start: async () => {} }) };
});
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ isAdmin: true, user: { id: "u-1" } }) }));

const props = {
  companyId: "e55ac325-2897-4d06-9fbd-d9ddd776be3b", companyName: "Acme", companyWebsite: "https://acme.com",
  socialNeeds: [], onAdded: () => {}, companyHasSpine: true, birthRunning: false, onBirthSpine: () => {},
  hasHierarchy: false,
};

describe("InputsTab — rename control relocated away", () => {
  it("no longer renders the rename control, even for an admin", () => {
    const { container } = render(<InputsTab {...props} />);
    expect(container.querySelector(`[aria-label="${RENAME_LABEL}"]`)).toBeNull();
  });
});
