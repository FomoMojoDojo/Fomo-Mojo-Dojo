import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import { writeFileSync } from "node:fs";
import { LegRow } from "./components";
import type { RouteRow } from "@/hooks/useRoutes";

// CG-2 — the LegTestPanel decides its state from (a) the `tests` row it fetches and
// (b) the decline stamp on the leg's wwhtbt[0]. We stub supabase so the fetch resolves
// to null (no `tests` row) — the state then turns ONLY on the stamp, which is exactly
// what distinguishes attempted-and-declined from never-attempted. isAdmin is stubbed
// true so the state's button is present to assert on.
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ order: () => ({ limit: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }) }) }) }) },
}));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ isAdmin: true }) }));
vi.mock("@/lib/frozenCompanies", () => ({ isFrozenCompany: () => false }));

function testLeg(head: Record<string, unknown>): RouteRow {
  return {
    id: "leg-1", company_id: "c1", level: "leg", parent_id: "route-1",
    title: "Monitor user support tickets for patterns of multi-room audio issues over a month.",
    short_description: "The move this leg proposes.",
    provenance_type: "internal_hypothesis", claim_id: null,
    what_would_have_to_be_true: [head],
  } as unknown as RouteRow;
}

const DECLINE_REASON = "deficiency-as-the-bet";
const declinedLeg = testLeg({
  condition: "Users encounter frequent multi-room audio issues that can be resolved with clear instructions.",
  satisfied_flag: false, leg_class: "test",
  test_declined: true, test_declined_reason: DECLINE_REASON, test_declined_at: "2026-07-22T10:00:00.000Z",
});
const neverAttemptedLeg = testLeg({
  condition: "Users can resolve common multi-room audio issues on their own when given clear, specific guidance.",
  satisfied_flag: false, leg_class: "test",
});

describe("LegRow — three distinct leg-test panel states (CG-2)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("ATTEMPTED-AND-DECLINED: shows the honesty-check decline + the stored reason verbatim + the disabled next step", async () => {
    const { container, findByText } = render(
      <LegRow leg={declinedLeg} index={1} expanded={false} onToggle={() => {}} />,
    );
    // Loaded asynchronously (the tests fetch resolves to null); wait for the panel.
    await findByText("The honesty check declined this test.");
    const text = container.textContent || "";
    // The STORED judge reason is surfaced verbatim (not a canned paraphrase).
    expect(text).toContain(`Reason: ${DECLINE_REASON}`);
    // The honest next step, disabled here (the condition control is elsewhere).
    expect(text).toContain("Regenerate condition first");
    expect(text).not.toContain("Test not yet drafted");

    writeFileSync(
      "/Users/fomomojodojo/Downloads/cg2-declined-legrow-render.html",
      `<!doctype html><meta charset="utf-8"><body style="margin:0;padding:32px;background:#faf9f7;font-family:-apple-system,system-ui,sans-serif"><div style="max-width:760px;border:1px solid #e7e4de;border-radius:8px;padding:20px 28px;background:#fff">${container.innerHTML}</div></body>`,
    );
  });

  it("NEVER-ATTEMPTED: shows 'Test not yet drafted' and the live Generate test button (no decline text)", async () => {
    const { container, findByText } = render(
      <LegRow leg={neverAttemptedLeg} index={1} expanded={false} onToggle={() => {}} />,
    );
    await findByText("Test not yet drafted");
    const text = container.textContent || "";
    expect(text).not.toContain("The honesty check declined this test.");
    expect(text).not.toContain("Regenerate condition first");
    expect(text).toContain("Generate test");
  });
});
