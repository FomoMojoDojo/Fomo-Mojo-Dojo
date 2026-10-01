// DIAGNOSE LOADERS (commit "diagnose data (1)", 2026-10-01) — typed, READ-ONLY reads for the
// Diagnose data layer. Every function here is a SELECT. There is no insert, update, delete or RPC
// in this file, and none may be added: the Diagnose data layer reads what other paths wrote.
//
// WHAT THIS FILE DELIBERATELY DOES NOT TOUCH:
//   usePublicBaseline / preferredRun / pickPreferredRun — DF7 binds the latest run BY DATE, and the
//     quality heuristic can return an older one (Edgewood: 2026-07-24 chosen over 2026-09-11).
//   mojo_scores and mojoScore/projections — K1 forbids the stored row and the existing
//     reachable/ceiling projections on Diagnose.
//   OutsideEmptyState — CV4; see outageLine.ts.
// The guard (scripts/guards/diagnose-data-guard.sh, checks d/e/f) fails if any of them appears.
//
// These loaders return ROWS, not counts. Classing is sourceClass.ts's job and selection is
// latestRun.ts's job, so both stay pure and unit-testable without a database.

import { supabase } from "@/integrations/supabase/client";
import type { BaselineRun } from "./latestRun";
import type { BackingSignal, ClaimSupport, InterviewSource } from "./sourceClass";

export type DiagnoseClaimRow = ClaimSupport & {
  readonly id: string;
  readonly status: string | null;
};

export type DiagnoseInterviewItemRow = InterviewSource & {
  readonly id: string;
  readonly kind: string | null;
  readonly retracted: boolean | null;
  /** The record's retraction, carried through so callers can drop items on a withdrawn record. */
  readonly record_retracted_at: string | null;
};

export type DiagnoseFindingRow = {
  readonly id: string;
  readonly kind: string | null;
  readonly status: string | null;
  readonly origin_signal_id: string | null;
};

type Loaded<T> = { readonly rows: T[]; readonly error: string | null };

function fail<T>(message: string): Loaded<T> {
  return { rows: [], error: message };
}

/**
 * Claims with their three stored support counts.
 *
 * STRUCK CLAIMS ARE EXCLUDED. A struck claim stops counting everywhere (Gate A, 2026-09-14 — the
 * law useLiveMojoScore.ts:64-66 and snapshotMojoScore both follow). Counting one here would let a
 * withdrawn claim keep contributing to the triad.
 */
export async function loadDiagnoseClaims(companyId: string): Promise<Loaded<DiagnoseClaimRow>> {
  if (!companyId) return fail("no company id");
  const { data, error } = await supabase
    .from("claims")
    .select("id, status, outside_support_count, organization_support_count, customer_support_count")
    .eq("company_id", companyId)
    .neq("status", "struck");
  if (error) return fail(error.message);
  return { rows: (data ?? []) as DiagnoseClaimRow[], error: null };
}

// ── INTERVIEW SOURCES: NOT LOADED HERE, BLOCKED BY A SIGNED RULE ─────────────────────────────────
//
// DF2 classes an interview source from the record's speaker role and the item's side. The item
// store, however, is walled: rule 4 (parser commit 1, 2026-09-22.1) says "public-register and
// external writers never read items; local generators may", and its enforcement is the census test
// src/lib/interviewParser/interviewItems.census.test.ts, whose allowlist is the parser directory,
// one shared module, src/lib/interviewParser/ and the migrations. src/lib/diagnose is none of those,
// and Diagnose is a client-facing read surface — much closer to the "public register" the rule was
// written to keep out than to a "local generator".
//
// So the loader is NOT written. The ruling the architect owes this module is one of:
//   (a) amend rule 4's allowlist to admit src/lib/diagnose, or
//   (b) class interview sources from interview_records ALONE (speaker_role), which DF2's own wording
//       names and which no census walls — but which counts one source per RECORD (Edgewood: 11, of
//       which 1 is live) rather than per item (582, of which 51 are live), or
//   (c) have the parser expose a classed count through its own shared module, leaving the wall intact.
//
// interviewItemSourceCounts() in sourceClass.ts is unaffected and stays: it is pure, it takes a
// plain { speaker_side, speaker_role } object, and it names no table. Whichever way the ruling goes,
// the classing rule is already written and tested.

/** Findings with their origin signal id. The signal itself is loaded separately, so the exclusion of
 *  'analysis' stays in one place (sourceClass.signalBackedSourceCounts). */
export async function loadDiagnoseFindings(companyId: string): Promise<Loaded<DiagnoseFindingRow>> {
  if (!companyId) return fail("no company id");
  const { data, error } = await supabase
    .from("findings")
    .select("id, kind, status, origin_signal_id")
    .eq("company_id", companyId);
  if (error) return fail(error.message);
  return { rows: (data ?? []) as DiagnoseFindingRow[], error: null };
}

/** The backing signals for a set of ids. voice_class travels so 'analysis' can be excluded — it is
 *  read for no other purpose anywhere in this module (DF2). */
export async function loadBackingSignals(signalIds: readonly string[]): Promise<Loaded<BackingSignal & { id: string }>> {
  const ids = signalIds.filter(Boolean);
  if (ids.length === 0) return { rows: [], error: null };
  const { data, error } = await supabase.from("signals").select("id, voice_class").in("id", ids);
  if (error) return fail(error.message);
  return { rows: (data ?? []) as Array<BackingSignal & { id: string }>, error: null };
}

/**
 * Every public baseline run for a company, newest first.
 *
 * NOT usePublicBaseline: that hook returns both `run` (latest) and `preferredRun` (the quality
 * pick), and half its callers bind the wrong one. Diagnose loads the rows and lets
 * selectLatestRuns decide, so DF7's rule is in one pure, tested function.
 */
export async function loadDiagnoseBaselineRuns(companyId: string): Promise<Loaded<BaselineRun>> {
  if (!companyId) return fail("no company id");
  const { data, error } = await supabase
    .from("public_baseline_runs")
    .select("id, created_at, result_json")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false });
  if (error) return fail(error.message);
  const rows: BaselineRun[] = (data ?? []).map((r) => {
    const rj: unknown = r.result_json;
    const status = rj && typeof rj === "object" && !Array.isArray(rj)
      ? ((rj as { status?: unknown }).status as string | undefined) ?? null
      : null;
    // public_baseline_runs.id is BIGINT, not a uuid. Stringified here so the domain type stays one
    // shape; nothing downstream does arithmetic on a run id.
    return { id: String(r.id), created_at: String(r.created_at), status };
  });
  return { rows, error: null };
}
