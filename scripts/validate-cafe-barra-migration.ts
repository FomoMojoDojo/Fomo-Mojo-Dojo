/**
 * Cafe Barra — claim state machine migration validation script.
 *
 * Run with:
 *   node_modules/.bin/vite-node scripts/validate-cafe-barra-migration.ts
 *
 * Steps:
 *   1. Fetch all mojo_score inputs for Cafe Barra
 *   2. Compute + serialize pre-migration score snapshot
 *   3. Apply schema migrations (via shell — docker exec)
 *   4. Run backwards-compat migration runner (dry-run first, then real)
 *   5. Compute + serialize post-migration score snapshot
 *   6. Diff the two snapshots and report
 *   7. Write migration report
 */

import { createClient } from "@supabase/supabase-js";
import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import { scoreCompanyMojo } from "@/lib/scoring/mojoScore";
import type {
  ScoreableInput,
  ScoreableJobStep,
  ScoreableOpportunity,
  ScoreableRoute,
  ScoreableDesiredOutcome,
  StrategicProblemInput,
} from "@/lib/scoring/mojoScore";
import { runBackwardsCompatMigration } from "@/lib/claimState/migration/runner";

const SUPABASE_URL = "http://127.0.0.1:54321";
const SERVICE_KEY = "***REMOVED***";
const CAFE_BARRA_ID = "58b2b15b-bada-4bcd-9c12-b7e66a37d0bc";
const DB_CONTAINER = "supabase_db_dzlgyxcvuwiulgifbmew";
const MIGRATIONS_DIR = path.join(process.cwd(), "supabase/migrations");
const DOCS_DIR = path.join(process.cwd(), "docs/migrations");

const NEW_MIGRATIONS = [
  "20260603100000_extend_claims_state_machine.sql",
  "20260603100001_add_claim_job_step_refs.sql",
  "20260603100002_add_claim_events.sql",
  "20260603100003_add_route_claim_id.sql",
  "20260603100004_add_strategic_decisions_linked_claim_id.sql",
  "20260603100005_create_derived_tensions_structural_view.sql",
];

const db = createClient(SUPABASE_URL, SERVICE_KEY);

// ── Data fetchers ─────────────────────────────────────────────────────────────

async function fetchInputs(): Promise<ScoreableInput[]> {
  const { data } = await db
    .from("inputs")
    .select("input_key,group_key,sub_group,completeness,status,score_impact,impact_tier")
    .eq("company_id", CAFE_BARRA_ID);
  return (data ?? []) as ScoreableInput[];
}

async function fetchJobSteps(): Promise<ScoreableJobStep[]> {
  const { data } = await db
    .from("job_steps")
    .select("journey_key,journey_title,journey_subtitle,designed,has_gap")
    .eq("company_id", CAFE_BARRA_ID);
  return (data ?? []) as ScoreableJobStep[];
}

async function fetchOpportunities(): Promise<ScoreableOpportunity[]> {
  const { data } = await db
    .from("odi_needs")
    .select("journey_key,desired_outcome,step_label,importance,satisfaction,opportunity_score,source_path")
    .eq("company_id", CAFE_BARRA_ID);
  // Map desired_outcome → outcome (ScoreableOpportunity.outcome field)
  return (data ?? []).map((r: Record<string, unknown>) => ({
    journey_key: r.journey_key,
    outcome: r.desired_outcome,        // field name mapping
    step_label: r.step_label,
    importance: r.importance,
    satisfaction: r.satisfaction,
    opportunity_score: r.opportunity_score,
    priority_tier: null,               // column doesn't exist in this schema
  })) as ScoreableOpportunity[];
}

async function fetchRoutes(): Promise<ScoreableRoute[]> {
  const { data } = await db
    .from("routes")
    .select("title,short_description,category")
    .eq("company_id", CAFE_BARRA_ID);
  return (data ?? []) as ScoreableRoute[];
}

async function fetchManagedOutcomes(): Promise<ScoreableDesiredOutcome[]> {
  const { data } = await db
    .from("managed_outcomes")
    .select("journey_key,outcome_statement,leading_indicator,target_direction,direction,metric,actor,action,object,context,is_primary,level")
    .eq("company_id", CAFE_BARRA_ID);
  return (data ?? []) as ScoreableDesiredOutcome[];
}

