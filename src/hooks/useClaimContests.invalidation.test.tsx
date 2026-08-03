// OC-3d — resolving a contest must refresh EVERY surface that renders claims.status,
// not just the Contested queue. A set_aside/strike flips claims.status via
// set_claim_status; each status-reading panel lives under its OWN react-query key and
// otherwise serves a stale pre-resolve status until it independently refetches (the
// diagnosed in-place-no-reload bug). This drives the REAL resolve() and asserts the
// invalidation set. Falsification: with any one key's invalidation removed, the matching
// expect() fails and names the missing key.

import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

// Fake supabase: the read resolves empty (so the mount query never errors), and rpc
// (resolve_contest) succeeds — this test is about invalidation, not the RPC itself.
vi.mock("@/integrations/supabase/client", () => {
  const chain: Record<string, unknown> = {};
  chain.select = () => chain;
  chain.eq = () => chain;
  chain.order = () => Promise.resolve({ data: [], error: null });
  return {
    supabase: {
      from: () => chain,
      rpc: vi.fn(() => Promise.resolve({ error: null })),
    },
  };
});

import { useClaimContests } from "./useClaimContests";

describe("OC-3d — resolve() refreshes every claims.status surface", () => {
  it("invalidates the contests key AND the delta / evidence-graph / foundation-provenance data keys", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidated: string[] = [];
    // Spy the queryClient the hook receives from useQueryClient(): record every key,
    // and short-circuit the real refetch (irrelevant to what we assert).
    vi.spyOn(client, "invalidateQueries").mockImplementation((filters?: { queryKey?: unknown }) => {
      invalidated.push(JSON.stringify(filters?.queryKey));
      return Promise.resolve();
    });

    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useClaimContests("co"), { wrapper });

    await act(async () => {
      await result.current.resolve("contest-1", "set_aside", "not a focus right now");
    });

    // The Contested queue/trail itself (present before this gate).
    expect(invalidated).toContain(JSON.stringify(["claim-contests", "co"]));
    // The three surfaces that render claims.status under their OWN keys — each proven a
    // status reader in the diagnostic:
    //   strategic-delta       → StrategicDirectionDelta (Declared-vs-Observed pairs)
    //   evidence-graph        → EvidenceInspectorPanel claims list (useEvidenceGraph)
    //   foundation-provenance → FoundationClaimSupport (useFoundationProvenance; prefix match)
    expect(invalidated).toContain(JSON.stringify(["strategic-delta", "co"]));
    expect(invalidated).toContain(JSON.stringify(["evidence-graph", "co"]));
    expect(invalidated).toContain(JSON.stringify(["foundation-provenance", "co"]));
  });
});
