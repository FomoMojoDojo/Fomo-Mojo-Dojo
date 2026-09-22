// The market goal-not-means deterministic guard (R3, 2026-09-22) + the v3 criterion bump (R2) and the
// writer's version stamp (R4). Pure; no model, no DB.
// Plants: (1) the pattern built without \b → "provided"/"clinical" hit and the near-miss cases go red;
//         (2) solutionAgnosticKey dropping the version → the v2/v3 key assertion goes red;
//         (3) the writer's criterion_version dropped → the source assertion goes red.
import { assert, assertEquals, assertNotEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  MARKET_MEANS_TERMS, containsMarketMeansTerm, marketMeansHits, marketMeansReason, marketMeansViolations,
} from "./marketMeansTerms.ts";
import { CRITERION_VERSION, SOLUTION_AGNOSTIC_SYSTEM, solutionAgnosticKey } from "./solutionAgnosticJudge.ts";

Deno.test("R3: the signed six, in order", () => {
  assertEquals([...MARKET_MEANS_TERMS], ["continuum of care", "residential treatment", "outpatient", "inpatient", "provider", "clinic"]);
});

Deno.test("R3: every term hits on its own, in a sentence", () => {
  for (const t of MARKET_MEANS_TERMS) {
    assert(containsMarketMeansTerm(`Finding a ${t} for the family.`), `missed: ${t}`);
    assertEquals(marketMeansHits(`Finding a ${t} for the family.`), [t]);
  }
});

Deno.test("R3: case-insensitive, including the multi-word phrases", () => {
  assert(containsMarketMeansTerm("PROVIDER"));
  assert(containsMarketMeansTerm("Continuum Of Care"));
  assert(containsMarketMeansTerm("RESIDENTIAL TREATMENT"));
  assertEquals(marketMeansHits("Seeking a Continuum of Care with Residential Treatment"), ["continuum of care", "residential treatment"]);
});

Deno.test("R3: whole word only — the near misses never hit", () => {
  for (const near of [
    "Care that is provided close to home",      // provided
    "Providing support to families",            // providing
    "Clinical progress the family can see",     // clinical
    "Clinicians they trust",                    // clinicians
    "Outpatients" /* plural noun, not the adjective */,
  ]) {
    assertEquals(marketMeansHits(near), [], `false hit on: ${near}`);
    assert(!containsMarketMeansTerm(near), `false hit on: ${near}`);
  }
  // but the bare words themselves still hit
  assertEquals(marketMeansHits("an outpatient option"), ["outpatient"]);
  assertEquals(marketMeansHits("a clinic near home"), ["clinic"]);
});

Deno.test("R3: 'residential' alone does not hit — only 'residential treatment' is on the list", () => {
  assertEquals(marketMeansHits("a residential neighbourhood"), []);
  assertEquals(marketMeansHits("residential treatment"), ["residential treatment"]);
});

Deno.test("R3: executor and job are judged together; the reason carries the terms", () => {
  const v = marketMeansViolations([
    { job_executor: "Families seeking support", jtbd: "Finding a reliable provider of specialised care." },
    { job_executor: "Clinic managers", jtbd: "Keeping the roster covered." },          // hit on the executor side
    { job_executor: "Pediatricians referring youth", jtbd: "Helping young patients get the care they need." },
  ]);
  assertEquals(v.length, 2);
  assertEquals(v[0].terms, ["provider"]);
  assertEquals(v[1].terms, ["clinic"]);
  assertEquals(marketMeansReason(v[0].terms), "names a means: provider");
  assertEquals(marketMeansReason(["continuum of care", "outpatient"]), "names a means: continuum of care, outpatient");
});

Deno.test("R3: empty / null are never a hit", () => {
  for (const v of [null, undefined, "", "   "]) {
    assertEquals(marketMeansHits(v), []);
    assert(!containsMarketMeansTerm(v));
  }
});

