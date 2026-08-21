// ── outside-v1.0.0 runner (local dev) ─────────────────────────────────────────
//
// Computes the OPERATOR-SIGNED outside-only Mojo Score (anchor + micro-moves;
// formulas live ONCE in src/lib/outsideScore/computeOutsideScore.ts) for every
// company EXCEPT the frozen CB1, and inserts one row per eligible company into
// mojo_scores under methodology_version 'outside-v1.0.0' (insert-only; the DB
// freeze trigger independently protects CB1).
//
// I/O goes through the local supabase db container via `docker exec psql`
// (superuser — the same channel every audited local data act uses); the
// inserted values are passed as a JSON parameter, never string-interpolated
// into SQL. Run with --dry-run to print the per-company table without writing.
//
//   npx vite-node scripts/compute-outside-scores.ts -- --dry-run
//   npx vite-node scripts/compute-outside-scores.ts
//
// Input predicates mirror the 8-beat surface exactly:
//   signals:   signal_band='outside' AND voice_class='outside_voice_about_client'
//              AND superseded_at IS NULL AND evidence_excerpt non-empty
//   strength:  R4 via accepted signal_recurrence_verdicts + confidence_to_use
//   deltas:    R5 vocab (echoed/divergent/internally_silent), struck claims and
//              uploaded-document-derived declared sides excluded (shared
//              provenance rule), research_required already held out upstream.

import { execFileSync } from "node:child_process";
import {
  computeOutsideScore,
  OUTSIDE_METHODOLOGY_VERSION,
  type OutsideDeltaInput,
  type OutsideSignalInput,
} from "../src/lib/outsideScore/computeOutsideScore";

const DB_CONTAINER = "supabase_db_dzlgyxcvuwiulgifbmew";
const CB1_FROZEN_ID = "58b2b15b-bada-4bcd-9c12-b7e66a37d0bc"; // NEVER written

const dryRun = process.argv.includes("--dry-run");
// Optional: restrict to one company (still never CB1), and a vacuous-proof hook that drops one
// signal id from the scored input so the ledger diff can be checked.
const onlyCompany = process.argv.find((a) => a.startsWith("--company="))?.split("=")[1] ?? null;
const excludeSignal = process.argv.find((a) => a.startsWith("--exclude-signal="))?.split("=")[1] ?? null;
// Vacuous-proof hook: drop every delta whose declared statement (own-words id) matches, so the
// echo ledger's statement-id diff can be checked against exactly one planted statement.
const excludeStatement = process.argv.find((a) => a.startsWith("--exclude-statement="))?.split("=")[1] ?? null;

function psqlJson<T>(sql: string): T {
  const out = execFileSync(
    "docker",
    ["exec", "-i", DB_CONTAINER, "psql", "-U", "postgres", "-d", "postgres", "-tA", "-c", sql],
    { encoding: "utf8" },
  ).trim();
  return (out ? JSON.parse(out) : null) as T;
}

function psqlParamInsert(payloadJson: string): void {
  // Values travel as a JSON literal bound through jsonb — no SQL interpolation
  // of content. The docker arg boundary keeps the payload out of shell parsing.
  const sql = `
    INSERT INTO mojo_scores (company_id, computed_at, total_score, component_scores, explanation, methodology_version, input_ledger)
    SELECT (j->>'company_id')::uuid, (j->>'computed_at')::timestamptz, (j->>'total_score')::numeric,
           j->'component_scores', j->'explanation', j->>'methodology_version', j->'input_ledger'
    FROM (SELECT $$${payloadJson.replace(/\$\$/g, "")}$$::jsonb AS j) t;`;
  execFileSync(
    "docker",
    ["exec", "-i", DB_CONTAINER, "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-c", sql],
    { encoding: "utf8" },
  );
}

type CompanyRow = { id: string; name: string };
type SignalRow = {
  id: string;
  source_type: string | null;
  event_date: string | null;
  confidence_to_use: string | null;
};
type DeltaRow = {
  id: string;
  delta_type: string;
  declared_claim_id: string | null;
  declared_topic: string | null;
  declared_status: string | null;
  declared_doc_derived: boolean | null;
};

const computedAt = new Date().toISOString();

const companies =
  psqlJson<CompanyRow[]>(
    `SELECT coalesce(json_agg(json_build_object('id', id, 'name', name) ORDER BY created_at), '[]'::json) FROM companies
     WHERE id <> '${CB1_FROZEN_ID}'${onlyCompany ? ` AND id='${onlyCompany}'` : ""};`,
  ) ?? [];

