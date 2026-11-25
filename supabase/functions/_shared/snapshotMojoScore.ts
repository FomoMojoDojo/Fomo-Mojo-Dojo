// ── Mojo Score Snapshot + Companies Write-back ───────────────────────────────
//
// Reads current claims/routes/needs, computes the live mojo score, inserts a
// history row into mojo_scores, and writes the fresh headline numbers back to
// companies so every consumer that reads companies.mojo_score (the compass,
// analytics, client views, admin panels) immediately reflects the live value.
//
// Errors are caught and logged; a snapshot failure is non-fatal.
//
// SCORE-2 projection unification — one meaning per column:
//   companies.potential_score = REACHABLE   (computeReachableScore: what
//     internal foundation work alone can add, contributor-headroom based)
//   companies.projected_score = DESTINATION (computeUnlockableScore: reachable
//     plus what customer research unlocks)
// These are the SAME definitions the surfaces render and explain
// (MojoScoreStrip, HomepageHierarchy), replacing the old evidence-band-cap
// formula that gave the columns a second, unexplained meaning.
//
// Call from any edge function that mutates claims, routes, or needs:
//   await snapshotMojoScore(supabase, companyId);
//
// SP-478 / SP-682 (2026-11-25) — ONE AUTHORITY. The Mojo Score's authority is the live computation
// (computeMojoScore over the one input rule). This function is the ONE server writer that keeps the
// stored copies — mojo_scores and the companies cache — in step with it:
//   • it reads the score's inputs through the ONE rule (scoreInputSet, src/lib/mojoScore/types.ts),
//     the same predicates the browser's live hook applies, and pages every read;
//   • it adds a mojo_scores row ONLY WHEN THE TOTAL CHANGES from the company's newest row of this
//     methodology, and touches the companies cache only when a cached number differs — so a daily
//     tick over a fleet that has not moved writes nothing;
//   • it NEVER writes for a frozen company. The freeze triggers would refuse the write anyway; this
//     stops before any write is attempted and says so in what it returns;
//   • { dryRun: true } makes every read and no write, and returns what it would have done.

import { computeMojoScore } from "../../../src/lib/mojoScore/computeMojoScore.ts";
import {
  computeReachableScore,
  computeUnlockableScore,
} from "../../../src/lib/mojoScore/projections.ts";
import {
  SCORE_CLAIM_COLUMNS, SCORE_INPUT_SOURCES, SCORE_NEED_COLUMNS, SCORE_ROUTE_COLUMNS, scoreInputSet,
  type ClaimInput, type RouteInput, type NeedInput,
} from "../../../src/lib/mojoScore/types.ts";
import { noEvidenceYet, EVIDENCE_PRESENCE_COMPONENT } from "./evidencePresence.ts";

export const MOJO_SCORE_SNAPSHOT_COMPONENT = "mojo_score_snapshot" as const;

// Structural client type (matches the sibling _shared modules): the generated
// DB types don't cover mojo_scores/companies mutations from this path, and the
// generic supabase-js client degrades those calls to `never`.
// deno-lint-ignore no-explicit-any
type SupabaseClient = { from: (table: string) => any };

/** What one call did, or — with dryRun — would have done. */
export type SnapshotOutcome = {
  company_id: string;
  /** Why nothing was computed, or null when a score was. */
  skipped: null | "frozen" | "no_evidence" | "no_company" | "error";
  total: number | null;
  potential: number | null;
  projected: number | null;
  /** The company's newest mojo_scores total of this methodology before the call, and the cache. */
  previous_total: number | null;
  cached_before: number | null;
  /** A mojo_scores row was added (or would be): only when the total changed. */
  row: "inserted" | "would_insert" | "unchanged" | null;
  /** The companies cache was updated (or would be): only when a cached number differed. */
  cache: "updated" | "would_update" | "unchanged" | null;
  dry_run: boolean;
};

/** How many rows one request asks for. A read is paged until a short page comes back, so a count
 *  on a first page is never taken for the whole. */
const PAGE = 1000;

// deno-lint-ignore no-explicit-any
async function readAll(supabase: SupabaseClient, table: string, columns: string, companyId: string): Promise<any[]> {
  // deno-lint-ignore no-explicit-any
  const out: any[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase.from(table).select(columns).eq("company_id", companyId).order("id").range(from, from + PAGE - 1);
    if (error) throw new Error(`${table} read failed: ${error.message}`);
    const rows = (data ?? []) as unknown[];
    out.push(...rows);
    if (rows.length < PAGE) return out;
  }
}

