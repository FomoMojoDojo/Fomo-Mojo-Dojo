// HONEST IDENTITY-COMPUTE GATE — the crux. contentIdentity() hashes via crypto.subtle, which is
// UNDEFINED on insecure origins (http over a non-localhost host, e.g. a Tailscale peer). Before the
// fix the hash threw with no catch, `loading` stayed true forever, and TheCheckAct rendered
// "Loading items…" eternally. The effect now wraps the async body in try/catch/finally: finally
// GUARANTEES loading clears; catch records identityError (folded into readError for HeardAct/Export).
//
// FALSIFICATION: remove the `finally` and loading never clears on a throw → the first test's
// waitFor(loading===false) times out and it fails. Remove the `catch` and identityError stays null
// → the identityError/readError assertions fail. Either reverts the escaped defect.
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

// Simulate crypto.subtle undefined: the single identity authority throws. SAME specifier the hook
// imports, so vi.mock resolves to the same module.
const ident = vi.hoisted(() => ({ throws: true }));
vi.mock("../../supabase/functions/_shared/contentIdentity.ts", () => ({
  contentIdentity: async (t: string) => {
    if (ident.throws) throw new Error("Cannot read properties of undefined (reading 'digest')");
    return "id-" + t;
  },
}));

// useFirstReadCapture calls useQueryClient() — stub it so renderHook needs no provider.
vi.mock("@tanstack/react-query", () => ({ useQueryClient: () => ({ invalidateQueries: () => {} }) }));

// One differentiator → one raw item (no register guard), so the identity effect actually hashes.
// Returns MUST be referentially STABLE (closure singletons): a new object each render would churn
// raw's useMemo and re-fire the identity effect forever, so no run's finally would ever commit.
vi.mock("@/hooks/useStandingFindings", () => { const R = { data: { findings: [] }, isLoading: false, error: null }; return { useStandingFindings: () => R }; });
vi.mock("@/hooks/useMarketOptions", () => { const R = { options: [], loading: false, error: null }; return { useMarketOptions: () => R }; });
vi.mock("@/hooks/usePositioningCanvas", () => { const R = { item: { unique_attributes: [{ id: "d1", name: "Fast onboarding" }] }, loading: false, error: null }; return { usePositioningCanvas: () => R }; });

// Chainable, thenable supabase stub: the delta read resolves to zero rows (ready, empty).
vi.mock("@/integrations/supabase/client", () => {
  const builder: Record<string, unknown> = {};
  for (const m of ["select", "eq", "in", "not", "order", "limit", "gte", "or", "abortSignal"]) builder[m] = () => builder;
  builder.maybeSingle = async () => ({ data: null, error: null });
  builder.then = (res: (v: { data: unknown[]; error: null }) => unknown) => res({ data: [], error: null });
  return { supabase: { from: () => builder } };
});

import { useFirstReadCapture } from "./useFirstReadCapture";

afterEach(() => { ident.throws = true; });

describe("useFirstReadCapture — identity compute terminates (no eternal loading)", () => {
  it("crypto.subtle undefined → loading CLEARS and identityError is recorded (folded into readError)", async () => {
    ident.throws = true;
    const { result } = renderHook(() => useFirstReadCapture("co-1", undefined));
    // The crux: finally clears loading even though the hash threw.
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.identityError).toBeTruthy();
    expect(result.current.readError).toBeTruthy(); // HeardAct (useReadState) + ExportButton (GATE D) stay honest
  });

  it("normal path: contentIdentity resolves → loading clears, NO identityError, items present", async () => {
    ident.throws = false;
    const { result } = renderHook(() => useFirstReadCapture("co-1", undefined));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.identityError).toBeNull();
    expect(result.current.items.length).toBeGreaterThan(0); // the differentiator became a hashed item
  });
});
