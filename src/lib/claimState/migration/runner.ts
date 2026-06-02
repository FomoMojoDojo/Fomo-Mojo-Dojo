// ── Claim State Backwards-Compatibility Migration Runner ──────────────────────
//
// Three-phase, idempotent migration for pre-existing data.
//
//   Phase 1 — CREATE
//     Inserts claims rows from source tables (odi_needs, routes,
//     positioning_canvases, strategy_cascades, strategic_hypotheses).
//     Each insert is ON CONFLICT DO NOTHING — safe to re-run.
//     A claim_event is written only for rows that were actually created.
//
//   Phase 2 — INFER
//     Reads all claims still at state='outside_view' and re-evaluates
//     them against linked data (signal refs, route steps, odi_need scores).
//     This is a no-op for rows created in Phase 1 (state already set)
//     and serves as a safety net for any pre-existing claims rows.
//
//   Phase 3 — DISTRIBUTION
//     Calls recomputeAndWriteDistribution to write
//     companies.area_scores_json.claim_state_distribution.
//
// Safety guarantees:
//   • Phase 1 never overwrites a claim that already exists (ON CONFLICT DO NOTHING)
//   • Phase 2 never downgrades: only moves outside_view → higher state
//   • Source tables (odi_needs, routes, …) are never modified
//   • Routes.claim_id is populated after Phase 1B — only for routes that
//     didn't already have a claim_id
//   • mojo_score inputs are unchanged: scoring remains byte-identical
//   • Dry-run mode (dryRun: true) reports what WOULD happen without writing

import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ClaimState } from "../types.ts";
import { inferClaimState, type ClaimInferenceInput } from "./inferState.ts";
import { recomputeAndWriteDistribution } from "../distribution.ts";

// ── Deterministic UUID (v5-flavored) for canvas/cascade/hypothesis claims ─────
//
// Produces the same UUID for the same (companyId, sourceType, sourceKey) triple
// across runs. Uses SHA-1 + UUID v5 bit-twiddling (RFC 4122 §4.3).

const MIGRATION_NAMESPACE = "claim-state-machine-migration-2026-05";

