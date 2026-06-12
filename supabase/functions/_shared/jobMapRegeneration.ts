import type { ClaimDraft } from "../../../src/lib/evidenceDomain.ts";
import type { DependencyStrength, DependencyType, StrategicActorType } from "../../../src/lib/strategicGraphDomain.ts";
import { matchStrengthFromScore, scoreClaimToJobStepMatch } from "../../../src/lib/evidenceMappers.ts";
import {
  clearStalenessIfResolved,
  getDownstreamDependents,
  getUpstreamSupports,
  markDependentsNeedsReview,
  recordBulkArtifactEvents,
  recordStrategicEvent,
  snapshotArtifactVersion,
  upsertDependenciesForArtifact,
} from "./strategicGraph.ts";
import { DELETABLE_PROVENANCE_OR_FILTER } from "./journeyProtection.ts";

type SupabaseClientLike = {
  from: (table: string) => {
    insert: (values: unknown) => any;
    select: (columns?: string) => {
      eq: (column: string, value: unknown) => any;
      in: (column: string, values: unknown[]) => any;
      order?: (column: string, opts?: { ascending?: boolean }) => any;
      limit?: (value: number) => any;
      maybeSingle?: () => any;
      single?: () => any;
    };
    update: (values: unknown) => {
      eq: (column: string, value: unknown) => any;
      in: (column: string, values: unknown[]) => any;
    };
    delete: () => {
      eq: (column: string, value: unknown) => any;
      in: (column: string, values: unknown[]) => any;
    };
  };
};

export type JobMapRegenerationStep = {
  step_number: number;
  step_label: string;
  description: string;
  designed: boolean;
  has_gap: boolean;
  evidence_status: string;
  evidence_basis: string;
  evidence_confidence: number;
  gap_note: string;
};

export type JobMapRegenerationResult = {
  regenerationEventId: string;
  affectedArtifactCount: number;
  dependencyCount: number;
  stepEventCount: number;
  insertedStepCount: number;
};

type DependencyTarget = {
  upstream_object_type: string;
  upstream_object_id: string;
  downstream_object_type: string;
  downstream_object_id: string;
  dependency_type: DependencyType;
  strength: DependencyStrength;
};

const STOP_WORDS = new Set([
  "the", "and", "for", "with", "that", "this", "from", "into", "what", "how",
  "when", "then", "your", "their", "will", "have", "make", "more", "less",
  "core", "work", "step", "team", "customer", "internal", "progress",
]);

function nowIso() {
  return new Date().toISOString();
}

function normalizeComparisonText(value: unknown) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

function semanticJobStepKey(row: { journey_key?: unknown; step_number?: unknown }) {
  return `${String(row.journey_key ?? "").trim().toLowerCase()}::${Number(row.step_number ?? 0)}`;
}

function jobStepChanged(previousRow: Record<string, unknown> | null | undefined, nextStep: JobMapRegenerationStep) {
  if (!previousRow) return true;
  return (
    normalizeComparisonText(previousRow.step_label) !== normalizeComparisonText(nextStep.step_label) ||
    normalizeComparisonText(previousRow.description) !== normalizeComparisonText(nextStep.description) ||
    Boolean(previousRow.designed) !== Boolean(nextStep.designed) ||
    Boolean(previousRow.has_gap) !== Boolean(nextStep.has_gap) ||
    normalizeComparisonText(previousRow.gap_note) !== normalizeComparisonText(nextStep.gap_note)
  );
}

function isJobStepEvidenceColumnError(message: string) {
  const lower = String(message || "").toLowerCase();
  return (
    lower.includes("evidence_status") ||
    lower.includes("evidence_basis") ||
    lower.includes("evidence_confidence")
  );
}

