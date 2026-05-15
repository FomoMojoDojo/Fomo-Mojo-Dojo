// ── Claim State Machine — DB Layer ────────────────────────────────────────────
//
// Thin wrapper around the pure gate functions in gates.ts.
// Owns: state reads from DB, transition writes, claim_event writes,
// regression detection sweeps, and distribution updates on every transition.
//
// All functions accept an explicit supabase client parameter for testability.
// Callers in the app use the singleton from @/integrations/supabase/client.

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  ClaimState,
  ClaimForGate,
  ClaimSignalRefForGate,
  OdiNeedForGate,
  RouteForGate,
  TensionForGate,
  ManagedOutcomeForGate,
  GateCheckResult,
  EvidenceDelta,
  ActionCategory,
  ClaimStateOrRetired,
} from "./types";
import {
  checkNoSkip,
  checkOutsideViewToDiagnose,
  checkDiagnoseToFocus,
  checkFocusToFlow,
  shouldRegressDiagnoseToOutsideView,
  shouldRegressFocusToDiagnose,
  shouldRegressFlowToFocus,
} from "./gates";
import { recomputeAndWriteDistribution } from "./distribution";

// ── Result types ──────────────────────────────────────────────────────────────

export type TransitionResult = {
  success: boolean;
  gateResult: GateCheckResult;
  newState?: ClaimState;
  eventId?: string;
  error?: string;
};

export type RegressionResult = {
  claimId: string;
  fromState: ClaimState;
  toState: ClaimState;
  reason: string;
};

export type RegressionSweepResult = {
  regressions: RegressionResult[];
  errors: Array<{ claimId: string; error: string }>;
};

// ── Internal helpers ──────────────────────────────────────────────────────────

async function loadClaimWithRefs(
  db: SupabaseClient,
  claimId: string,
): Promise<{
  claim: ClaimForGate | null;
  refs: ClaimSignalRefForGate[];
  error?: string;
}> {
  const { data: claimRow, error: claimErr } = await db
    .from("claims")
    .select("id, company_id, claim_type, state, need_statement, action_category, triangulation_state")
    .eq("id", claimId)
    .maybeSingle();

  if (claimErr || !claimRow) {
    return {
      claim: null,
      refs: [],
      error: claimErr?.message ?? "Claim not found",
    };
  }

  const { data: refRows, error: refsErr } = await db
    .from("claim_signal_refs")
    .select("relationship, signal_id, signals(signal_band, directness, framing_fit, validation_status, structure_level)")
    .eq("claim_id", claimId);

  if (refsErr) {
    return { claim: claimRow as ClaimForGate, refs: [], error: refsErr.message };
  }

  const refs: ClaimSignalRefForGate[] = (refRows ?? [])
    .filter((r): r is typeof r & { signals: NonNullable<typeof r["signals"]> } => r.signals !== null)
    .map((r) => ({
      signal_id: r.signal_id,
      relationship: r.relationship as ClaimSignalRefForGate["relationship"],
      signal: r.signals as ClaimSignalRefForGate["signal"],
    }));

  return { claim: claimRow as ClaimForGate, refs };
}

async function writeClaimEvent(
  db: SupabaseClient,
  opts: {
    companyId: string;
    claimId: string;
    fromState: ClaimState | null;
    toState: ClaimStateOrRetired;
    triggeredByEvent: string;
    evidenceDelta: EvidenceDelta;
  },
): Promise<string | undefined> {
  const { data, error } = await db
    .from("claim_events")
    .insert({
      company_id: opts.companyId,
      claim_id: opts.claimId,
      from_state: opts.fromState,
      to_state: opts.toState,
      triggered_by_event: opts.triggeredByEvent,
      evidence_delta: opts.evidenceDelta,
    })
    .select("id")
    .single();

  if (error) {
    console.error("[claimState/machine] Failed to write claim_event:", error.message);
    return undefined;
  }
  return (data as { id: string } | null)?.id;
}

async function applyStateUpdate(
  db: SupabaseClient,
  claimId: string,
  newState: ClaimState,
  extraFields?: { action_category?: ActionCategory | null },
): Promise<{ error?: string }> {
  const update: Record<string, unknown> = { state: newState };
  if (extraFields?.action_category !== undefined) {
    update.action_category = extraFields.action_category;
  }
  const { error } = await db
    .from("claims")
    .update(update)
    .eq("id", claimId);
  return { error: error?.message };
}

