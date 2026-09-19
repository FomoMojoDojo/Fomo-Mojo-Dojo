// Rule M guards (2026-09-18.1). Planted failures (reported in the gate): drop the new terms; drop the version
// stamp. Fixtures: draft 1's eight steps (run 3e99c270, preserved in the 2026-09-18 report) — one trips, seven pass.
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { containsMeansTerm, MEANS_TERMS, meansViolations, RULES_VERSION, TAXONOMY_VERSION, TAXONOMY_VERSION_BEFORE_RULES } from "./rules.ts";
import { validateSubsetOfEight } from "../generate-normative-jobmap/logic.ts";

const DRAFT1 = [
  { step_key: "define", step_label: "Identify Funding Needs", description: "Determine the specific areas or organizations in need of funding." },
  { step_key: "locate", step_label: "Research Potential Recipients", description: "Find and evaluate organizations and initiatives that align with funding goals." },
  { step_key: "prepare", step_label: "Review and Align Proposals", description: "Review proposals and align with mission and strategic priorities." },
  { step_key: "confirm", step_label: "Commit to Funding", description: "Confirm the commitment to fund selected organizations or initiatives." },
  { step_key: "execute", step_label: "Disburse Funds", description: "Provide financial support to the chosen organizations or initiatives." },
  { step_key: "monitor", step_label: "Track Impact", description: "Monitor the progress and impact of funded initiatives." },
  { step_key: "modify", step_label: "Adjust Support", description: "Modify funding or support based on changing conditions or needs." },
  { step_key: "conclude", step_label: "Evaluate Outcomes", description: "Confirm the impact and report findings of the funded initiatives." },
];

Deno.test("(a) draft 1's step 3 label 'Review and Align Proposals' is rejected by the deterministic means guard", () => {
  assert(containsMeansTerm("Review and Align Proposals"));
  const v = meansViolations(DRAFT1);
  assertEquals(v, [{ step_key: "prepare", words: ["proposals"] }]);
  // the shared subset-of-8 guard alone did NOT catch it (why the rule exists)
  assert(validateSubsetOfEight(DRAFT1).ok, "the pre-rule guard passes draft 1");
});

Deno.test("(b) draft 1's other seven steps pass the means guard", () => {
  const seven = DRAFT1.filter((s) => s.step_key !== "prepare");
  assertEquals(meansViolations(seven), []);
  for (const s of seven) assert(!containsMeansTerm(`${s.step_label} ${s.description}`), s.step_key);
});

Deno.test("(c) 'report' used as a verb passes (only proposal(s) / application(s) are deterministic); 'application' trips as a whole word only", () => {
  assert(!containsMeansTerm("Confirm the impact and report findings of the funded initiatives."));
  assert(!containsMeansTerm("Keep an eye on the policy and report changes to the household."));
  assert(containsMeansTerm("Complete the application process"));
  assert(!containsMeansTerm("Applicable rules and reapplications"), "no substring hits");
  assertEquals([...MEANS_TERMS], ["proposal", "proposals", "application", "applications"]);
});

Deno.test("(d) rows written under the rule carry taxonomy_version fd1-priority-8.1 beside RULES_VERSION 2026-09-18.1 — and the generator stamps them from rules.ts", async () => {
  assertEquals(RULES_VERSION, "2026-09-18.1");
  assertEquals(TAXONOMY_VERSION, "fd1-priority-8.1");
  assertEquals(TAXONOMY_VERSION_BEFORE_RULES, "fd1-priority-8");
  const src = await Deno.readTextFile(new URL("./index.ts", import.meta.url));
  assert(src.includes('import { meansViolations, RULES_VERSION, TAXONOMY_VERSION } from "./rules.ts";'), "stamps come from rules.ts");
  assert(src.includes("taxonomy_version: TAXONOMY_VERSION,"), "every row carries the stamp");
  assert(!/const TAXONOMY_VERSION = "fd1-priority-8"/.test(src), "no local pre-rule stamp");
  assert(src.includes("mechanism, document, or channel"), "layer 1: GEN_SYSTEM names mechanism/document/channel");
  assert(src.includes("REJECT any step that names a mechanism, document or channel") && src.includes("ALWAYS state your reason"), "layer 2: the judge rejects means and always states a reason");
  assert(src.includes("const means = meansViolations(gen.steps);"), "layer 3: the deterministic means guard runs in the loop");
});
