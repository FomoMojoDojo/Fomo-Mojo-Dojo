// ── THE OPTION B DOOR (ruling Q4, signed 2026-11-06) ────────────────────────────────────────────
//
// WHAT IT IS: one company-level check, in front of every outside call the three evaluate-* functions
// make. If the company holds client-provided material — or if the lookup cannot PROVE it does not —
// no outside call is made and one audited row records the refusal.
//
// WHY IT SITS IN FRONT OF, NOT INSTEAD OF, THE PER-ROW GATE: the per-row gates
// (gateStrategyArtifactForExternal, gateSubjectForExternal) ask "is THIS ROW public?". That question
// was answered from a provenance LABEL, and a label does not know who typed the row — which is how
// four Edgewood rows plus one FomoMojoDojo row sat stamped `public_research` while carrying operator
// prose. Q3 closes that with operator_edited_at. This door is the SECOND, coarser belt: it asks "does
// this company hold client material at all?" and refuses first. Both run; neither replaces the other.
//
// ── THE TENSION WITH THE SEP 18 WALL CORRECTION, STATED PLAINLY ─────────────────────────────────
// The standing law is that THE LAW FOLLOWS THE MATERIAL, NOT THE COMPANY: public data may go
// external even for a company that also holds client material. A company-level door is, by
// construction, a company-level rule — so it is STRICTER than the law requires. It will refuse
// alignment checks on genuinely public rows belonging to a company that holds an upload.
//
// That is the ruling's explicit instruction ("the door refuses evaluate-* for walled companies
// entirely"), and the cost is named at the STOP rather than quietly absorbed: for every company with
// any client material, the external alignment lane closes and only the LOCAL lane runs. The local
// lane already exists and already handles exactly these rows (gateSubjectForLocal → the Ollama
// judges), so a refused check is DOWNGRADED, not deleted — see the per-function local fallbacks.
//
// FAIL CLOSED: companyHasClientProvidedMaterial counts a lookup error as "has material" and names it
// in `errors`. A refusal caused by an error is therefore indistinguishable in effect from a refusal
// caused by a row, and both are visible in the audit row's excluded_by_rule.
//
// ONE PREDICATE, ONE PLACE: the verdict comes from clientMaterial.ts and nothing here re-derives it.

import { companyHasClientProvidedMaterial, type ClientMaterialVerdict } from "./clientMaterial.ts";
import { recordIntegrityRun } from "./integrity.ts";

// deno-lint-ignore no-explicit-any
type SupabaseLike = { from: (t: string) => any };

export type OptionBDoorResult = {
  /** true ⇒ no client material was found AND every lookup succeeded ⇒ an outside call may be made. */
  allowed: boolean;
  verdict: ClientMaterialVerdict;
};

/**
 * The door. Call it BEFORE the per-row gate and before any prompt text is assembled.
 *
 * On refusal it writes exactly one integrity_runs row (component 'option_b_door') carrying the
 * predicate's own `found` and `errors` plus the surface type and id, and the caller makes NO
 * outside call. On admission it writes nothing — an allowed call is the unremarkable case, and a row
 * per permitted call would bury the refusals it exists to surface.
 */
export async function optionBDoor(opts: {
  supabase: SupabaseLike;
  companyId: string;
  surfaceType: string;
  surfaceId: string;
  consumer: string;
}): Promise<OptionBDoorResult> {
  const verdict = await companyHasClientProvidedMaterial(opts.supabase, opts.companyId);
  if (!verdict.has) return { allowed: true, verdict };

  console.log("[option-b-door] refused", {
    consumer: opts.consumer,
    company_id: opts.companyId,
    surface_type: opts.surfaceType,
    surface_id: opts.surfaceId,
    found: verdict.found,
    errors: verdict.errors,
  });
  await recordIntegrityRun(opts.supabase, {
    company_id: opts.companyId,
    component: "option_b_door",
    surface_type: opts.surfaceType,
    surface_id: opts.surfaceId,
    status: "completed",
    examined: 1,
    admitted: 0,
    excluded_by_rule: {
      client_material: true,
      // The predicate's own output, verbatim — so the refusal is reconstructable from the row alone
      // and a refusal caused by a LOOKUP ERROR is never mistaken for one caused by a found row.
      found: verdict.found,
      errors: verdict.errors,
      fail_closed_on_error: verdict.errors.length > 0,
    },
    run_ref: opts.consumer,
  });
  return { allowed: false, verdict };
}
