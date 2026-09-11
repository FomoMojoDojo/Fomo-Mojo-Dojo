// PARITY — the b-i conditions gate moved out of JobMapOrgPanel into ./internalConditions (comp port
// 2a, 2026-09-11) with no logic change. This test renders the panel against a fixture whose step
// carries real_source, best_guess and a canned (refused) condition, and asserts the markup is
// byte-identical to the snapshot captured from the pre-move panel (JobMapOrgPanel.parity.html was
// written by rendering the HEAD~ version of the file through this same harness).
import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import fs from "node:fs";
import path from "node:path";
import Panel from "./JobMapOrgPanel";
import type { JobStepRow } from "@/hooks/useJobSteps";
import type { OdiNeedRow } from "@/hooks/useOdiNeeds";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }), update: () => ({ eq: async () => ({ error: null }) }) }), auth: { getUser: async () => ({ data: { user: null } }) } },
}));
vi.mock("@/hooks/useFoundationProvenance", () => ({ useFoundationProvenance: () => ({ data: null, isLoading: false, error: null }) }));
// The gate throws in DEV on a canned string; the panel's law is fail-closed in prod (dropped). Assert the prod branch.
vi.stubEnv("DEV", false);

const step = (n: number, extra: Partial<JobStepRow> = {}): JobStepRow => ({
  id: `s${n}`, company_id: "c1", user_id: "u1", journey_key: "customer", journey_title: "Fixture set", journey_subtitle: null,
  step_number: n, step_label: `Step ${n} label`, description: `Step ${n} description.`, designed: true, has_gap: n === 2,
  evidence_status: n === 2 ? "evidenced" : "implied", evidence_basis: null, evidence_confidence: null, gap_note: null, conditions_json: null, ...extra,
});
const STEPS: JobStepRow[] = [
  step(1, { conditions_json: [
    { condition: "Families can name a contact they reach in a crisis.", status: "real_source", origin: "doc" },
    { condition: "The intake form is short enough to finish in one sitting.", status: "best_guess", origin: "model" },
    { condition: "Ownership of intake is named and documented", status: "best_guess" }, // canned → refused
    { condition: "run_mojo_analysis:2026-06-10", status: "best_guess" }, // run-tag → refused
  ] }),
  step(2), step(3), step(4), step(5), step(6), step(7), step(8),
];
const NEEDS: OdiNeedRow[] = [
  { id: "n1", company_id: "c1", tier: "need", desired_outcome: "Minimize the time it takes to find the right program", journey_key: "customer", step_number: 1, step_label: "Step 1 label", importance: 8, satisfaction: 3, opportunity_score: 13, service_state: "underserved", source_path: "x", frameworks_used: [], created_at: "2026-06-01T00:00:00Z", provenance_type: "public_research" },
];

export function renderFixture(Component: typeof Panel) {
  const { container } = render(
    <Component steps={STEPS} loading={false} activeStepId="s1" onSelectStep={() => {}} activeStep={STEPS[0]} needs={NEEDS} hasHierarchy routesReady routes={[]} marketDef={{ journey_key: "customer", job_executor: "Families and caregivers", jtbd: "Get the right care", provenance_type: "manual" }} />,
  );
  return container.innerHTML;
}

describe("JobMapOrgPanel parity after the conditions-gate move", () => {
  it("renders byte-identically to the pre-move snapshot", () => {
    const html = renderFixture(Panel);
    const snap = path.join(__dirname, "JobMapOrgPanel.parity.html");
    if (process.env.WRITE_PARITY_SNAPSHOT) fs.writeFileSync(snap, html);
    expect(html).toBe(fs.readFileSync(snap, "utf8"));
    // The fixture's admissible conditions rendered; the refused ones did not.
    expect(html).toContain("Families can name a contact they reach in a crisis.");
    expect(html).toContain("The intake form is short enough to finish in one sitting.");
    expect(html).not.toContain("named and documented");
    expect(html).not.toContain("run_mojo_analysis");
  });
});
