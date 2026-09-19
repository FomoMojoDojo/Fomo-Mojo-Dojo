// Gate A census item 2 (operator, 2026-09-19) — contextBuilders.ts:429 + :327. A job_steps row with
// evidence_confidence NULL (a market map, ruling M2) reaches the journey brief as `conf=?` — never
// `conf=null`, never `conf=0`. A numeric row still prints its number; a legacy 0 still prints 0.
import { assert, assertEquals, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildJourneyBrief, buildJourneysFromJobSteps } from "./contextBuilders.ts";

const row = (n: number, conf: number | null, key = "pmk-funders") => ({
  provenance_type: "public_baseline", journey_key: key, journey_title: "Funders", journey_subtitle: "sub",
  step_number: n, step_label: `Step ${n}`, description: `d${n}`, designed: false, has_gap: true,
  evidence_status: "unclear", evidence_basis: "industry_anchor:grantmaking", evidence_confidence: conf,
});

Deno.test("item 2: NULL confidence → the brief line reads conf=? (exact text); a number and a legacy 0 print as themselves", () => {
  const journeys = buildJourneysFromJobSteps([row(1, null), row(2, 62), row(3, 0)]);
  assertEquals(journeys.length, 1);
  assertEquals(journeys[0].steps.map((s) => s.evidence_confidence), [null, 62, 0], "null passes the builder as null, not 0");
  const brief = buildJourneyBrief(journeys);
  const lines = brief.split("\n").filter((l) => l.startsWith("- Step "));
  assertEquals(lines[0], "- Step 1: Step 1 | designed=no | gap=yes | evidence=unclear | conf=? | basis=industry_anchor:grantmaking | d1");
  assertStringIncludes(lines[1], "| conf=62 |");
  assertStringIncludes(lines[2], "| conf=0 |");
  assert(!brief.includes("conf=null"), "never the word null");
});
