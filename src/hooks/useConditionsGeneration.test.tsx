// LIFT PARITY (Job Map Tier 1, 2026-09-11) — runConditionsGeneration moved out of the workshop view
// into useConditionsGeneration. (1) The hook issues exactly the invoke the view issued: function
// generate-step-conditions, body { company_id, journey_key } and NOTHING else — no job_steps
// selection / identity column rides along — then refetches. (2) A frozen company is refused before
// any invoke. (3) The workshop view's wiring: it imports the hook, feeds it the same four values the
// inline callback closed over, its button block is byte-identical to the pre-lift text, and no
// generate-step-conditions invoke remains in the view.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import fs from "node:fs";
import path from "node:path";
import { useConditionsGeneration, setHasConditions } from "./useConditionsGeneration";

const invoke = vi.hoisted(() => vi.fn(async (_name: string, _opts: unknown) => ({ data: { ok: true }, error: null })));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { functions: { invoke }, from: () => { throw new Error("no table read expected on the ok path"); } } }));
const toasts = vi.hoisted(() => ({ loading: vi.fn(), success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast: Object.assign(() => {}, toasts) }));
vi.mock("@/lib/frozenCompanies", () => ({ isFrozenCompany: (id?: string | null) => id === "frozen-co" }));

const STEPS = [{ id: "s1", conditions_json: [{ condition: "x", status: "real_source" }] }, { id: "s2", conditions_json: null }];

beforeEach(() => { invoke.mockClear(); toasts.loading.mockClear(); toasts.success.mockClear(); toasts.error.mockClear(); });

describe("useConditionsGeneration (the moved run)", () => {
  it("invokes generate-step-conditions with { company_id, journey_key } only, then refetches", async () => {
    const refetch = vi.fn(async () => {});
    const { result } = renderHook(() => useConditionsGeneration({ companyId: "c1", setKey: "customer", steps: STEPS, refetch }));
    expect(result.current.running).toBe(false);
    await act(async () => { await result.current.run(); });
    expect(invoke).toHaveBeenCalledTimes(1);
    const [name, opts] = invoke.mock.calls[0];
    expect(name).toBe("generate-step-conditions");
    const body = (opts as { body: Record<string, unknown> }).body;
    expect(Object.keys(body).sort()).toEqual(["company_id", "journey_key"]);
    expect(body).toEqual({ company_id: "c1", journey_key: "customer" });
    expect(refetch).toHaveBeenCalledTimes(1);
    expect(toasts.loading).toHaveBeenCalledWith("Regenerating conditions… (~1–2 min)", { id: "gen-conditions" });
    expect(toasts.success).toHaveBeenCalledWith("Conditions refreshed — your edits kept", { id: "gen-conditions" });
    await waitFor(() => expect(result.current.running).toBe(false));
  });

  it("says Generating / generated for a set with no conditions yet", async () => {
    const { result } = renderHook(() => useConditionsGeneration({ companyId: "c1", setKey: "customer", steps: [{ id: "s1", conditions_json: [] }], refetch: () => {} }));
    expect(setHasConditions([{ id: "s1", conditions_json: [] }])).toBe(false);
    await act(async () => { await result.current.run(); });
    expect(toasts.loading).toHaveBeenCalledWith("Generating conditions… (~1–2 min)", { id: "gen-conditions" });
    expect(toasts.success).toHaveBeenCalledWith("Conditions generated", { id: "gen-conditions" });
  });

  it("refuses a frozen company before any invoke; does nothing without a set", async () => {
    const { result } = renderHook(() => useConditionsGeneration({ companyId: "frozen-co", setKey: "customer", steps: STEPS, refetch: () => {} }));
    await act(async () => { await result.current.run(); });
    expect(invoke).not.toHaveBeenCalled();
    expect(toasts.error).toHaveBeenCalledWith("This is a frozen reference company — conditions are not generated for it.");
    const none = renderHook(() => useConditionsGeneration({ companyId: "c1", setKey: null, steps: STEPS, refetch: () => {} }));
    await act(async () => { await none.result.current.run(); });
    expect(invoke).not.toHaveBeenCalled();
  });
});

describe("ClientRefinePreviewWorkshopView wiring after the lift", () => {
  const src = fs.readFileSync(path.join(__dirname, "../views/client/ClientRefinePreviewWorkshopView.tsx"), "utf8");
  it("imports the hook and feeds it the four values the inline callback closed over", () => {
    expect(src).toContain('import { useConditionsGeneration } from "@/hooks/useConditionsGeneration";');
    expect(src).toMatch(/const \{ run: runConditionsGeneration, running: regeneratingConditions \} = useConditionsGeneration\(\{\s*companyId, setKey: viewedSetKey, steps: filteredJobSteps, refetch: refetchJobSteps,\s*\}\);/);
    expect(src).not.toContain("generate-step-conditions");
    expect(src).not.toContain("setRegeneratingConditions");
  });
  it("renders the header button exactly as before the lift", () => {
    const before = `                {viewedSetKey && !showAllJourneys && !isFrozenCompany(companyId) && (
                  <button
                    type="button"
                    className="btn ghost"
                    onClick={() => void runConditionsGeneration()}
                    disabled={regeneratingConditions || jobStepsLoading}
                  >
                    {regeneratingConditions
                      ? "Working…"
                      : filteredJobSteps.some((s) => Array.isArray(s.conditions_json) && s.conditions_json.length > 0)
                      ? "Regenerate conditions"
                      : "Generate conditions"}
                  </button>
                )}
`;
    expect(src).toContain(before);
  });
});
