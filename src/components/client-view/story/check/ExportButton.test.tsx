// GATE D — the export REFUSES while any consumed read has failed (operator ruling: nothing
// beats a permanent document built on failed data). Previously a RETURNING error set loading
// false, dataReady went TRUE, and onExport baked the failed section's absence string into the
// downloaded leave-behind — including the signed "Everything you've told us turned up somewhere
// in what we've read." Now: any read error → button disabled + an operator-facing reason naming
// the failed section(s) + NO document. A hang still disables (loading NOT bounded). A healthy or
// genuinely-empty-but-successful read still exports, byte-identical (onExport/serializer unchanged).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, act, fireEvent } from "@testing-library/react";

const h = vi.hoisted(() => ({
  company: { activeCompany: { id: "co-1", name: "Acme", industry_key: null } as Record<string, unknown> },
  score: { score: null as unknown, loading: false, error: null as string | null },
  findings: { data: { findings: [], primaryId: null, companyDomain: null } as unknown, isLoading: false, error: null as string | null },
  baseline: { preferredRun: null as unknown, loading: false, error: null as string | null },
  maps: { maps: new Map(), keys: [] as string[], loading: false, error: null as string | null },
  capture: { items: [] as unknown[], tally: { confirmed: 0, corrected: 0, rejected: 0, not_important: 0 }, loading: false, readError: null as string | null, deltaState: { status: "ready", data: [] }, frozen: false, sessionStatus: null, setVerdict: async () => null, refetchResponses: async () => {} },
  statedProblem: { data: null as unknown, loading: false, error: null as string | null },
  openQuestions: { rows: [] as unknown[], questions: [] as string[], loading: false, error: null as string | null },
  setAside: { identities: new Set() },
  perception: { claims: [] as unknown[], loading: false, error: null as string | null },
  html: null as string | null,
}));

vi.mock("@/hooks/useCompany", () => ({ useCompany: () => h.company }));
vi.mock("@/hooks/useMojoScore", () => ({ useMojoScore: () => h.score }));
vi.mock("@/hooks/useStandingFindings", async (o) => ({ ...(await o() as object), useStandingFindings: () => h.findings }));
vi.mock("@/hooks/usePublicBaseline", () => ({ usePublicBaseline: () => h.baseline }));
vi.mock("@/hooks/useIndustryReferenceMaps", () => ({ useIndustryReferenceMaps: () => h.maps }));
vi.mock("@/hooks/useFirstReadCapture", async (o) => ({ ...(await o() as object), useFirstReadCapture: () => h.capture }));
vi.mock("@/hooks/useFirstReadStatedProblem", () => ({ useFirstReadStatedProblem: () => h.statedProblem }));
vi.mock("@/hooks/useFirstReadOpenQuestions", () => ({ useFirstReadOpenQuestions: () => h.openQuestions }));
vi.mock("@/hooks/useSetAsideIdentities", () => ({ useSetAsideIdentities: () => h.setAside }));
vi.mock("@/hooks/useOutsidePerception", async (o) => ({ ...(await o() as object), useOutsidePerception: () => h.perception }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: { started_at: "2026-01-01T00:00:00Z", presenter: "Op" }, error: null }) }) }) }) },
}));
vi.mock("@/lib/firstRead/exportHtml", async (o) => {
  const actual = await o() as Record<string, unknown>;
  const real = actual.buildFirstReadExportHtml as (d: unknown) => string;
  return { ...actual, buildFirstReadExportHtml: (d: unknown) => { const s = real(d); h.html = s; return s; } };
});

import ExportButton from "./ExportButton";

beforeEach(() => {
  h.score = { score: null, loading: false, error: null };
  h.findings = { data: { findings: [], primaryId: null, companyDomain: null }, isLoading: false, error: null };
  h.baseline = { preferredRun: null, loading: false, error: null };
  h.maps = { maps: new Map(), keys: [], loading: false, error: null };
  h.capture = { items: [], tally: { confirmed: 0, corrected: 0, rejected: 0, not_important: 0 }, loading: false, readError: null, deltaState: { status: "ready", data: [] }, frozen: false, sessionStatus: null, setVerdict: async () => null, refetchResponses: async () => {} };
  h.statedProblem = { data: null, loading: false, error: null };
  h.openQuestions = { rows: [], questions: [], loading: false, error: null };
  h.perception = { claims: [], loading: false, error: null };
  h.html = null;
});
afterEach(() => vi.clearAllMocks());

