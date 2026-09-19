// Gate A guards (c), (e), (g) + the seed-note rule — rulings M3, FLIP, P3, I7 (signed 2026-09-19),
// component level. useViewedSet is the REAL hook over mocked reads (the same fixture shape as
// viewedSet.test.tsx), so the seed and the ?view= override are exercised end to end; the model-backed
// hooks are stubbed. Fixtures are non-empty on both sides: a customer set (0 designed) and a funder
// market set (8 designed) — the very state that broke the pre-act baseline.
import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";

const STEPS = vi.hoisted(() => ({ items: [] as Array<Record<string, unknown>> }));
const CHOSEN = vi.hoisted(() => ({ key: null as string | null }));
const TABLES = vi.hoisted(() => ({ defs: [] as Array<Record<string, unknown>>, lens: [] as Array<Record<string, unknown>> }));
const OPERATOR = vi.hoisted(() => ({ on: true }));
const NEEDS = vi.hoisted(() => ({ executorByKey: new Map<string, string>() }));

vi.mock("@/hooks/useJobSteps", () => ({ useJobSteps: () => ({ items: STEPS.items, loading: false, refetch: () => {} }) }));
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
vi.mock("@/hooks/useCompany", () => ({ useCompany: () => ({ activeCompany: { id: "co", name: "Edgewood" } }) }));
vi.mock("@/hooks/useOdiNeeds", () => ({
  useOdiNeeds: (_c?: string, _r?: number, key?: string) => ({ needs: [], loading: false, marketDefinition: key ? { job_executor: NEEDS.executorByKey.get(key) ?? "" } : null }),
  markNeedReviewed: async () => {},
}));
vi.mock("@/hooks/useChooseJobStepSet", () => ({ useChooseJobStepSet: () => ({ choose: async () => true, choosing: false }) }));
vi.mock("@/hooks/useConditionsGeneration", () => ({ useConditionsGeneration: () => ({ run: async () => {}, running: false }), setHasConditions: () => false }));
vi.mock("@/hooks/useJobMapGeneration", () => ({ useJobMapGeneration: () => ({ run: async () => {}, running: false, failed: false, failureDetail: null }) }));
vi.mock("@/views/client/firstReadPreview/operatorControls", async (orig) => {
  const real = await orig<typeof import("@/views/client/firstReadPreview/operatorControls")>();
  return { ...real, useOperatorControls: () => (OPERATOR.on ? { decide: async () => {} } : null) };
});

import JobMapPage from "./JobMapPage";
import { WORKSPACE_STRINGS } from "./workspaceNav";
import { DEFAULT_SEED_NOTE, heuristicDefaultViewSeed } from "@/lib/chosenJobStepSet";
import { ON_STRATEGY_LABEL } from "@/components/strategy/OnStrategyPin";

const FUNDER = "pmk-philanthropic-organizations-and-grant-ma";
const FUNDER_TITLE = "Philanthropic organizations and grant-making bodies supporting youth mental health initiatives";
const step = (key: string, n: number, title: string, designed: boolean) => ({
  id: `${key}-${n}`, company_id: "co", user_id: "u", journey_key: key, journey_title: title, journey_subtitle: "", step_number: n, step_label: `${key} step ${n}`,
  description: "", designed, has_gap: false, evidence_status: "unclear", evidence_basis: "", evidence_confidence: null, gap_note: "", created_at: "", conditions_json: null,
});
function edgewood() {
  STEPS.items = [
    ...Array.from({ length: 8 }, (_, i) => step("customer", i + 1, "Checkpoint Map: Families", false)),
    ...Array.from({ length: 8 }, (_, i) => step("internal", i + 1, "Internal Operations", false)),
    ...Array.from({ length: 8 }, (_, i) => step(FUNDER, i + 1, "Funders", true)), // more designed rows than customer
  ];
  TABLES.defs = [
    { id: "d-c", company_id: "co", journey_key: "customer", job_executor: "Families and caregivers", retracted_at: null },
    { id: "d-f", company_id: "co", journey_key: FUNDER, job_executor: "Program officers at grant-making foundations", retracted_at: null },
  ];
  TABLES.lens = [{ company_id: "co", journey_key: FUNDER, title: FUNDER_TITLE }, { company_id: "co", journey_key: "customer", title: "Checkpoint Map: Children and families" }];
  NEEDS.executorByKey = new Map([["customer", "Families and caregivers"], [FUNDER, "Program officers at grant-making foundations"]]);
  CHOSEN.key = null;
  OPERATOR.on = true;
}
let lastSearch = "";
function Probe() { lastSearch = useLocation().search; return null; }
const mount = (search = "") => render(
  <MemoryRouter initialEntries={[`/workspace/job-map${search}`]}>
    <Routes><Route path="/workspace/job-map" element={<><JobMapPage /><Probe /></>} /></Routes>
  </MemoryRouter>,
);
const settle = () => new Promise((r) => setTimeout(r, 0));

