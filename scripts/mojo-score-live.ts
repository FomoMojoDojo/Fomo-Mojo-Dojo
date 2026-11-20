// ── THE MOJO SCORE, COMPUTED LIVE FROM STORED ROWS (SP-467, 2026-11-20) ──────────────────────────
//
// SP-467: a materialised proposed need must not move the Mojo Score. Proving that needs the score
// recomputed from the rows as they stand, before and after — not the last `mojo_scores` row, which was
// written by whatever ran last and would agree with itself whatever the needs table now holds.
//
// The three selects are the SAME ONES snapshotMojoScore issues (supabase/functions/_shared/
// snapshotMojoScore.ts:44-67), including its `journey_key is not null` market filter and the
// `status <> 'struck'` claim filter, and the score comes from the one pure orchestrator
// (src/lib/mojoScore/computeMojoScore.ts). A second scoring rule here would be a second authority.
//
//   deno run -A scripts/mojo-score-live.ts [--company=<uuid>]
import { computeMojoScore } from "../src/lib/mojoScore/computeMojoScore.ts";
import type { ClaimInput, RouteInput, NeedInput } from "../src/lib/mojoScore/types.ts";

const arg = (n: string, d: string) => Deno.args.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? d;
const COMPANY = arg("company", "dd40ce2f-ff67-4111-bd3c-67943dde6717");
const DB = "supabase_db_dzlgyxcvuwiulgifbmew";

async function jsonq<T>(sql: string): Promise<T[]> {
  const { code, stdout, stderr } = await new Deno.Command("docker", {
    args: ["exec", "-i", DB, "psql", "-U", "postgres", "-v", "ON_ERROR_STOP=1", "-tA", "-c",
      `select coalesce(json_agg(t), '[]'::json) from (${sql}) t`],
    stdout: "piped", stderr: "piped",
  }).output();
  if (code !== 0) throw new Error(new TextDecoder().decode(stderr));
  return JSON.parse(new TextDecoder().decode(stdout));
}

const q = (s: string) => "'" + s.replaceAll("'", "''") + "'";
const claims = await jsonq<ClaimInput>(`select id, state, claim_type, topic, outside_support_count,
  organization_support_count, customer_support_count, updated_at
  from public.claims where company_id = ${q(COMPANY)} and status <> 'struck'`);
const routes = await jsonq<RouteInput>(`select id, category, level, parent_id, claim_id, steps_json,
  evidence_json, why_this_matters_json, rejected_alternatives, what_would_have_to_be_true,
  linked_need_ids, updated_at from public.routes where company_id = ${q(COMPANY)}`);
// SP-467: this select is snapshotMojoScore's, WITH its exclusion — a materialised proposed need is
// not a need of the map, so the score must not see it.
const needs = await jsonq<NeedInput>(`select id, desired_outcome, importance, satisfaction,
  opportunity_score, service_state, updated_at from public.odi_needs
  where company_id = ${q(COMPANY)} and journey_key is not null and status <> 'proposed'`);

const r = computeMojoScore({ companyId: COMPANY, claims, routes, needs, computedAt: new Date("2026-11-20T00:00:00Z") });
console.log(JSON.stringify({
  company_id: COMPANY, total_score: r.total_score,
  inputs: { claims: claims.length, routes: routes.length, needs: needs.length },
  contributors: r.contributors.map((c) => ({ key: c.key, weighted: c.weighted })),
}, null, 2));
