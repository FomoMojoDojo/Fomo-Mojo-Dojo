import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Claim, ClaimSignalRef, Signal } from "@/lib/evidenceDomain";
import { scoreClaimToNeedMatch } from "@/lib/evidenceMappers";

type FoundationObjectType = "job_step" | "odi_need";

type UpstreamStepSummary = {
  id: string;
  step_number: number | null;
  step_label: string | null;
};

type ClaimSignalDetail = {
  ref: ClaimSignalRef;
  signal: Signal | null;
};

export type FoundationClaimSupport = {
  claim: Claim;
  dependencyTypes: string[];
  supportShape: {
    outside: number;
    organization: number;
    customer: number;
  };
  contradictionCount: number;
  derivedTriangulationState: string;
  strongestSupportingSignal: Signal | null;
  supportingSignals: ClaimSignalDetail[];
  contradictorySignals: ClaimSignalDetail[];
  qualifyingSignals: ClaimSignalDetail[];
};

export type FoundationProvenance = {
  objectType: FoundationObjectType;
  objectId: string;
  claims: FoundationClaimSupport[];
  upstreamSteps: UpstreamStepSummary[];
  hasCustomerBackedClaims: boolean;
};

function confidenceWeight(value: string | null | undefined) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "high") return 3;
  if (normalized === "medium") return 2;
  return 1;
}

function bandWeight(value: string | null | undefined) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "customer") return 3;
  if (normalized === "organization") return 2;
  return 1;
}

function directnessWeight(value: string | null | undefined) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "direct") return 3;
  if (normalized === "inferred") return 2;
  return 1;
}

function chooseStrongestSupportingSignal(signals: Array<Signal | null>) {
  return [...signals]
    .filter((signal): signal is Signal => Boolean(signal))
    .sort((a, b) => {
      const scoreA = bandWeight(a.signal_band) * 100 + confidenceWeight(a.confidence_to_use) * 10 + directnessWeight(a.directness);
      const scoreB = bandWeight(b.signal_band) * 100 + confidenceWeight(b.confidence_to_use) * 10 + directnessWeight(b.directness);
      return scoreB - scoreA;
    })[0] ?? null;
}

function countSignalsByBand(details: ClaimSignalDetail[]) {
  const shape = {
    outside: 0,
    organization: 0,
    customer: 0,
  };
  for (const detail of details) {
    const band = String(detail.signal?.signal_band || "").trim().toLowerCase();
    if (band === "outside") shape.outside += 1;
    if (band === "organization") shape.organization += 1;
    if (band === "customer") shape.customer += 1;
  }
  return shape;
}

function deriveTriangulationState(args: {
  supportShape: { outside: number; organization: number; customer: number };
  contradictionCount: number;
}) {
  if (args.contradictionCount > 0) return "contradicted";
  if (args.supportShape.customer > 0) return "customer_backed";
  const activeBands = [args.supportShape.outside, args.supportShape.organization, args.supportShape.customer].filter((value) => value > 0).length;
  if (activeBands >= 2) return "multi_source";
  if (activeBands === 1) return "single_source";
  return "untested";
}

