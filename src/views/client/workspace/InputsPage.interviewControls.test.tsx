// Gate B commit 2a guards (f) listing rule, (o) controls at component level — R11 / R14 (2026-09-20):
// a retracted record's row is never rendered (file archived or not); W1 replaces Archive × on interview rows;
// ordinary rows keep Archive ×; the inline confirm carries W2 / W3 / Cancel and calls withdraw once; P1 opens
// the listbox P3 (Stakeholder / Customer) and calls correctSpeaker once; a collision renders P2.
// Plant (f): the listing rule removed → the retracted row renders.
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";
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
const HOOK = vi.hoisted(() => ({ records: [] as Array<Record<string, unknown>>, withdraw: [] as string[], correct: [] as Array<[string, string]>, collision: false }));
vi.mock("@/hooks/useInterviewUploads", async (orig) => {
  const real = await orig<typeof import("@/hooks/useInterviewUploads")>();
  return { ...real, useInterviewUploads: () => ({ records: HOOK.records, markets: [], loading: false, refetch: () => {},
    changeMarket: async () => ({ ok: true }),
    withdraw: async (r: { id: string }) => { HOOK.withdraw.push(r.id); return { ok: true }; },
    correctSpeaker: async (r: { id: string }, role: string) => { HOOK.correct.push([r.id, role]); return HOOK.collision ? { ok: false, collision: true, error: "speaker_identity_collision" } : { ok: true }; } }) };
});

const file = (id: string, is_interview: boolean) => ({ id, input_id: "in-1", file_name: `${id}.txt`, file_type: "text/plain", file_path: `c1/${id}.txt`, tags: [], uploaded_at: "2026-06-01T00:00:00Z", archived_at: null, archive_reason: null, archive_source: null, is_interview });
const rec = (id: string, input_file_id: string, extra: Record<string, unknown> = {}) => ({ id, input_file_id, speaker_role: "market_participant", market_state: "unplaced", journey_key: null, market_basis: [], review_state: "unreviewed", retracted_at: null, parsed_at: null, speaker_history: [], ...extra });
const mount = () => render(<OperatorControlsContext.Provider value={{ decide: async () => {} }}><InputsPage /></OperatorControlsContext.Provider>).container;

describe("Inputs — withdraw and speaker controls (R11 / R14)", () => {
  it("(f) a retracted record's row is never rendered, even when its file is not archived", () => {
    FILES.rows = [file("iv-live", true), file("iv-gone", true), file("ord", false)];
    HOOK.records = [rec("r-live", "iv-live"), rec("r-gone", "iv-gone", { retracted_at: "2026-09-20T00:00:00Z" })];
    const c = mount();
    const ids = [...c.querySelectorAll("[data-testid=inputs-file-row]")].map((el) => el.getAttribute("data-fr-file-id"));
    expect(ids).toEqual(["iv-live", "ord"]);
  });
  it("(o) W1 only on interview rows, Archive × only on ordinary rows; confirm → withdraw called once", () => {
    FILES.rows = [file("iv-1", true), file("ord", false)];
    HOOK.records = [rec("r-1", "iv-1")]; HOOK.withdraw.length = 0;
    const c = mount();
    const iv = c.querySelector('[data-testid=inputs-file-row][data-fr-file-id="iv-1"]')!;
    const ord = c.querySelector('[data-testid=inputs-file-row][data-fr-file-id="ord"]')!;
    expect(iv.querySelector("[data-testid=inputs-withdraw]")!.textContent).toBe("Withdraw interview (permanent)");
    expect(iv.querySelector("[data-testid=inputs-archive]")).toBeNull();
    expect(ord.querySelector("[data-testid=inputs-archive]")).not.toBeNull();
    expect(ord.querySelector("[data-testid=inputs-withdraw]")).toBeNull();
    fireEvent.click(iv.querySelector("[data-testid=inputs-withdraw]")!);
    const confirm = c.querySelector("[data-testid=inputs-withdraw-confirm]")!;
    expect(confirm.textContent).toContain("Withdraw this interview? This can't be undone. The file is archived and nothing from it is used.");
    expect(confirm.querySelector("[data-testid=inputs-withdraw-go]")!.textContent).toBe("Withdraw");
    expect(confirm.querySelector("[data-testid=inputs-withdraw-cancel]")!.textContent).toBe("Cancel");
    fireEvent.click(confirm.querySelector("[data-testid=inputs-withdraw-go]")!);
    expect(HOOK.withdraw).toEqual(["r-1"]);
  });
  it("(o) P1 → listbox P3 with Stakeholder / Customer / Working session → correctSpeaker once; a collision renders P2; not offered when parsed", async () => {
    FILES.rows = [file("iv-1", true), file("iv-p", true)];
    HOOK.records = [rec("r-1", "iv-1"), rec("r-p", "iv-p", { parsed_at: "2026-09-20T00:00:00Z" })]; HOOK.correct.length = 0; HOOK.collision = false;
    const c = mount();
    const iv = c.querySelector('[data-testid=inputs-file-row][data-fr-file-id="iv-1"]')!;
    expect(c.querySelector('[data-testid=inputs-file-row][data-fr-file-id="iv-p"] [data-testid=inputs-change-speaker]')).toBeNull();
    const btn = iv.querySelector("[data-testid=inputs-change-speaker]")!;
    expect(btn.textContent).toBe("Change speaker");
    fireEvent.click(btn);
    const list = iv.querySelector("[data-testid=inputs-speaker-list]")!;
    expect(list.getAttribute("aria-label")).toBe("Choose the speaker");
    // 4f-1: the list gains the third record type; the first two keep their words and their order.
    expect([...list.querySelectorAll("[data-testid=inputs-speaker-option]")].map((o) => o.textContent)).toEqual(["Stakeholder", "Customer", "Working session"]);
    fireEvent.click(list.querySelector('[data-fr-speaker-role="client_stakeholder"]')!);
    await new Promise((r) => setTimeout(r, 0));
    expect(HOOK.correct).toEqual([["r-1", "client_stakeholder"]]);
    // 4f-1: and picking it re-types the record through the same RPC call as the other two.
    HOOK.correct = [];
    fireEvent.click(iv.querySelector("[data-testid=inputs-change-speaker]")!);
    fireEvent.click(iv.querySelector('[data-fr-speaker-role="working_session"]')!);
    await new Promise((r) => setTimeout(r, 0));
    expect(HOOK.correct).toEqual([["r-1", "working_session"]]);
    HOOK.collision = true;
    fireEvent.click(iv.querySelector("[data-testid=inputs-change-speaker]")!);
    fireEvent.click(iv.querySelector('[data-fr-speaker-role="client_stakeholder"]')!);
    await new Promise((r) => setTimeout(r, 0));
    expect(iv.querySelector("[data-testid=inputs-speaker-collision]")!.textContent).toBe("This transcript is already recorded with that speaker.");
  });
});
