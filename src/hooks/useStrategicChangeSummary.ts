import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { AffectedArtifactSummary, StrategicEvent } from "@/lib/strategicGraphDomain";

export type StrategicChangeSummary = {
  latestJobMapEvent: StrategicEvent | null;
  affectedArtifacts: AffectedArtifactSummary[];
  affectedCounts: {
    total: number;
    odi_needs: number;
    routes: number;
    desired_outcomes: number;
  };
  scoreNote: string | null;
  debug: {
    latestEventId: string | null;
    latestEventAt: string | null;
    latestArtifactVersionCount: number;
    dependenciesCreatedCount: number;
  };
};

export function useStrategicChangeSummary(companyId?: string) {
  return useQuery({
    queryKey: ["strategic-change-summary", companyId],
    enabled: Boolean(companyId),
    queryFn: async (): Promise<StrategicChangeSummary> => {
      if (!companyId) {
        return {
          latestJobMapEvent: null,
          affectedArtifacts: [],
          affectedCounts: { total: 0, odi_needs: 0, routes: 0, desired_outcomes: 0 },
          scoreNote: null,
          debug: {
            latestEventId: null,
            latestEventAt: null,
            latestArtifactVersionCount: 0,
            dependenciesCreatedCount: 0,
          },
        };
      }

      const latestEventRes = await supabase
        .from("strategic_events")
        .select("*")
        .eq("company_id", companyId)
        .eq("event_type", "regenerated")
        .eq("object_type", "job_map")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (latestEventRes.error) {
        throw new Error(latestEventRes.error.message || "Failed to load latest strategic change.");
      }

      const latestJobMapEvent = (latestEventRes.data as StrategicEvent | null) ?? null;
      if (!latestJobMapEvent) {
        return {
          latestJobMapEvent: null,
          affectedArtifacts: [],
          affectedCounts: { total: 0, odi_needs: 0, routes: 0, desired_outcomes: 0 },
          scoreNote: null,
          debug: {
            latestEventId: null,
            latestEventAt: null,
            latestArtifactVersionCount: 0,
            dependenciesCreatedCount: 0,
          },
        };
      }

      const eventId = latestJobMapEvent.id;
      const journeyKey = String((latestJobMapEvent.new_value as { journey_key?: string } | null)?.journey_key || "customer");

      const [needsRes, routesRes, outcomesRes, versionRes, stepRowsRes] = await Promise.all([
        supabase
          .from("odi_needs")
          .select("id, desired_outcome, dependency_state, stale_reason, updated_at")
          .eq("company_id", companyId)
          .eq("stale_since_event_id", eventId)
          .neq("dependency_state", "fresh")
          .order("updated_at", { ascending: false }),
        supabase
          .from("routes")
          .select("id, title, dependency_state, stale_reason, updated_at")
          .eq("company_id", companyId)
          .eq("stale_since_event_id", eventId)
          .neq("dependency_state", "fresh")
          .order("updated_at", { ascending: false }),
        supabase
          .from("managed_outcomes")
          .select("id, outcome_title, outcome_statement, dependency_state, stale_reason, updated_at")
          .eq("company_id", companyId)
          .eq("stale_since_event_id", eventId)
          .neq("dependency_state", "fresh")
          .order("updated_at", { ascending: false }),
        supabase
          .from("artifact_versions")
          .select("id", { count: "exact", head: true })
          .eq("company_id", companyId)
          .eq("source_event_id", eventId),
        supabase
          .from("job_steps")
          .select("id")
          .eq("company_id", companyId)
          .eq("journey_key", journeyKey)
          .eq("source_run_id", latestJobMapEvent.source_run_id || "__none__"),
      ]);

      if (needsRes.error) throw new Error(needsRes.error.message || "Failed to load affected needs.");
      if (routesRes.error) throw new Error(routesRes.error.message || "Failed to load affected routes.");
      if (outcomesRes.error) throw new Error(outcomesRes.error.message || "Failed to load affected outcomes.");
      if (versionRes.error) throw new Error(versionRes.error.message || "Failed to load artifact version count.");
      if (stepRowsRes.error) throw new Error(stepRowsRes.error.message || "Failed to load regenerated job steps.");

      const stepIds = (stepRowsRes.data ?? []).map((row) => row.id);
      let dependenciesCreatedCount = 0;
      if (stepIds.length > 0) {
        const dependencyRes = await supabase
          .from("object_dependencies")
          .select("id", { count: "exact", head: true })
          .eq("company_id", companyId)
          .or(
            [
              `and(upstream_object_type.eq.job_step,upstream_object_id.in.(${stepIds.join(",")}))`,
              `and(downstream_object_type.eq.job_step,downstream_object_id.in.(${stepIds.join(",")}))`,
            ].join(","),
          );
        if (dependencyRes.error) throw new Error(dependencyRes.error.message || "Failed to load dependency count.");
        dependenciesCreatedCount = dependencyRes.count ?? 0;
      }

      const affectedArtifacts: AffectedArtifactSummary[] = [
        ...((needsRes.data ?? []).map((row) => ({
          object_type: "odi_need" as const,
          object_id: row.id,
          label: String(row.desired_outcome || "Need"),
          dependency_state: row.dependency_state as AffectedArtifactSummary["dependency_state"],
          stale_reason: row.stale_reason,
          updated_at: row.updated_at,
        }))),
        ...((routesRes.data ?? []).map((row) => ({
          object_type: "route" as const,
          object_id: row.id,
          label: String(row.title || "Route"),
          dependency_state: row.dependency_state as AffectedArtifactSummary["dependency_state"],
          stale_reason: row.stale_reason,
          updated_at: row.updated_at,
        }))),
        ...((outcomesRes.data ?? []).map((row) => ({
          object_type: "desired_outcome" as const,
          object_id: row.id,
          label: String(row.outcome_title || row.outcome_statement || "Desired outcome"),
          dependency_state: row.dependency_state as AffectedArtifactSummary["dependency_state"],
          stale_reason: row.stale_reason,
          updated_at: row.updated_at,
        }))),
      ];

      const affectedCounts = {
        total: affectedArtifacts.length,
        odi_needs: needsRes.data?.length ?? 0,
        routes: routesRes.data?.length ?? 0,
        desired_outcomes: outcomesRes.data?.length ?? 0,
      };

      return {
        latestJobMapEvent,
        affectedArtifacts,
        affectedCounts,
        scoreNote: affectedCounts.odi_needs > 0
          ? "Customer insight confidence may be lower because the job map changed and dependent needs now require review."
          : null,
        debug: {
          latestEventId: latestJobMapEvent.id,
          latestEventAt: latestJobMapEvent.created_at,
          latestArtifactVersionCount: versionRes.count ?? 0,
          dependenciesCreatedCount,
        },
      };
    },
    staleTime: 15_000,
  });
}
