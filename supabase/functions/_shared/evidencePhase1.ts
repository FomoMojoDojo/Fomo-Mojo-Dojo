import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import type { ClaimCandidate, ClaimDraft, ClaimSignalRefDraft, SignalDraft } from "../../../src/lib/evidenceDomain.ts";
import { inferClaimState } from "../../../src/lib/claimState/migration/inferState.ts";
import {
  matchStrengthFromScore,
  mapDifyFileOutputToSignals,
  mapPublicBaselineOutputToSignals,
  mapSignalsToClaimCandidates,
  scoreClaimToJobStepMatch,
  scoreClaimToNeedMatch,
} from "../../../src/lib/evidenceMappers.ts";
import { upsertDependenciesForArtifact } from "./strategicGraph.ts";
import {
  rebuildRouteHypothesisDependencies,
  rebuildStrategicHypothesesForCompany,
} from "./strategicHypotheses.ts";
import { inferJourneyHypothesesForCompany } from "./journeyHypotheses.ts";

type SupabaseClient = ReturnType<typeof createClient>;

type DependencyTarget = {
  upstream_object_type: string;
  upstream_object_id: string;
  downstream_object_type: string;
  downstream_object_id: string;
  dependency_type: "supports" | "derives" | "contradicts";
  strength: "high" | "medium" | "low";
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function normalizeSignalInsert(signal: SignalDraft) {
  return {
    company_id: signal.company_id,
    source_id: signal.source_id,
    source_type: signal.source_type,
    source_title: signal.source_title,
    source_url: signal.source_url,
    signal_band: signal.signal_band,
    evidence_type: signal.evidence_type,
    claim_text: signal.claim_text,
    evidence_excerpt: signal.evidence_excerpt,
    topic: signal.topic,
    framework: signal.framework,
    directness: signal.directness,
    recency: signal.recency,
    framing_fit: signal.framing_fit,
    structure_level: signal.structure_level,
    validation_status: signal.validation_status,
    confidence_to_use: signal.confidence_to_use,
    raw_payload: signal.raw_payload ?? {},
  };
}

function normalizeClaimInsert(claim: ClaimDraft) {
  return {
    company_id: claim.company_id,
    statement: claim.statement,
    topic: claim.topic,
    claim_type: claim.claim_type,
    outside_support_count: claim.outside_support_count,
    organization_support_count: claim.organization_support_count,
    customer_support_count: claim.customer_support_count,
    triangulation_state: claim.triangulation_state,
    confidence: claim.confidence,
    revalidation_flag: claim.revalidation_flag,
    raw_payload: claim.raw_payload ?? {},
  };
}

function normalizeTopic(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

async function rebuildClaimsForCompany(supabase: SupabaseClient, companyId: string) {
  const { data: signalRows, error: signalError } = await supabase
    .from("signals")
    .select("*")
    .eq("company_id", companyId)
    .order("created_at", { ascending: true });

  if (signalError) throw new Error(`Failed to load signals for claim rebuild: ${signalError.message}`);

  const signals = Array.isArray(signalRows) ? signalRows : [];
  const candidates = mapSignalsToClaimCandidates(companyId, signals as Array<SignalDraft & { id?: string }>);

  const { error: deleteRefsError } = await supabase.from("claim_signal_refs").delete().eq("company_id", companyId);
  if (deleteRefsError) throw new Error(`Failed clearing claim refs: ${deleteRefsError.message}`);
  // Preserve claims whose raw_payload.source matches 'manual_%' — they were
  // hand-approved and must survive the signal rebuild.
  const { data: manualClaimRows } = await supabase
    .from("claims")
    .select("id")
    .eq("company_id", companyId)
    .filter("raw_payload->>source", "like", "manual_%");
  const manualClaimIds = (manualClaimRows || []).map((r: { id?: string }) => String(r.id || "")).filter(Boolean);

  const claimsDeleteQuery = supabase.from("claims").delete().eq("company_id", companyId);
  const { error: deleteClaimsError } = manualClaimIds.length > 0
    ? await claimsDeleteQuery.not("id", "in", `(${manualClaimIds.join(",")})`)
    : await claimsDeleteQuery;
  if (deleteClaimsError) throw new Error(`Failed clearing claims: ${deleteClaimsError.message}`);

  if (candidates.length === 0) {
    return {
      signalCount: signals.length,
      claimCount: 0,
      refCount: 0,
    };
  }

  const claimPayloads = candidates.map((candidate) => normalizeClaimInsert(candidate.claim));
  const { data: insertedClaims, error: insertClaimsError } = await supabase
    .from("claims")
    .insert(claimPayloads)
    .select("id, statement");

  if (insertClaimsError) throw new Error(`Failed inserting claims: ${insertClaimsError.message}`);

  const claimIdByStatement = new Map<string, string>();
  for (const row of Array.isArray(insertedClaims) ? insertedClaims : []) {
    const record = asRecord(row);
    const id = String(record?.id ?? "").trim();
    const statement = String(record?.statement ?? "").trim();
    if (id && statement) claimIdByStatement.set(statement, id);
  }

  const refPayloads: ClaimSignalRefDraft[] = [];
  candidates.forEach((candidate) => {
    const claimId = claimIdByStatement.get(candidate.claim.statement);
    if (!claimId) return;
    candidate.sourceSignals.forEach((ref) => {
      const signal = signals[ref.signalIndex] as Record<string, unknown> | undefined;
      const signalId = String(signal?.id ?? "").trim();
      if (!signalId) return;
      refPayloads.push({
        company_id: companyId,
        claim_id: claimId,
        signal_id: signalId,
        relationship: ref.relationship,
      });
    });
  });

  if (refPayloads.length > 0) {
    const { error: refInsertError } = await supabase
      .from("claim_signal_refs")
      .insert(refPayloads);
    if (refInsertError) throw new Error(`Failed inserting claim refs: ${refInsertError.message}`);
  }

  // Derive claim state from backing signals — single source of truth via inferClaimState.
  // Omit linkedRoute/linkedOdiNeed/positioningCanvas: those drive focus/flow states that
  // are set by separate flows (ODI scoring, route linkage). Only signal-driven states here.
  const stateByValue = new Map<string, string[]>();
  for (const candidate of candidates) {
    const claimId = claimIdByStatement.get(candidate.claim.statement);
    if (!claimId) continue;

    const signalRefs = candidate.sourceSignals
      .map((ref) => {
        const sig = signals[ref.signalIndex] as Record<string, unknown> | undefined;
        if (!sig) return null;
        return {
          relationship: String(ref.relationship),
          signal_band: String(sig.signal_band ?? "") as "outside" | "organization" | "customer",
          directness: sig.directness as "direct" | "inferred" | "weak" | undefined,
          structure_level: sig.structure_level as "raw" | "extracted" | "interpreted" | undefined,
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);

    const inferred = inferClaimState({
      claimType: candidate.claim.claim_type,
      signalRefs,
      linkedRoute: null,
      linkedOdiNeed: null,
      positioningCanvas: null,
    });

    if (inferred !== "outside_view") {
      if (!stateByValue.has(inferred)) stateByValue.set(inferred, []);
      stateByValue.get(inferred)!.push(claimId);
    }
  }

  for (const [state, ids] of stateByValue) {
    const { error: stateUpdateError } = await supabase
      .from("claims")
      .update({ state })
      .in("id", ids);
    if (stateUpdateError) throw new Error(`Failed updating claim state to '${state}': ${stateUpdateError.message}`);
  }

  return {
    signalCount: signals.length,
    claimCount: claimPayloads.length,
    refCount: refPayloads.length,
  };
}

async function rebuildFoundationDependenciesForCompany(supabase: SupabaseClient, companyId: string) {
  const [claimsRes, jobStepsRes, needsRes] = await Promise.all([
    supabase
      .from("claims")
      .select("id, statement, topic, claim_type, triangulation_state")
      .eq("company_id", companyId)
      .limit(1000),
    supabase
      .from("job_steps")
      .select("id, journey_key, step_number, step_label, description")
      .eq("company_id", companyId)
      .limit(1000),
    supabase
      .from("odi_needs")
      .select("id, journey_key, step_number, desired_outcome")
      .eq("company_id", companyId)
      .limit(1000),
  ]);

  if (claimsRes.error) throw new Error(`Failed loading claims for dependency rebuild: ${claimsRes.error.message}`);
  if (jobStepsRes.error) throw new Error(`Failed loading job steps for dependency rebuild: ${jobStepsRes.error.message}`);
  if (needsRes.error) throw new Error(`Failed loading ODI needs for dependency rebuild: ${needsRes.error.message}`);

  const claims = Array.isArray(claimsRes.data) ? claimsRes.data : [];
  const jobSteps = Array.isArray(jobStepsRes.data) ? jobStepsRes.data : [];
  const needs = Array.isArray(needsRes.data) ? needsRes.data : [];

  const jobStepIds = jobSteps.map((row) => String(row.id || "")).filter(Boolean);
  const needIds = needs.map((row) => String(row.id || "")).filter(Boolean);

  const stepDependencies = new Map<string, DependencyTarget>();
  const needDependencies = new Map<string, DependencyTarget>();

  for (const claim of claims) {
    const claimId = String(claim.id || "");
    if (!claimId) continue;

    const scoredSteps = jobSteps
      .map((step) => ({
        step,
        score: scoreClaimToJobStepMatch(
          {
            statement: String(claim.statement || ""),
            topic: String(claim.topic || ""),
            claim_type: String(claim.claim_type || "") as ClaimDraft["claim_type"],
            triangulation_state: String(claim.triangulation_state || "") as ClaimDraft["triangulation_state"],
          },
          {
            step_label: String(step.step_label || ""),
            description: String(step.description || ""),
          },
        ),
      }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score);

    if (scoredSteps.length === 0) continue;

    const topScore = scoredSteps[0].score;
    const selectedSteps =
      topScore >= 2
        ? scoredSteps.filter((entry) => entry.score >= topScore - 1).slice(0, 2)
        : scoredSteps.slice(0, 1);

    for (const entry of selectedSteps) {
      const stepId = String(entry.step.id || "");
      if (!stepId) continue;
      const dependencyType = normalizeTopic(claim.triangulation_state) === "contradicted" ? "contradicts" : "supports";
      stepDependencies.set(`claim:${claimId}->job_step:${stepId}`, {
        upstream_object_type: "claim",
        upstream_object_id: claimId,
        downstream_object_type: "job_step",
        downstream_object_id: stepId,
        dependency_type: dependencyType,
        strength: dependencyType === "contradicts" ? "low" : matchStrengthFromScore(entry.score),
      });
    }
  }

  for (const need of needs) {
    const needId = String(need.id || "");
    if (!needId) continue;
    const needText = String(need.desired_outcome || "").trim();
    const needJourneyKey = String(need.journey_key || "").trim().toLowerCase();
    const needStepNumber = Number(need.step_number || 0);

    for (const step of jobSteps) {
      const stepId = String(step.id || "");
      if (!stepId) continue;
      if (String(step.journey_key || "").trim().toLowerCase() !== needJourneyKey) continue;
      if (Number(step.step_number || 0) !== needStepNumber) continue;
      needDependencies.set(`job_step:${stepId}->odi_need:${needId}`, {
        upstream_object_type: "job_step",
        upstream_object_id: stepId,
        downstream_object_type: "odi_need",
        downstream_object_id: needId,
        dependency_type: "derives",
        strength: "high",
      });
    }

  }

  for (const claim of claims) {
    const claimId = String(claim.id || "");
    if (!claimId) continue;

    const scoredNeeds = needs
      .map((need) => ({
        need,
        score: scoreClaimToNeedMatch(
          {
            statement: String(claim.statement || ""),
            topic: String(claim.topic || ""),
            claim_type: String(claim.claim_type || "") as ClaimDraft["claim_type"],
            triangulation_state: String(claim.triangulation_state || "") as ClaimDraft["triangulation_state"],
          },
          {
            desired_outcome: String(need.desired_outcome || ""),
          },
        ),
      }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score);

    if (scoredNeeds.length === 0) continue;

    const selectedNeed = scoredNeeds[0];
    const needId = String(selectedNeed.need.id || "");
    if (!needId) continue;
    const dependencyType = normalizeTopic(claim.triangulation_state) === "contradicted" ? "contradicts" : "supports";
    needDependencies.set(`claim:${claimId}->odi_need:${needId}`, {
      upstream_object_type: "claim",
      upstream_object_id: claimId,
      downstream_object_type: "odi_need",
      downstream_object_id: needId,
      dependency_type: dependencyType,
      strength: dependencyType === "contradicts" ? "low" : matchStrengthFromScore(selectedNeed.score),
    });
  }

  await upsertDependenciesForArtifact(
    supabase,
    companyId,
    { objectType: "job_step", objectIds: jobStepIds },
    [...stepDependencies.values()],
  );

  await upsertDependenciesForArtifact(
    supabase,
    companyId,
    { objectType: "odi_need", objectIds: needIds },
    [...needDependencies.values()],
  );

  return {
    jobStepDependencyCount: stepDependencies.size,
    needDependencyCount: needDependencies.size,
  };
}

export async function persistSignalsAndRebuildClaims(args: {
  supabase: SupabaseClient;
  companyId: string;
  sourceId?: string | number | null;
  sourceType: string;
  signals: SignalDraft[];
}) {
  const { supabase, companyId, sourceId, sourceType, signals } = args;
  const normalizedSourceId = sourceId == null ? null : String(sourceId);

  if (signals.length === 0) {
    throw new Error(`Evidence ingestion produced zero signals for ${sourceType}${normalizedSourceId ? ` (${normalizedSourceId})` : ""}.`);
  }

  if (normalizedSourceId) {
    const { error: deleteExistingError } = await supabase
      .from("signals")
      .delete()
      .eq("company_id", companyId)
      .eq("source_type", sourceType)
      .eq("source_id", normalizedSourceId);
    if (deleteExistingError) {
      throw new Error(`Failed clearing existing signals: ${deleteExistingError.message}`);
    }
  }

  if (signals.length > 0) {
    const { error: insertSignalsError } = await supabase
      .from("signals")
      .insert(signals.map((signal) => normalizeSignalInsert(signal)));
    if (insertSignalsError) throw new Error(`Failed inserting signals: ${insertSignalsError.message}`);
  }

  const claimStats = await rebuildClaimsForCompany(supabase, companyId);
  const dependencyStats = await rebuildFoundationDependenciesForCompany(supabase, companyId);
  const hypothesisStats = await rebuildStrategicHypothesesForCompany({
    supabase,
    companyId,
    sourceRunId: normalizedSourceId,
  });
  const routeHypothesisStats = await rebuildRouteHypothesisDependencies({
    supabase,
    companyId,
  });
  return {
    signalCount: signals.length,
    ...claimStats,
    ...dependencyStats,
    ...hypothesisStats,
    ...routeHypothesisStats,
  };
}

export async function ingestPublicBaselineSignals(args: {
  supabase: SupabaseClient;
  companyId: string;
  runId: string | number;
  companyName?: string | null;
  website?: string | null;
  resultJson: unknown;
}) {
  const signals = mapPublicBaselineOutputToSignals({
    companyId: args.companyId,
    sourceId: args.runId,
    sourceTitle: args.companyName ? `${args.companyName} public baseline` : "Public baseline run",
    sourceUrl: args.website ?? null,
    resultJson: args.resultJson,
  });
  const stats = await persistSignalsAndRebuildClaims({
    supabase: args.supabase,
    companyId: args.companyId,
    sourceId: args.runId,
    sourceType: "public_baseline_run",
    signals,
  });
  const journeyStats = await inferJourneyHypothesesForCompany({
    supabase: args.supabase as any,
    companyId: args.companyId,
    resultJson: args.resultJson,
    sourceRunId: String(args.runId),
  });
  console.log(`[evidence] public baseline ingested company=${args.companyId} run=${args.runId} signals=${stats.signalCount} claims=${stats.claimCount} refs=${stats.refCount} stepDeps=${stats.jobStepDependencyCount} needDeps=${stats.needDependencyCount} hypotheses=${stats.hypothesisCount} hypothesisDeps=${stats.dependencyCount} routeHypothesisDeps=${stats.routeDependencyCount} graphLinkedRoutes=${stats.graphLinkedRouteCount} journeyHypotheses=${journeyStats.journeyCount}`);
  return { ...stats, ...journeyStats };
}

export async function ingestDifyProposalSignals(args: {
  supabase: SupabaseClient;
  companyId: string;
  proposalId: string;
  sourceType?: string | null;
  sourceTitle?: string | null;
  summary?: string | null;
  evidence?: unknown;
  contradictions?: unknown;
  frameworkResults?: unknown;
  questionsToVerify?: unknown;
  rawPayload?: unknown;
}) {
  const signals = mapDifyFileOutputToSignals({
    companyId: args.companyId,
    sourceId: args.proposalId,
    sourceType: args.sourceType ?? "file_proposal",
    sourceTitle: args.sourceTitle ?? "Dify proposal",
    summary: args.summary,
    evidence: args.evidence,
    contradictions: args.contradictions,
    frameworkResults: args.frameworkResults,
    questionsToVerify: args.questionsToVerify,
    rawPayload: args.rawPayload,
  });

  const stats = await persistSignalsAndRebuildClaims({
    supabase: args.supabase,
    companyId: args.companyId,
    sourceId: args.proposalId,
    sourceType: String(args.sourceType ?? "file_proposal"),
    signals,
  });
  console.log(`[evidence] dify proposal ingested company=${args.companyId} proposal=${args.proposalId} signals=${stats.signalCount} claims=${stats.claimCount} refs=${stats.refCount} stepDeps=${stats.jobStepDependencyCount} needDeps=${stats.needDependencyCount} hypotheses=${stats.hypothesisCount} hypothesisDeps=${stats.dependencyCount} routeHypothesisDeps=${stats.routeDependencyCount} graphLinkedRoutes=${stats.graphLinkedRouteCount}`);
  return stats;
}