async function renderSettled(): Promise<HTMLButtonElement> {
  h.score.loading = true; // transition true→false so scoreSettled becomes true (preserving any error)
  const utils = render(<ExportButton companyId="co-1" sessionId="s-1" proposal={null} />);
  await act(async () => { h.score.loading = false; utils.rerender(<ExportButton companyId="co-1" sessionId="s-1" proposal={null} />); });
  const btn = await screen.findByRole("button", { name: /Export/ });
  // let the async session read settle
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
  return btn as HTMLButtonElement;
}

const reasonText = () => screen.queryByRole("alert")?.textContent ?? "";

// (a) each section-feeding read, by name, must disable + name its section + produce NO document.
const SECTIONS: Array<{ name: string; set: () => void; label: string; leak: string }> = [
  { name: "perception", set: () => { h.perception.error = "boom"; }, label: "How the outside describes you", leak: "We haven't found this company described in its own words." },
  { name: "capture", set: () => { h.capture.readError = "boom"; }, label: "The Check", leak: "Everything you've told us turned up somewhere in what we've read." },
  { name: "score", set: () => { h.score.error = "boom"; }, label: "Mojo Score", leak: "No score has been computed yet." },
  { name: "findings", set: () => { h.findings.error = "boom"; }, label: "Outside findings", leak: "Nothing else stood out from the outside read." },
  { name: "baseline", set: () => { h.baseline.error = "boom"; }, label: "Outside signals", leak: "" },
  { name: "maps", set: () => { h.maps.error = "boom"; }, label: "Standard job map", leak: "No industry-standard map matched this company's industry." },
  { name: "statedProblem", set: () => { h.statedProblem.error = "boom"; }, label: "Stated problem", leak: "No problem is stated on this company's own public site." },
  { name: "openQuestions", set: () => { h.openQuestions.error = "boom"; }, label: "The Gap", leak: "The outside read left no open questions for this company." },
];

describe("GATE D — export refuses on any read error", () => {
  for (const s of SECTIONS) {
    it(`(a) ${s.name} error → disabled, reason names "${s.label}", NO document`, async () => {
      s.set();
      const btn = await renderSettled();
      // Leak-catch FIRST: attempt the export; the guard must have kept the button disabled so
      // no document is generated. If the guard is removed, h.html holds the failed section's
      // absence string — this assertion's Received value names the leak.
      await act(async () => { fireEvent.click(btn); });
      expect(h.html).toBeNull();
      expect(btn.disabled).toBe(true);
      expect(reasonText()).toContain("Export unavailable");
      expect(reasonText()).toContain(s.label);
    });
  }

  it("multiple errors → reason names every failed section", async () => {
    h.score.error = "boom"; h.perception.error = "boom";
    await renderSettled();
    expect(reasonText()).toContain("Mojo Score");
    expect(reasonText()).toContain("How the outside describes you");
  });

  it("(b) hang (loading true, no error) → still disabled, NO reason (invariant intact)", async () => {
    h.findings.isLoading = true; // never resolves
    const btn = await renderSettled();
    expect(btn.disabled).toBe(true);
    expect(screen.queryByRole("alert")).toBeNull(); // no error → no reason, just loading
  });

  it("(c) healthy WITH content → exports; the real content is in the document, no reason", async () => {
    // Open questions flow straight to the Gap section (no register/primary gymnastics).
    h.openQuestions = { rows: [{ question_text: "Which segment do we defend first?", anchor_identity: "a1" }], questions: ["Which segment do we defend first?"], loading: false, error: null };
    const btn = await renderSettled();
    expect(btn.disabled).toBe(false);
    expect(screen.queryByRole("alert")).toBeNull();
    await act(async () => { fireEvent.click(btn); });
    expect(h.html).toContain("Which segment do we defend first?");
  });

  it("(d) zero-data but successful reads → STILL exports (honest empty is not failure)", async () => {
    // all reads healthy, all empty, no errors
    const btn = await renderSettled();
    expect(btn.disabled).toBe(false);
    expect(screen.queryByRole("alert")).toBeNull();
    await act(async () => { fireEvent.click(btn); });
    expect(h.html).not.toBeNull();
    expect(h.html).toContain("The outside read hasn't surfaced a lead finding for this company yet."); // honest-empty content intact
  });
});
