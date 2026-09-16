// Gate B (2026-09-16) — the Inputs "Run outside signals" control for a company with no public site:
// the refresh hook starts without a website when noPublicSite is true (website sent as ""), still
// refuses without it otherwise, and the operator-facing plan tag string is byte-identical to the register.
import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

const invoke = vi.hoisted(() => vi.fn(async (_name: string, _opts: unknown) => ({ data: {}, error: null })));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { functions: { invoke }, from: () => { const b: Record<string, unknown> = {}; b.select = () => b; b.eq = () => b; b.gte = () => b; b.or = () => b; b.not = () => b; b.neq = () => b; b.order = () => b; b.limit = () => b; b.maybeSingle = () => b; b.in = () => b; b.then = (r: (v: unknown) => void) => r({ data: [], error: null }); return b; } } }));
vi.mock("@/lib/frozenCompanies", () => ({ isFrozenCompany: () => false }));
vi.mock("@tanstack/react-query", () => ({ useQueryClient: () => ({ invalidateQueries: () => {} }) }));
import { useFullRefresh } from "./useFullRefresh";
import { WORKSPACE_STRINGS } from "@/views/client/workspace/workspaceNav";

beforeEach(() => invoke.mockClear());

describe("useFullRefresh — no public site", () => {
  it("without a website and without the flag: no invoke", async () => {
    const { result } = renderHook(() => useFullRefresh("co", "Proof", null, false));
    await act(async () => { await result.current.start(); });
    expect(invoke).not.toHaveBeenCalled();
  });
  it("without a website but flagged: invokes public-baseline by name with website ''", async () => {
    const { result } = renderHook(() => useFullRefresh("co", "Proof", null, true));
    await act(async () => { await result.current.start(); });
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke.mock.calls[0][0]).toBe("public-baseline");
    expect((invoke.mock.calls[0][1] as { body: unknown }).body).toEqual({ company_id: "co", company_name: "Proof", website: "", chain: true });
  });
  it("strings: the state line (signed) and the operator plan tag", () => {
    expect(WORKSPACE_STRINGS.noPublicSiteState).toBe("No public site — the outside read runs on the name only.");
    expect(WORKSPACE_STRINGS.readByName).toBe("read by name");
  });
});