function toDependencyTarget(row: Record<string, unknown> | null | undefined): DependencyTarget | null {
  if (!row) return null;
  const upstream_object_id = String(row.upstream_object_id || "").trim();
  const downstream_object_id = String(row.downstream_object_id || "").trim();
  const upstream_object_type = String(row.upstream_object_type || "").trim();
  const downstream_object_type = String(row.downstream_object_type || "").trim();
  const dependency_type = String(row.dependency_type || "").trim() as DependencyType;
  const strength = String(row.strength || "").trim() as DependencyStrength;
  if (!upstream_object_id || !downstream_object_id || !upstream_object_type || !downstream_object_type || !dependency_type || !strength) {
    return null;
  }
  return {
    upstream_object_type,
    upstream_object_id,
    downstream_object_type,
    downstream_object_id,
    dependency_type,
    strength,
  };
}

async function restoreJobStepsForJourney(
  supabase: SupabaseClientLike,
  companyId: string,
  journeyKey: string,
  rows: Record<string, unknown>[],
) {
  // Gate 2b row-level backstop: protected-provenance rows are never deleted,
  // even on the restore path. NULL stays deletable (legacy law).
  const { error: deleteError } = await supabase.from("job_steps").delete().eq("company_id", companyId).eq("journey_key", journeyKey).or(DELETABLE_PROVENANCE_OR_FILTER);
  if (deleteError) {
    throw new Error(deleteError.message || "Failed clearing regenerated job steps before restore.");
  }
  if (rows.length === 0) return;

  let result = await supabase.from("job_steps").insert(rows);
  if (result.error) {
    const message = result.error.message || "";
    if (
      isJobStepEvidenceColumnError(message) ||
      message.toLowerCase().includes("dependency_state") ||
      message.toLowerCase().includes("source_run_id") ||
      message.toLowerCase().includes("stale_since_event_id")
    ) {
      const fallbackRows = rows.map((row) => {
        const {
          evidence_status,
          evidence_basis,
          evidence_confidence,
          dependency_state,
          validation_state,
          evidence_state,
          stale_reason,
          stale_since_event_id,
          last_reviewed_at,
          source_run_id,
          ...rest
        } = row;
        return rest;
      });
      result = await supabase.from("job_steps").insert(fallbackRows);
    }
  }

  if (result.error) {
    throw new Error(result.error.message || "Failed to restore previous job steps after regeneration error.");
  }
}

async function loadExistingDependenciesForJobSteps(
  supabase: SupabaseClientLike,
  companyId: string,
  jobStepIds: string[],
) {
  if (jobStepIds.length === 0) return [] as DependencyTarget[];
  const [downstream, upstream] = await Promise.all([
    getDownstreamDependents(supabase, companyId, "job_step", jobStepIds),
    getUpstreamSupports(supabase, companyId, "job_step", jobStepIds),
  ]);
  const map = new Map<string, DependencyTarget>();
  for (const row of [...downstream, ...upstream]) {
    const parsed = toDependencyTarget(row as Record<string, unknown>);
    if (!parsed) continue;
    const key = `${parsed.upstream_object_type}:${parsed.upstream_object_id}->${parsed.downstream_object_type}:${parsed.downstream_object_id}:${parsed.dependency_type}`;
    map.set(key, parsed);
  }
  return [...map.values()];
}

