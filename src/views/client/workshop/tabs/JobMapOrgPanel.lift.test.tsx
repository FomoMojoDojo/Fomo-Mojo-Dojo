// LIFT PARITY (Job Map Tier 1, 2026-09-11) — the "Mark reviewed" odi_needs update moved out of
// JobMapOrgPanel.handleMarkNeedReviewed into @/hooks/useOdiNeeds.markNeedReviewed. This mounts the
// real panel with one need in a review state and proves the row still shows "review pending" +
// "Mark reviewed", the click calls markNeedReviewed with that row's id, and the row leaves its review
// state afterwards — exactly the panel's pre-lift behaviour. A second test drives the moved function
// against a supabase stub and asserts the update payload and filter verbatim.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, fireEvent, waitFor } from "@testing-library/react";
import Panel from "./JobMapOrgPanel";
import type { JobStepRow } from "@/hooks/useJobSteps";
import type { OdiNeedRow } from "@/hooks/useOdiNeeds";

const lifted = vi.hoisted(() => ({ markNeedReviewed: vi.fn(async (_id: unknown) => {}) }));
vi.mock("@/hooks/useOdiNeeds", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/hooks/useOdiNeeds")>();
  return { ...mod, markNeedReviewed: lifted.markNeedReviewed };
});
const calls = vi.hoisted(() => [] as Array<{ table: string; op: string; args: unknown[] }>);
vi.mock("@/integrations/supabase/client", () => {
  const make = (table: string) => {
    const b: Record<string, unknown> = {};
    for (const op of ["select", "eq", "update", "order"]) b[op] = (...args: unknown[]) => { calls.push({ table, op, args }); return b; };
    b.maybeSingle = async () => ({ data: null, error: null });
    b.then = (resolve: (v: unknown) => void) => resolve({ data: null, error: null });
    return b;
  };
  return { supabase: { from: (t: string) => make(t), auth: { getUser: async () => ({ data: { user: null } }) } } };
});
vi.mock("@/hooks/useFoundationProvenance", () => ({ useFoundationProvenance: () => ({ data: null, isLoading: false, error: null }) }));
vi.stubEnv("DEV", false);

const step = (n: number): JobStepRow => ({
  id: `s${n}`, company_id: "c1", user_id: "u1", journey_key: "customer", journey_title: "Fixture set", journey_subtitle: null,
  step_number: n, step_label: `Step ${n} label`, description: null, designed: true, has_gap: false,
  evidence_status: "implied", evidence_basis: null, evidence_confidence: null, gap_note: null, conditions_json: null,
});
const STEPS = [1, 2, 3, 4, 5, 6, 7, 8].map(step);
const NEED: OdiNeedRow = { id: "need-42", company_id: "c1", tier: "need", desired_outcome: "Minimize the time it takes to find the right program", journey_key: "customer", step_number: 1, step_label: "Step 1 label", importance: 8, satisfaction: 3, opportunity_score: 13, service_state: "underserved", source_path: "x", frameworks_used: [], created_at: "2026-06-01T00:00:00Z", provenance_type: "public_research", dependency_state: "needs_review" };
const button = (c: HTMLElement, text: string) => Array.from(c.querySelectorAll("button")).find((b) => (b.textContent || "").trim() === text);

beforeEach(() => { lifted.markNeedReviewed.mockClear(); calls.length = 0; });

describe("JobMapOrgPanel after the mark-reviewed lift", () => {
  it("shows review pending + Mark reviewed, calls markNeedReviewed(id) on click, and the row leaves review", async () => {
    const { container } = render(<Panel steps={STEPS} loading={false} activeStepId="s1" onSelectStep={() => {}} activeStep={STEPS[0]} needs={[NEED]} hasHierarchy routesReady routes={[]} marketDef={null} />);
    expect(container.textContent).toContain("review pending");
    const btn = button(container, "Mark reviewed");
    expect(btn).toBeTruthy();
    fireEvent.click(btn!);
    await waitFor(() => expect(lifted.markNeedReviewed).toHaveBeenCalledWith("need-42"));
    await waitFor(() => expect(container.textContent).not.toContain("review pending"));
    expect(button(container, "Mark reviewed")).toBeUndefined();
    expect(calls.filter((c) => c.op === "update")).toHaveLength(0); // the panel itself no longer writes
  });
});

describe("markNeedReviewed (the moved write)", () => {
  it("updates odi_needs: fresh, stale markers cleared, last_reviewed_at now — filtered by id", async () => {
    const { markNeedReviewed: real } = await vi.importActual<typeof import("@/hooks/useOdiNeeds")>("@/hooks/useOdiNeeds");
    await real("need-42");
    const update = calls.find((c) => c.op === "update");
    expect(update?.table).toBe("odi_needs");
    const patch = update!.args[0] as Record<string, unknown>;
    expect(Object.keys(patch).sort()).toEqual(["dependency_state", "last_reviewed_at", "stale_reason", "stale_since_event_id"]);
    expect(patch).toMatchObject({ dependency_state: "fresh", stale_reason: null, stale_since_event_id: null });
    expect(typeof patch.last_reviewed_at).toBe("string");
    expect(calls.find((c) => c.op === "eq")?.args).toEqual(["id", "need-42"]);
  });
});