/** The score's inputs for one company, through the one rule. Exported so the read-only harnesses
 *  (the authority guard, the dry count) read exactly what the writer reads. */
export async function readScoreInputs(
  supabase: SupabaseClient,
  companyId: string,
): Promise<{ claims: ClaimInput[]; routes: RouteInput[]; needs: NeedInput[] }> {
  const [claims, routes, needs] = await Promise.all([
    readAll(supabase, SCORE_INPUT_SOURCES.claims, SCORE_CLAIM_COLUMNS, companyId),
    readAll(supabase, SCORE_INPUT_SOURCES.routes, SCORE_ROUTE_COLUMNS, companyId),
    readAll(supabase, SCORE_INPUT_SOURCES.needs, SCORE_NEED_COLUMNS, companyId),
  ]);
  return scoreInputSet({ claims, routes, needs }) as { claims: ClaimInput[]; routes: RouteInput[]; needs: NeedInput[] };
}

// ── Main snapshot function ────────────────────────────────────────────────────

export async function snapshotMojoScore(
  supabase: SupabaseClient,
  companyId: string,
  opts: { dryRun?: boolean; quietSkip?: boolean } = {},
): Promise<SnapshotOutcome> {
  const dryRun = opts.dryRun === true;
  const outcome: SnapshotOutcome = {
    company_id: companyId, skipped: null, total: null, potential: null, projected: null,
    previous_total: null, cached_before: null, row: null, cache: null, dry_run: dryRun,
  };
  try {
    // ── The company, first: a frozen company is never written (SP-682 ruling 6) ──────────────
    const { data: companyRow } = await supabase
      .from("companies")
      .select("id, frozen, mojo_score, potential_score, projected_score, area_scores_json")
      .eq("id", companyId)
      .maybeSingle();
    const company = (companyRow ?? null) as null | {
      frozen?: boolean | null; mojo_score?: number | null; potential_score?: number | null;
      projected_score?: number | null; area_scores_json?: unknown;
    };
    if (!company) { outcome.skipped = "no_company"; return outcome; }
    outcome.cached_before = typeof company.mojo_score === "number" ? company.mojo_score : null;
    if (company.frozen === true) {
      outcome.skipped = "frozen";
      console.log(`[snapshotMojoScore] company: ${companyId} | skipped: frozen`);
      return outcome;
    }

    // SP-478: the ONE input rule — struck claims, inactive routes, company-held / retracted /
    // proposed needs are out (scoreInputSet); 4f-6 (F9) and SP-467 are two of its predicates.
    const { claims, routes, needs } = await readScoreInputs(supabase, companyId);

    // Evidence presence: a company with no evidence gets no mojo_scores row and no companies
    // write-back — a score on zero evidence is a fabricated verdict. The skip is ledgered so the
    // absence is a record, not a silence. (The daily tick passes quietSkip: one record of the
    // absence is a record; one a day for every unscored company is noise.)
    if (await noEvidenceYet(supabase, companyId)) {
      outcome.skipped = "no_evidence";
      if (!dryRun && !opts.quietSkip) {
        const { error: skipErr } = await supabase.from("integrity_runs").insert({
          company_id: companyId, component: MOJO_SCORE_SNAPSHOT_COMPONENT, status: "skipped_empty_input",
          ran_at: new Date().toISOString(), examined: 0, admitted: 0,
          excluded_by_rule: { reason: "no_evidence_yet", rule: EVIDENCE_PRESENCE_COMPONENT },
          run_ref: "snapshotMojoScore",
        });
        if (skipErr) console.error("[snapshotMojoScore] skip ledger failed:", skipErr.message);
      }
      console.log(`[snapshotMojoScore] company: ${companyId} | skipped: no evidence yet`);
      return outcome;
    }

    const result = computeMojoScore({ companyId, claims, routes, needs, computedAt: new Date().toISOString() });

    // SCORE-2: potential_score = REACHABLE, projected_score = DESTINATION —
    // the projections.ts contributor-headroom definitions, identical to what
    // the score surfaces compute and explain.
    const potential_score = computeReachableScore(result);
    const projected_score = computeUnlockableScore(potential_score, result);
    outcome.total = result.total_score;
    outcome.potential = potential_score;
    outcome.projected = projected_score;

    // ── Has anything changed? ─────────────────────────────────────────────────
    // The newest row OF THIS METHODOLOGY: mojo_scores also holds outside-score rows, a different
    // calculation, and comparing against one of those would compare two different scores.
    const { data: lastRow } = await supabase
      .from("mojo_scores")
      .select("total_score, computed_at")
      .eq("company_id", companyId)
      .eq("methodology_version", result.methodology_version)
      .order("computed_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const previous = lastRow ? Number((lastRow as { total_score: unknown }).total_score) : null;
    outcome.previous_total = previous;
    const rowNeeded = previous === null || previous !== result.total_score;
    const cacheNeeded =
      company.mojo_score !== result.total_score ||
      company.potential_score !== potential_score ||
      company.projected_score !== projected_score;

    if (dryRun) {
      outcome.row = rowNeeded ? "would_insert" : "unchanged";
      outcome.cache = cacheNeeded ? "would_update" : "unchanged";
      return outcome;
    }

    // ── Insert history row into mojo_scores — only when the total changed ─────
    if (rowNeeded) {
      const componentScores: Record<string, unknown> = {};
      const explanationPayload: Record<string, unknown> = {};
      for (const c of result.contributors) {
        componentScores[c.key] = { score: c.score, weight: c.weight, weighted: c.weighted, sub_scores: c.sub_scores ?? {} };
        explanationPayload[c.key] = { label: c.label, explanation: c.explanation };
      }
      explanationPayload["projected_raisers"] = result.projected_raisers;
      explanationPayload["engagement_state"]  = result.engagement_state;

      await supabase
        .from("mojo_scores")
        .insert({
          company_id:          result.company_id,
          computed_at:         result.computed_at,
          total_score:         result.total_score,
          component_scores:    componentScores,
          explanation:         explanationPayload,
          methodology_version: result.methodology_version,
        });
      outcome.row = "inserted";
    } else {
      outcome.row = "unchanged";
    }

    // ── Write-back to companies — only when a cached number differs ───────────
    // companies.mojo_score mirrors the live value for the consumers that read the column: the
    // legacy and admin pages, which are not edited, and server jobs.
    if (cacheNeeded) {
      const { error: writeErr } = await supabase
        .from("companies")
        .update({
          mojo_score:      result.total_score,
          potential_score,
          projected_score,
        })
        .eq("id", companyId);

      if (writeErr) {
        console.error("[snapshotMojoScore] companies write-back failed:", writeErr.message);
      } else {
        outcome.cache = "updated";
        console.log(
          `[snapshotMojoScore] company: ${companyId} | live score: ${result.total_score} | reachable→potential: ${potential_score} | destination→projected: ${projected_score}`,
        );
      }
    } else {
      outcome.cache = "unchanged";
    }

    // ── Write claim_evidence_pct into area_scores_json (RMW, preserves all keys) ─
    // Weights: outside_view=0, diagnose=33, focus=67, flow=100.
    // Written here from the claims already loaded; only claim_evidence_pct is added
    // (claim_state_distribution is intentionally NOT persisted from this path).
    const claimTotal = claims.length;
    let nDiagnose = 0, nFocus = 0, nFlow = 0;
    for (const c of claims) {
      if (c.state === "diagnose") nDiagnose++;
      else if (c.state === "focus") nFocus++;
      else if (c.state === "flow") nFlow++;
    }
    const claimEvidencePct: number | null = claimTotal > 0
      ? Math.round((nDiagnose * 33 + nFocus * 67 + nFlow * 100) / claimTotal)
      : null;

    if (claimEvidencePct !== null) {
      const { data: asjRow } = await supabase
        .from("companies")
        .select("area_scores_json")
        .eq("id", companyId)
        .maybeSingle();

      const existing =
        asjRow && typeof asjRow === "object" && "area_scores_json" in asjRow
          ? ((asjRow as { area_scores_json: unknown }).area_scores_json ?? {})
          : {};
      const existingObj = (typeof existing === "object" && existing !== null ? existing : {}) as Record<string, unknown>;

      // Unchanged ⇒ no write: the tick must not touch a company row that has nothing new to say.
      if (existingObj.claim_evidence_pct !== claimEvidencePct) {
        const merged = { ...existingObj, claim_evidence_pct: claimEvidencePct };
        const { error: asjErr } = await supabase
          .from("companies")
          .update({ area_scores_json: merged })
          .eq("id", companyId);

        if (asjErr) {
          console.error("[snapshotMojoScore] claim_evidence_pct write failed:", asjErr.message);
        } else {
          console.log(`[snapshotMojoScore] claim_evidence_pct=${claimEvidencePct} written for ${companyId}`);
        }
      }
    }
    return outcome;
  } catch (err) {
    console.error("[snapshotMojoScore] failed (non-fatal):", String((err as Error)?.message ?? err));
    outcome.skipped = "error";
    return outcome;
  }
}
