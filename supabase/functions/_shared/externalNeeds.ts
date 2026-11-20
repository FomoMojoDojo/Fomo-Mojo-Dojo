// B1 (2026-11-16): the ONE odi_needs collector for the two context-building propose functions
// (propose-positioning-changes, propose-cascade-changes). Both used to carry an identical select and
// filter; a fix to one could miss the other. The select carries the need's SOURCE columns
// (NEED_SOURCE_COLUMNS) because isExternalAdmissibleNeed now tests the source first — a column left
// out reads undefined and the row is withheld (fail closed), never admitted.
//
// Only the brief's own fields are printed (buildOpportunityBrief), so the source columns never reach
// a prompt; they are read here to decide, at the collection point, before any prompt text exists.
import { isExternalAdmissibleNeed } from "./externalProvenance.ts";

export type CollectedNeed = { provenance_type?: unknown } & Record<string, unknown>;

export async function collectExternalNeeds(
  db: { from: (t: string) => any },
  companyId: string,
): Promise<{ externalNeeds: CollectedNeed[]; needsWithheldExternal: number }> {
  // 4f-6 (F9): a company-held need (journey_key NULL) is not of any market, so it never enters a
  // market-framed proposal context. Off-strategy needs stay out of proposals (C1 / C1.1).
  const { data: opportunityRows } = await db
    .from("odi_needs")
    .select("desired_outcome as outcome, journey_key, step_number, step_label, importance, satisfaction, opportunity_score, tier as priority_tier, provenance_type, operator_edited_at, source_path, frameworks_used, interview_record_id, source_proposal_id")
    // SP-467: a materialised proposed need reaches the Brief only.
    .neq("status", "proposed")
    .eq("company_id", companyId)
    .not("journey_key", "is", null)
    .neq("strategy_alignment", "off_strategy")
    .order("opportunity_score", { ascending: false })
    .limit(30);
  // Gate 0 (2026-09-16) + B1: only external-admissible needs enter the OpenAI context. The
  // withheld count is reported on every response so the omission is visible.
  const needRows = ((opportunityRows ?? []) as unknown) as CollectedNeed[];
  const externalNeeds = needRows.filter(isExternalAdmissibleNeed);
  return { externalNeeds, needsWithheldExternal: needRows.length - externalNeeds.length };
}
