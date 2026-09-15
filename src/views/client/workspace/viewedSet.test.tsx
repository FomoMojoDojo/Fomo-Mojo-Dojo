// Item 2 R1 (signed 2026-09-15) — the viewed-set union. The Job Map switcher lists the UNION of live
// market definitions (retracted_at IS NULL) and existing job_steps key sets, each mapped or not; the
// label is job_steps.journey_title → market_lens.title → key; an unmapped key is never the default/seed
// view and never reads as chosen; the viewKey override MAY name an unmapped key. Market and
// Opportunities call useViewedSet without a viewKey — their resolution is proven unchanged here.
import { describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

const STEPS = vi.hoisted(() => ({ items: [] as Array<Record<string, unknown>> }));
const CHOSEN = vi.hoisted(() => ({ key: null as string | null }));
const TABLES = vi.hoisted(() => ({ defs: [] as Array<Record<string, unknown>>, lens: [] as Array<Record<string, unknown>> }));

vi.mock("@/hooks/useJobSteps", () => ({
  useJobSteps: () => ({ items: STEPS.items, loading: false, refetch: () => {} }),
}));
vi.mock("@/lib/chosenJobStepSet", async (orig) => {
  const real = await orig<typeof import("@/lib/chosenJobStepSet")>();
  return { ...real, useChosenSetKey: () => ({ chosenKey: CHOSEN.key, loading: false, invalidate: () => {} }) };
});
vi.mock("@/integrations/supabase/client", () => {
  const q = (rows: () => Array<Record<string, unknown>>) => {
    const filters: Array<(r: Record<string, unknown>) => boolean> = [];
    const b: Record<string, unknown> = {};
    b.select = () => b;
    b.eq = (c: string, v: unknown) => { filters.push((r) => r[c] === v); return b; };
    b.is = (c: string, v: unknown) => { filters.push((r) => (v === null ? r[c] == null : r[c] === v)); return b; };
    b.then = (res: (v: unknown) => void) => res({ data: rows().filter((r) => filters.every((f) => f(r))), error: null });
    return b;
  };
  return { supabase: { from: (t: string) => q(() => (t === "odi_market_definitions" ? TABLES.defs : t === "market_lens" ? TABLES.lens : [])) } };
});

import { useViewedSet } from "./viewedSet";

const step = (key: string, n: number, title: string | null = null, designed = true) => ({ id: `${key}-${n}`, journey_key: key, journey_title: title, step_number: n, designed });
const def = (key: string, retracted_at: string | null = null) => ({ id: `d-${key}`, company_id: "co", journey_key: key, job_executor: `Executor of ${key}`, retracted_at });

function edgewood() {
  STEPS.items = [step("customer", 1, "Checkpoint Map: Families"), step("customer", 2, "Checkpoint Map: Families"), step("internal", 1, "Internal Operations")];
  TABLES.defs = [def("customer"), def("pmk-new-clinicians"), def("mkt-funders"), def("dmk-retracted", "2026-09-01T00:00:00Z")];
  TABLES.lens = [{ company_id: "co", journey_key: "pmk-new-clinicians", title: "New clinicians" }, { company_id: "co", journey_key: "customer", title: "Lens title must lose to the steps title" }];
  CHOSEN.key = null;
}

describe("viewedSet union (R1)", () => {
  it("sets = union of live definitions and job_steps keys, each mapped or not, with stepCount", async () => {
    edgewood();
    const { result } = renderHook(() => useViewedSet("co"));
    await waitFor(() => expect(result.current.sets.length).toBe(4));
    const byKey = Object.fromEntries(result.current.sets.map((s) => [s.key, s]));
    expect(byKey.customer).toMatchObject({ mapped: true, stepCount: 2 });
    expect(byKey.internal).toMatchObject({ mapped: true, stepCount: 1 });          // steps, no definition
    expect(byKey["pmk-new-clinicians"]).toMatchObject({ mapped: false, stepCount: 0 }); // definition, no steps
    expect(byKey["mkt-funders"]).toMatchObject({ mapped: false, stepCount: 0 });
    expect(byKey["dmk-retracted"]).toBeUndefined();                                // retracted counts as absent
  });
  it("label order: job_steps.journey_title → market_lens.title → key", async () => {
    edgewood();
    const { result } = renderHook(() => useViewedSet("co"));
    await waitFor(() => expect(result.current.sets.length).toBe(4));
    const byKey = Object.fromEntries(result.current.sets.map((s) => [s.key, s]));
    expect(byKey.customer.title).toBe("Checkpoint Map: Families");
    expect(byKey["pmk-new-clinicians"].title).toBe("New clinicians");
    expect(byKey["mkt-funders"].title).toBeNull();                                 // renders as the key
  });
  it("an unmapped key is never the seed, even when it is the only definition-backed key", async () => {
    edgewood();
    STEPS.items = [step("internal", 1, "Internal Operations", false)];
    const { result } = renderHook(() => useViewedSet("co"));
    await waitFor(() => expect(result.current.sets.length).toBe(4)); // internal + customer/pmk/mkt definitions
    expect(result.current.viewedKey).toBe("internal");
    expect(result.current.keys).toEqual(["internal"]);
  });
  it("an unmapped key never reads as chosen, even when the pin names it", async () => {
    edgewood();
    CHOSEN.key = "pmk-new-clinicians";
    const { result } = renderHook(() => useViewedSet("co"));
    await waitFor(() => expect(result.current.sets.length).toBe(4));
    expect(result.current.chosenKey).toBeNull();
    expect(result.current.chosen).toBe(false);
    expect(result.current.viewedKey).toBe("customer");
  });
  it("viewKey may name an unmapped key: the view moves, steps are empty, mapped is false, title is the label", async () => {
    edgewood();
    const { result } = renderHook(() => useViewedSet("co", "pmk-new-clinicians"));
    await waitFor(() => expect(result.current.viewedKey).toBe("pmk-new-clinicians"));
    expect(result.current.viewedMapped).toBe(false);
    expect(result.current.viewedSteps).toEqual([]);
    expect(result.current.viewedTitle).toBe("New clinicians");
    expect(result.current.chosen).toBe(false);
  });
});

describe("consumers without a viewKey are unchanged (Market, Opportunities, the seed note)", () => {
  it("no viewKey → the mapped seed (largest designed non-internal set), never a definition-only key", async () => {
    edgewood();
    TABLES.defs.push(def("zzz-only-defined"));
    const { result } = renderHook(() => useViewedSet("co"));
    await waitFor(() => expect(result.current.sets.length).toBe(5));
    expect(result.current.viewedKey).toBe("customer");
    expect(result.current.viewedMapped).toBe(true);
    expect(result.current.chosen).toBe(false);   // → DEFAULT_SEED_NOTE renders on Market/Opportunities as before
  });
  it("a chosen mapped key resolves exactly as before", async () => {
    edgewood();
    CHOSEN.key = "internal";
    const { result } = renderHook(() => useViewedSet("co"));
    await waitFor(() => expect(result.current.viewedKey).toBe("internal"));
    expect(result.current.chosen).toBe(true);
    expect(result.current.viewedSteps.map((s) => s.id)).toEqual(["internal-1"]);
  });
});
