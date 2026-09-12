// LIFT PARITY (Job Map Tier 1, 2026-09-11) — the choose write (operator_primary_selection upsert +
// audit row) moved out of OnStrategyPin.pinFocused into @/hooks/useChooseJobStepSet. This mounts the
// real OnStrategyPin with two sets, a pin on the other one, and proves (1) its action string is
// unchanged and (2) the click calls chooseJobStepSet with (companyId, viewedSetKey) — the same two
// values the inline upsert used — and then invalidates its own query. A second test drives the moved
// function against a supabase stub and asserts the upsert / audit payloads verbatim.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { OnStrategyPin, ON_STRATEGY_LABEL } from "./OnStrategyPin";
import { chooseJobStepSet } from "@/hooks/useChooseJobStepSet";

const lifted = vi.hoisted(() => ({ chooseJobStepSet: vi.fn(async (_c: unknown, _k: unknown) => {}) }));
vi.mock("@/hooks/useChooseJobStepSet", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/hooks/useChooseJobStepSet")>();
  return { ...mod, chooseJobStepSet: lifted.chooseJobStepSet };
});

// Records every table call; the pin read answers with a pin on set "a".
const calls = vi.hoisted(() => [] as Array<{ table: string; op: string; args: unknown[] }>);
vi.mock("@/integrations/supabase/client", () => {
  const make = (table: string) => {
    const b: Record<string, unknown> = {};
    const chain = (op: string) => (...args: unknown[]) => { calls.push({ table, op, args }); return b; };
    for (const op of ["select", "eq", "upsert", "insert", "delete"]) b[op] = chain(op);
    b.maybeSingle = async () => ({ data: table === "operator_primary_selection" ? { item_key: "a" } : null, error: null });
    b.then = (resolve: (v: unknown) => void) => resolve({ data: null, error: null });
    return b;
  };
  return { supabase: { from: (t: string) => make(t), auth: { getUser: async () => ({ data: { user: { email: "op@example.test", id: "u1" } } }) } } };
});

const SETS = [{ key: "a", title: "Set A" }, { key: "b", title: "Set B" }];
function mount(viewed: string | null) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const spy = vi.spyOn(qc, "invalidateQueries");
  const utils = render(<QueryClientProvider client={qc}><OnStrategyPin companyId="c1" setOptions={SETS} viewedSetKey={viewed} /></QueryClientProvider>);
  return { ...utils, spy };
}
const button = (c: HTMLElement) => Array.from(c.querySelectorAll("button")).find((b) => (b.textContent || "").includes("Choose this as the on-strategy set"));

beforeEach(() => { lifted.chooseJobStepSet.mockClear(); calls.length = 0; });

describe("OnStrategyPin after the choose-write lift", () => {
  it("keeps its action string and calls chooseJobStepSet(companyId, viewedSetKey), then invalidates its read", async () => {
    const { container, spy } = mount("b");
    await waitFor(() => expect(container.textContent).toContain(`${ON_STRATEGY_LABEL}: Set A`));
    const btn = button(container);
    expect(btn).toBeTruthy();
    fireEvent.click(btn!);
    await waitFor(() => expect(lifted.chooseJobStepSet).toHaveBeenCalledTimes(1));
    expect(lifted.chooseJobStepSet).toHaveBeenCalledWith("c1", "b");
    await waitFor(() => expect(spy).toHaveBeenCalledWith({ queryKey: ["on-strategy-pin", "c1"] }));
    // The pin itself no longer writes: no upsert / insert left the component.
    expect(calls.filter((c) => c.op === "upsert" || c.op === "insert")).toHaveLength(0);
  });

  it("shows the checked label, not the action, when the viewed set is the chosen one", async () => {
    const { container } = mount("a");
    await waitFor(() => expect(container.textContent).toContain(`✓ ${ON_STRATEGY_LABEL}`));
    expect(button(container)).toBeUndefined();
  });
});

describe("chooseJobStepSet (the moved write)", () => {
  it("upserts operator_primary_selection on (company_id,domain) with the actor, then inserts the audit row", async () => {
    const { chooseJobStepSet: real } = await vi.importActual<typeof import("@/hooks/useChooseJobStepSet")>("@/hooks/useChooseJobStepSet");
    await real("c1", "b");
    const upsert = calls.find((c) => c.op === "upsert");
    expect(upsert?.table).toBe("operator_primary_selection");
    const row = upsert!.args[0] as Record<string, unknown>;
    expect(row).toMatchObject({ company_id: "c1", domain: "job_step_set", item_key: "b", item_id: null, chosen_by: "op@example.test" });
    expect(typeof row.chosen_at).toBe("string");
    expect(upsert!.args[1]).toEqual({ onConflict: "company_id,domain" });
    const audit = calls.find((c) => c.op === "insert");
    expect(audit?.table).toBe("operator_primary_selection_audit");
    expect(audit!.args[0]).toEqual({ company_id: "c1", domain: "job_step_set", item_key: "b", action: "set", actor: "op@example.test", reason: null });
    expect(calls.findIndex((c) => c.op === "upsert")).toBeLessThan(calls.findIndex((c) => c.op === "insert"));
    expect(typeof chooseJobStepSet).toBe("function");
  });
});
