// useRouteDecision (MOVED from RoutesOrgPanel.handleSelectRoute / handleClearDecision, Routes Tier 1 lift
// 2026-09-12). Drives the hook against a supabase stub and asserts the writes verbatim: the companies
// PATCH keys, the route_decision_events insert with event_type selected | changed | cleared and the
// decision summary (bullets from the route's why / evidence / steps, route_title, route_category).
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useRouteDecision } from "./useRouteDecision";
import type { Company } from "@/hooks/useCompany";
import type { RouteRow } from "@/hooks/useRoutes";

const calls = vi.hoisted(() => [] as Array<{ table: string; op: string; args: unknown[] }>);
vi.mock("@/integrations/supabase/client", () => {
  const make = (table: string) => {
    const b: Record<string, unknown> = {};
    for (const op of ["update", "insert", "eq"]) b[op] = (...args: unknown[]) => { calls.push({ table, op, args }); return b; };
    b.then = (resolve: (v: unknown) => void) => resolve({ data: null, error: null });
    return b;
  };
  return { supabase: { from: (t: string) => make(t) } };
});

const company = (over: Partial<Company> = {}) => ({ id: "c1", name: "Edgewood", selected_route_id: null, selected_route_updated_at: null, selected_route_summary_json: null, ...over } as unknown as Company);
const ROUTE: RouteRow = {
  id: "route-1", company_id: "c1", title: "Clarify eligibility criteria before funding", category: "fix", level: "route", parent_id: null,
  why_this_matters_json: ["Search delays cost families weeks.", "Eligibility rules differ per funder."],
  evidence_json: [{ id: "e1", title: "Intake notes", status: "complete" }, { id: "e2", title: "Funder matrix", status: "missing" }],
  steps_json: [{ id: "s1", title: "Map funders", status: "complete" }],
} as unknown as RouteRow;
const patches = (table: string) => calls.filter((c) => c.table === table && c.op === "update").map((c) => c.args[0] as Record<string, unknown>);
const inserts = (table: string) => calls.filter((c) => c.table === table && c.op === "insert").map((c) => c.args[0] as Record<string, unknown>);

beforeEach(() => { calls.length = 0; });

describe("useRouteDecision", () => {
  it("seeds from the company row", () => {
    const { result } = renderHook(() => useRouteDecision(company({ selected_route_id: "route-9", selected_route_updated_at: "2026-09-01T00:00:00Z" })));
    expect(result.current.selectedRouteId).toBe("route-9");
    expect(result.current.savedAt).toBe("2026-09-01T00:00:00Z");
  });

  it("chooseRoute with nothing chosen: companies PATCH (selection columns, by id) + event_type 'selected' with the decision summary", async () => {
    const { result } = renderHook(() => useRouteDecision(company()));
    await act(async () => { await result.current.chooseRoute(ROUTE); });
    expect(result.current.selectedRouteId).toBe("route-1");
    const [patch] = patches("companies");
    expect(Object.keys(patch).sort()).toEqual(["selected_route_id", "selected_route_summary_json", "selected_route_updated_at"]);
    expect(patch.selected_route_id).toBe("route-1");
    expect(typeof patch.selected_route_updated_at).toBe("string");
    expect(calls.find((c) => c.table === "companies" && c.op === "eq")?.args).toEqual(["id", "c1"]);
    const [event] = inserts("route_decision_events");
    expect(event).toMatchObject({ company_id: "c1", route_id: "route-1", event_type: "selected" });
    const summary = event.summary_json as { bullets: string[]; route_title: string; route_category: string };
    expect(summary.route_title).toBe(ROUTE.title);
    expect(summary.route_category).toBe("fix");
    expect(summary.bullets[0]).toBe("Search delays cost families weeks.");
    expect(summary.bullets).toContain("1 of 2 evidence items already in place.");
    expect(patch.selected_route_summary_json).toEqual(summary);
  });

  it("chooseRoute with another route chosen: event_type 'changed'", async () => {
    const { result } = renderHook(() => useRouteDecision(company({ selected_route_id: "route-9" })));
    await act(async () => { await result.current.chooseRoute(ROUTE); });
    expect(inserts("route_decision_events")[0]).toMatchObject({ route_id: "route-1", event_type: "changed" });
    expect(patches("companies")[0].selected_route_id).toBe("route-1");
  });

  it("chooseRoute on the chosen route clears it: nulling PATCH + event_type 'cleared' carrying the prior summary", async () => {
    const prior = { bullets: ["x"], route_title: "Old", route_category: "improve" };
    const { result } = renderHook(() => useRouteDecision(company({ selected_route_id: "route-1", selected_route_summary_json: prior })));
    await act(async () => { await result.current.chooseRoute(ROUTE); });
    expect(result.current.selectedRouteId).toBeNull();
    expect(patches("companies")[0]).toEqual({ selected_route_id: null, selected_route_summary_json: {}, selected_route_updated_at: null });
    expect(inserts("route_decision_events")[0]).toMatchObject({ route_id: "route-1", event_type: "cleared", summary_json: prior });
  });

  it("clearRoute: the same nulling PATCH + 'cleared'", async () => {
    const { result } = renderHook(() => useRouteDecision(company({ selected_route_id: "route-1" })));
    await act(async () => { await result.current.clearRoute(); });
    expect(patches("companies")[0].selected_route_id).toBeNull();
    expect(inserts("route_decision_events")[0]).toMatchObject({ route_id: "route-1", event_type: "cleared", summary_json: {} });
  });

  it("no company ⇒ local state only, zero writes", async () => {
    const { result } = renderHook(() => useRouteDecision(null));
    await act(async () => { await result.current.chooseRoute(ROUTE); });
    expect(result.current.selectedRouteId).toBe("route-1");
    expect(calls).toHaveLength(0);
  });
});