Deno.test("R2: the criterion is v3 and the key changes with the version", async () => {
  assertEquals(CRITERION_VERSION, 3);
  const [v1, v2, v3] = await Promise.all([
    solutionAgnosticKey("E", "J", 1), solutionAgnosticKey("E", "J", 2), solutionAgnosticKey("E", "J", 3),
  ]);
  assertNotEquals(v3, v2); // a v3 lookup can never find a v2 row — the bump re-judges exactly once
  assertNotEquals(v3, v1);
  assertNotEquals(v2, v1);
  assertEquals(await solutionAgnosticKey("E", "J"), v3); // the default is the current version
});

Deno.test("R1/R2: the goal-not-means clause is in the judge criterion, and v2's first test survives", () => {
  assert(SOLUTION_AGNOSTIC_SYSTEM.includes("SECOND TEST — GOAL, NOT MEANS"));
  assert(SOLUTION_AGNOSTIC_SYSTEM.includes("transitive verb + object + contextual clarifier"));
  assert(SOLUTION_AGNOSTIC_SYSTEM.includes("category of supplier the executor would shop for"));
  assert(SOLUTION_AGNOSTIC_SYSTEM.includes("A job fails if EITHER test fails"));
  // the reason contract is unchanged and still mandatory on both outcomes
  assert(SOLUTION_AGNOSTIC_SYSTEM.includes('"reason":"<one short clause>"'));
  // v2's first test, verbatim
  assert(SOLUTION_AGNOSTIC_SYSTEM.includes("if the company's solution category did not exist, would the job read the same?"));
});

Deno.test("R1: the rule text and the never-use list are in the generator and the reframe", async () => {
  const src = await Deno.readTextFile(new URL("./marketPortfolioDiscovery.ts", import.meta.url));
  const RULE = "A job statement names what the executor is trying to get done, in the executor's own words.";
  assertEquals(src.split(RULE).length - 1, 2, "the rule text must appear in BOTH GEN_SYSTEM and REFRAME_SYSTEM");
  assert(src.includes("It never names a provider, program, service line, facility, treatment setting, or category of supplier the executor would shop for."));
  assert(src.includes("Form: transitive verb + object + contextual clarifier."));
  for (const w of ["provider", "program", "service", "services", "continuum of care", "residential", "outpatient", "inpatient", "clinic", "facility", "treatment", "therapy", "organizations that provide"]) {
    assert(src.includes(w), `never-use list missing: ${w}`);
  }
});

Deno.test("R3/R4: the guard runs BEFORE the judge, and the writer stamps the version", async () => {
  const src = await Deno.readTextFile(new URL("./marketPortfolioDiscovery.ts", import.meta.url));
  const gate0 = src.indexOf("const meansTerms = marketMeansHits(");
  const gateA = src.indexOf("judgeConditionPerspectives({");
  const gateB = src.indexOf("SOLUTION_AGNOSTIC_SYSTEM, userPrompt");
  assert(gate0 > 0 && gateA > 0 && gateB > 0);
  assert(gate0 < gateA, "the means guard must precede the buyer judge");
  assert(gate0 < gateB, "the means guard must precede the solution-agnostic judge");
  assert(src.includes('return "rejected_means";'));
  // R4: the definition insert carries the stamp
  const insertAt = src.indexOf('from("odi_market_definitions").insert({');
  assert(insertAt > 0);
  const insertBlock = src.slice(insertAt, insertAt + 1400);
  assert(insertBlock.includes("criterion_version: CRITERION_VERSION"), "the definition writer must stamp criterion_version");
});

Deno.test("R3: _shared/jtbdProcess.ts is untouched by this rule", async () => {
  const src = await Deno.readTextFile(new URL("./jtbdProcess.ts", import.meta.url));
  assert(!src.includes("marketMeansTerms"), "the shared jtbd list must not import the market guard");
  assert(!src.includes("continuum of care"));
});
