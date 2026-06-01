import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Claim, ClaimSignalRef, Signal } from "@/lib/evidenceDomain";
import type { StrategicHypothesis } from "@/lib/strategicHypothesisDomain";
import type { FoundationClaimSupport } from "@/hooks/useFoundationProvenance";

export type HypothesisProvenanceCard = {
  hypothesis: StrategicHypothesis;
  supportingClaims: FoundationClaimSupport[];
  weakeningClaims: FoundationClaimSupport[];
  latestEventAt: string | null;
};

export type RouteHypothesisDependency = {
  routeId: string;
  hypothesisId: string;
  dependencyType: "supports" | "constrains" | "assumes" | "contradicts";
  strength: "high" | "medium" | "low";
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

function countSignalsByBand(details: Array<{ signal: Signal | null }>) {
  const shape = { outside: 0, organization: 0, customer: 0 };
  for (const detail of details) {
    const band = String(detail.signal?.signal_band || "").trim().toLowerCase();
    if (band === "outside") shape.outside += 1;
    if (band === "organization") shape.organization += 1;
    if (band === "customer") shape.customer += 1;
  }
  return shape;
}

function deriveTriangulationState(args: { supportShape: { outside: number; organization: number; customer: number }; contradictionCount: number }) {
  if (args.contradictionCount > 0) return "contradicted";
  if (args.supportShape.customer > 0) return "customer_backed";
  const activeBands = [args.supportShape.outside, args.supportShape.organization, args.supportShape.customer].filter((value) => value > 0).length;
  if (activeBands >= 2) return "multi_source";
  if (activeBands === 1) return "single_source";
  return "untested";
}

export function useStrategicHypotheses(companyId?: string) {
  return useQuery({
    queryKey: ["strategic-hypotheses", companyId],
    enabled: Boolean(companyId),
    queryFn: async (): Promise<HypothesisProvenanceCard[]> => {
      if (!companyId) return [];

      const [hypothesesRes, depsRes, eventsRes] = await Promise.all([
        supabase
          .from("strategic_hypotheses")
          .select("*")
          .eq("company_id", companyId)
          .order("is_active", { ascending: false })
          .order("updated_at", { ascending: false })
          .limit(100),
        supabase
          .from("object_dependencies")
          .select("*")
          .eq("company_id", companyId)
          .eq("downstream_object_type", "strategic_hypothesis")
          .eq("upstream_object_type", "claim")
          .limit(500),
        supabase
          .from("strategic_events")
          .select("object_id, created_at")
          .eq("company_id", companyId)
          .eq("object_type", "strategic_hypothesis")
          .order("created_at", { ascending: false })
          .limit(300),
      ]);

      if (hypothesesRes.error) throw new Error(hypothesesRes.error.message || "Failed to load strategic hypotheses.");
      if (depsRes.error) throw new Error(depsRes.error.message || "Failed to load hypothesis dependencies.");
      if (eventsRes.error) throw new Error(eventsRes.error.message || "Failed to load hypothesis events.");

      const hypotheses = (hypothesesRes.data ?? []) as StrategicHypothesis[];
      if (hypotheses.length === 0) return [];

      const deps = (depsRes.data ?? []) as Array<{
        upstream_object_id: string;
        downstream_object_id: string;
        dependency_type: string;
      }>;
      const claimIds = [...new Set(deps.map((dep) => dep.upstream_object_id).filter(Boolean))];
      if (claimIds.length === 0) {
        return hypotheses.map((hypothesis) => ({
          hypothesis,
          supportingClaims: [],
          weakeningClaims: [],
          latestEventAt: (eventsRes.data ?? []).find((event) => String((event as { object_id?: string }).object_id || "") === hypothesis.id)?.created_at ?? null,
        }));
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
      if (refsRes.error) throw new Error(refsRes.error.message || "Failed to load linked claim refs.");

      const claims = (claimsRes.data ?? []) as Claim[];
      const refs = (refsRes.data ?? []) as ClaimSignalRef[];
      const signalIds = [...new Set(refs.map((ref) => ref.signal_id).filter(Boolean))];
      let signals: Signal[] = [];
      if (signalIds.length > 0) {
        const signalsRes = await supabase.from("signals").select("*").eq("company_id", companyId).eq("relevance_state", "active").in("id", signalIds);
        if (signalsRes.error) throw new Error(signalsRes.error.message || "Failed to load linked signals.");
        signals = (signalsRes.data ?? []) as Signal[];
      }

      const signalMap = new Map(signals.map((signal) => [signal.id, signal]));
      const refsByClaimId = new Map<string, ClaimSignalRef[]>();
      for (const ref of refs) {
        if (!refsByClaimId.has(ref.claim_id)) refsByClaimId.set(ref.claim_id, []);
        refsByClaimId.get(ref.claim_id)!.push(ref);
      }
      const claimMap = new Map(claims.map((claim) => [claim.id, claim]));
      const depsByHypothesisId = new Map<string, typeof deps>();
      for (const dep of deps) {
        const bucket = depsByHypothesisId.get(dep.downstream_object_id) ?? [];
        bucket.push(dep);
        depsByHypothesisId.set(dep.downstream_object_id, bucket);
      }
      const latestEventMap = new Map<string, string>();
      for (const row of (eventsRes.data ?? []) as Array<{ object_id: string; created_at: string }>) {
        if (!latestEventMap.has(row.object_id)) latestEventMap.set(row.object_id, row.created_at);
      }

      function toClaimSupport(claimId: string, dependencyType: string): FoundationClaimSupport | null {
        const claim = claimMap.get(claimId);
        if (!claim) return null;
        const claimRefs = refsByClaimId.get(claim.id) ?? [];
        const supportingSignals = claimRefs.filter((ref) => ref.relationship === "supports").map((ref) => ({ ref, signal: signalMap.get(ref.signal_id) ?? null }));
        const contradictorySignals = claimRefs.filter((ref) => ref.relationship === "contradicts").map((ref) => ({ ref, signal: signalMap.get(ref.signal_id) ?? null }));
        const qualifyingSignals = claimRefs.filter((ref) => ref.relationship === "qualifies").map((ref) => ({ ref, signal: signalMap.get(ref.signal_id) ?? null }));
        const supportShape = countSignalsByBand([...supportingSignals, ...qualifyingSignals]);
        const contradictionCount = contradictorySignals.length;
        return {
          claim,
          dependencyTypes: [dependencyType],
          supportShape,
          contradictionCount,
          derivedTriangulationState: deriveTriangulationState({ supportShape, contradictionCount }),
          strongestSupportingSignal: chooseStrongestSupportingSignal([...supportingSignals, ...qualifyingSignals].map((item) => item.signal)),
          supportingSignals,
          contradictorySignals,
          qualifyingSignals,
        };
      }

      return hypotheses.map((hypothesis) => {
        const hypothesisDeps = depsByHypothesisId.get(hypothesis.id) ?? [];
        const supportingClaims = hypothesisDeps
          .filter((dep) => dep.dependency_type === "supports")
          .map((dep) => toClaimSupport(dep.upstream_object_id, dep.dependency_type))
          .filter((entry): entry is FoundationClaimSupport => Boolean(entry));
        const weakeningClaims = hypothesisDeps
          .filter((dep) => dep.dependency_type === "contradicts")
          .map((dep) => toClaimSupport(dep.upstream_object_id, dep.dependency_type))
          .filter((entry): entry is FoundationClaimSupport => Boolean(entry));

        return {
          hypothesis,
          supportingClaims,
          weakeningClaims,
          latestEventAt: latestEventMap.get(hypothesis.id) ?? null,
        };
      });
    },
    staleTime: 20_000,
  });
}

export function useRouteHypothesisDependencies(companyId?: string) {
  return useQuery({
    queryKey: ["route-hypothesis-dependencies", companyId],
    enabled: Boolean(companyId),
    queryFn: async (): Promise<RouteHypothesisDependency[]> => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from("object_dependencies")
        .select("upstream_object_id, downstream_object_id, dependency_type, strength")
        .eq("company_id", companyId)
        .eq("upstream_object_type", "strategic_hypothesis")
        .eq("downstream_object_type", "route")
        .limit(500);

      if (error) throw new Error(error.message || "Failed to load route hypothesis dependencies.");

      return ((data ?? []) as Array<{
        upstream_object_id: string;
        downstream_object_id: string;
        dependency_type: string;
        strength: string;
      }>).map((row) => ({
        routeId: row.downstream_object_id,
        hypothesisId: row.upstream_object_id,
        dependencyType: row.dependency_type as RouteHypothesisDependency["dependencyType"],
        strength: row.strength as RouteHypothesisDependency["strength"],
      }));
    },
    staleTime: 20_000,
  });
}
