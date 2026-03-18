import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type LocalAlignmentScoreImpact = {
  should_change: boolean;
  direction: "up" | "down" | "none";
  points: number;
  reason: string;
};

export type LocalAlignmentAppliedUpdate = {
  applied: boolean;
  previous_mojo: number | null;
  updated_mojo: number | null;
  direction: "up" | "down" | "none";
  points: number;
  reason: string;
  applied_at: string | null;
};

export type LocalAlignmentArea = {
  area_key: string;
  approach_checks: Array<{ check: string; status: "pass" | "partial" | "fail"; note: string }>;
  public_claims: Array<{ claim: string; source: string; confidence: number; tier?: string }>;
  internal_claims: Array<{ claim: string; source: string; confidence: number; tier?: string }>;
  overlaps: Array<{ theme: string; public_claim: string; internal_claim: string; confidence: number }>;
  gaps: Array<{ theme: string; gap_type: "missing_internal" | "missing_public" | "conflict"; impact: "low" | "medium" | "high"; description: string }>;
  why_gaps_likely: string[];
  actions: Array<{ action: string; evidence_needed: string; priority: "low" | "medium" | "high" }>;
  applies_to_areas: string[];
  score_impact: LocalAlignmentScoreImpact;
};

export type LocalAlignmentRun = {
  id: string;
  created_at: string;
  provider: string;
  model: string;
  local_only_verified: boolean;
  score_impact: LocalAlignmentScoreImpact;
  applied_score_update: LocalAlignmentAppliedUpdate;
  areas: Record<string, LocalAlignmentArea>;
};

type ArtifactRunRow = {
  id: string;
  created_at: string;
  status: string;
  summary_json: unknown;
  artifacts_json: unknown;
};

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function asArray<T = unknown>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function parseScoreImpact(value: unknown): LocalAlignmentScoreImpact {
  const obj = asObject(value);
  const rawDirection = String(obj.direction || "none").toLowerCase();
  const direction = rawDirection === "up" || rawDirection === "down" || rawDirection === "none"
    ? (rawDirection as "up" | "down" | "none")
    : "none";
  const points = Number.isFinite(Number(obj.points)) ? Math.max(0, Math.min(20, Math.round(Number(obj.points)))) : 0;
  return {
    should_change: Boolean(obj.should_change),
    direction,
    points,
    reason: String(obj.reason || "No score impact summary available."),
  };
}

function parseAppliedUpdate(value: unknown): LocalAlignmentAppliedUpdate {
  const obj = asObject(value);
  const rawDirection = String(obj.direction || "none").toLowerCase();
  const direction = rawDirection === "up" || rawDirection === "down" || rawDirection === "none"
    ? (rawDirection as "up" | "down" | "none")
    : "none";
  const numberOrNull = (input: unknown): number | null =>
    Number.isFinite(Number(input)) ? Number(input) : null;

  return {
    applied: Boolean(obj.applied),
    previous_mojo: numberOrNull(obj.previous_mojo),
    updated_mojo: numberOrNull(obj.updated_mojo),
    direction,
    points: Number.isFinite(Number(obj.points)) ? Math.max(0, Math.min(20, Math.round(Number(obj.points)))) : 0,
    reason: String(obj.reason || "No apply status available."),
    applied_at: typeof obj.applied_at === "string" && obj.applied_at.trim().length > 0 ? obj.applied_at : null,
  };
}

