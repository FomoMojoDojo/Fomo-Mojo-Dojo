// PCT-2 extraction (faithful MOVE, no logic change): the public opportunities and
// odi_needs reconcile+write loops, relocated verbatim out of research-company's
// Deno.serve handler so the tempKey->id parent-seeding path is unit-testable. The
// loop bodies are byte-for-byte the originals; every handler-scoped variable is an
// argument, and the peripheral shaper helpers (clamp / journey-key / outcome
// normalizers / service-state) are dependency-injected so production passes its
// REAL in-scope helpers while a test harness can supply faithful copies. planReconcile
// and the seeding loop themselves are the real code under test.

import { planReconcile } from "./reconcilePublicSynthesis.ts";
import { needIdentityStatement } from "./contentIdentity.ts";

type SupabaseLike = { from: (t: string) => any };

export type InsertedOpportunity = {
  id: string;
  outcome: string;
  step_label: string;
  step_number: number;
  journey_key: string;
  priority_tier: string;
  opportunity_score: number;
};

export async function writeReconciledOpportunities(args: {
  supabase: SupabaseLike;
  company_id: string;
  user: { id: string };
  hierarchicalOpportunities: Array<Record<string, any>>;
  customerStepLabelByNumber: Map<number, string>;
  managedOutcomeIdByJourney: Map<string, string>;
  opportunityFrameworkKeys: string[];
  reconcileRunId: string | null;
  // Mutated in place (verbatim push) so the handler's downstream consumers see the inserts.
  insertedOpportunities: InsertedOpportunity[];
  helpers: {
    clamp: (n: number, lo: number, hi: number) => number;
    normalizeJourneyKey: (value: unknown) => string;
    isCustomerJourneyKey: (value: unknown) => boolean;
    ensureRequiredFrameworkKeys: (keys: string[]) => string[];
    JTBD_CHECKPOINT_COUNT: number;
  };
}): Promise<{ oppsInserted: number }> {
  const {
    supabase, company_id, user, hierarchicalOpportunities, customerStepLabelByNumber,
    managedOutcomeIdByJourney, opportunityFrameworkKeys, reconcileRunId, insertedOpportunities,
  } = args;
  const { clamp, normalizeJourneyKey, isCustomerJourneyKey, ensureRequiredFrameworkKeys, JTBD_CHECKPOINT_COUNT } = args.helpers;
  let oppsInserted = 0;

  // ── verbatim from research-company handler (PCT-2 opportunities block) ──────
    const oppPrepared = hierarchicalOpportunities.map((opp, i) => {
      const journeyKey = normalizeJourneyKey(opp?.journey_key) || "customer";
      const rawStepNumber = Number(opp?.step_number) || 0;
      const stepNumber = isCustomerJourneyKey(journeyKey)
        ? clamp(rawStepNumber || 1, 1, JTBD_CHECKPOINT_COUNT)
        : Math.max(1, rawStepNumber || 1);
      const stepLabel = isCustomerJourneyKey(journeyKey)
        ? customerStepLabelByNumber.get(stepNumber) || String(opp?.step_label || "").trim()
        : String(opp?.step_label || "").trim();
      const importance = clamp(Number(opp?.importance) || 5, 1, 10);
      const satisfaction = clamp(Number(opp?.satisfaction) || 5, 1, 10);
      const opportunity_score = clamp(Number(opp?.opportunity_score) || (importance + (10 - satisfaction)), 0, 20);
      const priority_tier = opportunity_score >= 12 ? "focus" : opportunity_score >= 7 ? "monitor" : "defer";
      return {
        opp, journeyKey, stepNumber, stepLabel, importance, satisfaction, opportunity_score, priority_tier,
        tempKey: String(opp.__temp_key || "").trim(),
        outcome: String(opp?.outcome || ""),
        ref: String(opp.__temp_key || "").trim() || `idx:${i}`,
      };
    });

    const { data: existingOppRows } = await supabase
      .from("opportunities")
      .select("id, outcome, content_identity, journey_key, step_number")
      .eq("company_id", company_id)
      .eq("provenance_type", "public_research")
      .eq("status", "active");
    const existingOppById = new Map<string, Record<string, unknown>>(
      (existingOppRows ?? []).map((r: Record<string, unknown>) => [String(r.id), r]),
    );
    const oppPlan = await planReconcile(
      (existingOppRows ?? []).map((r: Record<string, unknown>) => {
        const rr = r as Record<string, unknown>;
        return {
          id: String(rr.id),
          statement: String(rr.outcome || ""),
          content_identity: (rr.content_identity as string | null) ?? null,
          journey_key: String(rr.journey_key || ""),
          step_number: Number(rr.step_number) || 0,
        };
      }),
      oppPrepared.map((p) => ({ ref: p.ref, statement: p.outcome, journey_key: p.journeyKey, step_number: p.stepNumber })),
    );
    const oppEntryByRef = new Map(oppPlan.entries.map((e) => [e.ref, e]));
    // Lazy identity backfill on existing rows, through the single TS helper.
    for (const b of oppPlan.identityBackfill) {
      await supabase.from("opportunities").update({ content_identity: b.identity }).eq("id", b.id);
    }

    const persistedOpportunityIdByTempKey = new Map<string, string>();
    let parentOpportunityColumnAvailable = true;
    for (const p of oppPrepared) {
      const entry = oppEntryByRef.get(p.ref);
      const { journeyKey, stepNumber, stepLabel, importance, satisfaction, opportunity_score, priority_tier } = p;

      // KEEP: matched an existing active public row — do NOT insert. Seed the temp
      // key map with the KEPT id so new children of a kept parent resolve their
      // parent_opportunity_id correctly. The row is left untouched (text/scores/tree
      // position retained); only last_confirmed advances (batched below).
      if (entry && entry.action === "keep") {
        const existing = existingOppById.get(entry.existingId) || {};
        if (p.tempKey) persistedOpportunityIdByTempKey.set(p.tempKey, entry.existingId);
        insertedOpportunities.push({
          id: entry.existingId,
          outcome: String(existing.outcome || p.outcome),
          step_label: stepLabel,
          step_number: stepNumber,
          journey_key: journeyKey,
          priority_tier,
          opportunity_score,
        });
        oppsInserted++;
        continue;
      }

      // ADD
      const managedOutcomeId = managedOutcomeIdByJourney.get(journeyKey) || null;
      const parentOpportunityId = parentOpportunityColumnAvailable
        ? persistedOpportunityIdByTempKey.get(String(p.opp.__parent_key || "")) || null
        : null;
      const reconcileCols = {
        content_identity: entry?.identity ?? null,
        status: "active",
        source_run_id: reconcileRunId,
        last_confirmed_run_id: reconcileRunId,
      };
      let insert = await supabase
        .from("opportunities")
        .insert({
          company_id,
          user_id: user.id,
          provenance_type: "public_research",
          frameworks_used: ensureRequiredFrameworkKeys(opportunityFrameworkKeys),
          managed_outcome_id: managedOutcomeId,
          ...(parentOpportunityColumnAvailable ? { parent_opportunity_id: parentOpportunityId } : {}),
          outcome: p.outcome,
          step_number: stepNumber,
          step_label: stepLabel,
          journey_key: journeyKey,
          importance,
          satisfaction,
          opportunity_score,
          priority_tier,
          ...reconcileCols,
        })
        .select("id, outcome, step_label, step_number, journey_key, priority_tier, opportunity_score")
        .single();

      let insertMessage = String(insert.error?.message || "").toLowerCase();
      if (insert.error && insertMessage.includes("parent_opportunity_id") && parentOpportunityColumnAvailable) {
        parentOpportunityColumnAvailable = false;
        insert = await supabase
          .from("opportunities")
          .insert({
            company_id,
            user_id: user.id,
            provenance_type: "public_research",
            frameworks_used: ensureRequiredFrameworkKeys(opportunityFrameworkKeys),
            managed_outcome_id: managedOutcomeId,
            outcome: p.outcome,
            step_number: stepNumber,
            step_label: stepLabel,
            journey_key: journeyKey,
            importance,
            satisfaction,
            opportunity_score,
            priority_tier,
            ...reconcileCols,
          })
          .select("id, outcome, step_label, step_number, journey_key, priority_tier, opportunity_score")
          .single();
        insertMessage = String(insert.error?.message || "").toLowerCase();
      }

      if (insert.error && insertMessage.includes("frameworks_used")) {
        insert = await supabase
          .from("opportunities")
          .insert({
            company_id,
            user_id: user.id,
            provenance_type: "public_research",
            managed_outcome_id: managedOutcomeId,
            ...(parentOpportunityColumnAvailable ? { parent_opportunity_id: parentOpportunityId } : {}),
            outcome: p.outcome,
            step_number: stepNumber,
            step_label: stepLabel,
            journey_key: journeyKey,
            importance,
            satisfaction,
            opportunity_score,
            priority_tier,
            ...reconcileCols,
          })
          .select("id, outcome, step_label, step_number, journey_key, priority_tier, opportunity_score")
          .single();
      }

      if (insert.error) {
        console.error("[research-company] opportunity insert error:", insert.error);
      } else {
        const row = (insert.data || {}) as Record<string, unknown>;
        const insertedId = String(row.id || "");
        if (insertedId) {
          if (p.tempKey) persistedOpportunityIdByTempKey.set(p.tempKey, insertedId);
          insertedOpportunities.push({
            id: insertedId,
            outcome: String(row.outcome || ""),
            step_label: String(row.step_label || ""),
            step_number: Number(row.step_number) || stepNumber,
            journey_key: String(row.journey_key || journeyKey),
            priority_tier: String(row.priority_tier || priority_tier),
            opportunity_score: Number(row.opportunity_score) || opportunity_score,
          });
        }
        oppsInserted++;
      }
    }

    // Advance last_confirmed_run_id on kept rows (status stays active; nothing else changes).
    if (oppPlan.keptExistingIds.length > 0 && reconcileRunId) {
      await supabase.from("opportunities").update({ last_confirmed_run_id: reconcileRunId }).in("id", oppPlan.keptExistingIds);
    }
    console.log(`[research-company] opportunities reconcile: kept=${oppPlan.keptExistingIds.length} added=${oppPlan.entries.filter((e) => e.action === "add").length} preserved=${oppPlan.preservedExistingIds.length}`);
  // ── end verbatim ───────────────────────────────────────────────────────────

  return { oppsInserted };
}

