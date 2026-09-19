// ── The job performer of a job-map run (operator ruling 1, signed 2026-09-18) ────────────────────
//
// "A market run sends that market definition's executor, chooser and job as the job performer. The
// customer spine's performer, outcome, leading indicator and recurring challenge are NOT sent on a
// market run. A customer run is unchanged."
//
// Before this ruling local-jobmap-synthesis fell back to the customer definition whenever the run did
// not carry the customer key (handler.ts, `definitionsByKey.get("customer")` before `journeyDefinitions[0]`),
// so a funder-market run for Edgewood carried TWO executors: the funder in the ODI grounding block and
// the families-and-caregivers spine in odi_context, plus the families' desired outcome appended to the
// funder grounding. One pure function decides both now; the handler reads only its result.
import type { JourneyDefinition } from "./marketDefinitionByKey.ts";

export function isCustomerJourneyKey(key: string): boolean {
  return key === "customer" || key.startsWith("customer-");
}

export type CompanyOdiExtras = {
  desired_outcome: string;
  outcome_leading_indicator: string;
  recurring_progress_challenge: string;
};

export const EMPTY_ODI_EXTRAS: CompanyOdiExtras = { desired_outcome: "", outcome_leading_indicator: "", recurring_progress_challenge: "" };

export type RunPerformer = {
  /** True when no requested set is the customer spine — every requested key is a market. */
  isMarketRun: boolean;
  /** The definition whose executor / chooser / job are the run's job performer. */
  spineDefinition: JourneyDefinition | null;
  /** The company-level ODI extras the run may carry: the customer's on a customer run, none on a market run. */
  odiExtras: CompanyOdiExtras;
};

/** Ruling 1: a customer run keeps the customer spine (and the company extras); a market run's performer is
 *  the requested market's own definition and the customer extras are withheld. `definitionsByKey.get("customer")`
 *  is reached only when the run requested nothing resolvable (unscoped legacy runs inject "customer"). */
export function resolveRunPerformer(
  journeyDefinitions: readonly JourneyDefinition[],
  definitionsByKey: ReadonlyMap<string, JourneyDefinition>,
  companyExtras: CompanyOdiExtras,
): RunPerformer {
  const customer = journeyDefinitions.find((d) => isCustomerJourneyKey(d.journey_key)) ?? null;
  const isMarketRun = journeyDefinitions.length > 0 && !customer;
  const spineDefinition = customer ?? (isMarketRun ? journeyDefinitions[0] : definitionsByKey.get("customer") ?? journeyDefinitions[0] ?? null);
  return { isMarketRun, spineDefinition, odiExtras: isMarketRun ? { ...EMPTY_ODI_EXTRAS } : companyExtras };
}