function parseArea(value: unknown, fallbackKey: string): LocalAlignmentArea {
  const obj = asObject(value);
  const areaKey = String(obj.area_key || fallbackKey || "unknown");

  const approachChecks = asArray<Record<string, unknown>>(obj.approach_checks).map((entry) => {
    const statusRaw = String(entry.status || "partial").toLowerCase();
    const status = statusRaw === "pass" || statusRaw === "partial" || statusRaw === "fail"
      ? (statusRaw as "pass" | "partial" | "fail")
      : "partial";
    return {
      check: String(entry.check || ""),
      status,
      note: String(entry.note || ""),
    };
  }).filter((entry) => entry.check);

  const publicClaims = asArray<Record<string, unknown>>(obj.public_claims).map((entry) => ({
    claim: String(entry.claim || ""),
    source: String(entry.source || "unknown"),
    confidence: Number.isFinite(Number(entry.confidence)) ? Math.max(0, Math.min(100, Math.round(Number(entry.confidence)))) : 50,
    tier: String(entry.tier || ""),
  })).filter((entry) => entry.claim);

  const internalClaims = asArray<Record<string, unknown>>(obj.internal_claims).map((entry) => ({
    claim: String(entry.claim || ""),
    source: String(entry.source || "unknown"),
    confidence: Number.isFinite(Number(entry.confidence)) ? Math.max(0, Math.min(100, Math.round(Number(entry.confidence)))) : 50,
    tier: String(entry.tier || ""),
  })).filter((entry) => entry.claim);

  const overlaps = asArray<Record<string, unknown>>(obj.overlaps).map((entry) => ({
    theme: String(entry.theme || "Shared theme"),
    public_claim: String(entry.public_claim || ""),
    internal_claim: String(entry.internal_claim || ""),
    confidence: Number.isFinite(Number(entry.confidence)) ? Math.max(0, Math.min(100, Math.round(Number(entry.confidence)))) : 50,
  })).filter((entry) => entry.public_claim && entry.internal_claim);

  const gaps = asArray<Record<string, unknown>>(obj.gaps).map((entry) => {
    const gapRaw = String(entry.gap_type || "conflict").toLowerCase();
    const impactRaw = String(entry.impact || "medium").toLowerCase();
    const gapType = gapRaw === "missing_internal" || gapRaw === "missing_public" || gapRaw === "conflict"
      ? (gapRaw as "missing_internal" | "missing_public" | "conflict")
      : "conflict";
    const impact = impactRaw === "low" || impactRaw === "medium" || impactRaw === "high"
      ? (impactRaw as "low" | "medium" | "high")
      : "medium";
    return {
      theme: String(entry.theme || "Gap"),
      gap_type: gapType,
      impact,
      description: String(entry.description || ""),
    };
  }).filter((entry) => entry.description);

  const actions = asArray<Record<string, unknown>>(obj.actions).map((entry) => {
    const priorityRaw = String(entry.priority || "medium").toLowerCase();
    const priority = priorityRaw === "low" || priorityRaw === "medium" || priorityRaw === "high"
      ? (priorityRaw as "low" | "medium" | "high")
      : "medium";
    return {
      action: String(entry.action || ""),
      evidence_needed: String(entry.evidence_needed || ""),
      priority,
    };
  }).filter((entry) => entry.action);

  return {
    area_key: areaKey,
    approach_checks: approachChecks,
    public_claims: publicClaims,
    internal_claims: internalClaims,
    overlaps,
    gaps,
    why_gaps_likely: asArray<string>(obj.why_gaps_likely).map((entry) => String(entry || "")).filter(Boolean),
    actions,
    applies_to_areas: asArray<string>(obj.applies_to_areas).map((entry) => String(entry || "")).filter(Boolean),
    score_impact: parseScoreImpact(obj.score_impact),
  };
}

function parseRun(row: ArtifactRunRow | null): LocalAlignmentRun | null {
  if (!row) return null;
  const summary = asObject(row.summary_json);
  const artifacts = asObject(row.artifacts_json);
  const runLedger = asObject(summary.run_ledger);
  const areasObj = asObject(artifacts.areas);
  const areasEntries = Object.entries(areasObj).map(([key, value]) => [key, parseArea(value, key)] as const);
  const areas = Object.fromEntries(areasEntries);

  return {
    id: row.id,
    created_at: row.created_at,
    provider: String(runLedger.provider || "unknown"),
    model: String(runLedger.model || "unknown"),
    local_only_verified: Boolean(runLedger.local_only_verified),
    score_impact: parseScoreImpact(summary.score_impact),
    applied_score_update: parseAppliedUpdate(summary.applied_score_update),
    areas,
  };
}

export function useLatestLocalAlignment(companyId?: string) {
  return useQuery({
    queryKey: ["local-alignment", companyId],
    queryFn: async (): Promise<LocalAlignmentRun | null> => {
      if (!companyId) return null;
      const { data, error } = await supabase
        .from("research_artifact_runs")
        .select("id, created_at, status, summary_json, artifacts_json")
        .eq("company_id", companyId)
        .eq("status", "local_alignment")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return parseRun((data as ArtifactRunRow | null) ?? null);
    },
    enabled: !!companyId,
  });
}

export function useRunLocalAlignment(companyId?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args?: { areas?: string[]; trigger?: string; applyScoreUpdate?: boolean }) => {
      if (!companyId) throw new Error("Select a company before running local alignment.");
      const { data, error } = await supabase.functions.invoke("local-alignment", {
        body: {
          company_id: companyId,
          areas: args?.areas ?? ["positioning", "strategy"],
          trigger: args?.trigger ?? "manual",
          apply_score_update: args?.applyScoreUpdate === true,
        },
      });
      if (error) {
        const responseLike = (error as { context?: Response }).context;
        if (responseLike) {
          try {
            const parsed = await responseLike.clone().json();
            if (parsed && typeof parsed === "object" && typeof (parsed as { error?: unknown }).error === "string") {
              throw new Error((parsed as { error: string }).error);
            }
          } catch {
            // keep fallback below
          }
          throw new Error(`Local comparison failed (${responseLike.status}).`);
        }
        throw error;
      }
      if (data?.error) throw new Error(String(data.error));
      return data;
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["local-alignment", companyId] });
    },
  });
}