export async function writeReconciledNeeds(args: {
  supabase: SupabaseLike;
  company_id: string;
  user: { id: string };
  opportunities: Array<Record<string, any>>;
  customerStepLabelByNumber: Map<number, string>;
  odiFrameworkKeys: string[];
  artifactSourcePath: string;
  reconcileRunId: string | null;
  helpers: {
    clamp: (n: number, lo: number, hi: number) => number;
    normalizeOutcomeLanguage: (outcome: string) => string;
    odiServiceState: (importance: number, satisfaction: number) => string;
    JTBD_CHECKPOINT_COUNT: number;
  };
}): Promise<{ odiNeedsInserted: number }> {
  const {
    supabase, company_id, user, opportunities, customerStepLabelByNumber,
    odiFrameworkKeys, artifactSourcePath, reconcileRunId,
  } = args;
  const { clamp, normalizeOutcomeLanguage, odiServiceState, JTBD_CHECKPOINT_COUNT } = args.helpers;
  let odiNeedsInserted = 0;

  // ── verbatim from research-company handler (PCT-2 needs block) ──────────────
    const needPrepared = opportunities.map((opp, needIndex) => {
      const rawStepNumber = Number(opp?.step_number) || 0;
      const stepNumber = clamp(rawStepNumber || 1, 1, JTBD_CHECKPOINT_COUNT);
      const stepLabel = customerStepLabelByNumber.get(stepNumber) || String(opp?.step_label || "").trim();
      const importance = clamp(Number(opp?.importance) || 5, 1, 10);
      const satisfaction = clamp(Number(opp?.satisfaction) || 5, 1, 10);
      const opportunity_score = clamp(Number(opp?.opportunity_score) || (importance + (10 - satisfaction)), 0, 20);
      const desiredOutcome = normalizeOutcomeLanguage(String(opp?.outcome || ""));
      const canonical = (opp?.odi_canonical_statement as string | null) || null;
      // Identity = desired_outcome ALWAYS (canonical is a derived display field).
      const statement = needIdentityStatement({ desired_outcome: desiredOutcome });
      return { needIndex, stepNumber, stepLabel, importance, satisfaction, opportunity_score, desiredOutcome, canonical, statement };
    });

    const { data: existingNeedRows } = await supabase
      .from("odi_needs")
      .select("id, desired_outcome, odi_canonical_statement, content_identity, journey_key, step_number")
      .eq("company_id", company_id)
      .eq("provenance_type", "public_research")
      .eq("status", "active");
    const needPlan = await planReconcile(
      (existingNeedRows ?? []).map((r: Record<string, unknown>) => {
        const rr = r as Record<string, unknown>;
        return {
          id: String(rr.id),
          statement: needIdentityStatement({ desired_outcome: rr.desired_outcome as string | null }),
          content_identity: (rr.content_identity as string | null) ?? null,
          journey_key: String(rr.journey_key || ""),
          step_number: Number(rr.step_number) || 0,
        };
      }),
      needPrepared.map((p) => ({ ref: `n:${p.needIndex}`, statement: p.statement, journey_key: "customer", step_number: p.stepNumber })),
    );
    const needEntryByRef = new Map(needPlan.entries.map((e) => [e.ref, e]));
    for (const b of needPlan.identityBackfill) {
      await supabase.from("odi_needs").update({ content_identity: b.identity }).eq("id", b.id);
    }

    for (const p of needPrepared) {
      const entry = needEntryByRef.get(`n:${p.needIndex}`);
      // KEEP: row stays as-is; last_confirmed advances below. Count it present.
      if (entry && entry.action === "keep") { odiNeedsInserted++; continue; }

      const { error: odiNeedErr } = await supabase.from("odi_needs").insert({
        company_id,
        user_id: user.id,
        provenance_type: "public_research",
        tier: "need",
        desired_outcome: p.desiredOutcome,
        odi_canonical_statement: p.canonical,
        journey_key: "customer",
        step_number: p.stepNumber,
        step_label: p.stepLabel,
        importance: p.importance,
        satisfaction: p.satisfaction,
        opportunity_score: p.opportunity_score,
        sort_order: p.needIndex + 1,
        service_state: odiServiceState(p.importance, p.satisfaction),
        source_path: artifactSourcePath,
        frameworks_used: odiFrameworkKeys,
        content_identity: entry?.identity ?? null,
        status: "active",
        source_run_id: reconcileRunId,
        last_confirmed_run_id: reconcileRunId,
      });

      if (odiNeedErr) console.error("[research-company] odi need insert error:", odiNeedErr);
      else odiNeedsInserted++;
    }

    if (needPlan.keptExistingIds.length > 0 && reconcileRunId) {
      await supabase.from("odi_needs").update({ last_confirmed_run_id: reconcileRunId }).in("id", needPlan.keptExistingIds);
    }
    console.log(`[research-company] odi_needs reconcile: kept=${needPlan.keptExistingIds.length} added=${needPlan.entries.filter((e) => e.action === "add").length} preserved=${needPlan.preservedExistingIds.length}`);
  // ── end verbatim ───────────────────────────────────────────────────────────

  return { odiNeedsInserted };
}