// ── Forward transitions ───────────────────────────────────────────────────────

/**
 * Attempt a forward transition on a claim.
 * Validates the no-skip rule, runs the appropriate gate, writes the event,
 * updates the claim state, and refreshes the state distribution for the company.
 *
 * @param triggeredBy  Identifies what caused this transition (e.g., 'manual', 'file_proposal_accepted')
 * @param evidenceDelta  Optional snapshot of what evidence changed
 */
export async function transitionClaim(
  db: SupabaseClient,
  claimId: string,
  toState: ClaimState,
  opts: {
    triggeredBy?: string;
    evidenceDelta?: EvidenceDelta;
    odiNeed?: OdiNeedForGate;
    linkedRoute?: RouteForGate;
    activeTensions?: TensionForGate[];
    managedOutcomes?: ManagedOutcomeForGate[];
    actionCategory?: ActionCategory;
  } = {},
): Promise<TransitionResult> {
  const { claim, refs, error: loadErr } = await loadClaimWithRefs(db, claimId);
  if (!claim || loadErr) {
    return { success: false, gateResult: { allowed: false, blockers: [loadErr ?? "Load failed"] } };
  }

  // Skip-state guard
  const skipCheck = checkNoSkip(claim.state, toState);
  if (!skipCheck.allowed) {
    return { success: false, gateResult: skipCheck };
  }

  // Cannot re-enter the same state
  if (claim.state === toState) {
    return {
      success: false,
      gateResult: { allowed: false, blockers: [`Claim is already in '${toState}'`] },
    };
  }

  // Regression (backward) handled separately
  const fromIdx = ["outside_view", "diagnose", "focus", "flow"].indexOf(claim.state);
  const toIdx = ["outside_view", "diagnose", "focus", "flow"].indexOf(toState);
  if (toIdx < fromIdx) {
    return {
      success: false,
      gateResult: {
        allowed: false,
        blockers: [`Use regressionSweep() for backward transitions — they are automatic`],
      },
    };
  }

  // Run the appropriate gate
  let gateResult: GateCheckResult;
  if (toState === "diagnose") {
    gateResult = checkOutsideViewToDiagnose(claim, refs);
  } else if (toState === "focus") {
    gateResult = checkDiagnoseToFocus(claim, refs, opts.odiNeed);
  } else if (toState === "flow") {
    const claimWithCategory: ClaimForGate = {
      ...claim,
      action_category: opts.actionCategory ?? claim.action_category,
    };
    gateResult = checkFocusToFlow(
      claimWithCategory,
      opts.linkedRoute ?? null,
      opts.activeTensions ?? [],
      opts.managedOutcomes ?? [],
    );
  } else {
    return {
      success: false,
      gateResult: { allowed: false, blockers: [`Unknown target state: ${toState}`] },
    };
  }

  if (!gateResult.allowed) {
    return { success: false, gateResult };
  }

  // Apply state update
  const extraFields =
    toState === "flow" && opts.actionCategory
      ? { action_category: opts.actionCategory }
      : undefined;
  const { error: updateErr } = await applyStateUpdate(db, claimId, toState, extraFields);
  if (updateErr) {
    return {
      success: false,
      gateResult,
      error: `State update failed: ${updateErr}`,
    };
  }

  // Write event
  const eventId = await writeClaimEvent(db, {
    companyId: claim.company_id,
    claimId,
    fromState: claim.state,
    toState,
    triggeredByEvent: opts.triggeredBy ?? "manual",
    evidenceDelta: opts.evidenceDelta ?? {},
  });

  // Refresh distribution
  await recomputeAndWriteDistribution(db, claim.company_id);

  return { success: true, gateResult, newState: toState, eventId };
}

// ── Retirement ────────────────────────────────────────────────────────────────

export async function retireClaim(
  db: SupabaseClient,
  claimId: string,
  opts: { reason?: string } = {},
): Promise<{ success: boolean; error?: string }> {
  const { data: row, error: fetchErr } = await db
    .from("claims")
    .select("id, company_id, state")
    .eq("id", claimId)
    .maybeSingle();

  if (fetchErr || !row) {
    return { success: false, error: fetchErr?.message ?? "Claim not found" };
  }

  const { error: updateErr } = await db
    .from("claims")
    .update({ revalidation_flag: true }) // Mark for soft-delete; state kept for history
    .eq("id", claimId);

  if (updateErr) {
    return { success: false, error: updateErr.message };
  }

  await writeClaimEvent(db, {
    companyId: (row as { company_id: string }).company_id,
    claimId,
    fromState: (row as { state: ClaimState }).state,
    toState: "retired",
    triggeredByEvent: "manual_retire",
    evidenceDelta: { note: opts.reason ?? "Claim retired" },
  });

  await recomputeAndWriteDistribution(db, (row as { company_id: string }).company_id);
  return { success: true };
}

