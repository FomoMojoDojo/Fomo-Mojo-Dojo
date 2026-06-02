// ── Claim State Distribution — DB Layer ──────────────────────────────────────
//
// Reads all claims for a company, counts by state, writes the distribution
// into companies.area_scores_json under key 'claim_state_distribution'.
//
// Also exports stateDistributionToBand() — the v1 shim that maps the distribution
// to an EvidenceBand so the existing mojo_score pipeline can consume it without
// schema changes (decision §5.2 Option B).

import type { SupabaseClient } from "@supabase/supabase-js";
import type { EvidenceBand } from "@/lib/evidenceBands";
import type { ClaimStateDistribution, ClaimState } from "./types.ts";

// ── Read ──────────────────────────────────────────────────────────────────────

export async function computeClaimStateDistribution(
  db: SupabaseClient,
  companyId: string,
): Promise<ClaimStateDistribution> {
  const { data, error } = await db
    .from("claims")
    .select("state")
    .eq("company_id", companyId)
    .neq("revalidation_flag", true); // exclude retired/soft-deleted

  if (error || !data) {
    console.error("[claimState/distribution] Failed to load claims:", error?.message);
    return emptyDistribution();
  }

  const counts = { outside_view: 0, diagnose: 0, focus: 0, flow: 0 };
  for (const row of data as Array<{ state: string }>) {
    const s = row.state as ClaimState;
    if (s in counts) counts[s]++;
  }

  return {
    ...counts,
    total: counts.outside_view + counts.diagnose + counts.focus + counts.flow,
    computed_at: new Date().toISOString(),
  };
}

function emptyDistribution(): ClaimStateDistribution {
  return {
    outside_view: 0,
    diagnose: 0,
    focus: 0,
    flow: 0,
    total: 0,
    computed_at: new Date().toISOString(),
  };
}

// ── Write ─────────────────────────────────────────────────────────────────────

export async function recomputeAndWriteDistribution(
  db: SupabaseClient,
  companyId: string,
): Promise<void> {
  const distribution = await computeClaimStateDistribution(db, companyId);

  // Read-modify-write: preserve all existing area_scores_json keys
  const { data: companyRow, error: readErr } = await db
    .from("companies")
    .select("area_scores_json")
    .eq("id", companyId)
    .maybeSingle();

  if (readErr) {
    console.error("[claimState/distribution] Failed to read area_scores_json:", readErr.message);
    return;
  }

  const existing =
    companyRow && typeof companyRow === "object" && "area_scores_json" in companyRow
      ? ((companyRow as { area_scores_json: unknown }).area_scores_json ?? {})
      : {};

  const merged = {
    ...(typeof existing === "object" && existing !== null ? existing : {}),
    claim_state_distribution: distribution,
  };

  const { error: writeErr } = await db
    .from("companies")
    .update({ area_scores_json: merged })
    .eq("id", companyId);

  if (writeErr) {
    console.error("[claimState/distribution] Failed to write distribution:", writeErr.message);
  }
}

// ── v1 Shim — stateDistributionToBand ────────────────────────────────────────
//
// Maps a ClaimStateDistribution to an EvidenceBand so the v1 mojo_score
// pipeline can consume claim state data without schema changes.
//
// Thresholds (decision §5.2):
//   proven_path             focusOrFlow > 50 % && flow > 30 %
//   customer_evidenced      focusOrFlow > 50 %
//   directional_not_validated  focusOrFlow > 20 % OR diagnoseOrAbove > 50 %
//   hypothesis_only         everything else (including 0 total)

export function stateDistributionToBand(
  dist: ClaimStateDistribution,
): EvidenceBand {
  if (dist.total === 0) return "hypothesis_only";

  const focusOrFlow = (dist.focus + dist.flow) / dist.total;
  const flow = dist.flow / dist.total;
  const diagnoseOrAbove =
    (dist.diagnose + dist.focus + dist.flow) / dist.total;

  if (focusOrFlow > 0.5 && flow > 0.3) return "proven_path";
  if (focusOrFlow > 0.5) return "customer_evidenced";
  if (focusOrFlow > 0.2 || diagnoseOrAbove > 0.5) return "directional_not_validated";
  return "hypothesis_only";
}
