// FULL REFRESH — regression for the G2 first-live-run defect: useFullRefresh wrote the parent
// full_refresh row FROM THE BROWSER, but long_runner_runs is SELECT-only under RLS for
// authenticated sessions, so the insert was denied and the halt string was shown for a chain that
// never started. The fix: the client writes NOTHING to the ledger — it passes only {chain:true}
// and public-baseline opens the parent server-side. This test proves the client never inserts and
// invokes with the right contract. (The RLS behavior itself is proven live on the authenticated
// PostgREST role — the standing RLS-verification law.)

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

const { invokeSpy, ledgerWrites } = vi.hoisted(() => ({
  invokeSpy: vi.fn(async () => ({ data: {}, error: null })),
  ledgerWrites: [] as string[], // any insert/update/delete/upsert on long_runner_runs is a regression.
}));

vi.mock("@/integrations/supabase/client", () => {
  const terminal = { data: null, count: 0 };
  const builder: Record<string, unknown> = {};
  for (const m of ["select", "eq", "gte", "order", "limit", "or"]) builder[m] = () => builder;
  builder.maybeSingle = async () => terminal;
  builder.then = undefined;
  const from = (table: string) => ({
    ...builder,
    insert: () => { if (table === "long_runner_runs") ledgerWrites.push("insert"); return builder; },
    update: () => { if (table === "long_runner_runs") ledgerWrites.push("update"); return builder; },
    upsert: () => { if (table === "long_runner_runs") ledgerWrites.push("upsert"); return builder; },
    delete: () => { if (table === "long_runner_runs") ledgerWrites.push("delete"); return builder; },
  });
  return { supabase: { from, functions: { invoke: invokeSpy } } };
});

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: () => {} }),
}));

import { useFullRefresh } from "./useFullRefresh";

describe("useFullRefresh — no client ledger write; correct invoke contract", () => {
  beforeEach(() => { invokeSpy.mockClear(); ledgerWrites.length = 0; });

  it("start() writes NOTHING to long_runner_runs (the escaped defect) and invokes public-baseline {chain:true} with NO parent_run_id", async () => {
    const { result, unmount } = renderHook(() => useFullRefresh("co-1", "Acme", "https://acme.com"));
    await act(async () => { await result.current.start(); });

    // The exact regression: the browser must never write the ledger.
    expect(ledgerWrites).toEqual([]);

    // Contract: fire public-baseline with chain:true and NO client-supplied parent_run_id
    // (public-baseline opens the parent server-side).
    expect(invokeSpy).toHaveBeenCalledTimes(1);
    const [fn, opts] = invokeSpy.mock.calls[0] as unknown as [string, { body: Record<string, unknown> }];
    expect(fn).toBe("public-baseline");
    expect(opts.body.chain).toBe(true);
    expect(opts.body).not.toHaveProperty("parent_run_id");
    unmount();
  });

  it("does not fire when the website is missing (guard)", async () => {
    const { result, unmount } = renderHook(() => useFullRefresh("co-1", "Acme", ""));
    await act(async () => { await result.current.start(); });
    expect(invokeSpy).not.toHaveBeenCalled();
    expect(ledgerWrites).toEqual([]);
    unmount();
  });
});