console.log(`outside-v1.0.0 · computedAt ${computedAt} · ${dryRun ? "DRY RUN" : "WRITING"}`);
console.log(`CB1 (${CB1_FROZEN_ID}) excluded from compute by rule.\n`);

for (const company of companies) {
  const signalsRaw =
    psqlJson<SignalRow[]>(
      `SELECT coalesce(json_agg(json_build_object('id', id, 'source_type', source_type, 'event_date', event_date, 'confidence_to_use', confidence_to_use)), '[]'::json)
       FROM signals
       WHERE company_id='${company.id}' AND signal_band='outside'
         AND voice_class='outside_voice_about_client' AND superseded_at IS NULL
         AND length(trim(coalesce(evidence_excerpt,''))) > 0;`,
    ) ?? [];

  const confirmedIds = new Set(
    psqlJson<string[]>(
      `SELECT coalesce(json_agg(sid), '[]'::json) FROM (
         SELECT signal_a_id AS sid FROM signal_recurrence_verdicts WHERE company_id='${company.id}' AND verdict='accepted'
         UNION SELECT signal_b_id FROM signal_recurrence_verdicts WHERE company_id='${company.id}' AND verdict='accepted'
       ) s;`,
    ) ?? [],
  );

  const deltasRaw =
    psqlJson<DeltaRow[]>(
      `SELECT coalesce(json_agg(json_build_object(
         'id', d.id,
         'delta_type', d.delta_type,
         'declared_claim_id', d.declared_claim_id,
         'declared_topic', dc.topic,
         'declared_status', dc.status,
         'declared_doc_derived', EXISTS (
            SELECT 1 FROM claim_signal_refs r JOIN signals s ON s.id = r.signal_id
            WHERE r.claim_id = d.declared_claim_id AND s.source_type = 'uploaded_file')
       )), '[]'::json)
       FROM claim_deltas d LEFT JOIN claims dc ON dc.id = d.declared_claim_id
       WHERE d.company_id='${company.id}'
         AND d.pairing_kind='public_vs_public'
         AND d.delta_type IN ('echoed','divergent','internally_silent');`,
    ) ?? [];

  const signals: OutsideSignalInput[] = signalsRaw
    // Vacuous-proof hook: drop one signal id from the scored input (proof, never a real run).
    .filter((s) => s.id !== excludeSignal)
    .map((s) => ({
      id: s.id,
      sourceType: s.source_type,
      eventDate: s.event_date,
      confidence: s.confidence_to_use,
      recurrenceConfirmed: confirmedIds.has(s.id),
    }));

  const deltas: OutsideDeltaInput[] = deltasRaw
    .filter((d) => d.declared_status !== "struck" && d.declared_doc_derived !== true)
    // Vacuous-proof hook: drop one declared statement's deltas from the scored input (proof, never a real run).
    .filter((d) => d.declared_claim_id !== excludeStatement)
    .map((d) => ({
      id: d.id,
      deltaType: d.delta_type as OutsideDeltaInput["deltaType"],
      declaredClaimId: d.declared_claim_id,
      declaredTopic: d.declared_topic,
    }));

  const result = computeOutsideScore({ companyId: company.id, signals, deltas, computedAt });

  if (!result.eligible) {
    console.log(`${company.name.padEnd(32)} INELIGIBLE (${result.signalCount} outside-voice signals < 10) — no row`);
    continue;
  }

  const moveStr = result.moves.map((m) => `${m.key}=${m.value.toFixed(3)}`).join("  ");
  console.log(
    `${company.name.padEnd(32)} signals=${String(result.signalCount).padStart(3)}  anchor=${result.anchor}  ${moveStr}  total=${result.totalUnrounded.toFixed(3)} → ${result.totalScore}`,
  );

  if (dryRun) {
    console.log(`  LEDGER ${company.name}: ${JSON.stringify(result.inputLedger)}`);
    continue;
  }

  const component_scores: Record<string, unknown> = {
    anchor: { value: result.anchor, explanation: "Research base rate for strategy success (sub-20%)." },
  };
  const explanation: Record<string, unknown> = {
    methodology: "Anchor + micro-moves, read from outside-voice public signals only.",
    signal_count: result.signalCount,
  };
  for (const m of result.moves) {
    component_scores[m.key] = { value: m.value, min: m.min, max: m.max };
    explanation[m.key] = m.explanation;
  }

  psqlParamInsert(
    JSON.stringify({
      company_id: result.companyId,
      computed_at: result.computedAt,
      total_score: result.totalScore,
      component_scores,
      explanation,
      methodology_version: OUTSIDE_METHODOLOGY_VERSION,
      input_ledger: result.inputLedger,
    }),
  );
}

console.log("\ndone.");
