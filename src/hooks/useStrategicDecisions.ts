import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  appendDecisionMemory,
  addConfidenceMovement,
  type StrategicDecisionRow,
  type DecisionRouteRow,
  type DecisionState,
  type ConfidenceState,
  type DecisionRouteRelationship,
  type ConfidenceMovementDirection,
} from "@/lib/strategicDecisionDomain";

export type DecisionWithRoutes = StrategicDecisionRow & {
  routes: DecisionRouteRow[];
};

export function useStrategicDecisions(companyId?: string) {
  const [decisions, setDecisions] = useState<DecisionWithRoutes[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sb = supabase as any;

  const load = useCallback(async () => {
    if (!companyId) {
      setDecisions([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [decRes, routeRes] = await Promise.all([
        sb
          .from("strategic_decisions")
          .select("*")
          .eq("company_id", companyId)
          .order("created_at", { ascending: false })
          .limit(100),
        sb
          .from("decision_routes")
          .select("*")
          .eq("company_id", companyId)
          .order("sort_order", { ascending: true }),
      ]);
      if (decRes.error) throw decRes.error;
      if (routeRes.error) throw routeRes.error;

      const decRows = (decRes.data ?? []) as StrategicDecisionRow[];
      const routeRows = (routeRes.data ?? []) as DecisionRouteRow[];

      setDecisions(
        decRows.map((d) => ({
          ...d,
          routes: routeRows.filter((r) => r.decision_id === d.id),
        })),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load decisions");
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function createDecision(input: {
    title: string;
    decision_question: string;
    current_posture?: string;
    source?: "user_defined" | "ai_derived" | "route_promoted";
  }): Promise<StrategicDecisionRow | null> {
    if (!companyId) return null;
    try {
      const { data, error: err } = await sb
        .from("strategic_decisions")
        .insert({
          company_id: companyId,
          title: input.title,
          decision_question: input.decision_question,
          current_posture: input.current_posture ?? null,
          source: input.source ?? "user_defined",
        })
        .select()
        .single();
      if (err) throw err;
      await load();
      return data as StrategicDecisionRow;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create decision");
      return null;
    }
  }

  async function updateDecision(
    id: string,
    updates: Partial<
      Pick<
        StrategicDecisionRow,
        | "title"
        | "decision_question"
        | "decision_state"
        | "confidence_state"
        | "current_posture"
        | "affected_positioning"
        | "affected_capabilities"
        | "affected_job_steps"
        | "blocked_by"
        | "supporting_hypothesis_ids"
        | "active_tension_ids"
        | "stale_dependencies"
        | "last_meaningful_change_at"
      >
    >,
  ): Promise<void> {
    try {
      const { error: err } = await sb
        .from("strategic_decisions")
        .update(updates)
        .eq("id", id)
        .eq("company_id", companyId);
      if (err) throw err;
      setDecisions((prev) =>
        prev.map((d) => (d.id === id ? { ...d, ...updates } : d)),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update decision");
    }
  }

  async function addRouteToDecision(
    decisionId: string,
    routeId: string,
    relationship: DecisionRouteRelationship = "expression",
  ): Promise<void> {
    if (!companyId) return;
    try {
      const { error: err } = await sb.from("decision_routes").upsert(
        {
          company_id: companyId,
          decision_id: decisionId,
          route_id: routeId,
          relationship,
        },
        { onConflict: "decision_id,route_id" },
      );
      if (err) throw err;
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to link route to decision");
    }
  }

  async function removeRouteFromDecision(
    decisionId: string,
    routeId: string,
  ): Promise<void> {
    try {
      const { error: err } = await sb
        .from("decision_routes")
        .delete()
        .eq("decision_id", decisionId)
        .eq("route_id", routeId);
      if (err) throw err;
      setDecisions((prev) =>
        prev.map((d) =>
          d.id === decisionId
            ? { ...d, routes: d.routes.filter((r) => r.route_id !== routeId) }
            : d,
        ),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove route from decision");
    }
  }

  async function appendMemory(id: string, entry: string): Promise<void> {
    const decision = decisions.find((d) => d.id === id);
    if (!decision) return;
    const updatedMemory = appendDecisionMemory(decision.decision_memory, entry);
    try {
      const { error: err } = await sb
        .from("strategic_decisions")
        .update({
          decision_memory: updatedMemory,
          last_meaningful_change_at: new Date().toISOString(),
        })
        .eq("id", id)
        .eq("company_id", companyId);
      if (err) throw err;
      setDecisions((prev) =>
        prev.map((d) => (d.id === id ? { ...d, decision_memory: updatedMemory } : d)),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to append decision memory");
    }
  }

  async function recordConfidenceMovement(
    id: string,
    direction: ConfidenceMovementDirection,
    reason: string,
    triggeredBy?: string,
  ): Promise<void> {
    const decision = decisions.find((d) => d.id === id);
    if (!decision) return;
    const updatedMovement = addConfidenceMovement(
      decision.confidence_movement,
      direction,
      reason,
      triggeredBy,
    );
    try {
      const { error: err } = await sb
        .from("strategic_decisions")
        .update({ confidence_movement: updatedMovement })
        .eq("id", id)
        .eq("company_id", companyId);
      if (err) throw err;
      setDecisions((prev) =>
        prev.map((d) =>
          d.id === id ? { ...d, confidence_movement: updatedMovement } : d,
        ),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to record confidence movement");
    }
  }

  return {
    decisions,
    loading,
    error,
    reload: load,
    createDecision,
    updateDecision,
    addRouteToDecision,
    removeRouteFromDecision,
    appendMemory,
    recordConfidenceMovement,
  };
}
