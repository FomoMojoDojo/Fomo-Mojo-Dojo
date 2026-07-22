import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import { writeFileSync } from "node:fs";
import { LegRow } from "./components";
import type { RouteRow } from "@/hooks/useRoutes";

// CG-2 + HEAL — the LegTestPanel decides its state from (a) the `tests` row it fetches and
// (b) the decline stamp on the leg's wwhtbt[0]. We stub supabase so the fetch resolves to
// null (no `tests` row) — the state then turns ONLY on the stamp. Operator ruling
// (2026-07-22): the declined residual carries NO instructions and NO button (the system
// already self-healed and retried); the retired "This unlocks…" line and "Regenerate
// condition first" button MUST NOT render.
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ order: () => ({ limit: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }) }) }) }) },
}));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ isAdmin: true }) }));
vi.mock("@/lib/frozenCompanies", () => ({ isFrozenCompany: () => false }));

const RETIRED_UNLOCK = "This unlocks once";
const RETIRED_BUTTON = "Regenerate condition first";
const NEW_LINE = "The system rewrote the condition and tried again — that attempt was also declined.";

function testLeg(head: Record<string, unknown>): RouteRow {
  return {
    id: "leg-1", company_id: "c1", level: "leg", parent_id: "route-1",
    title: "Monitor user support tickets for patterns of multi-room audio issues over a month.",
    short_description: "The move this leg proposes.",
    provenance_type: "internal_hypothesis", claim_id: null,
    what_would_have_to_be_true: [head],
  } as unknown as RouteRow;
}

const ORIGINAL_REASON = "deficiency-as-the-bet";
const RETRY_REASON = "polarity — positive signal points at the problem";

// Residual after a self-heal that still failed: BOTH reasons stamped verbatim.
const healedResidualLeg = testLeg({
  condition: "Common multi-room audio issues can be resolved through the provided guidance.",
  satisfied_flag: false, leg_class: "test",
  test_declined: true, test_declined_reason: ORIGINAL_REASON, test_declined_retry_reason: RETRY_REASON,
  test_declined_at: "2026-07-22T10:00:00.000Z",
});
// A non-deficiency decline that did NOT heal: original reason only, no retry.
const nonHealedDeclinedLeg = testLeg({
  condition: "Some source condition.",
  satisfied_flag: false, leg_class: "test",
  test_declined: true, test_declined_reason: "fabricated — invents numbers", test_declined_at: "2026-07-22T10:00:00.000Z",
});
const neverAttemptedLeg = testLeg({
  condition: "Users can resolve common multi-room audio issues on their own when given clear, specific guidance.",
  satisfied_flag: false, leg_class: "test",
});

describe("LegRow — declined leg-test states (CG-2 + HEAL residual)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("HEALED-BUT-DECLINED residual: title + BOTH reasons verbatim + the new line; NO retired strings, NO button", async () => {
    const { container, findByText } = render(
      <LegRow leg={healedResidualLeg} index={1} expanded={false} onToggle={() => {}} />,
    );
    await findByText("The honesty check declined this test.");
    const text = container.textContent || "";
    expect(text).toContain(`Reason: ${ORIGINAL_REASON}`);
    expect(text).toContain(NEW_LINE);
    expect(text).toContain(`Reason: ${RETRY_REASON}`);
    // Retired strings are structurally unrenderable.
    expect(text).not.toContain(RETIRED_UNLOCK);
    expect(text).not.toContain(RETIRED_BUTTON);
    expect(text).not.toContain("Test not yet drafted");

    writeFileSync(
      "/Users/fomomojodojo/Downloads/heal-declined-legrow-render.html",
      `<!doctype html><meta charset="utf-8"><body style="margin:0;padding:32px;background:#faf9f7;font-family:-apple-system,system-ui,sans-serif"><div style="max-width:760px;border:1px solid #e7e4de;border-radius:8px;padding:20px 28px;background:#fff">${container.innerHTML}</div></body>`,
    );
  });

  it("NON-HEALED decline (non-deficiency): title + original reason only; NO new line, NO retry reason, NO retired strings", async () => {
    const { container, findByText } = render(
      <LegRow leg={nonHealedDeclinedLeg} index={1} expanded={false} onToggle={() => {}} />,
    );
    await findByText("The honesty check declined this test.");
    const text = container.textContent || "";
    expect(text).toContain("Reason: fabricated — invents numbers");
    expect(text).not.toContain(NEW_LINE);
    expect(text).not.toContain(RETIRED_UNLOCK);
    expect(text).not.toContain(RETIRED_BUTTON);
  });

  it("NEVER-ATTEMPTED: 'Test not yet drafted' and the live Generate test button (no decline text)", async () => {
    const { container, findByText } = render(
      <LegRow leg={neverAttemptedLeg} index={1} expanded={false} onToggle={() => {}} />,
    );
    await findByText("Test not yet drafted");
    const text = container.textContent || "";
    expect(text).not.toContain("The honesty check declined this test.");
    expect(text).not.toContain(RETIRED_BUTTON);
    expect(text).toContain("Generate test");
  });
});