export function deterministicClaimId(
  companyId: string,
  sourceType: string,
  sourceKey: string,
): string {
  const input = `${MIGRATION_NAMESPACE}:${companyId}:${sourceType}:${sourceKey}`;
  const hash = createHash("sha1").update(input).digest();
  hash[6] = (hash[6] & 0x0f) | 0x50; // version 5
  hash[8] = (hash[8] & 0x3f) | 0x80; // RFC 4122 variant
  const h = hash.toString("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

// ── Source-path tier mapping for odi_needs state inference (spec §4.1) ────────

const PUBLIC_PATHS = new Set(["public_research", "baseline"]);
const PRIMARY_PATHS = new Set(["interview", "survey", "primary"]);

export function inferOdiNeedState(
  sourcePath: string,
  importance: number,
  satisfaction: number | null,
  isLinkedToSelectedRoute: boolean,
): ClaimState {
  if (isLinkedToSelectedRoute) return "flow";
  if (PUBLIC_PATHS.has(sourcePath)) return importance === 0 ? "outside_view" : "diagnose";
  if (PRIMARY_PATHS.has(sourcePath)) return importance >= 1 ? "focus" : "outside_view";
  // Uncovered source paths: scored org-internal data → diagnose; unscored → outside_view
  return importance >= 1 ? "diagnose" : "outside_view";
}

export function inferRouteState(
  route: RouteRow,
  selectedRouteId: string | null,
): ClaimState {
  if (selectedRouteId && route.id === selectedRouteId) return "flow";
  const steps = (route.steps_json ?? []) as Array<{ status: string }>;
  const startedSteps = steps.filter(
    (s) => s.status === "in_progress" || s.status === "complete",
  );
  if (startedSteps.length > 0) return "focus";
  const evidence = (route.evidence_json ?? []) as Array<{ status?: string }>;
  const nonMissing = evidence.filter((e) => e.status !== "missing");
  if (nonMissing.length > 0) return "focus";
  return "diagnose";
}

// ── Internal row types ────────────────────────────────────────────────────────

type OdiNeedRow = {
  id: string;
  desired_outcome: string;
  source_path: string;
  importance: number;
  satisfaction: number | null;
};

export type RouteRow = {
  id: string;
  title: string | null;
  short_description: string | null;
  category: string | null;
  claim_id: string | null;
  steps_json: unknown;
  evidence_json: unknown;
};

type PositioningCanvasRow = {
  value_for_customer: string | null;
  market_category: string | null;
  best_fit_customers: string | null;
};

type StrategyCascadeRow = {
  winning_aspiration: string | null;
  where_to_play: string | null;
  how_to_win: string | null;
  assumptions_json: Array<{ assumption: string; confidence?: string }> | null;
};

type HypothesisRow = {
  id: string;
  statement: string | null;
  hypothesis_state: string;
  revalidation_flag?: boolean;
};

// ── Result types ──────────────────────────────────────────────────────────────

export type Phase1Counts = {
  odi_needs_created: number;
  odi_needs_skipped: number;
  routes_created: number;
  routes_skipped: number;
  canvas_created: number;
  canvas_skipped: number;
  cascade_fields_created: number;
  cascade_fields_skipped: number;
  cascade_assumptions_created: number;
  cascade_assumptions_skipped: number;
  hypotheses_created: number;
  hypotheses_skipped: number;
};

export type MigrationRecord = {
  claimId: string;
  fromState: "outside_view";
  toState: "diagnose" | "focus" | "flow";
  dryRun: boolean;
};

export type MigrationRunResult = {
  phase1: Phase1Counts;
  phase2: {
    total: number;
    migrated: MigrationRecord[];
    skipped: number;
  };
  errors: Array<{ source: string; sourceId: string; error: string }>;
  dryRun: boolean;
};

// ── Shared: write a claim_events row ─────────────────────────────────────────

async function writeCreationEvent(
  db: SupabaseClient,
  opts: {
    companyId: string;
    claimId: string;
    toState: ClaimState;
    triggeredBy: string;
    sourceTable: string;
    sourceId: string;
    sourceField?: string;
  },
): Promise<void> {
  await db.from("claim_events").insert({
    company_id: opts.companyId,
    claim_id: opts.claimId,
    from_state: null,
    to_state: opts.toState,
    triggered_by_event: opts.triggeredBy,
    evidence_delta: {
      source_table: opts.sourceTable,
      source_id: opts.sourceId,
      source_field: opts.sourceField ?? null,
    },
  });
}

// ── Phase 1A: odi_needs → claims ─────────────────────────────────────────────

async function createClaimsFromOdiNeeds(
  db: SupabaseClient,
  companyId: string,
  triggeredBy: string,
  dryRun: boolean,
  errors: MigrationRunResult["errors"],
  selectedRouteId: string | null,
  selectedRouteLinkedNeedIds: string[],
): Promise<Pick<Phase1Counts, "odi_needs_created" | "odi_needs_skipped">> {
  const { data: rows, error } = await db
    .from("odi_needs")
    .select("id,desired_outcome,source_path,importance,satisfaction")
    .eq("company_id", companyId);

  if (error || !rows) {
    errors.push({ source: "odi_needs", sourceId: "*", error: error?.message ?? "Load failed" });
    return { odi_needs_created: 0, odi_needs_skipped: 0 };
  }

  let created = 0;
  let skipped = 0;

  for (const row of rows as OdiNeedRow[]) {
    try {
      const isLinkedToSelectedRoute = selectedRouteLinkedNeedIds.includes(row.id);
      const state = inferOdiNeedState(
        row.source_path ?? "",
        row.importance ?? 0,
        row.satisfaction ?? null,
        isLinkedToSelectedRoute,
      );

      if (dryRun) {
        // Dry-run: check whether the row already exists
        const { data: existing } = await db
          .from("claims")
          .select("id")
          .eq("id", row.id)
          .maybeSingle();
        existing ? skipped++ : created++;
        continue;
      }

      const { data: inserted, error: insertErr } = await db
        .from("claims")
        .insert({
          id: row.id,
          company_id: companyId,
          statement: row.desired_outcome ?? "(no statement)",
          claim_type: "customer_outcome",
          need_statement: row.desired_outcome,
          state,
        })
        .select("id");

      if (insertErr) {
        // 23505 = unique_violation — row already existed
        if (insertErr.code === "23505") {
          skipped++;
        } else {
          errors.push({ source: "odi_needs", sourceId: row.id, error: insertErr.message });
        }
        continue;
      }

      if ((inserted ?? []).length > 0) {
        created++;
        await writeCreationEvent(db, {
          companyId,
          claimId: row.id,
          toState: state,
          triggeredBy,
          sourceTable: "odi_needs",
          sourceId: row.id,
        });
      }
    } catch (err) {
      errors.push({ source: "odi_needs", sourceId: row.id, error: String(err) });
    }
  }

  return { odi_needs_created: created, odi_needs_skipped: skipped };
}

// ── Phase 1B: routes → claims ─────────────────────────────────────────────────

async function createClaimsFromRoutes(
  db: SupabaseClient,
  companyId: string,
  triggeredBy: string,
  dryRun: boolean,
  errors: MigrationRunResult["errors"],
  selectedRouteId: string | null,
): Promise<Pick<Phase1Counts, "routes_created" | "routes_skipped">> {
  const { data: rows, error } = await db
    .from("routes")
    .select("id,title,short_description,category,claim_id,steps_json,evidence_json")
    .eq("company_id", companyId);

  if (error || !rows) {
    errors.push({ source: "routes", sourceId: "*", error: error?.message ?? "Load failed" });
    return { routes_created: 0, routes_skipped: 0 };
  }

  let created = 0;
  let skipped = 0;

  for (const row of rows as RouteRow[]) {
    try {
      // Use deterministic claim ID so re-runs are idempotent
      const claimId = deterministicClaimId(companyId, "route", row.id);
      const state = inferRouteState(row, selectedRouteId);
      const statement = row.title ?? row.short_description ?? "(no title)";
      const actionCategory = (row.category as "fix" | "improve" | "create" | null) ?? null;

      if (dryRun) {
        const { data: existing } = await db
          .from("claims")
          .select("id")
          .eq("id", claimId)
          .maybeSingle();
        existing ? skipped++ : created++;
        continue;
      }

      const { data: inserted, error: insertErr } = await db
        .from("claims")
        .insert({
          id: claimId,
          company_id: companyId,
          statement,
          claim_type: "route_candidate",
          action_category: actionCategory,
          state,
        })
        .select("id");

      if (insertErr) {
        if (insertErr.code === "23505") {
          skipped++;
        } else {
          errors.push({ source: "routes", sourceId: row.id, error: insertErr.message });
        }
        continue;
      }

      if ((inserted ?? []).length > 0) {
        created++;

        // Link route → claim (only if not already linked)
        if (!row.claim_id) {
          await db
            .from("routes")
            .update({ claim_id: claimId })
            .eq("id", row.id)
            .is("claim_id", null);
        }

        await writeCreationEvent(db, {
          companyId,
          claimId,
          toState: state,
          triggeredBy,
          sourceTable: "routes",
          sourceId: row.id,
        });
      } else {
        skipped++;
      }
    } catch (err) {
      errors.push({ source: "routes", sourceId: row.id, error: String(err) });
    }
  }

  return { routes_created: created, routes_skipped: skipped };
}

// ── Phase 1C: positioning_canvases → claims ───────────────────────────────────

const CANVAS_FIELDS: Array<{
  field: keyof PositioningCanvasRow;
  label: string;
}> = [
  { field: "value_for_customer", label: "value_for_customer" },
  { field: "market_category", label: "market_category" },
  { field: "best_fit_customers", label: "best_fit_customers" },
];

async function createClaimsFromPositioningCanvas(
  db: SupabaseClient,
  companyId: string,
  triggeredBy: string,
  dryRun: boolean,
  errors: MigrationRunResult["errors"],
  hasPublicBaseline: boolean,
): Promise<Pick<Phase1Counts, "canvas_created" | "canvas_skipped">> {
  const { data: rows, error } = await db
    .from("positioning_canvases")
    .select("value_for_customer,market_category,best_fit_customers")
    .eq("company_id", companyId);

  if (error || !rows?.length) {
    if (error) errors.push({ source: "positioning_canvases", sourceId: "*", error: error.message });
    return { canvas_created: 0, canvas_skipped: 0 };
  }

  const canvas = rows[0] as PositioningCanvasRow;
  let created = 0;
  let skipped = 0;

  for (const { field, label } of CANVAS_FIELDS) {
    const text = (canvas[field] ?? "").trim();
    if (!text) continue;

    // Per spec §4.1: if public baseline exists AND content overlaps with
    // baseline language, start at outside_view. Skipped here when no baseline.
    const state: ClaimState = hasPublicBaseline ? "outside_view" : "diagnose";
    const claimId = deterministicClaimId(companyId, "positioning_canvas", label);

    try {
      if (dryRun) {
        const { data: existing } = await db
          .from("claims")
          .select("id")
          .eq("id", claimId)
          .maybeSingle();
        existing ? skipped++ : created++;
        continue;
      }

      const { data: inserted, error: insertErr } = await db
        .from("claims")
        .insert({
          id: claimId,
          company_id: companyId,
          statement: text,
          claim_type: "strategic_belief",
          topic: "positioning",
          state,
        })
        .select("id");

      if (insertErr) {
        if (insertErr.code === "23505") {
          skipped++;
        } else {
          errors.push({ source: "positioning_canvases", sourceId: label, error: insertErr.message });
        }
        continue;
      }

      if ((inserted ?? []).length > 0) {
        created++;
        await writeCreationEvent(db, {
          companyId,
          claimId,
          toState: state,
          triggeredBy,
          sourceTable: "positioning_canvases",
          sourceId: companyId,
          sourceField: label,
        });
      } else {
        skipped++;
      }
    } catch (err) {
      errors.push({ source: "positioning_canvases", sourceId: label, error: String(err) });
    }
  }

  return { canvas_created: created, canvas_skipped: skipped };
}

// ── Phase 1D: strategy_cascades → claims ─────────────────────────────────────

const CASCADE_TEXT_FIELDS: Array<{
  field: keyof Pick<StrategyCascadeRow, "winning_aspiration" | "where_to_play" | "how_to_win">;
  label: string;
}> = [
  { field: "winning_aspiration", label: "winning_aspiration" },
  { field: "where_to_play", label: "where_to_play" },
  { field: "how_to_win", label: "how_to_win" },
];

async function createClaimsFromStrategyCascade(
  db: SupabaseClient,
  companyId: string,
  triggeredBy: string,
  dryRun: boolean,
  errors: MigrationRunResult["errors"],
): Promise<Pick<Phase1Counts, "cascade_fields_created" | "cascade_fields_skipped" | "cascade_assumptions_created" | "cascade_assumptions_skipped">> {
  const { data: rows, error } = await db
    .from("strategy_cascades")
    .select("winning_aspiration,where_to_play,how_to_win,assumptions_json")
    .eq("company_id", companyId);

  if (error || !rows?.length) {
    if (error) errors.push({ source: "strategy_cascades", sourceId: "*", error: error.message });
    return {
      cascade_fields_created: 0,
      cascade_fields_skipped: 0,
      cascade_assumptions_created: 0,
      cascade_assumptions_skipped: 0,
    };
  }

  const cascade = rows[0] as StrategyCascadeRow;
  let fieldsCreated = 0;
  let fieldsSkipped = 0;
  let assumptionsCreated = 0;
  let assumptionsSkipped = 0;

  // Text fields → strategic_belief / diagnose
  for (const { field, label } of CASCADE_TEXT_FIELDS) {
    const text = (cascade[field] ?? "").trim();
    if (!text) continue;
    const claimId = deterministicClaimId(companyId, "strategy_cascade", label);

    try {
      if (dryRun) {
        const { data: existing } = await db.from("claims").select("id").eq("id", claimId).maybeSingle();
        existing ? fieldsSkipped++ : fieldsCreated++;
        continue;
      }

      const { data: inserted, error: insertErr } = await db
        .from("claims")
        .insert({
          id: claimId,
          company_id: companyId,
          statement: text,
          claim_type: "strategic_belief",
          topic: "strategy",
          state: "diagnose",
        })
        .select("id");

      if (insertErr) {
        if (insertErr.code === "23505") { fieldsSkipped++; }
        else errors.push({ source: "strategy_cascades", sourceId: label, error: insertErr.message });
        continue;
      }

      if ((inserted ?? []).length > 0) {
        fieldsCreated++;
        await writeCreationEvent(db, {
          companyId, claimId, toState: "diagnose", triggeredBy,
          sourceTable: "strategy_cascades", sourceId: companyId, sourceField: label,
        });
      } else {
        fieldsSkipped++;
      }
    } catch (err) {
      errors.push({ source: "strategy_cascades", sourceId: label, error: String(err) });
    }
  }

  // assumptions_json items → assumption / outside_view
  // Schema uses 'confidence' not 'tested'; create claims for all assumptions.
  const assumptions = Array.isArray(cascade.assumptions_json) ? cascade.assumptions_json : [];
  for (let i = 0; i < assumptions.length; i++) {
    const item = assumptions[i];
    const text = (item?.assumption ?? "").trim();
    if (!text) continue;
    // Deterministic key: use index + first 40 chars of text to handle re-ordering safely
    const key = `assumption:${i}:${text.slice(0, 40)}`;
    const claimId = deterministicClaimId(companyId, "strategy_cascade", key);

    try {
      if (dryRun) {
        const { data: existing } = await db.from("claims").select("id").eq("id", claimId).maybeSingle();
        existing ? assumptionsSkipped++ : assumptionsCreated++;
        continue;
      }

      const { data: inserted, error: insertErr } = await db
        .from("claims")
        .insert({
          id: claimId,
          company_id: companyId,
          statement: text,
          claim_type: "assumption",
          topic: "strategy",
          state: "outside_view",
        })
        .select("id");

      if (insertErr) {
        if (insertErr.code === "23505") { assumptionsSkipped++; }
        else errors.push({ source: "strategy_cascades:assumptions", sourceId: key, error: insertErr.message });
        continue;
      }

      if ((inserted ?? []).length > 0) {
        assumptionsCreated++;
        await writeCreationEvent(db, {
          companyId, claimId, toState: "outside_view", triggeredBy,
          sourceTable: "strategy_cascades", sourceId: companyId, sourceField: key,
        });
      } else {
        assumptionsSkipped++;
      }
    } catch (err) {
      errors.push({ source: "strategy_cascades:assumptions", sourceId: key, error: String(err) });
    }
  }

  return {
    cascade_fields_created: fieldsCreated,
    cascade_fields_skipped: fieldsSkipped,
    cascade_assumptions_created: assumptionsCreated,
    cascade_assumptions_skipped: assumptionsSkipped,
  };
}

// ── Phase 1E: strategic_hypotheses → claims ───────────────────────────────────

const HYPOTHESIS_STATE_MAP: Record<string, ClaimState | null> = {
  inferred: "outside_view",
  emerging: "outside_view",
  strengthened: "diagnose",
  unstable: "diagnose",
  contradicted: null, // skip
  reframed: null,     // skip — successor claim handled separately
  retired: null,      // skip
};

async function createClaimsFromStrategicHypotheses(
  db: SupabaseClient,
  companyId: string,
  triggeredBy: string,
  dryRun: boolean,
  errors: MigrationRunResult["errors"],
): Promise<Pick<Phase1Counts, "hypotheses_created" | "hypotheses_skipped">> {
  const { data: rows, error } = await db
    .from("strategic_hypotheses")
    .select("id,statement,hypothesis_state")
    .eq("company_id", companyId)
    .eq("is_active", true);

  if (error || !rows) {
    if (error) errors.push({ source: "strategic_hypotheses", sourceId: "*", error: error.message });
    return { hypotheses_created: 0, hypotheses_skipped: 0 };
  }

  let created = 0;
  let skipped = 0;

  for (const row of rows as HypothesisRow[]) {
    const state = HYPOTHESIS_STATE_MAP[row.hypothesis_state ?? ""] ?? null;
    if (!state) { skipped++; continue; }

    const text = (row.statement ?? "").trim();
    if (!text) { skipped++; continue; }

    const revalidationFlag = row.hypothesis_state === "unstable";

    try {
      if (dryRun) {
        const { data: existing } = await db.from("claims").select("id").eq("id", row.id).maybeSingle();
        existing ? skipped++ : created++;
        continue;
      }

      const { data: inserted, error: insertErr } = await db
        .from("claims")
        .insert({
          id: row.id,
          company_id: companyId,
          statement: text,
          claim_type: "strategic_belief",
          state,
          revalidation_flag: revalidationFlag,
        })
        .select("id");

      if (insertErr) {
        if (insertErr.code === "23505") { skipped++; }
        else errors.push({ source: "strategic_hypotheses", sourceId: row.id, error: insertErr.message });
        continue;
      }

      if ((inserted ?? []).length > 0) {
        created++;
        await writeCreationEvent(db, {
          companyId, claimId: row.id, toState: state, triggeredBy,
          sourceTable: "strategic_hypotheses", sourceId: row.id,
        });
      } else {
        skipped++;
      }
    } catch (err) {
      errors.push({ source: "strategic_hypotheses", sourceId: row.id, error: String(err) });
    }
  }

  return { hypotheses_created: created, hypotheses_skipped: skipped };
}

// ── Phase 2: infer + update state on any remaining outside_view claims ────────

async function runInferPhase(
  db: SupabaseClient,
  companyId: string,
  triggeredBy: string,
  dryRun: boolean,
): Promise<MigrationRunResult["phase2"]> {
  const { data: claims, error: claimsErr } = await db
    .from("claims")
    .select("id,claim_type,state")
    .eq("company_id", companyId)
    .eq("state", "outside_view");

  if (claimsErr || !claims) {
    return { total: 0, migrated: [], skipped: 0 };
  }

  const migrated: MigrationRecord[] = [];
  let skipped = 0;

  for (const claim of claims as Array<{ id: string; claim_type: string; state: string }>) {
    const input = await loadInferenceInput(db, claim.id, claim.claim_type, companyId);
    const inferred = inferClaimState(input);

    if (inferred === "outside_view") {
      skipped++;
      continue;
    }

    const record: MigrationRecord = {
      claimId: claim.id,
      fromState: "outside_view",
      toState: inferred,
      dryRun,
    };
    migrated.push(record);

    if (!dryRun) {
      await db.from("claims").update({ state: inferred }).eq("id", claim.id);
      await db.from("claim_events").insert({
        company_id: companyId,
        claim_id: claim.id,
        from_state: "outside_view",
        to_state: inferred,
        triggered_by_event: triggeredBy,
        evidence_delta: { note: `Phase 2 inference: ${inferred}` },
      });
    }
  }

  return { total: claims.length, migrated, skipped };
}

// ── Side-data loader for Phase 2 inference ────────────────────────────────────

async function loadInferenceInput(
  db: SupabaseClient,
  claimId: string,
  claimType: string,
  companyId: string,
): Promise<ClaimInferenceInput> {
  const [refsResult, routeResult, needResult, canvasResult] = await Promise.all([
    db
      .from("claim_signal_refs")
      .select("relationship,signals(signal_band)")
      .eq("claim_id", claimId),

    // Route links to this claim via routes.claim_id (Phase 1B wrote this)
    db.from("routes").select("steps_json").eq("claim_id", claimId).maybeSingle(),

    // odi_needs.id = claims.id for customer_outcome claims (1:1 per spec §3.1)
    claimType === "customer_outcome"
      ? db.from("odi_needs").select("importance,satisfaction").eq("id", claimId).maybeSingle()
      : Promise.resolve({ data: null, error: null }),

    claimType === "positioning"
      ? db.from("positioning_canvases")
          .select("market_category,best_fit_customers,value_for_customer")
          .eq("company_id", companyId)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);

  const signalRefs = (refsResult.data ?? [])
    .filter(
      (r): r is typeof r & { signals: NonNullable<typeof r["signals"]> } =>
        r.signals !== null,
    )
    .map((r) => ({
      relationship: r.relationship,
      signal_band: (r.signals as { signal_band: string }).signal_band as
        | "outside"
        | "organization"
        | "customer",
    }));

  const routeRow = routeResult.data as { steps_json: Array<{ status: string }> | null } | null;
  const needRow = needResult.data as { importance: number; satisfaction: number } | null;
  const canvasRow = canvasResult.data as {
    market_category?: string | null;
    best_fit_customers?: string | null;
    value_for_customer?: string | null;
  } | null;

  return {
    claimType,
    signalRefs,
    linkedRoute: routeRow ? { steps_json: routeRow.steps_json } : null,
    linkedOdiNeed: needRow
      ? { importance: needRow.importance, satisfaction: needRow.satisfaction }
      : null,
    positioningCanvas: canvasRow
      ? {
          category: canvasRow.market_category,
          buyer: canvasRow.best_fit_customers,
          value: canvasRow.value_for_customer,
        }
      : null,
  };
}

// ── Main entry point ──────────────────────────────────────────────────────────

export async function runBackwardsCompatMigration(
  db: SupabaseClient,
  companyId: string,
  opts: { dryRun?: boolean; triggeredBy?: string } = {},
): Promise<MigrationRunResult> {
  const dryRun = opts.dryRun ?? false;
  const triggeredBy = opts.triggeredBy ?? "backwards_compat_migration";
  const errors: MigrationRunResult["errors"] = [];

  // Pre-flight: fetch company context needed for state inference
  const { data: company } = await db
    .from("companies")
    .select("selected_route_id")
    .eq("id", companyId)
    .maybeSingle();

  const selectedRouteId = (company as { selected_route_id: string | null } | null)?.selected_route_id ?? null;

  // Fetch selected route's linked_need_ids for odi_needs flow detection
  let selectedRouteLinkedNeedIds: string[] = [];
  if (selectedRouteId) {
    const { data: routeRow } = await db
      .from("routes")
      .select("linked_need_ids")
      .eq("id", selectedRouteId)
      .maybeSingle();
    const ids = (routeRow as { linked_need_ids: string[] | null } | null)?.linked_need_ids;
    if (Array.isArray(ids)) selectedRouteLinkedNeedIds = ids;
  }

  // Check whether a public baseline exists (affects canvas/cascade initial state)
  const { data: baselineRows } = await db
    .from("public_baseline_runs")
    .select("id")
    .eq("company_id", companyId)
    .limit(1);
  const hasPublicBaseline = Array.isArray(baselineRows) && baselineRows.length > 0;

  // ── Phase 1 — CREATE ───────────────────────────────────────────────────────
  const [p1a, p1b, p1c, p1d, p1e] = await Promise.all([
    createClaimsFromOdiNeeds(db, companyId, triggeredBy, dryRun, errors, selectedRouteId, selectedRouteLinkedNeedIds),
    createClaimsFromRoutes(db, companyId, triggeredBy, dryRun, errors, selectedRouteId),
    createClaimsFromPositioningCanvas(db, companyId, triggeredBy, dryRun, errors, hasPublicBaseline),
    createClaimsFromStrategyCascade(db, companyId, triggeredBy, dryRun, errors),
    createClaimsFromStrategicHypotheses(db, companyId, triggeredBy, dryRun, errors),
  ]);

  const phase1: Phase1Counts = { ...p1a, ...p1b, ...p1c, ...p1d, ...p1e };
  const phase1TotalCreated =
    phase1.odi_needs_created + phase1.routes_created + phase1.canvas_created +
    phase1.cascade_fields_created + phase1.cascade_assumptions_created + phase1.hypotheses_created;

  // ── Phase 2 — INFER ────────────────────────────────────────────────────────
  const phase2 = await runInferPhase(db, companyId, triggeredBy, dryRun);

  // ── Phase 3 — DISTRIBUTION ─────────────────────────────────────────────────
  const anyWritten = !dryRun && (phase1TotalCreated > 0 || phase2.migrated.length > 0);
  if (anyWritten) {
    await recomputeAndWriteDistribution(db, companyId);
  }

  return { phase1, phase2, errors, dryRun };
}
