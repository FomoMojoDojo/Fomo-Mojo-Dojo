// ── MojoScore DB Writer ────────────────────────────────────────────────────────
//
// Insert-only — one row per computation, history preserved.
// Never overwrites or updates existing rows.
// Distinct from the legacy `mojo_score` field in area_scores_json,
// which remains controlled by the old scoring function and is never touched here.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { MojoScoreResult } from "./types";

type InsertPayload = {
  company_id: string;
  computed_at: string;
  total_score: number;
  component_scores: Record<string, unknown>;
  explanation: Record<string, unknown>;
  methodology_version: string;
};

export async function writeMojoScore(
  db: SupabaseClient,
  result: MojoScoreResult,
): Promise<{ id: string } | null> {
  const component_scores: Record<string, unknown> = {};
  const explanation: Record<string, unknown> = {};

  for (const c of result.contributors) {
    component_scores[c.key] = {
      score: c.score,
      weight: c.weight,
      weighted: c.weighted,
      sub_scores: c.sub_scores ?? {},
    };
    explanation[c.key] = {
      label: c.label,
      explanation: c.explanation,
    };
  }

  explanation["projected_raisers"] = result.projected_raisers;
  explanation["engagement_state"] = result.engagement_state;

  const payload: InsertPayload = {
    company_id: result.company_id,
    computed_at: result.computed_at,
    total_score: result.total_score,
    component_scores,
    explanation,
    methodology_version: result.methodology_version,
  };

  const { data, error } = await db
    .from("mojo_scores")
    .insert(payload)
    .select("id")
    .maybeSingle();

  if (error) {
    console.error("[writeMojoScore] Insert failed:", error.message);
    return null;
  }

  return data as { id: string } | null;
}
