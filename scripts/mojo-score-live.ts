// ── THE MOJO SCORE, COMPUTED LIVE FROM STORED ROWS (SP-467, 2026-11-20) ──────────────────────────
//
// SP-467: a materialised proposed need must not move the Mojo Score. Proving that needs the score
// recomputed from the rows as they stand, before and after — not the last `mojo_scores` row, which was
// written by whatever ran last and would agree with itself whatever the needs table now holds.
//
// The inputs come through the ONE rule snapshotMojoScore and the browser's live hook use
// (scoreInputSet, src/lib/mojoScore/types.ts — SP-478), and the score comes from the one pure
// orchestrator (src/lib/mojoScore/computeMojoScore.ts). A second rule here would be a second authority.
//
//   deno run -A scripts/mojo-score-live.ts [--company=<uuid>]
import { computeMojoScore } from "../src/lib/mojoScore/computeMojoScore.ts";
import {
  SCORE_CLAIM_COLUMNS, SCORE_INPUT_SOURCES, SCORE_NEED_COLUMNS, SCORE_ROUTE_COLUMNS, scoreInputSet,
  type ClaimInput, type RouteInput, type NeedInput,
} from "../src/lib/mojoScore/types.ts";

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
// SP-478 (2026-11-25): the ONE input rule. The rows are read from the rule's own sources with the
// rule's own columns, and passed through scoreInputSet — exactly what snapshotMojoScore does
// (readScoreInputs) and what the browser's live hook does. No filter is restated in SQL here: a
// second statement of the rule is a second authority. SP-467's exclusion (a materialised proposed
// need is not a need of the map) is one of the rule's predicates.
const all = {
  claims: await jsonq<ClaimInput & { status?: string | null }>(
    `select ${SCORE_CLAIM_COLUMNS} from public.${SCORE_INPUT_SOURCES.claims} where company_id = ${q(COMPANY)}`),
  routes: await jsonq<RouteInput & { relevance_state?: string | null }>(
    `select ${SCORE_ROUTE_COLUMNS} from public.${SCORE_INPUT_SOURCES.routes} where company_id = ${q(COMPANY)}`),
  needs: await jsonq<NeedInput & { status?: string | null; journey_key?: string | null }>(
    `select ${SCORE_NEED_COLUMNS} from public.${SCORE_INPUT_SOURCES.needs} where company_id = ${q(COMPANY)}`),
};
const { claims, routes, needs } = scoreInputSet(all);

const r = computeMojoScore({ companyId: COMPANY, claims, routes, needs, computedAt: new Date("2026-11-20T00:00:00Z") });
console.log(JSON.stringify({
  company_id: COMPANY, total_score: r.total_score,
  inputs: { claims: claims.length, routes: routes.length, needs: needs.length },
  contributors: r.contributors.map((c) => ({ key: c.key, weighted: c.weighted })),
}, null, 2));
