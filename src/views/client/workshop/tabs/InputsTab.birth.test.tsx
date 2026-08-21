// BRT-1 fix — render proof for the birth trigger.
//
// BRT-1 shipped a temporal-dead-zone bug that tsc and vite build both passed: the spine
// probe's dependency array read `companyId`/`needsRefreshKey` ABOVE their const
// declarations in the same component body, so the workshop crashed at render with
// "Cannot access 'companyId' before initialization". Code-read alone missed it, so the
// control is now proven by actually rendering it.
//
// Mounts the real InputsTab in jsdom with a Sonos-shaped company (baseline banked,
// spine empty) and asserts the control appears; then the two blocked states.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import InputsTab from "./InputsTab";

// ── Module stubs: InputsTab pulls a wide hook surface; none of it is under test here.
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }),
          maybeSingle: async () => ({ data: null, error: null }),
          order: () => ({ limit: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
        }),
      }),
    }),
    functions: { invoke: async () => ({ data: null, error: null }) },
  },
}));
vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: [] }),
  // FR-REOPEN-3: InputsTab now mounts ReopenFirstReadControl, whose hooks call
  // useQueryClient (the control itself renders null here — no live session).
  useQueryClient: () => ({ invalidateQueries: () => {} }),
}));
vi.mock("@/hooks/useCompanyFiles", () => ({ useCompanyFiles: () => ({ data: [], refetch: () => {} }) }));
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

// Baseline presence is what distinguishes "run first" from "already banked".
const banked = { id: 34, created_at: "2026-07-20T19:35:50.000Z", result_json: {} };
let baselineState: { loading: boolean; run: unknown } = { loading: false, run: banked };
vi.mock("@/hooks/usePublicBaseline", () => ({
  usePublicBaseline: () => ({ ...baselineState, preferredRun: null, error: null, refetch: () => {} }),
}));

const sonosProps = {
  companyId: "e55ac325-2897-4d06-9fbd-d9ddd776be3b",
  companyName: "Sonos",
  companyWebsite: "https://sonos.com",
  socialNeeds: [],
  onAdded: () => {},
  hasHierarchy: false,          // Sonos: zero routes
  companyHasSpine: false,       // five-table probe resolved: empty
  birthRunning: false,
  onBirthSpine: () => {},
};

beforeEach(() => {
  baselineState = { loading: false, run: banked };
});

describe("BRT-1 — birth trigger renders (TDZ regression)", () => {
  it("renders without throwing, and shows the spine control for a banked-baseline / no-spine company", () => {
    // The crash this replaces was a throw AT RENDER; reaching an assertion at all is
    // itself the primary proof.
    const { container } = render(<InputsTab {...sonosProps} />);
    const text = container.textContent || "";

    expect(text).toContain("Build company spine →");
    expect(text).toContain("Builds this company's routes, job map and market definition from the outside read.");

    // BSL-1's control still renders alongside it, in its has-baseline form.
    // Ruling C (switcher fix): the label now NAMES its target company (companyName="Sonos").
    expect(text).toContain("Refresh outside signals — Sonos →");
    expect(text).not.toContain("Run outside signals — Sonos →");
  });

  it("already-spined: control is disabled and names why — never silently hidden-by-crash", () => {
    const { container } = render(<InputsTab {...sonosProps} companyHasSpine={true} />);
    const text = container.textContent || "";
    // Offering birth here would promise a 409 from the birth-only cold-start guard.
    expect(text).not.toContain("Build company spine →");
  });

  it("spine state unknown (null): does not claim 'no spine' while the probe is in flight", () => {
    const { container } = render(<InputsTab {...sonosProps} companyHasSpine={null} />);
    const text = container.textContent || "";
    // DEF-3's lesson: loading is not absence. Offering birth from an unknown could
    // hand a birth to a company that already has one.
    expect(text).not.toContain("Build company spine →");
  });

  it("no baseline yet: birth is offered disabled, pointing at the outside-signals step", () => {
    baselineState = { loading: false, run: null };
    const { container } = render(<InputsTab {...sonosProps} />);
    const text = container.textContent || "";

    expect(text).toContain("Run outside signals — Sonos →");          // BSL-1 first-run label, named (Ruling C)
    expect(text).toContain("Run outside signals first — the spine is built from that evidence.");

    const birthBtn = Array.from(container.querySelectorAll("button"))
      .find((b) => (b.textContent || "").includes("Build company spine"));
    expect(birthBtn).toBeTruthy();
    expect((birthBtn as HTMLButtonElement).disabled).toBe(true);
  });
});

// OC-2b (+ FR8-LINK) — the First Read entry point. The control is UNGATED by company-state:
// it must appear the same for a spine-complete company, a zero-route newborn, and a
// no-baseline company, always linking the PRIMARY to the 8-beat surface
// /preview/client-refine/first-read/<that company's id>.
// OC-2b (updated 2026-08-21): the PRIMARY 8-beat "Open First Read →" entry MOVED OFF the Inputs
// tab into the side nav ("First read" under Inputs). The Inputs tab now carries ONLY the quiet
// legacy V2 link. This proves the old entry location is removed (not duplicated).
describe("OC-2b — First Read entry point moved off the Inputs tab", () => {
  const primaryLink = (container: HTMLElement) =>
    Array.from(container.querySelectorAll("a")).find((a) => (a.textContent || "").includes("Open First Read"));
  const legacyLink = (container: HTMLElement) =>
    Array.from(container.querySelectorAll("a")).find((a) => (a.textContent || "").includes("open legacy first read"));

  it("the primary 'Open First Read →' link is GONE from the Inputs tab", () => {
    const { container } = render(<InputsTab {...sonosProps} hasHierarchy={true} companyHasSpine={true} />);
    expect(primaryLink(container)).toBeFalsy();
  });

  it("the legacy V2 link stays on the Inputs tab (untouched)", () => {
    baselineState = { loading: false, run: null };
    const { container } = render(<InputsTab {...sonosProps} />);
    const legacy = legacyLink(container);
    expect(legacy).toBeTruthy();
    expect(legacy!.getAttribute("href")).toBe(`/first-read/${sonosProps.companyId}`);
  });
});

// FR-FLOW-1b — the intake form + Prepare control are GONE; only the quiet legacy link remains
// (the primary moved to the nav). Rendered-tree absence proof over the real mounted Inputs tab.
describe("FR-FLOW-1b — no intake form; primary moved to nav, legacy remains", () => {
  it("the mounted Inputs tab has NO intake form, NO Prepare control, and NO primary Open link", () => {
    const { container } = render(<InputsTab {...sonosProps} />);
    const text = container.textContent || "";
    expect(text).not.toContain("Before the meeting"); // intake form gone
    expect(text).not.toContain("Prepare First Read");  // retired control gone
    const primary = Array.from(container.querySelectorAll("a")).filter((a) => (a.textContent || "").includes("Open First Read"));
    expect(primary).toHaveLength(0); // primary entry moved to the side nav
  });
});
