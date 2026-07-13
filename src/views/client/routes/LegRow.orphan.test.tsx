import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { writeFileSync } from "node:fs";
import { LegRow } from "./components";
import type { RouteRow } from "@/hooks/useRoutes";

// LegRow is prop-driven; a build-class leg renders no LegTestPanel/DriftBadge, so a
// supabase stub is enough for the module to import cleanly (mirrors ClaimStateBadge.test).
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }) },
}));

// A generated leg whose source condition was re-rolled away → stamped orphaned by the
// hole-close reconcile. This is exactly what reconcileRouteConditionsOnReroll writes.
const orphanedLeg = {
  id: "leg-1", company_id: "c1", level: "leg", parent_id: "route-1",
  title: "Build the express lane", short_description: "The move this leg proposes.",
  provenance_type: "internal_hypothesis", claim_id: null,
  what_would_have_to_be_true: [{
    condition: "Customers value the faster path enough to change vendors",
    satisfied_flag: false, leg_class: "build",
    orphaned: true,
    orphaned_reason: "source condition re-rolled 2026-07-13 — this leg no longer maps to a live condition",
    orphaned_at: "2026-07-13T21:15:00.000Z",
  }],
} as unknown as RouteRow;

describe("LegRow — declared-orphan render (hole-close never-disappear law)", () => {
  it("renders the orphaned leg in place with a ⚠ badge and its reason", () => {
    const { container } = render(
      <LegRow leg={orphanedLeg} index={1} expanded={false} onToggle={() => {}} />,
    );
    const text = container.textContent || "";
    expect(text).toContain("Orphaned");
    expect(text).toContain("source condition re-rolled 2026-07-13");
    // The leg itself still renders (never disappears) — its title is present.
    expect(text).toContain("Build the express lane");

    // Emit the real component HTML for a frame-audited screenshot.
    writeFileSync(
      "/Users/fomomojodojo/Downloads/orphan-legrow-render.html",
      `<!doctype html><meta charset="utf-8"><body style="margin:0;padding:32px;background:#faf9f7;font-family:-apple-system,system-ui,sans-serif"><div style="max-width:760px;border:1px solid #e7e4de;border-radius:8px;padding:20px 28px;background:#fff">${container.innerHTML}</div></body>`,
    );
  });
});
