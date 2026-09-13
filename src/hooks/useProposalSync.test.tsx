// useProposalSync — the page-side sync poll MOVED from InputsTab (2026-09-13). Same body as the tab's
// effect: per active (queued/running, not rejected) row, dify-analyze-file {mode:"sync", proposalId},
// at most once per row per 5 s, then refetch. `enabled` is the caller's gate — the workspace passes its
// operator + capability gate, so capability FALSE means NO sync path (the standing local-admin-bypass gap
// is proven here, at component level).
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render } from "@testing-library/react";
import { useProposalSync } from "./useProposalSync";
import type { FileProposalRow } from "@/hooks/useFileProposals";

const invoke = vi.hoisted(() => vi.fn(async (_name: string, _opts: unknown) => ({ data: { state: "running" }, error: null })));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { functions: { invoke } } }));

const row = (id: string, processing_state: FileProposalRow["processing_state"], status: FileProposalRow["status"] = "pending"): FileProposalRow =>
  ({ id, status, processing_state, file_id: `f-${id}`, company_id: "c1" } as unknown as FileProposalRow);

function Host({ rows, enabled, refetch }: { rows: FileProposalRow[]; enabled: boolean; refetch: () => Promise<unknown> }) {
  useProposalSync(rows, enabled, refetch);
  return null;
}

beforeEach(() => { invoke.mockClear(); vi.useFakeTimers({ toFake: ["Date"] }); });
afterEach(() => { vi.useRealTimers(); });

describe("useProposalSync", () => {
  it("enabled: one sync per active row (queued/running), none for ready/failed/rejected; then refetch", async () => {
    const refetch = vi.fn(async () => {});
    render(<Host enabled rows={[row("run", "running"), row("q", "queued"), row("ready", "ready"), row("failed", "failed"), row("rej", "running", "rejected")]} refetch={refetch} />);
    expect(invoke).toHaveBeenCalledTimes(2);
    expect(invoke.mock.calls.map((c) => c[1])).toEqual([{ body: { mode: "sync", proposalId: "run" } }, { body: { mode: "sync", proposalId: "q" } }]);
    expect(invoke.mock.calls.every((c) => c[0] === "dify-analyze-file")).toBe(true);
    await Promise.resolve(); await Promise.resolve();
    expect(refetch).toHaveBeenCalled();
  });
  it("throttles to one sync per row per 5 s across re-renders, then fires again", () => {
    const rows = [row("run", "running")];
    const { rerender } = render(<Host enabled rows={rows} refetch={async () => {}} />);
    expect(invoke).toHaveBeenCalledTimes(1);
    rerender(<Host enabled rows={[...rows]} refetch={async () => {}} />); // a new array (a refetch) inside 5 s
    expect(invoke).toHaveBeenCalledTimes(1);
    vi.setSystemTime(Date.now() + 5001);
    rerender(<Host enabled rows={[...rows]} refetch={async () => {}} />);
    expect(invoke).toHaveBeenCalledTimes(2);
  });
  it("disabled (operator off / capability false): NO sync path at all", () => {
    render(<Host enabled={false} rows={[row("run", "running"), row("q", "queued")]} refetch={async () => {}} />);
    expect(invoke).not.toHaveBeenCalled();
  });
  it("nothing active: nothing issued", () => {
    render(<Host enabled rows={[row("ready", "ready"), row("acc", "ready", "accepted")]} refetch={async () => {}} />);
    expect(invoke).not.toHaveBeenCalled();
  });
});