export async function regenerateJobMapJourney(args: {
  supabase: SupabaseClientLike;
  companyId: string;
  userId: string;
  actorType: StrategicActorType;
  actorId: string | null;
  journeyKey: string;
  journeyTitle: string;
  journeySubtitle: string;
  steps: JobMapRegenerationStep[];
  sourceRunId: string | null;
  sourceLabel: string;
  frameworksUsed: string[];
  claimTopic?: string;
}) {
  const {
    supabase,
    companyId,
    userId,
    actorType,
    actorId,
    journeyKey,
    journeyTitle,
    journeySubtitle,
    steps,
    sourceRunId,
    sourceLabel,
    frameworksUsed,
    claimTopic = "job",
  } = args;

  const normalizedKey = String(journeyKey || "").trim() || "customer";
  const { data: existingRowsRaw, error: existingRowsError } = await supabase
    .from("job_steps")
    .select("*")
    .eq("company_id", companyId)
    .eq("journey_key", normalizedKey)
    .order("step_number", { ascending: true });
  if (existingRowsError) throw new Error(existingRowsError.message || "Failed to load existing job steps.");
  const existingRows = ((existingRowsRaw ?? []) as Record<string, unknown>[]);
  const existingStepIds = existingRows.map((row) => String(row.id || "")).filter(Boolean);
  const previousDependencies = await loadExistingDependenciesForJobSteps(supabase, companyId, existingStepIds);
  let clearedExistingRows = false;
  let insertedRows: Record<string, unknown>[] = [];

  const regenerationEvent = await recordStrategicEvent(supabase, {
    company_id: companyId,
    event_type: "regenerated",
    actor_type: actorType,
    actor_id: actorId,
    source_run_id: sourceRunId,
    object_type: "job_map",
    object_id: crypto.randomUUID(),
    previous_value: {
      journey_key: normalizedKey,
      previous_step_count: existingRows.length,
      previous_step_ids: existingStepIds,
    },
    new_value: {
      journey_key: normalizedKey,
      next_step_count: steps.length,
      source: sourceLabel,
    },
    reason: "ODI job map regenerated",
  });

  try {
    for (const previousRow of existingRows) {
      const previousId = String(previousRow.id || "").trim();
      if (!previousId) continue;
      await snapshotArtifactVersion(supabase, {
        company_id: companyId,
        object_type: "job_step",
        object_id: previousId,
        snapshot: previousRow,
        source_event_id: String(regenerationEvent.id || ""),
        source_run_id: sourceRunId,
      });
    }

    // Gate 2b row-level backstop (operator-approved Option A): internal_derived /
    // operator_authored rows never enter a delete — callers must key-exclude
    // protected journeys; this guard holds even if they regress.
    const { error: deleteExistingError } = await supabase.from("job_steps").delete().eq("company_id", companyId).eq("journey_key", normalizedKey).or(DELETABLE_PROVENANCE_OR_FILTER);
    if (deleteExistingError) {
      throw new Error(deleteExistingError.message || "Failed clearing existing job steps before regeneration.");
    }
    clearedExistingRows = true;

    const insertedAt = nowIso();
    const stepPayload = steps.map((step) => ({
      company_id: companyId,
      user_id: userId,
      // Phase 2 Gate 1: both callers of this module (local-jobmap-synthesis,
      // run-mojo-analysis) are internal pipelines — their steps are mechanically
      // inadmissible to external prompt framing. Restore paths re-insert previously
      // selected rows, so original provenance round-trips untouched.
      provenance_type: "internal_derived",
      journey_key: normalizedKey,
      journey_title: journeyTitle,
      journey_subtitle: journeySubtitle,
      frameworks_used: frameworksUsed,
      step_number: step.step_number,
      step_label: step.step_label,
      description: step.description,
      designed: step.designed,
      has_gap: step.has_gap,
      evidence_status: step.evidence_status,
      evidence_basis: step.evidence_basis || `${sourceLabel}:${insertedAt.slice(0, 10)}`,
      evidence_confidence: Number.isFinite(step.evidence_confidence) ? step.evidence_confidence : 40,
      gap_note: step.has_gap ? String(step.gap_note || "").trim() : "",
      dependency_state: "fresh",
      validation_state: "unvalidated",
      evidence_state: step.evidence_status === "evidenced" ? "sufficient" : step.evidence_status === "implied" ? "partial" : "thin",
      stale_reason: null,
      stale_since_event_id: null,
      last_reviewed_at: null,
      source_run_id: sourceRunId,
      updated_at: insertedAt,
    }));

    let insertResult = await supabase.from("job_steps").insert(stepPayload).select("*");
    if (insertResult.error) {
      const message = insertResult.error.message || "";
      if (isJobStepEvidenceColumnError(message) || message.toLowerCase().includes("dependency_state") || message.toLowerCase().includes("source_run_id")) {
        const legacyPayload = stepPayload.map(({ evidence_status, evidence_basis, evidence_confidence, dependency_state, validation_state, evidence_state, stale_reason, stale_since_event_id, last_reviewed_at, source_run_id, updated_at, ...rest }) => rest);
        insertResult = await supabase.from("job_steps").insert(legacyPayload).select("*");
      }
    }
    if (insertResult.error) throw new Error(insertResult.error.message || "Failed inserting regenerated job steps.");
    insertedRows = ((insertResult.data ?? []) as Record<string, unknown>[]);

    const previousByKey = new Map(existingRows.map((row) => [semanticJobStepKey(row), row]));
    const insertedByKey = new Map(insertedRows.map((row) => [semanticJobStepKey(row), row]));

    const stepEventPayloads = [] as Array<{
      company_id: string;
      event_type: "created" | "updated" | "deleted" | "refreshed";
      actor_type: StrategicActorType;
      actor_id: string | null;
      source_run_id: string | null;
      object_type: "job_step";
      object_id: string;
      previous_value: Record<string, unknown> | null;
      new_value: Record<string, unknown> | null;
      reason: string;
    }>;

    for (const insertedRow of insertedRows) {
      const key = semanticJobStepKey(insertedRow);
      const previousRow = previousByKey.get(key);
      const normalizedStep = steps.find((step) => semanticJobStepKey({ journey_key: normalizedKey, step_number: step.step_number }) === key);
      const changed = normalizedStep ? jobStepChanged(previousRow, normalizedStep) : true;
      stepEventPayloads.push({
        company_id: companyId,
        event_type: previousRow ? (changed ? "updated" : "refreshed") : "created",
        actor_type: actorType,
        actor_id: actorId,
        source_run_id: sourceRunId,
        object_type: "job_step",
        object_id: String(insertedRow.id || ""),
        previous_value: previousRow ?? null,
        new_value: insertedRow,
        reason: previousRow ? (changed ? "Job step changed during ODI job map regeneration" : "Job step was refreshed during ODI job map regeneration") : "Job step created during ODI job map regeneration",
      });
    }

    for (const previousRow of existingRows) {
      const key = semanticJobStepKey(previousRow);
      if (insertedByKey.has(key)) continue;
      stepEventPayloads.push({
        company_id: companyId,
        event_type: "deleted",
        actor_type: actorType,
        actor_id: actorId,
        source_run_id: sourceRunId,
        object_type: "job_step",
        object_id: String(previousRow.id || ""),
        previous_value: previousRow,
        new_value: null,
        reason: "Job step removed during ODI job map regeneration",
      });
    }

    await recordBulkArtifactEvents(supabase, stepEventPayloads);

    const { data: claimRows, error: claimRowsError } = await supabase
      .from("claims")
      .select("id, statement, topic, claim_type, triangulation_state")
      .eq("company_id", companyId)
      .limit(500);
    if (claimRowsError) throw new Error(claimRowsError.message || "Failed to load claims for dependency rebuild.");
    const claims = (claimRows ?? []) as Array<Record<string, unknown>>;

    const { data: needRows, error: needRowsError } = await supabase
      .from("odi_needs")
      .select("id, desired_outcome, journey_key, step_number")
      .eq("company_id", companyId)
      .eq("journey_key", normalizedKey);
    if (needRowsError) throw new Error(needRowsError.message || "Failed to load ODI needs for dependency rebuild.");
    const needs = (needRows ?? []) as Array<Record<string, unknown>>;

    const dependencyMap = new Map<string, DependencyTarget>();
    for (const claim of claims) {
      const claimId = String(claim.id || "");
      if (!claimId) continue;

      const scoredSteps = insertedRows
        .map((stepRow) => ({
          stepRow,
          score: scoreClaimToJobStepMatch(
            {
              statement: String(claim.statement || ""),
              topic: String(claim.topic || ""),
              claim_type: String(claim.claim_type || "") as ClaimDraft["claim_type"],
              triangulation_state: String(claim.triangulation_state || "") as ClaimDraft["triangulation_state"],
            },
            {
              step_label: String(stepRow.step_label || ""),
              description: String(stepRow.description || ""),
            },
          ),
        }))
        .filter((entry) => entry.score > 0)
        .sort((a, b) => b.score - a.score);

      if (scoredSteps.length > 0) {
        const topScore = scoredSteps[0].score;
        const selectedSteps =
          topScore >= 2
            ? scoredSteps.filter((entry) => entry.score >= topScore - 1).slice(0, 2)
            : scoredSteps.slice(0, 1);

        for (const entry of selectedSteps) {
          const stepId = String(entry.stepRow.id || "");
          if (!stepId) continue;
          const dependencyType = String(claim.triangulation_state || "").trim().toLowerCase() === "contradicted" ? "contradicts" : "supports";
          const key = `claim:${claimId}->job_step:${stepId}`;
          dependencyMap.set(key, {
            upstream_object_type: "claim",
            upstream_object_id: claimId,
            downstream_object_type: "job_step",
            downstream_object_id: stepId,
            dependency_type: dependencyType as DependencyType,
            strength: dependencyType === "contradicts" ? "low" : matchStrengthFromScore(entry.score),
          });
        }
      }
    }

    for (const stepRow of insertedRows) {
      const stepId = String(stepRow.id || "");
      for (const need of needs) {
        if (Number(need.step_number || 0) !== Number(stepRow.step_number || 0)) continue;
        const needId = String(need.id || "");
        if (!needId) continue;
        const key = `job_step:${stepId}->odi_need:${needId}`;
        dependencyMap.set(key, {
          upstream_object_type: "job_step",
          upstream_object_id: stepId,
          downstream_object_type: "odi_need",
          downstream_object_id: needId,
          dependency_type: "derives",
          strength: "high",
        });
      }
    }

    const currentArtifactIds = [...new Set([...existingStepIds, ...insertedRows.map((row) => String(row.id || "")).filter(Boolean)])];
    const dependencyPayload = [...dependencyMap.values()];
    await upsertDependenciesForArtifact(
      supabase,
      companyId,
      { objectType: "job_step", objectIds: currentArtifactIds },
      dependencyPayload,
    );

    await clearStalenessIfResolved(supabase, {
      companyId,
      objectType: "job_step",
      objectIds: insertedRows.map((row) => String(row.id || "")).filter(Boolean),
      staleReason: "Job map was regenerated",
    });

    const affectedNeedIds = [...new Set(
      dependencyPayload
        .filter((dependency) => dependency.upstream_object_type === "job_step" && dependency.downstream_object_type === "odi_need")
        .map((dependency) => dependency.downstream_object_id)
        .filter(Boolean),
    )];

    const affected = await markDependentsNeedsReview(supabase, {
      companyId,
      dependentIdsByType: {
        odi_need: affectedNeedIds,
      },
      sourceEventId: String(regenerationEvent.id || ""),
      sourceRunId,
      reason: "Job map was regenerated",
      actorType,
    });

    return {
      regenerationEventId: String(regenerationEvent.id || ""),
      affectedArtifactCount: affected.length,
      dependencyCount: dependencyPayload.length,
      stepEventCount: stepEventPayloads.length,
      insertedStepCount: insertedRows.length,
    } satisfies JobMapRegenerationResult;
  } catch (error) {
    if (clearedExistingRows) {
      await restoreJobStepsForJourney(supabase, companyId, normalizedKey, existingRows);
      const currentArtifactIds = [...new Set([...existingStepIds, ...insertedRows.map((row) => String(row.id || "")).filter(Boolean)])];
      if (currentArtifactIds.length > 0) {
        await upsertDependenciesForArtifact(
          supabase,
          companyId,
          { objectType: "job_step", objectIds: currentArtifactIds },
          previousDependencies,
        );
      }
    }
    throw error;
  }
}