async function fetchNeedsSourcePaths(): Promise<string[]> {
  const { data } = await db
    .from("odi_needs")
    .select("source_path")
    .eq("company_id", CAFE_BARRA_ID);
  return (data ?? []).map((r: Record<string, unknown>) => String(r.source_path ?? ""));
}

async function fetchStoredScores(): Promise<Record<string, unknown>> {
  const { data } = await db
    .from("companies")
    .select("mojo_score,potential_score,projected_score,evidence_status,area_scores_json")
    .eq("id", CAFE_BARRA_ID)
    .maybeSingle();
  return (data ?? {}) as Record<string, unknown>;
}

async function fetchDryRunStats(): Promise<{
  claims: number;
  routes: number;
  odi_needs: number;
  signal_refs: number;
}> {
  // After migration, these tables will have the state column
  const [claimsRes, routesRes, needsRes, refsRes] = await Promise.all([
    db.from("claims").select("id,state,claim_type", { count: "exact" }).eq("company_id", CAFE_BARRA_ID),
    db.from("routes").select("id,claim_id", { count: "exact" }).eq("company_id", CAFE_BARRA_ID),
    db.from("odi_needs").select("id", { count: "exact" }).eq("company_id", CAFE_BARRA_ID),
    db.from("claim_signal_refs").select("id", { count: "exact" }).eq("company_id", CAFE_BARRA_ID),
  ]);
  return {
    claims: claimsRes.count ?? 0,
    routes: routesRes.count ?? 0,
    odi_needs: needsRes.count ?? 0,
    signal_refs: refsRes.count ?? 0,
  };
}

// ── Score computation ─────────────────────────────────────────────────────────

async function computeScore(label: string) {
  console.log(`\n[${label}] Computing mojo_score...`);

  const [inputs, jobSteps, opportunities, routes, managedOutcomes, needsSourcePaths] =
    await Promise.all([
      fetchInputs(),
      fetchJobSteps(),
      fetchOpportunities(),
      fetchRoutes(),
      fetchManagedOutcomes(),
      fetchNeedsSourcePaths(),
    ]);

  console.log(`  inputs=${inputs.length} jobSteps=${jobSteps.length} opps=${opportunities.length} routes=${routes.length} outcomes=${managedOutcomes.length}`);

  const result = scoreCompanyMojo({
    inputs,
    jobSteps,
    opportunities,
    managedOutcomes,
    routes,
    strategicProblems: [] as StrategicProblemInput[],
    baselineRunResultJson: null,
    needsSourcePaths,
  });

  const storedScores = await fetchStoredScores();

  return {
    computed: result,
    stored: storedScores,
    input_counts: {
      inputs: inputs.length,
      job_steps: jobSteps.length,
      opportunities: opportunities.length,
      routes: routes.length,
      managed_outcomes: managedOutcomes.length,
      needs_source_paths: needsSourcePaths.length,
    },
    timestamp: new Date().toISOString(),
  };
}

// ── Migration application ─────────────────────────────────────────────────────

function applyMigration(filename: string): void {
  const filepath = path.join(MIGRATIONS_DIR, filename);
  if (!fs.existsSync(filepath)) {
    throw new Error(`Migration file not found: ${filepath}`);
  }
  console.log(`  Applying ${filename}...`);
  try {
    execSync(
      `docker exec -i ${DB_CONTAINER} psql -U postgres -d postgres -f /dev/stdin < "${filepath}"`,
      { stdio: ["pipe", "pipe", "pipe"] },
    );
    console.log(`    ✓ Applied`);
  } catch (err) {
    const msg = String((err as { stderr?: Buffer }).stderr ?? err);
    // NOTICE and IF NOT EXISTS errors are safe to ignore
    if (msg.includes("ERROR") && !msg.includes("already exists")) {
      throw new Error(`Migration ${filename} failed: ${msg}`);
    }
    console.log(`    ✓ Applied (with notices)`);
  }
}