describe("Job Map — the viewed market (M3 / FLIP / P3 / I7)", () => {
  it("(g) no chosen set, no ?view=, a funder set with MORE designed rows than customer → opens on the customer set", async () => {
    edgewood();
    const { container } = mount();
    await settle();
    const lead = container.querySelector(".fr-ws-setlead")!;
    expect(lead.getAttribute("data-fr-viewed-key")).toBe("customer");
    expect(container.querySelector("h1")!.textContent).toContain(WORKSPACE_STRINGS.titleJobMap);
    expect(container.querySelector("[data-fr-region=stages]")!.getAttribute("data-fr-set-key")).toBe("customer");
    expect(container.querySelector("[data-fr-seed-note]")!.textContent).toBe(DEFAULT_SEED_NOTE); // a seed still says so
    // the seed itself, directly
    expect(heuristicDefaultViewSeed(["internal", FUNDER, "customer"], new Map([["customer", 0], [FUNDER, 8], ["internal", 0]]))).toBe("customer");
    expect(heuristicDefaultViewSeed(["internal", FUNDER], new Map([[FUNDER, 8], ["internal", 0]]))).toBe(FUNDER); // no customer set → the older heuristic
  });
  it("(c) ?view=<funder> → the title is the market's lens title; Choose and ON STRATEGY absent; the executor band is the funder's; no seed note", async () => {
    edgewood();
    const { container } = mount(`?view=${FUNDER}`);
    await settle();
    const lead = container.querySelector(".fr-ws-setlead")!;
    expect(lead.getAttribute("data-fr-viewed-key")).toBe(FUNDER);
    expect(container.querySelector("h1")!.textContent).toContain(FUNDER_TITLE);
    expect(container.querySelector("h1")!.textContent).not.toContain(WORKSPACE_STRINGS.titleJobMap);
    expect(container.querySelector("[data-testid=jobmap-choose]")).toBeNull();
    expect(container.textContent).not.toContain(ON_STRATEGY_LABEL);
    expect(container.querySelector("[data-fr-seed-note]")).toBeNull(); // never for a market switched to explicitly
    expect(container.querySelector("[data-testid=jobmap-hypothesis] .fr-ws-band-text")!.textContent).toBe("Program officers at grant-making foundations");
    expect(container.querySelector("[data-testid=jobmap-switcher-open]")!.textContent).toBe(FUNDER_TITLE); // the switcher shows the viewed market
    expect(container.querySelector("[data-fr-region=stages]")!.getAttribute("data-fr-set-key")).toBe(FUNDER);
  });
  it("(c) the customer set: 'The customer job', Choose present (not chosen); ON STRATEGY when chosen", async () => {
    edgewood();
    const a = mount("?view=customer");
    await settle();
    expect(a.container.querySelector("h1")!.textContent).toContain(WORKSPACE_STRINGS.titleJobMap);
    expect(a.container.querySelector("[data-testid=jobmap-choose]")).not.toBeNull();
    expect(a.container.querySelector("[data-fr-seed-note]")).toBeNull(); // explicit ?view=customer is a switch too
    a.unmount();
    CHOSEN.key = "customer";
    const b = mount();
    await settle();
    expect(b.container.textContent).toContain(ON_STRATEGY_LABEL);
    expect(b.container.querySelector("[data-testid=jobmap-choose]")).toBeNull();
    b.unmount();
    // chosen = customer but VIEWING the funder market: neither the chip nor Choose
    const c = mount(`?view=${FUNDER}`);
    await settle();
    expect(c.container.textContent).not.toContain(ON_STRATEGY_LABEL);
    expect(c.container.querySelector("[data-testid=jobmap-choose]")).toBeNull();
  });
  it("(FLIP) the switcher writes ?view= to the URL", async () => {
    edgewood();
    const { container } = mount();
    await settle();
    (container.querySelector("[data-testid=jobmap-switcher-open]") as HTMLButtonElement).click();
    await settle();
    const opt = container.querySelector(`[data-testid=jobmap-switcher-option][data-fr-set-key="${FUNDER}"]`) as HTMLButtonElement;
    opt.click();
    await settle();
    expect(lastSearch).toBe(`?view=${FUNDER}`);
    expect(container.querySelector(".fr-ws-setlead")!.getAttribute("data-fr-viewed-key")).toBe(FUNDER);
  });
  it("(ii) T2: the eyebrow is dropped when it equals the title exactly; present when it differs", async () => {
    edgewood();
    // funder: job_steps.journey_title "Funders" ≠ the lens title → eyebrow present
    const a = mount(`?view=${FUNDER}`);
    await settle();
    expect(a.container.querySelector("h1")!.textContent).toContain(FUNDER_TITLE);
    expect(a.container.querySelector(".fr-ws-setlead .fr-eyebrow")!.textContent).toBe("Funders");
    a.unmount();
    // funder with journey_title equal to the lens title (the live Edgewood shape) → no eyebrow
    STEPS.items = STEPS.items.map((s) => (s.journey_key === FUNDER ? { ...s, journey_title: FUNDER_TITLE } : s));
    const b = mount(`?view=${FUNDER}`);
    await settle();
    expect(b.container.querySelector("h1")!.textContent).toContain(FUNDER_TITLE);
    expect(b.container.querySelector(".fr-ws-setlead .fr-eyebrow")).toBeNull();
    b.unmount();
    // customer: "Checkpoint Map: Families" ≠ "The customer job" → eyebrow present, as today
    const c = mount("?view=customer");
    await settle();
    expect(c.container.querySelector(".fr-ws-setlead .fr-eyebrow")!.textContent).toBe("Checkpoint Map: Families");
    c.unmount();
    STEPS.items = STEPS.items.map((s) => (s.journey_key === "customer" ? { ...s, journey_title: "The customer job" } : s));
    const d = mount("?view=customer");
    await settle();
    expect(d.container.querySelector("h1")!.textContent).toContain("The customer job");
    expect(d.container.querySelector(".fr-ws-setlead .fr-eyebrow")).toBeNull();
  });
  it("(e) no 'Record interview finding' control on the step panel — customer set and funder set, glyph on", async () => {
    edgewood();
    for (const search of ["", `?view=${FUNDER}`]) {
      const { container, unmount } = mount(search);
      await settle();
      expect(container.querySelector("[data-testid=jobmap-stage]")).not.toBeNull();
      expect(container.querySelector("[data-testid=jobmap-capture-toggle]")).toBeNull();
      expect(container.querySelector("[data-fr-operator=record-interview-finding]")).toBeNull();
      expect(container.textContent).not.toContain("Record interview finding");
      unmount();
    }
  });
});
