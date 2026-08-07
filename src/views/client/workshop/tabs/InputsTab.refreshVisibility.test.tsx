// FULL REFRESH — visibility regression. The chain worked headless but the in-progress control
// rendered rgba(246,246,244,…) off-white on the #ffffff canvas → INVISIBLE, so the operator saw
// the control "vanish" on click. BSL-1: in-progress states must be legible, never hidden. This
// mounts the real InputsTab in a RUNNING full-refresh state and asserts the stage line renders in
// a visible colour (not the off-white). Falsification: the old rgba(246,246,244,…) fails it.

import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import InputsTab from "./InputsTab";
import { FR_STEP_BASELINE, FR_STEP_DELTAS } from "@/hooks/useFullRefresh";

// Wide hook surface — none under test except the refresh control's rendered colour.
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
  useUpdateFileTags: () => ({ mutateAsync: async () => {} }), useArchiveInputFile: () => ({ mutateAsync: async () => {} }),
  useRestoreInputFile: () => ({ mutateAsync: async () => {} }), useArchivedInputFiles: () => ({ data: [] }), getFileSignedUrl: async () => "",
}));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ isAdmin: true }) }));
vi.mock("@/hooks/usePublicBaseline", () => ({ usePublicBaseline: () => ({ loading: false, run: { id: 1, created_at: "2026-07-20T00:00:00Z", result_json: {} }, preferredRun: null, error: null, refetch: () => {} }) }));
vi.mock("@/components/FileUploadDialog", () => ({ default: () => null }));
vi.mock("./SocialSignalsPanel", () => ({ default: () => null }));
vi.mock("mammoth", () => ({ default: {} }));
vi.mock("sonner", () => ({ toast: Object.assign(() => {}, { loading: () => {}, success: () => {}, error: () => {}, message: () => {} }) }));

// The lever: force a RUNNING full-refresh state so the in-progress stage line renders.
const frState = { current: { stage: "baseline" as string, message: FR_STEP_BASELINE, running: true } };
vi.mock("@/hooks/useFullRefresh", async (orig) => {
  const actual = (await orig()) as Record<string, unknown>;
  return { ...actual, useFullRefresh: () => ({ state: frState.current, start: async () => {} }) };
});

const props = {
  companyId: "e55ac325-2897-4d06-9fbd-d9ddd776be3b", companyName: "Sonos", companyWebsite: "https://sonos.com",
  socialNeeds: [], onAdded: () => {}, companyHasSpine: true, birthRunning: false, onBirthSpine: () => {},
};

const stageSpan = (container: HTMLElement, text: string) =>
  Array.from(container.querySelectorAll("span")).find((s) => (s.textContent || "").includes(text));

describe("Full refresh — in-progress control is legible on the white canvas (BSL-1)", () => {
  it("white-canvas branch (hasHierarchy): stage line renders in a VISIBLE colour, not the invisible off-white", () => {
    frState.current = { stage: "baseline", message: FR_STEP_BASELINE, running: true };
    const { container } = render(<InputsTab {...props} hasHierarchy={true} />);
    const span = stageSpan(container, FR_STEP_BASELINE);
    expect(span).toBeTruthy();
    const color = (span as HTMLElement).style.color;
    // the exact escaped defect: off-white (246,246,244) on white is invisible
    expect(color).not.toContain("246");
    // D.inkSoft (#555555) → rgb(85, 85, 85) in jsdom — a legible colour
    expect(color).toBe("rgb(85, 85, 85)");
  });

  it("else branch (no hierarchy): stage line also legible, not off-white", () => {
    frState.current = { stage: "deltas", message: FR_STEP_DELTAS, running: true };
    const { container } = render(<InputsTab {...props} hasHierarchy={false} />);
    const span = stageSpan(container, FR_STEP_DELTAS);
    expect(span).toBeTruthy();
    const color = (span as HTMLElement).style.color;
    expect(color).not.toContain("246");
    expect(color).toBe("rgb(85, 85, 85)");
  });
});