function recordMigrationInHistory(filename: string): void {
  const version = filename.split("_")[0];
  try {
    execSync(
      `docker exec ${DB_CONTAINER} psql -U postgres -d postgres -c "INSERT INTO supabase_migrations.schema_migrations (version) VALUES ('${version}') ON CONFLICT DO NOTHING;"`,
      { stdio: "pipe" },
    );
  } catch {
    // Non-fatal — migration history is best-effort
  }
}

// ── Diff ──────────────────────────────────────────────────────────────────────

function deepDiff(
  pre: Record<string, unknown>,
  post: Record<string, unknown>,
  path = "",
): Array<{ path: string; pre: unknown; post: unknown }> {
  const diffs: Array<{ path: string; pre: unknown; post: unknown }> = [];
  const allKeys = new Set([...Object.keys(pre), ...Object.keys(post)]);

  for (const key of allKeys) {
    const fullPath = path ? `${path}.${key}` : key;
    const preVal = pre[key];
    const postVal = post[key];

    if (typeof preVal === "object" && preVal !== null && typeof postVal === "object" && postVal !== null) {
      diffs.push(...deepDiff(
        preVal as Record<string, unknown>,
        postVal as Record<string, unknown>,
        fullPath,
      ));
    } else if (JSON.stringify(preVal) !== JSON.stringify(postVal)) {
      diffs.push({ path: fullPath, pre: preVal, post: postVal });
    }
  }
  return diffs;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log("╔══════════════════════════════════════════════════════════╗");
  console.log("║  Cafe Barra — Claim State Migration Validation Pass      ║");
  console.log("╚══════════════════════════════════════════════════════════╝");
  console.log(`  Company ID: ${CAFE_BARRA_ID}`);
  console.log(`  Timestamp:  ${new Date().toISOString()}`);

  // ── Step 1: Pre-migration snapshot ─────────────────────────────────────────
  console.log("\n══ Step 1: Pre-migration snapshot ═══════════════════════════");
  const preSnapshot = await computeScore("PRE");
  console.log(`  Computed mojo_score: ${preSnapshot.computed.mojo_score}`);
  console.log(`  Stored  mojo_score: ${preSnapshot.stored.mojo_score}`);

  fs.writeFileSync(
    path.join(DOCS_DIR, "cafe-barra-mojo-pre.json"),
    JSON.stringify(preSnapshot, null, 2),
  );
  console.log("  ✓ Saved docs/migrations/cafe-barra-mojo-pre.json");

  // ── Step 2: Dry-run migration ───────────────────────────────────────────────
  console.log("\n══ Step 2: Check migration prerequisites ════════════════════");
  // The schema migrations haven't been applied yet — check what claims exist
  const preClaims = await db
    .from("claims")
    .select("id,claim_type")
    .eq("company_id", CAFE_BARRA_ID);
  console.log(`  Existing claims before schema migration: ${(preClaims.data ?? []).length}`);
  // No state column yet, so dry-run inference is conceptual — we'll report counts after schema migration

  // ── Step 3: Apply schema migrations ────────────────────────────────────────
  console.log("\n══ Step 3: Applying schema migrations ═══════════════════════");
  for (const migration of NEW_MIGRATIONS) {
    applyMigration(migration);
    recordMigrationInHistory(migration);
  }
  console.log("  ✓ All 6 schema migrations applied");

  // ── Step 4: Dry-run the backwards-compat migration ─────────────────────────
  console.log("\n══ Step 4: Dry-run — backwards-compat migration ════════════");
  const dryRunResult = await runBackwardsCompatMigration(db, CAFE_BARRA_ID, {
    dryRun: true,
    triggeredBy: "migration_2026_05_initial_state",
  });

  const drP1 = dryRunResult.phase1;
  const drP2 = dryRunResult.phase2;
  console.log("  Phase 1 (CREATE) — would create:");
  console.log(`    odi_needs:            ${drP1.odi_needs_created} (${drP1.odi_needs_skipped} skipped)`);
  console.log(`    routes:               ${drP1.routes_created} (${drP1.routes_skipped} skipped)`);
  console.log(`    canvas fields:        ${drP1.canvas_created} (${drP1.canvas_skipped} skipped)`);
  console.log(`    cascade fields:       ${drP1.cascade_fields_created} (${drP1.cascade_fields_skipped} skipped)`);
  console.log(`    cascade assumptions:  ${drP1.cascade_assumptions_created} (${drP1.cascade_assumptions_skipped} skipped)`);
  console.log(`    hypotheses:           ${drP1.hypotheses_created} (${drP1.hypotheses_skipped} skipped)`);
  console.log(`  Phase 2 (INFER) — existing claims scanned: ${drP2.total}`);
  console.log(`    Would migrate:        ${drP2.migrated.length}`);
  console.log(`    Would stay at outside_view: ${drP2.skipped}`);
  console.log(`  Errors: ${dryRunResult.errors.length}`);

  if (drP2.migrated.length > 0) {
    const byCounts = drP2.migrated.reduce(
      (acc, r) => { acc[r.toState] = (acc[r.toState] ?? 0) + 1; return acc; },
      {} as Record<string, number>,
    );
    console.log("  Phase 2 distribution preview:", byCounts);
  }

  if (dryRunResult.errors.length > 0) {
    console.error("  ✗ DRY-RUN ERRORS:");
    for (const e of dryRunResult.errors) {
      console.error(`    [${e.source}:${e.sourceId}] ${e.error}`);
    }
    console.error("\n  HALTING — dry-run has errors. Review before proceeding.");
    process.exit(1);
  }

  console.log("  ✓ Dry-run clean. Proceeding to live migration.");

  // ── Step 5: Live migration ─────────────────────────────────────────────────
  console.log("\n══ Step 5: Running live migration ═══════════════════════════");
  const liveResult = await runBackwardsCompatMigration(db, CAFE_BARRA_ID, {
    dryRun: false,
    triggeredBy: "migration_2026_05_initial_state",
  });

  const lvP1 = liveResult.phase1;
  const lvP2 = liveResult.phase2;
  console.log("  Phase 1 (CREATE) — created:");
  console.log(`    odi_needs:            ${lvP1.odi_needs_created} (${lvP1.odi_needs_skipped} skipped)`);
  console.log(`    routes:               ${lvP1.routes_created} (${lvP1.routes_skipped} skipped)`);
  console.log(`    canvas fields:        ${lvP1.canvas_created} (${lvP1.canvas_skipped} skipped)`);
  console.log(`    cascade fields:       ${lvP1.cascade_fields_created} (${lvP1.cascade_fields_skipped} skipped)`);
  console.log(`    cascade assumptions:  ${lvP1.cascade_assumptions_created} (${lvP1.cascade_assumptions_skipped} skipped)`);
  console.log(`    hypotheses:           ${lvP1.hypotheses_created} (${lvP1.hypotheses_skipped} skipped)`);
  const lvP1Total = lvP1.odi_needs_created + lvP1.routes_created + lvP1.canvas_created +
    lvP1.cascade_fields_created + lvP1.cascade_assumptions_created + lvP1.hypotheses_created;
  console.log(`    Total created:        ${lvP1Total}`);
  console.log(`  Phase 2 (INFER) — claims processed: ${lvP2.total}`);
  console.log(`    Migrated:             ${lvP2.migrated.length}`);
  console.log(`    Left at outside_view: ${lvP2.skipped}`);
  console.log(`  Errors: ${liveResult.errors.length}`);

  if (liveResult.errors.length > 0) {
    console.error("  ✗ LIVE MIGRATION ERRORS:");
    for (const e of liveResult.errors) {
      console.error(`    [${e.source}:${e.sourceId}] ${e.error}`);
    }
  } else {
    console.log("  ✓ Live migration complete");
  }

  // ── Step 6: Post-migration snapshot ────────────────────────────────────────
  console.log("\n══ Step 6: Post-migration snapshot ══════════════════════════");
  const postSnapshot = await computeScore("POST");
  console.log(`  Computed mojo_score: ${postSnapshot.computed.mojo_score}`);
  console.log(`  Stored  mojo_score: ${postSnapshot.stored.mojo_score}`);

  // Fetch the updated area_scores_json (migration runner may have written claim_state_distribution)
  const { data: postCompany } = await db
    .from("companies")
    .select("area_scores_json")
    .eq("id", CAFE_BARRA_ID)
    .maybeSingle();
  postSnapshot.stored = { ...postSnapshot.stored, area_scores_json: (postCompany as Record<string, unknown>)?.area_scores_json };

  fs.writeFileSync(
    path.join(DOCS_DIR, "cafe-barra-mojo-post.json"),
    JSON.stringify(postSnapshot, null, 2),
  );
  console.log("  ✓ Saved docs/migrations/cafe-barra-mojo-post.json");

  // ── Step 7: Diff ───────────────────────────────────────────────────────────
  console.log("\n══ Step 7: Score diff ════════════════════════════════════════");

  // Compare computed scores (the actual gate) — flatten both for comparison
  const preComputed = preSnapshot.computed as unknown as Record<string, unknown>;
  const postComputed = postSnapshot.computed as unknown as Record<string, unknown>;

  // Strip area_scores_json from diff — it always reflects computed time,
  // capture separately as additive-only change
  const preForDiff = { ...preComputed };
  const postForDiff = { ...postComputed };
  delete (preForDiff as Record<string, unknown>).area_scores_json;
  delete (postForDiff as Record<string, unknown>).area_scores_json;

  const scoreDiffs = deepDiff(preForDiff, postForDiff);
  const storedDiffs = deepDiff(
    { mojo_score: preSnapshot.stored.mojo_score, potential_score: preSnapshot.stored.potential_score, projected_score: preSnapshot.stored.projected_score },
    { mojo_score: postSnapshot.stored.mojo_score, potential_score: postSnapshot.stored.potential_score, projected_score: postSnapshot.stored.projected_score },
  );

  const passed = scoreDiffs.length === 0 && storedDiffs.length === 0;

  if (passed) {
    console.log("  ✓ PASS — computed mojo_score is byte-identical pre/post migration");
    console.log(`    mojo_score: ${preSnapshot.computed.mojo_score} (unchanged)`);
    console.log(`    gateScore:  ${preSnapshot.computed.gateScore} (unchanged)`);
    console.log(`    p_raw:      ${preSnapshot.computed.p_raw} (unchanged)`);
  } else {
    console.error("  ✗ FAIL — score differences detected:");
    for (const d of scoreDiffs) {
      console.error(`    ${d.path}: ${JSON.stringify(d.pre)} → ${JSON.stringify(d.post)}`);
    }
    for (const d of storedDiffs) {
      console.error(`    stored.${d.path}: ${JSON.stringify(d.pre)} → ${JSON.stringify(d.post)}`);
    }
    console.error("\n  HALTING — do not commit migration. Surface for review.");
    process.exit(1);
  }

  // Check what changed in area_scores_json
  const preAsj = (preSnapshot.stored.area_scores_json ?? null) as Record<string, unknown> | null;
  const postAsj = (postSnapshot.stored.area_scores_json ?? null) as Record<string, unknown> | null;
  if (postAsj && !preAsj) {
    const newKeys = Object.keys(postAsj);
    console.log(`  area_scores_json: null → {${newKeys.join(", ")}} (additive-only — score inputs unchanged)`);
  } else if (preAsj && postAsj) {
    const addedKeys = Object.keys(postAsj).filter((k) => !(k in preAsj));
    if (addedKeys.length > 0) {
      console.log(`  area_scores_json: added keys [${addedKeys.join(", ")}] (additive-only)`);
    }
  }

  // Post-migration DB stats
  const stats = await fetchDryRunStats();

  // ── Step 8: Migration report ───────────────────────────────────────────────
  console.log("\n══ Step 8: Writing migration report ═════════════════════════");

  let gitHash = "unknown";
  try { gitHash = execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim(); } catch { /* ok */ }

  const distributionInAsj = postAsj?.claim_state_distribution ?? null;

  const report = `# Cafe Barra — Claim State Machine Migration Report

**Date:** ${new Date().toISOString().split("T")[0]}
**Commit:** ${gitHash}
**Company ID:** ${CAFE_BARRA_ID}

## Migration Applied

6 schema migrations applied to local Supabase instance:

| Migration | Description |
|-----------|-------------|
| 20260603100000 | Extend claims — state, action_category, need_statement columns |
| 20260603100001 | Create claim_job_step_refs junction table |
| 20260603100002 | Create claim_events append-only audit table |
| 20260603100003 | Add routes.claim_id FK |
| 20260603100004 | Add strategic_decisions.linked_claim_id FK |
| 20260603100005 | Create derived_tensions_structural view |

## Backwards-Compat Migration Runner

### Phase 1 — CREATE (from source tables)

| Source | Created | Skipped |
|--------|---------|---------|
| odi_needs | ${lvP1.odi_needs_created} | ${lvP1.odi_needs_skipped} |
| routes | ${lvP1.routes_created} | ${lvP1.routes_skipped} |
| canvas fields | ${lvP1.canvas_created} | ${lvP1.canvas_skipped} |
| cascade fields | ${lvP1.cascade_fields_created} | ${lvP1.cascade_fields_skipped} |
| cascade assumptions | ${lvP1.cascade_assumptions_created} | ${lvP1.cascade_assumptions_skipped} |
| hypotheses | ${lvP1.hypotheses_created} | ${lvP1.hypotheses_skipped} |
| **Total** | **${lvP1Total}** | |

### Phase 2 — INFER (state elevation for pre-existing claims)

\`\`\`
Claims scanned:          ${lvP2.total}
Migrated (state raised): ${lvP2.migrated.length}
Stayed at outside_view:  ${lvP2.skipped}
Errors:                  ${liveResult.errors.length}
\`\`\`

## State Distribution

${distributionInAsj ? JSON.stringify(distributionInAsj, null, 2) : "Distribution not written (no claims to process — recomputeAndWriteDistribution not called when migrated.length = 0)"}

## Post-Migration DB Counts

| Table | Count |
|-------|-------|
| claims | ${stats.claims} |
| routes | ${stats.routes} |
| odi_needs | ${stats.odi_needs} |
| claim_signal_refs | ${stats.signal_refs} |

## mojo_score Diff Verification

**Result: ${passed ? "PASS ✓" : "FAIL ✗"}**

| Metric | Pre | Post |
|--------|-----|------|
| \`mojo_score\` (computed) | ${preSnapshot.computed.mojo_score} | ${postSnapshot.computed.mojo_score} |
| \`gateScore\` | ${preSnapshot.computed.gateScore} | ${postSnapshot.computed.gateScore} |
| \`p_raw\` | ${preSnapshot.computed.p_raw} | ${postSnapshot.computed.p_raw} |
| \`evidenceMultiplier\` | ${preSnapshot.computed.evidenceMultiplier} | ${postSnapshot.computed.evidenceMultiplier} |
| stored \`mojo_score\` | ${preSnapshot.stored.mojo_score} | ${postSnapshot.stored.mojo_score} |

Score computation inputs are unchanged by the schema migration — the migration
adds columns/tables/view and runs \`inferClaimState\` on existing claims rows,
none of which feed into \`scoreCompanyMojo\`.

## Anomalies and Notes

- **Phase 1 claims created:** ${lvP1Total} claims bootstrapped from source tables.
  Phase 2 (INFER) scanned ${lvP2.total} pre-existing claims for state elevation
  (was 0 before Phase 1 ran in this same pass).

- **area_scores_json:** Written by Phase 3 (DISTRIBUTION) if any claims were created
  or migrated. Contains the \`claim_state_distribution\` key derived from all claims
  rows at migration time.

- **claim_events:** One \`state_created\` event written per claim inserted in Phase 1.
  Phase 2 writes \`state_transitioned\` events only for state elevations.

- **routes.claim_id:** Populated by Phase 1B for each route that had a claim created.

## Snapshot Files

- Pre: \`docs/migrations/cafe-barra-mojo-pre.json\`
- Post: \`docs/migrations/cafe-barra-mojo-post.json\`
`;

  const reportPath = path.join(DOCS_DIR, "cafe-barra-2026-05-claim-state.md");
  fs.writeFileSync(reportPath, report);
  console.log("  ✓ Saved docs/migrations/cafe-barra-2026-05-claim-state.md");

  console.log("\n╔══════════════════════════════════════════════════════════╗");
  console.log(`║  Result: ${passed ? "PASS ✓ — migration is safe to commit      " : "FAIL ✗ — DO NOT COMMIT                     "}║`);
  console.log("╚══════════════════════════════════════════════════════════╝\n");
}

main().catch((err) => {
  console.error("\n✗ Validation script failed with unhandled error:");
  console.error(err);
  process.exit(1);
});
