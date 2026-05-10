import type { Claim } from "../../../src/lib/evidenceDomain.ts";
import {
  buildStrategicHypothesisCandidates,
  matchReframedHypothesis,
} from "../../../src/lib/strategicHypothesisMappers.ts";
import {
  buildConservativeRouteHypothesisLinks,
  type RouteHypothesisLike,
  type RouteHypothesisRouteLike,
  type RouteHypothesisSupportShape,
} from "../../../src/lib/routeHypothesisLinking.ts";
import type {
  StrategicHypothesis,
  StrategicHypothesisCandidate,
  StrategicHypothesisDraft,
} from "../../../src/lib/strategicHypothesisDomain.ts";
import { recordStrategicEvent, upsertDependenciesForArtifact } from "./strategicGraph.ts";

type SupabaseClientLike = {
  from: (table: string) => {
    insert: (values: unknown) => any;
    select: (columns?: string) => {
      eq: (column: string, value: unknown) => any;
      in: (column: string, values: unknown[]) => any;
      order?: (column: string, opts?: { ascending?: boolean }) => any;
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

type DependencyTarget = {
  upstream_object_type: "claim";
  upstream_object_id: string;
  downstream_object_type: "strategic_hypothesis";
  downstream_object_id: string;
  dependency_type: "supports" | "contradicts";
  strength: "high" | "medium" | "low";
};

type RouteDependencyTarget = {
  upstream_object_type: "strategic_hypothesis";
  upstream_object_id: string;
  downstream_object_type: "route";
  downstream_object_id: string;
  dependency_type: "supports" | "constrains" | "assumes" | "contradicts";
  strength: "high" | "medium" | "low";
};

function nowIso() {
  return new Date().toISOString();
}

function hypothesisChanged(existing: StrategicHypothesis, next: StrategicHypothesisDraft) {
  return (
    existing.statement !== next.statement ||
    existing.hypothesis_kind !== next.hypothesis_kind ||
    existing.hypothesis_state !== next.hypothesis_state ||
    existing.topic !== next.topic ||
    existing.confidence !== next.confidence ||
    existing.validation_state !== next.validation_state ||
    JSON.stringify(existing.what_must_be_true || []) !== JSON.stringify(next.what_must_be_true || []) ||
    existing.source_run_id !== next.source_run_id ||
    existing.is_active !== next.is_active ||
    JSON.stringify(existing.raw_payload || {}) !== JSON.stringify(next.raw_payload || {}) ||
    existing.reframed_from_hypothesis_id !== next.reframed_from_hypothesis_id
  );
}

function normalizeInsert(hypothesis: StrategicHypothesisDraft) {
  return {
    company_id: hypothesis.company_id,
    hypothesis_key: hypothesis.hypothesis_key,
    statement: hypothesis.statement,
    hypothesis_kind: hypothesis.hypothesis_kind,
    hypothesis_state: hypothesis.hypothesis_state,
    topic: hypothesis.topic,
    confidence: hypothesis.confidence,
    validation_state: hypothesis.validation_state,
    what_must_be_true: hypothesis.what_must_be_true,
    source_run_id: hypothesis.source_run_id,
    reframed_from_hypothesis_id: hypothesis.reframed_from_hypothesis_id,
    is_active: hypothesis.is_active,
    raw_payload: hypothesis.raw_payload ?? {},
    updated_at: nowIso(),
  };
}

function dependencyStrengthFromCounts(claim: Pick<Claim, "outside_support_count" | "organization_support_count" | "customer_support_count">) {
  const total = (claim.outside_support_count ?? 0) + (claim.organization_support_count ?? 0) + (claim.customer_support_count ?? 0);
  if ((claim.customer_support_count ?? 0) > 0 || total >= 3) return "high" as const;
  if (total >= 2) return "medium" as const;
  return "low" as const;
}

function emptySupportShape(): RouteHypothesisSupportShape {
  return { outside: 0, organization: 0, customer: 0 };
}

function addSupportShape(target: RouteHypothesisSupportShape, claim: Pick<Claim, "outside_support_count" | "organization_support_count" | "customer_support_count">) {
  target.outside += claim.outside_support_count ?? 0;
  target.organization += claim.organization_support_count ?? 0;
  target.customer += claim.customer_support_count ?? 0;
  return target;
}

export async function rebuildStrategicHypothesesForCompany(args: {
  supabase: SupabaseClientLike;
  companyId: string;
  sourceRunId?: string | null;
}) {
  const { supabase, companyId, sourceRunId = null } = args;

  const [claimsRes, existingRes] = await Promise.all([
    supabase
      .from("claims")
      .select("*")
      .eq("company_id", companyId)
      .limit(1000),
    supabase
      .from("strategic_hypotheses")
      .select("*")
      .eq("company_id", companyId)
      .limit(1000),
  ]);

  if (claimsRes.error) throw new Error(`Failed to load claims for hypothesis rebuild: ${claimsRes.error.message}`);
  if (existingRes.error) throw new Error(`Failed to load existing hypotheses: ${existingRes.error.message}`);

  const claims = (claimsRes.data ?? []) as Claim[];
  const candidates = buildStrategicHypothesisCandidates(companyId, claims).map((candidate) => ({
    ...candidate,
    hypothesis: {
      ...candidate.hypothesis,
      source_run_id: sourceRunId,
    },
  }));
  const claimsById = new Map(claims.map((claim) => [claim.id, claim]));
  const existing = (existingRes.data ?? []) as StrategicHypothesis[];
  const existingByKey = new Map(existing.map((row) => [row.hypothesis_key, row]));
  const activeUnmatched = new Map(existing.filter((row) => row.is_active).map((row) => [row.id, row]));
  const processedHypothesisIds = new Set<string>();
  const dependencyPayload: DependencyTarget[] = [];

  for (const candidate of candidates) {
    const matched = existingByKey.get(candidate.hypothesis.hypothesis_key);
    if (matched) {
      activeUnmatched.delete(matched.id);
      const nextDraft: StrategicHypothesisDraft = {
        ...candidate.hypothesis,
        reframed_from_hypothesis_id: matched.reframed_from_hypothesis_id,
        is_active: true,
      };
      const changed = hypothesisChanged(matched, nextDraft);
      if (changed || !matched.is_active) {
        const patch = normalizeInsert(nextDraft);
        const { error: updateError } = await supabase
          .from("strategic_hypotheses")
          .update(patch)
          .eq("company_id", companyId)
          .eq("id", matched.id);
        if (updateError) throw new Error(`Failed updating hypothesis: ${updateError.message}`);
        await recordStrategicEvent(supabase, {
          company_id: companyId,
          event_type: matched.is_active ? "updated" : "restored",
          actor_type: "system",
          actor_id: null,
          source_run_id: sourceRunId,
          object_type: "strategic_hypothesis",
          object_id: matched.id,
          previous_value: matched as unknown as Record<string, unknown>,
          new_value: patch,
          reason: matched.is_active ? "Strategic hypothesis refreshed from current evidence" : "Strategic hypothesis restored from current evidence",
        });
      }
      processedHypothesisIds.add(matched.id);
      for (const claimId of candidate.supportingClaimIds) {
        const claim = claimsById.get(claimId);
        if (!claim) continue;
        dependencyPayload.push({
          upstream_object_type: "claim",
          upstream_object_id: claimId,
          downstream_object_type: "strategic_hypothesis",
          downstream_object_id: matched.id,
          dependency_type: "supports",
          strength: dependencyStrengthFromCounts(claim),
        });
      }
      for (const claimId of candidate.weakeningClaimIds) {
        dependencyPayload.push({
          upstream_object_type: "claim",
          upstream_object_id: claimId,
          downstream_object_type: "strategic_hypothesis",
          downstream_object_id: matched.id,
          dependency_type: "contradicts",
          strength: "medium",
        });
      }
      continue;
    }

    let reframedFrom: StrategicHypothesis | null = null;
    for (const row of activeUnmatched.values()) {
      const score = matchReframedHypothesis(row, candidate.hypothesis);
      if (score >= 3) {
        reframedFrom = row;
        break;
      }
    }

    if (reframedFrom) {
      activeUnmatched.delete(reframedFrom.id);
      processedHypothesisIds.add(reframedFrom.id);
      const { error: reframeError } = await supabase
        .from("strategic_hypotheses")
        .update({
          hypothesis_state: "reframed",
          is_active: false,
          updated_at: nowIso(),
        })
        .eq("company_id", companyId)
        .eq("id", reframedFrom.id);
      if (reframeError) throw new Error(`Failed marking hypothesis reframed: ${reframeError.message}`);
      await recordStrategicEvent(supabase, {
        company_id: companyId,
        event_type: "updated",
        actor_type: "system",
        actor_id: null,
        source_run_id: sourceRunId,
        object_type: "strategic_hypothesis",
        object_id: reframedFrom.id,
        previous_value: reframedFrom as unknown as Record<string, unknown>,
        new_value: { hypothesis_state: "reframed", is_active: false },
        reason: "Strategic hypothesis was reframed by a newer directional read",
      });
    }

    const insertPayload = normalizeInsert({
      ...candidate.hypothesis,
      reframed_from_hypothesis_id: reframedFrom?.id ?? null,
      is_active: true,
    });
    const { data: inserted, error: insertError } = await supabase
      .from("strategic_hypotheses")
      .insert(insertPayload)
      .select("*")
      .single();
    if (insertError) throw new Error(`Failed inserting strategic hypothesis: ${insertError.message}`);

    const insertedId = String((inserted as Record<string, unknown>)?.id || "").trim();
    if (!insertedId) throw new Error("Inserted strategic hypothesis is missing id.");
    processedHypothesisIds.add(insertedId);
    await recordStrategicEvent(supabase, {
      company_id: companyId,
      event_type: "created",
      actor_type: "system",
      actor_id: null,
      source_run_id: sourceRunId,
      object_type: "strategic_hypothesis",
      object_id: insertedId,
      previous_value: null,
      new_value: insertPayload,
      reason: "Strategic hypothesis created from current outside-view evidence",
    });

    for (const claimId of candidate.supportingClaimIds) {
      const claim = claimsById.get(claimId);
      if (!claim) continue;
      dependencyPayload.push({
        upstream_object_type: "claim",
        upstream_object_id: claimId,
        downstream_object_type: "strategic_hypothesis",
        downstream_object_id: insertedId,
        dependency_type: "supports",
        strength: dependencyStrengthFromCounts(claim),
      });
    }
    for (const claimId of candidate.weakeningClaimIds) {
      dependencyPayload.push({
        upstream_object_type: "claim",
        upstream_object_id: claimId,
        downstream_object_type: "strategic_hypothesis",
        downstream_object_id: insertedId,
        dependency_type: "contradicts",
        strength: "medium",
      });
    }
  }

  for (const retired of activeUnmatched.values()) {
    processedHypothesisIds.add(retired.id);
    const { error: retireError } = await supabase
      .from("strategic_hypotheses")
      .update({
        hypothesis_state: "retired",
        is_active: false,
        updated_at: nowIso(),
      })
      .eq("company_id", companyId)
      .eq("id", retired.id);
    if (retireError) throw new Error(`Failed retiring hypothesis: ${retireError.message}`);
    await recordStrategicEvent(supabase, {
      company_id: companyId,
      event_type: "updated",
      actor_type: "system",
      actor_id: null,
      source_run_id: sourceRunId,
      object_type: "strategic_hypothesis",
      object_id: retired.id,
      previous_value: retired as unknown as Record<string, unknown>,
      new_value: { hypothesis_state: "retired", is_active: false },
      reason: "Strategic hypothesis retired because current evidence no longer regenerates it",
    });
  }

  await upsertDependenciesForArtifact(
    supabase,
    companyId,
    { objectType: "strategic_hypothesis", objectIds: [...processedHypothesisIds] },
    dependencyPayload,
  );

  return {
    hypothesisCount: processedHypothesisIds.size,
    dependencyCount: dependencyPayload.length,
    candidateCount: candidates.length,
  };
}

export async function rebuildRouteHypothesisDependencies(args: {
  supabase: SupabaseClientLike;
  companyId: string;
}) {
  const { supabase, companyId } = args;

  const [hypothesesRes, depsRes] = await Promise.all([
    supabase
      .from("strategic_hypotheses")
      .select("id, statement, hypothesis_kind, hypothesis_state, topic, confidence, what_must_be_true, is_active")
      .eq("company_id", companyId)
      .eq("is_active", true)
      .limit(300),
    supabase
      .from("object_dependencies")
      .select("upstream_object_id, downstream_object_id, dependency_type")
      .eq("company_id", companyId)
      .eq("upstream_object_type", "claim")
      .eq("downstream_object_type", "strategic_hypothesis")
      .limit(1000),
  ]);

  if (hypothesesRes.error) throw new Error(`Failed loading hypotheses for route dependency rebuild: ${hypothesesRes.error.message}`);
  if (depsRes.error) throw new Error(`Failed loading hypothesis claim dependencies for route dependency rebuild: ${depsRes.error.message}`);

  let routesRes = await supabase
    .from("routes")
    .select("id, category, title, short_description, why_this_matters_json, assumptions_json")
    .eq("company_id", companyId)
    .limit(300);
  if (routesRes.error && String(routesRes.error.message || "").toLowerCase().includes("assumptions_json")) {
    routesRes = await supabase
      .from("routes")
      .select("id, category, title, short_description, why_this_matters_json")
      .eq("company_id", companyId)
      .limit(300);
    if (!routesRes.error) {
      routesRes.data = ((routesRes.data ?? []) as Array<Record<string, unknown>>).map((row) => ({
        ...row,
        assumptions_json: null,
      }));
    }
  }
  if (routesRes.error) throw new Error(`Failed loading routes for route dependency rebuild: ${routesRes.error.message}`);

  const hypotheses = (hypothesesRes.data ?? []) as RouteHypothesisLike[];
  const routes = (routesRes.data ?? []) as RouteHypothesisRouteLike[];
  const claimDeps = (depsRes.data ?? []) as Array<{
    upstream_object_id: string;
    downstream_object_id: string;
    dependency_type: string;
  }>;

  const routeIds = routes.map((route) => String(route.id || "")).filter(Boolean);
  if (routeIds.length === 0) {
    return {
      routeCount: 0,
      routeDependencyCount: 0,
      graphLinkedRouteCount: 0,
    };
  }

  const claimIds = [...new Set(claimDeps.map((dep) => String(dep.upstream_object_id || "")).filter(Boolean))];
  const claimMap = new Map<string, Pick<Claim, "id" | "outside_support_count" | "organization_support_count" | "customer_support_count">>();

  if (claimIds.length > 0) {
    const claimsRes = await supabase
      .from("claims")
      .select("id, outside_support_count, organization_support_count, customer_support_count")
      .eq("company_id", companyId)
      .in("id", claimIds);
    if (claimsRes.error) throw new Error(`Failed loading claims for route dependency rebuild: ${claimsRes.error.message}`);
    for (const row of (claimsRes.data ?? []) as Array<Pick<Claim, "id" | "outside_support_count" | "organization_support_count" | "customer_support_count">>) {
      claimMap.set(row.id, row);
    }
  }

  const supportShapeByHypothesisId = new Map<string, RouteHypothesisSupportShape>();
  const contradictionByHypothesisId = new Map<string, boolean>();
  for (const dep of claimDeps) {
    const hypothesisId = String(dep.downstream_object_id || "");
    const claim = claimMap.get(String(dep.upstream_object_id || ""));
    if (!hypothesisId || !claim) continue;
    if (!supportShapeByHypothesisId.has(hypothesisId)) supportShapeByHypothesisId.set(hypothesisId, emptySupportShape());
    if (dep.dependency_type === "supports") {
      addSupportShape(supportShapeByHypothesisId.get(hypothesisId)!, claim);
    }
    if (dep.dependency_type === "contradicts") {
      contradictionByHypothesisId.set(hypothesisId, true);
    }
  }

  const matches = buildConservativeRouteHypothesisLinks({
    routes,
    hypotheses: hypotheses.map((hypothesis) => ({
      hypothesis,
      supportShape: supportShapeByHypothesisId.get(hypothesis.id) ?? emptySupportShape(),
      hasContradiction: contradictionByHypothesisId.get(hypothesis.id) ?? hypothesis.hypothesis_state === "contradicted",
    })),
  });

  const dependencyPayload: RouteDependencyTarget[] = matches.map((match) => ({
    upstream_object_type: "strategic_hypothesis",
    upstream_object_id: match.hypothesisId,
    downstream_object_type: "route",
    downstream_object_id: match.routeId,
    dependency_type: match.dependencyType,
    strength: match.strength,
  }));

  await upsertDependenciesForArtifact(
    supabase,
    companyId,
    { objectType: "route", objectIds: routeIds },
    dependencyPayload,
    {
      deleteScope: {
        downstreamUpstreamObjectTypes: ["strategic_hypothesis"],
        upstreamDownstreamObjectTypes: ["strategic_hypothesis"],
      },
    },
  );

  return {
    routeCount: routeIds.length,
    routeDependencyCount: dependencyPayload.length,
    graphLinkedRouteCount: new Set(dependencyPayload.map((dep) => dep.downstream_object_id)).size,
  };
}
