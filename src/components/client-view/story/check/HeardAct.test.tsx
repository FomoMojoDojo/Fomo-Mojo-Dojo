// GATE C-2b — HeardAct gating on the aggregate. A readError (any sub-read) renders the signed
// error, not HEARD_EMPTY. A never-returning read → error within the 10s deadline. Zero recorded
// verdicts (readLoading false, readError null, no verdicted items) → HEARD_EMPTY byte-identical.
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, act } from "@testing-library/react";

const cap = vi.hoisted(() => ({ ret: null as Record<string, unknown> | null }));
vi.mock("@/hooks/useFirstReadCapture", async (o) => ({ ...(await o() as object), useFirstReadCapture: () => cap.ret }));

import HeardAct from "./HeardAct";
import { ACT_DATA_ERROR } from "@/components/client-view/story/ActData";
import { HEARD_EMPTY } from "@/lib/firstRead/heard";

const base = (over: Record<string, unknown>) => ({
  items: [], tally: { confirmed: 0, corrected: 0, rejected: 0, not_important: 0 },
  loading: false, frozen: false, sessionStatus: null, setVerdict: async () => null, refetchResponses: async () => {},
  deltaState: { status: "ready", data: [] }, readLoading: false, readError: null, ...over,
});

afterEach(() => { vi.useRealTimers(); cap.ret = null; });

describe("HeardAct — Gate C-2b failure handling", () => {
  it("(a) aggregate readError → signed error; HEARD_EMPTY ABSENT", () => {
    cap.ret = base({ readError: "a sub-read failed", items: [] });
    const { container } = render(<HeardAct companyId="co-1" sessionId="s-1" />);
    expect(container.textContent).toContain(ACT_DATA_ERROR);
    expect(container.textContent).not.toContain(HEARD_EMPTY);
  });

  it("(b) never-returning (readLoading) → error within the 10s deadline; not empty", async () => {
    vi.useFakeTimers();
    cap.ret = base({ readLoading: true, readError: null });
    const { container } = render(<HeardAct companyId="co-1" sessionId="s-1" />);
    expect(container.textContent).not.toContain(HEARD_EMPTY);
    await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
    expect(container.textContent).toContain(ACT_DATA_ERROR);
    expect(container.textContent).not.toContain(HEARD_EMPTY);
  });

  it("(c) zero recorded verdicts → HEARD_EMPTY byte-identical, no error", () => {
    cap.ret = base({ items: [], readLoading: false, readError: null });
    const { container } = render(<HeardAct companyId="co-1" sessionId="s-1" />);
    expect(container.textContent).toContain(HEARD_EMPTY);
    expect(container.textContent).not.toContain(ACT_DATA_ERROR);
  });

  it("recorded verdicts → the playback renders, no error, no HEARD_EMPTY", () => {
    cap.ret = base({
      items: [{ identity: "i1", text: "Score is always visible", kind: "finding", ref: "f1", verdict: "confirmed", correctionText: null, capturedAt: "2026-01-01" }],
      readLoading: false, readError: null,
    });
    const { container } = render(<HeardAct companyId="co-1" sessionId="s-1" />);
    expect(container.textContent).toContain("Score is always visible");
    expect(container.textContent).not.toContain(ACT_DATA_ERROR);
    expect(container.textContent).not.toContain(HEARD_EMPTY);
  });
});
