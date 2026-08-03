// FR-REOPEN-3 — reopen() invalidates exactly the one key whose data goes stale: the
// session-status source ["fr-reopen-session", companyId] (status flips proposal_issued→
// open). Evidence-bounded: the cached *_count columns have NO react-query reader, and
// claim_contests is never written by reopen (R9), so neither the counts nor the contested
// surface is invalidated. Falsification: with the invalidate line removed, this REDs
// naming the missing key.

import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

vi.mock("@/integrations/supabase/client", () => {
  const chain: Record<string, unknown> = {};
  chain.select = () => chain;
  chain.eq = () => chain;
  chain.in = () => chain;
  chain.order = () => chain;
  chain.limit = () => chain;
  chain.maybeSingle = () => Promise.resolve({ data: null, error: null });
  return {
    supabase: {
      from: () => chain,
      rpc: vi.fn(() => Promise.resolve({ error: null })),
    },
  };
});

import { useReopenFirstRead } from "./useReopenFirstRead";

describe("FR-REOPEN-3 — reopen() invalidation set", () => {
  it("invalidates ONLY ['fr-reopen-session', companyId]", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidated: string[] = [];
    vi.spyOn(client, "invalidateQueries").mockImplementation((f?: { queryKey?: unknown }) => {
      invalidated.push(JSON.stringify(f?.queryKey));
      return Promise.resolve();
    });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useReopenFirstRead("co"), { wrapper });

    await act(async () => {
      await result.current.reopen("s1", "a valid reason");
    });

    // The session-status key must be invalidated (control unmounts once status → open).
    expect(invalidated).toContain(JSON.stringify(["fr-reopen-session", "co"]));
    // …and nothing more — no counts reader, contests unchanged (R9).
    expect(invalidated).toEqual([JSON.stringify(["fr-reopen-session", "co"])]);
  });
});