export function useFoundationProvenance(args: {
  companyId?: string;
  objectType: FoundationObjectType;
  objectId?: string | null;
  enabled?: boolean;
}) {
  const { companyId, objectType, objectId, enabled = true } = args;

  return useQuery({
    queryKey: ["foundation-provenance", companyId, objectType, objectId],
    enabled: Boolean(companyId && objectId && enabled),
    queryFn: async (): Promise<FoundationProvenance> => {
      if (!companyId || !objectId) {
        return {
          objectType,
          objectId: objectId || "",
          claims: [],
          upstreamSteps: [],
          hasCustomerBackedClaims: false,
        };
      }

      let needOutcomeText = "";
      if (objectType === "odi_need") {
        const needRes = await supabase
          .from("odi_needs")
          .select("desired_outcome")
          .eq("company_id", companyId)
          .eq("id", objectId)
          .maybeSingle();
        if (needRes.error) throw new Error(needRes.error.message || "Failed to load need context.");
        needOutcomeText = String(needRes.data?.desired_outcome || "");
      }

      const baseDepsRes = await supabase
        .from("object_dependencies")
        .select("*")
        .eq("company_id", companyId)
        .eq("downstream_object_type", objectType)
        .eq("downstream_object_id", objectId);
      if (baseDepsRes.error) throw new Error(baseDepsRes.error.message || "Failed to load object dependencies.");

      const baseDeps = (baseDepsRes.data ?? []) as Array<{
        upstream_object_type: string;
        upstream_object_id: string;
        dependency_type: string;
      }>;

      const upstreamSteps: UpstreamStepSummary[] = [];
      const directClaimDependencyMap = new Map<string, Set<string>>();
      const upstreamStepIds = new Set<string>();

      for (const dep of baseDeps) {
        if (dep.upstream_object_type === "claim") {
          if (!directClaimDependencyMap.has(dep.upstream_object_id)) directClaimDependencyMap.set(dep.upstream_object_id, new Set());
          directClaimDependencyMap.get(dep.upstream_object_id)!.add(dep.dependency_type);
        }
        if (objectType === "odi_need" && dep.upstream_object_type === "job_step") {
          upstreamStepIds.add(dep.upstream_object_id);
        }
      }

      let stepRows: Array<{ id: string; step_number: number | null; step_label: string | null }> = [];
      let stepClaimDeps: Array<{ upstream_object_id: string; downstream_object_id: string; dependency_type: string }> = [];

      if (upstreamStepIds.size > 0) {
        const [stepRowsRes, stepDepsRes] = await Promise.all([
          supabase
            .from("job_steps")
            .select("id, step_number, step_label")
            .eq("company_id", companyId)
            .in("id", [...upstreamStepIds]),
          supabase
            .from("object_dependencies")
            .select("upstream_object_id, downstream_object_id, dependency_type")
            .eq("company_id", companyId)
            .eq("downstream_object_type", "job_step")
            .eq("upstream_object_type", "claim")
            .in("downstream_object_id", [...upstreamStepIds]),
        ]);

        if (stepRowsRes.error) throw new Error(stepRowsRes.error.message || "Failed to load upstream job steps.");
        if (stepDepsRes.error) throw new Error(stepDepsRes.error.message || "Failed to load claim links for upstream job steps.");

        stepRows = (stepRowsRes.data ?? []) as typeof stepRows;
        stepClaimDeps = (stepDepsRes.data ?? []) as typeof stepClaimDeps;
        stepRows.forEach((row) => upstreamSteps.push(row));
      }

      const claimDependencyMap = new Map<string, Set<string>>();
      for (const [claimId, depTypes] of directClaimDependencyMap.entries()) {
        claimDependencyMap.set(claimId, new Set(depTypes));
      }
      for (const dep of stepClaimDeps) {
        if (!claimDependencyMap.has(dep.upstream_object_id)) claimDependencyMap.set(dep.upstream_object_id, new Set());
        claimDependencyMap.get(dep.upstream_object_id)!.add(dep.dependency_type);
      }

      const claimIds = [...claimDependencyMap.keys()];
      if (claimIds.length === 0) {
        return {
          objectType,
          objectId,
          claims: [],
          upstreamSteps,
          hasCustomerBackedClaims: false,
        };
      }

      const [claimsRes, refsRes] = await Promise.all([
        supabase
          .from("claims")
          .select("*")
          .eq("company_id", companyId)
          .in("id", claimIds),
        supabase
          .from("claim_signal_refs")
          .select("*")
          .eq("company_id", companyId)
          .in("claim_id", claimIds),
      ]);

      if (claimsRes.error) throw new Error(claimsRes.error.message || "Failed to load linked claims.");
      if (refsRes.error) throw new Error(refsRes.error.message || "Failed to load claim signal refs.");

      const claims = (claimsRes.data ?? []) as Claim[];
      const refs = (refsRes.data ?? []) as ClaimSignalRef[];
      const signalIds = [...new Set(refs.map((ref) => ref.signal_id).filter(Boolean))];

      let signals: Signal[] = [];
      if (signalIds.length > 0) {
        const signalsRes = await supabase
          .from("signals")
          .select("*")
          .eq("company_id", companyId)
          .in("id", signalIds);
        if (signalsRes.error) throw new Error(signalsRes.error.message || "Failed to load linked signals.");
        signals = (signalsRes.data ?? []) as Signal[];
      }

      const signalMap = new Map(signals.map((signal) => [signal.id, signal]));
      const refsByClaimId = new Map<string, ClaimSignalRef[]>();
      for (const ref of refs) {
        if (!refsByClaimId.has(ref.claim_id)) refsByClaimId.set(ref.claim_id, []);
        refsByClaimId.get(ref.claim_id)!.push(ref);
      }

      const supportedClaims: FoundationClaimSupport[] = claims
        .map((claim) => {
          const claimRefs = refsByClaimId.get(claim.id) ?? [];
          const supportingSignals = claimRefs
            .filter((ref) => ref.relationship === "supports")
            .map((ref) => ({ ref, signal: signalMap.get(ref.signal_id) ?? null }));
          const contradictorySignals = claimRefs
            .filter((ref) => ref.relationship === "contradicts")
            .map((ref) => ({ ref, signal: signalMap.get(ref.signal_id) ?? null }));
          const qualifyingSignals = claimRefs
            .filter((ref) => ref.relationship === "qualifies")
            .map((ref) => ({ ref, signal: signalMap.get(ref.signal_id) ?? null }));
          const supportShape = countSignalsByBand([...supportingSignals, ...qualifyingSignals]);
          const contradictionCount = contradictorySignals.length;
          const strongestSupportingSignal = chooseStrongestSupportingSignal(
            [...supportingSignals, ...qualifyingSignals].map((item) => item.signal),
          );

          return {
            claim,
            dependencyTypes: [...(claimDependencyMap.get(claim.id) ?? new Set())],
            supportShape,
            contradictionCount,
            derivedTriangulationState: deriveTriangulationState({ supportShape, contradictionCount }),
            strongestSupportingSignal,
            supportingSignals,
            contradictorySignals,
            qualifyingSignals,
          } satisfies FoundationClaimSupport;
        })
        .filter((entry) => {
          if (objectType !== "odi_need") return true;
          if (directClaimDependencyMap.has(entry.claim.id)) return true;
          return scoreClaimToNeedMatch(entry.claim, { desired_outcome: needOutcomeText }) > 0;
        })
        .sort((a, b) => {
          const customerDelta = (b.claim.customer_support_count ?? 0) - (a.claim.customer_support_count ?? 0);
          if (customerDelta !== 0) return customerDelta;
          const totalA = (a.claim.outside_support_count ?? 0) + (a.claim.organization_support_count ?? 0) + (a.claim.customer_support_count ?? 0);
          const totalB = (b.claim.outside_support_count ?? 0) + (b.claim.organization_support_count ?? 0) + (b.claim.customer_support_count ?? 0);
          return totalB - totalA;
        });

      return {
        objectType,
        objectId,
        claims: supportedClaims,
        upstreamSteps,
        hasCustomerBackedClaims: supportedClaims.some((entry) => entry.supportShape.customer > 0),
      };
    },
    staleTime: 20_000,
  });
}