// ── Regression sweep ──────────────────────────────────────────────────────────
//
// Scans all flow/focus/diagnose claims for a company and auto-demotes any
// that no longer meet the evidence requirements for their current state.
// Called after signal mutations (withdrawal, contradiction).

export async function regressionSweep(
  db: SupabaseClient,
  companyId: string,
  opts: { triggeredBy?: string } = {},
): Promise<RegressionSweepResult> {
  const regressions: RegressionResult[] = [];
  const errors: Array<{ claimId: string; error: string }> = [];

  // Load all active non-outside_view claims for the company
  const { data: claims, error: claimsErr } = await db
    .from("claims")
    .select("id, company_id, claim_type, state, need_statement, action_category, triangulation_state")
    .eq("company_id", companyId)
    .in("state", ["diagnose", "focus", "flow"]);

  if (claimsErr || !claims) {
    return { regressions: [], errors: [{ claimId: "*", error: claimsErr?.message ?? "Load failed" }] };
  }

  for (const claim of claims as ClaimForGate[]) {
    try {
      const { refs } = await loadClaimWithRefs(db, claim.id);

      if (claim.state === "diagnose") {
        if (shouldRegressDiagnoseToOutsideView(refs)) {
          await applyStateUpdate(db, claim.id, "outside_view");
          await writeClaimEvent(db, {
            companyId,
            claimId: claim.id,
            fromState: "diagnose",
            toState: "outside_view",
            triggeredByEvent: opts.triggeredBy ?? "signal_withdrawal",
            evidenceDelta: { note: "All org-band signals removed or contradicted" },
          });
          regressions.push({ claimId: claim.id, fromState: "diagnose", toState: "outside_view", reason: "org_signals_lost" });
        }
      } else if (claim.state === "focus") {
        if (shouldRegressFocusToDiagnose(refs)) {
          await applyStateUpdate(db, claim.id, "diagnose");
          await writeClaimEvent(db, {
            companyId,
            claimId: claim.id,
            fromState: "focus",
            toState: "diagnose",
            triggeredByEvent: opts.triggeredBy ?? "signal_contradiction",
            evidenceDelta: { note: "Primary customer signal withdrawn or contradicted" },
          });
          regressions.push({ claimId: claim.id, fromState: "focus", toState: "diagnose", reason: "customer_signal_lost" });
        }
      } else if (claim.state === "flow") {
        // Load the linked route for staleness check
        const { data: routeRow } = await db
          .from("routes")
          .select("id, steps_json, stale_reason, dependency_state, linked_need_ids")
          .eq("claim_id", claim.id)
          .maybeSingle();

        const linkedRoute = routeRow
          ? {
              id: (routeRow as { id: string }).id,
              steps_json: (routeRow as { steps_json: Array<{ status: string }> | null }).steps_json,
              stale_reason: (routeRow as { stale_reason: string | null }).stale_reason,
              dependency_state: (routeRow as { dependency_state: string | null }).dependency_state,
              linked_need_ids: (routeRow as { linked_need_ids: string[] | null }).linked_need_ids,
            }
          : null;

        if (shouldRegressFlowToFocus(linkedRoute, refs)) {
          await applyStateUpdate(db, claim.id, "focus");
          await writeClaimEvent(db, {
            companyId,
            claimId: claim.id,
            fromState: "flow",
            toState: "focus",
            triggeredByEvent: opts.triggeredBy ?? "route_stale",
            evidenceDelta: {
              note: linkedRoute?.stale_reason
                ? `Route stale: ${linkedRoute.stale_reason}`
                : "Route dependency_state=stale or contradicting customer signal",
            },
          });
          regressions.push({ claimId: claim.id, fromState: "flow", toState: "focus", reason: "route_stale_or_contradicted" });
        }
      }
    } catch (err) {
      errors.push({ claimId: claim.id, error: String(err) });
    }
  }

  if (regressions.length > 0) {
    await recomputeAndWriteDistribution(db, companyId);
  }

  return { regressions, errors };
}
