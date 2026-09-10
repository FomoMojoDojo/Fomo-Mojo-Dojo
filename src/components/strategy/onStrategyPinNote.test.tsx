// Gate 5b (ruling g) — PIN_CLEARED_STALE_NOTE persists in component state until the operator's next
// choice.
//
// RED ON REVERT. The note used to ride the query result: the first fetch found a stale pin, cleared
// it (audit row) and returned clearedStale:true; the NEXT fetch — 30s later, or any invalidation —
// found no pin and returned clearedStale:false, so the note vanished before the operator read it
// (Gate E1b's capture missed it for exactly this reason). A status the operator has not acted on
// must not un-write itself; only choosing clears it.
import { describe, it, expect, vi } from "vitest";
import { render, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const pinRow = { current: { item_key: "gone-set" } as { item_key: string } | null };
const upserts: unknown[] = [];
vi.mock("@/integrations/supabase/client", () => {
  const chain = (table: string) => {
    const q: Record<string, unknown> = {};
    const self = () => q;
    q.select = self; q.eq = self; q.insert = async () => ({ error: null }); q.delete = self;
    q.upsert = async (row: unknown) => { upserts.push(row); pinRow.current = { item_key: (row as { item_key: string }).item_key }; return { error: null }; };
    q.maybeSingle = async () => ({ data: table === "operator_primary_selection" ? pinRow.current : null, error: null });
    return q;
  };
  return { supabase: { from: chain, auth: { getUser: async () => ({ data: { user: { email: "op@x" } } }) } } };
});
vi.mock("@/lib/chosenJobStepSet", async (orig) => {
  const real = await orig<typeof import("@/lib/chosenJobStepSet")>();
  return {
    ...real,
    currentActor: async () => "op@x",
    clearStalePin: async () => { pinRow.current = null; },   // the mechanism: the stale pin is gone after the first read
  };
});

import { OnStrategyPin } from "./OnStrategyPin";
import { PIN_CLEARED_STALE_NOTE } from "@/lib/chosenJobStepSet";

const SETS = [{ key: "a", title: "Set A" }, { key: "b", title: "Set B" }];

describe("Gate 5b (g) — the cleared-stale note persists until the next choice", () => {
  it("(g5b) the note SURVIVES a refetch that no longer finds a stale pin, and clears on choose", async () => {
    pinRow.current = { item_key: "gone-set" };
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 0 } } });
    const { findByTestId, queryByTestId, getByText } = render(
      <QueryClientProvider client={qc}>
        <OnStrategyPin companyId="co" setOptions={SETS} viewedSetKey="a" />
      </QueryClientProvider>,
    );
    // first fetch: stale pin found → cleared → note shown
    expect((await findByTestId("pin-cleared-note")).textContent).toBe(PIN_CLEARED_STALE_NOTE);

    // a refetch (what the 30s staleTime / any invalidation does): the pin is gone, clearedStale:false
    await act(async () => { await qc.refetchQueries({ queryKey: ["on-strategy-pin", "co"] }); });
    const q = qc.getQueryData<{ clearedStale: boolean }>(["on-strategy-pin", "co"]);
    expect(q?.clearedStale).toBe(false);                     // the query itself has forgotten
    // react-query notifies observers on a macrotask; let the re-render with the new data land
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    expect(queryByTestId("pin-cleared-note")).not.toBeNull(); // the component has not

    // the operator's next choice is the ONLY thing that clears it
    await act(async () => { getByText("Choose this as the on-strategy set").click(); });
    await waitFor(() => expect(queryByTestId("pin-cleared-note")).toBeNull());
    expect(upserts.length).toBe(1);
  });
});
