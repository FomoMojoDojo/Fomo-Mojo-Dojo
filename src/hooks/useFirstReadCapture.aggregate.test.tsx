// GATE C-2b — useFirstReadCapture's AGGREGATE read-error (Option 1). The whole point of the
// aggregate is that ANY sub-read failing trips it. This proves EACH of the five sub-reads
// individually — findings / markets / canvas (sub-hooks) + delta + verdict-responses (direct
// queries) — sets `readError`, and that all-healthy leaves it null.
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

const h = vi.hoisted(() => ({
  findings: { data: { findings: [], primaryId: null, companyDomain: null } as unknown, isLoading: false, error: null as string | null },
  options: { options: [] as unknown[], loading: false, error: null as string | null },
  canvas: { item: null as unknown, loading: false, error: null as string | null },
  tableError: {} as Record<string, string | null>,
}));

vi.mock("@/hooks/useStandingFindings", async (o) => ({ ...(await o() as object), useStandingFindings: () => h.findings }));
vi.mock("@/hooks/useMarketOptions", async (o) => ({ ...(await o() as object), useMarketOptions: () => h.options }));
vi.mock("@/hooks/usePositioningCanvas", async (o) => ({ ...(await o() as object), usePositioningCanvas: () => h.canvas }));
vi.mock("@/integrations/supabase/client", () => {
  const result = (t: string) => Promise.resolve({ data: [], error: h.tableError[t] ? { message: h.tableError[t] } : null });
  const builder = (t: string) => {
    const b: Record<string, unknown> = {};
    for (const m of ["select", "eq", "in", "not", "order", "abortSignal", "upsert", "delete"]) b[m] = () => b;
    b.maybeSingle = () => result(t);
    (b as { then: unknown }).then = (res: (v: unknown) => void, rej: (e: unknown) => void) => result(t).then(res, rej);
    return b;
  };
  return { supabase: { from: (t: string) => builder(t) } };
});

import { useFirstReadCapture } from "./useFirstReadCapture";

afterEach(() => {
  h.findings = { data: { findings: [], primaryId: null, companyDomain: null }, isLoading: false, error: null };
  h.options = { options: [], loading: false, error: null };
  h.canvas = { item: null, loading: false, error: null };
  h.tableError = {};
});

async function readErrorOf(): Promise<string | null> {
  const { result } = renderHook(() => useFirstReadCapture("co-1", "sess-1"));
  await waitFor(() => expect(result.current.readLoading).toBe(false));
  return result.current.readError;
}

describe("useFirstReadCapture aggregate read-error (Option 1)", () => {
  it("all healthy → readError null", async () => {
    expect(await readErrorOf()).toBeNull();
  });

  it("sub-read 1/5 — findings error trips the aggregate", async () => {
    h.findings = { ...h.findings, error: "findings boom" };
    expect(await readErrorOf()).toBe("findings boom");
  });

  it("sub-read 2/5 — markets(options) error trips the aggregate", async () => {
    h.options = { ...h.options, error: "options boom" };
    expect(await readErrorOf()).toBe("options boom");
  });

  it("sub-read 3/5 — canvas error trips the aggregate", async () => {
    h.canvas = { ...h.canvas, error: "canvas boom" };
    expect(await readErrorOf()).toBe("canvas boom");
  });

  it("sub-read 4/5 — delta read error trips the aggregate", async () => {
    h.tableError = { claim_deltas: "delta boom" };
    const err = await readErrorOf();
    expect(err).toContain("delta boom");
  });

  it("sub-read 5/5 — verdict-responses read error trips the aggregate", async () => {
    h.tableError = { first_read_responses: "responses boom" };
    expect(await readErrorOf()).toBe("responses boom");
  });

  it("readLoading is true while a sub-read is loading (deadline source)", async () => {
    h.findings = { ...h.findings, isLoading: true };
    const { result } = renderHook(() => useFirstReadCapture("co-1", "sess-1"));
    expect(result.current.readLoading).toBe(true);
  });
});
