// Fixture steps for the EvidenceDrawer parity snapshot (Job Map Tier 1 lift, 2026-09-11): every
// branch of the drawer — evidenced with prose basis + gap, implied with a hidden run-tag basis,
// unassessed with a confidence, and a long gap note that the drawer truncates at 90.
import type { JobStepRow } from "@/hooks/useJobSteps";

const base = (n: number, extra: Partial<JobStepRow>): JobStepRow => ({
  id: `s${n}`, company_id: "c1", user_id: "u1", journey_key: "customer", journey_title: "Fixture set", journey_subtitle: null,
  step_number: n, step_label: `Step ${n}`, description: null, designed: true, has_gap: false,
  evidence_status: null, evidence_basis: null, evidence_confidence: null, gap_note: null, conditions_json: null, ...extra,
});

export const DRAWER_FIXTURES: JobStepRow[] = [
  base(1, { evidence_status: "evidenced", evidence_basis: "Families describe calling three programs before one answers.", evidence_confidence: 72, has_gap: true, gap_note: "No named intake owner." }),
  base(2, { evidence_status: "implied", evidence_basis: "run_mojo_analysis:2026-06-10", evidence_confidence: 40 }),
  base(3, { evidence_confidence: 10 }),
  base(4, { evidence_status: "unclear", has_gap: true, gap_note: "A very long gap note that keeps going well past the ninety character mark so the drawer must truncate it with an ellipsis." }),
  base(5, { evidence_status: "declared", has_gap: true, gap_note: null }),
];
