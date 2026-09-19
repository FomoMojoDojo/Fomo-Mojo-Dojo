// Ruling 1 guards (2026-09-18): a market run's job performer is the market's executor; the customer spine's
// performer / outcome / leading indicator / recurring challenge are not sent on a market run; a customer run
// is byte-identical to before. Planted failure (reported in the gate): restore the old precedence
// (customer fallback before the requested market, extras always sent).
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { resolveRunPerformer, type CompanyOdiExtras } from "./jobmapRunPerformer.ts";
import { renderOdiGrounding, type JourneyDefinition } from "./marketDefinitionByKey.ts";

const CUSTOMER: JourneyDefinition = { id: "d-cust", journey_key: "customer", job_executor: "Families and caregivers navigating program access", chooser: "Families and caregivers", jtbd: "Get the right program in place", provenance_type: "internal_hypothesis", market_register: "internal_inferred" };
const FUNDER: JourneyDefinition = { id: "d-fund", journey_key: "pmk-funders", job_executor: "Philanthropic organizations and grant-making bodies", chooser: "Grant-making bodies", jtbd: "Direct money to effective initiatives", provenance_type: "internal_hypothesis", market_register: "public_inferred" };
const EXTRAS: CompanyOdiExtras = { desired_outcome: "Increase the share of families who reach funding faster", outcome_leading_indicator: "Share of families reaching step 2", recurring_progress_challenge: "Fragmented referrals" };
const byKey = new Map<string, JourneyDefinition>([["customer", CUSTOMER], ["pmk-funders", FUNDER]]);

// the handler's odi_context, built exactly as handler.ts builds it from the resolver's result
function odiContext(defs: JourneyDefinition[]) {
  const p = resolveRunPerformer(defs, byKey, EXTRAS);
  const spine = p.spineDefinition;
  return { performer: p, odi_context: { job_performer: spine?.job_executor ?? "", primary_job: spine?.jtbd ?? "", chooser: spine?.chooser ?? "", ...p.odiExtras } };
}
// the pre-ruling precedence, kept here ONLY as the byte-identity oracle for the customer run
function oldOdiContext(defs: JourneyDefinition[]) {
  const spine = defs.find((d) => d.journey_key === "customer" || d.journey_key.startsWith("customer-")) ?? byKey.get("customer") ?? defs[0] ?? null;
  return { job_performer: spine?.job_executor ?? "", primary_job: spine?.jtbd ?? "", chooser: spine?.chooser ?? "", ...EXTRAS };
}

Deno.test("(a) a market run's job performer is the market's executor, chooser and job — never the customer spine", () => {
  const { performer, odi_context } = odiContext([FUNDER]);
  assert(performer.isMarketRun, "market run");
  assertEquals(odi_context.job_performer, FUNDER.job_executor);
  assertEquals(odi_context.chooser, FUNDER.chooser);
  assertEquals(odi_context.primary_job, FUNDER.jtbd);
  assert(!JSON.stringify(odi_context).includes("Families"), "nothing of the customer spine in odi_context");
});

Deno.test("(b) on a market run the grounding block names exactly one performer and carries no customer outcome / indicator / challenge line", () => {
  const { odi_context } = odiContext([FUNDER]);
  const block = renderOdiGrounding([FUNDER], { desiredOutcome: odi_context.desired_outcome, outcomeLeadingIndicator: odi_context.outcome_leading_indicator, recurringChallenge: odi_context.recurring_progress_challenge });
  assertEquals((block.match(/Job performer:/g) ?? []).length, 1, "exactly one performer line");
  assert(block.includes(FUNDER.job_executor), "it is the market's");
  for (const s of ["Primary desired outcome", "Outcome leading indicator", "Recurring progress challenge", "Families", "Fragmented referrals"]) assert(!block.includes(s), `no '${s}' on a market run`);
  assertEquals(odi_context.desired_outcome, ""); assertEquals(odi_context.outcome_leading_indicator, ""); assertEquals(odi_context.recurring_progress_challenge, "");
});

Deno.test("(c) a customer run is byte-identical to before (spine + company extras), including a customer+market run", () => {
  for (const defs of [[CUSTOMER], [CUSTOMER, FUNDER], [FUNDER, CUSTOMER]]) {
    const { performer, odi_context } = odiContext(defs);
    assert(!performer.isMarketRun, "not a market run");
    assertEquals(JSON.stringify(odi_context), JSON.stringify(oldOdiContext(defs)), `byte-identical for ${defs.map((d) => d.journey_key).join("+")}`);
    const block = renderOdiGrounding(defs, { desiredOutcome: odi_context.desired_outcome, outcomeLeadingIndicator: odi_context.outcome_leading_indicator, recurringChallenge: odi_context.recurring_progress_challenge });
    assert(block.includes("Primary desired outcome: " + EXTRAS.desired_outcome), "customer run keeps the company extras");
  }
});

Deno.test("(d) source guard: the handler reads the performer from the resolver and no longer prefers the customer fallback over the requested market", async () => {
  const src = await Deno.readTextFile(new URL("../local-jobmap-synthesis/handler.ts", import.meta.url));
  assert(src.includes('import { isCustomerJourneyKey, resolveRunPerformer } from "../_shared/jobmapRunPerformer.ts";'), "imports the resolver");
  assert(src.includes("...performer.odiExtras"), "odi_context extras come from the resolver");
  assert(!/definitionsByKey\.get\("customer"\)\s*\?\?\s*journeyDefinitions\[0\]/.test(src), "the old precedence is gone from the handler");
  assert(!/desired_outcome:\s*safeText\(primaryOutcome\?\.outcome_statement\),\s*outcome_leading_indicator[\s\S]{0,200}\},\s*strategic_problems/.test(src), "odi_context no longer inlines the company extras unconditionally");
});
