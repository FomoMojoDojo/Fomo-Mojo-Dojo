#!/usr/bin/env -S deno run --allow-all
// ── DELTA RULE REFUSALS — the data act for gap-quality rules R1–R3 (operator ruling 2026-10-22) ─────────────────────────
//
// Applies supabase/functions/_shared/deltaRuleChecks.ts (the same functions the public finalize calls) to ONE company's
// existing public_vs_public pairs, under the data-act pattern. Named mode, no default:
//
//   --mode=plan          --company=<id> --out=<plan.json>          read-only (writes are blocked in the client); prints
//                        [--operator=<ops.json> --operator-actor=operator:<who>]   the plan md5 (sha of the sorted
//                                                                   delta_id:rule list). ops.json = [{delta_id, reason}]:
//                                                                   OPERATOR refusals, reason verbatim (ruling 8)
//   --mode=revert-probe  --plan=<plan.json>                         BEGIN; apply; assert; revert; assert; ROLLBACK
//   --mode=apply         --plan=<plan.json> --plan-md5=<md5>        re-plans read-only, refuses unless it equals the file
//                        [--expect-disputed=<ids,..>] [--expect-raised=<ids,..>] [--expect-echoed=<ids,..>]
//                        [--expect-operator=<ids,..>]                by id (and every expected set given, by 8-char id);
//                                                                   then ONE transaction: claim_deltas md5 before, one audit
//                                                                   row before each refusal row, md5 after must be equal,
//                                                                   one integrity_runs row (component claim_delta_rule_refusals)
//   --mode=revert        --company=<id> --run-ref=<ref>             a revert row (audit first) for every active refusal of the run
//
// Writes go through psql in the DB container (the audited channel the guards use). claim_deltas is never written.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { DELTA_RULES_VERSION, loadActiveRuleRefusals, loadPairRuleInputs, planOperatorRefusals, planRuleRefusals, type PlannedRefusal } from "../supabase/functions/_shared/deltaRuleChecks.ts";

const DB_CONTAINER = Deno.env.get("DB_CONTAINER") ?? "supabase_db_dzlgyxcvuwiulgifbmew";
const arg = (k: string) => Deno.args.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
const mode = arg("mode");
if (!mode || !["plan", "revert-probe", "apply", "revert"].includes(mode)) { console.error("mode required: plan | revert-probe | apply | revert"); Deno.exit(2); }

type PlanFile = { company_id: string; rules_version: number; planned_at: string; operator?: OperatorReq[]; operator_actor?: string; refusals: PlannedRefusal[] };

function readOnlyClient() {
  const url = Deno.env.get("SUPABASE_URL"), key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) { console.error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set"); Deno.exit(2); }
  const raw = createClient(url!, key!);
  const BAN = new Set(["insert", "update", "upsert", "delete"]);
  // deno-lint-ignore no-explicit-any
  return { from: (t: string) => new Proxy(raw.from(t) as any, { get(o, k) { if (BAN.has(String(k))) throw new Error(`plan is read-only: ${t}.${String(k)} refused`); const v = o[k]; return typeof v === "function" ? v.bind(o) : v; } }) };
}
type OperatorReq = { delta_id: string; reason: string };
async function planFor(companyId: string, ops: OperatorReq[] = [], opActor = ""): Promise<PlannedRefusal[]> {
  const sb = readOnlyClient();
  const active = await loadActiveRuleRefusals(sb, companyId);
  // OPERATOR refusals first: an identity the operator names is not re-planned by the rules in the same act
  const opPlan = ops.length ? await planOperatorRefusals(sb, companyId, ops, opActor, active) : [];
  const taken = new Map<string, unknown>([...active, ...opPlan.map((o) => [o.content_identity, o] as [string, unknown])]);
  const { inputs, nameWords } = await loadPairRuleInputs(sb, companyId);
  return [...planRuleRefusals(inputs, nameWords, taken), ...opPlan].sort((a, b) => a.delta_id.localeCompare(b.delta_id));
}
async function sha(s: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 32);
}
const planKey = (rs: readonly PlannedRefusal[]) => rs.map((r) => `${r.delta_id}:${r.rule}`).sort().join("\n");

async function psql(sql: string): Promise<{ code: number; out: string }> {
  const p = new Deno.Command("docker", { args: ["exec", "-i", DB_CONTAINER, "psql", "-U", "postgres", "-d", "postgres", "-XAt", "-v", "ON_ERROR_STOP=1"], stdin: "piped", stdout: "piped", stderr: "piped" }).spawn();
  const w = p.stdin.getWriter(); await w.write(new TextEncoder().encode(sql)); await w.close();
  const o = await p.output();
  return { code: o.code, out: new TextDecoder().decode(o.stdout) + new TextDecoder().decode(o.stderr) };
}
const q = (s: string) => `$cdrr$${s}$cdrr$`;
const DELTA_MD5 = (co: string) => `(select md5(coalesce(string_agg(t::text, '|' order by t.id), '')) from public.claim_deltas t where t.company_id = '${co}')`;
const ACTIVE_N = (co: string, runRef: string) => `(select count(*) from public.claim_delta_rule_refusals_active a join public.claim_delta_rule_refusals r on r.id = a.id where a.company_id = '${co}' and r.run_ref = ${q(runRef)})`;

/** The apply body: one audit row BEFORE each refusal row. Raises if claim_deltas changed. No BEGIN/COMMIT here. */
function applySql(plan: PlanFile, runRef: string, actor: string): string {
  const co = plan.company_id;
  const lines = [`create temp table _cdrr_md5 on commit drop as select ${DELTA_MD5(co)} as m;`];
  for (const r of plan.refusals) {
    const id = crypto.randomUUID();
    lines.push(
      `insert into public.claim_delta_rule_refusal_audit (refusal_id, company_id, delta_id, rule, action, before, after, actor, run_ref) ` +
      `select '${id}', '${co}', '${r.delta_id}', '${r.rule}', 'refuse', jsonb_build_object('active', false, 'delta_row_md5', (select md5(d::text) from public.claim_deltas d where d.id = '${r.delta_id}')), ` +
      `jsonb_build_object('active', true, 'rule', '${r.rule}', 'outcome', '${r.outcome}', 'kind', '${r.kind ?? "rule"}'), ${q(r.actor ?? actor)}, ${q(runRef)};`,
      `insert into public.claim_delta_rule_refusals (id, company_id, delta_id, content_identity, delta_type, rule, outcome, action, reason, detail, rules_version, actor, run_ref, kind) ` +
      `values ('${id}', '${co}', '${r.delta_id}', ${q(r.content_identity)}, '${r.delta_type}', '${r.rule}', '${r.outcome}', 'refuse', ${q(r.reason)}, ${q(JSON.stringify(r.detail))}::jsonb, ${DELTA_RULES_VERSION}, ${q(r.actor ?? actor)}, ${q(runRef)}, '${r.kind ?? "rule"}');`,
    );
  }
  lines.push(`do $$ begin if (select m from _cdrr_md5) <> ${DELTA_MD5(co)} then raise exception 'claim_deltas changed during the act — refused'; end if; end $$;`);
  return lines.join("\n");
}
/** The revert body: for every active refusal of the run, an audit row then a revert row. */
function revertSql(co: string, runRef: string, actor: string): string {
  return `
create temp table _cdrr_rev on commit drop as
  select gen_random_uuid() as rid, a.id as refusal_id, a.delta_id, a.rule from public.claim_delta_rule_refusals_active a
  join public.claim_delta_rule_refusals r on r.id = a.id where a.company_id = '${co}' and r.run_ref = ${q(runRef)};
insert into public.claim_delta_rule_refusal_audit (refusal_id, company_id, delta_id, rule, action, before, after, actor, run_ref)
  select rid, '${co}', delta_id, rule, 'revert', jsonb_build_object('active', true, 'reverts', refusal_id), jsonb_build_object('active', false), ${q(actor)}, ${q(runRef + ":revert")} from _cdrr_rev;
insert into public.claim_delta_rule_refusals (id, company_id, delta_id, content_identity, delta_type, rule, outcome, action, reverts, reason, detail, rules_version, actor, run_ref, kind)
  select v.rid, r.company_id, r.delta_id, r.content_identity, r.delta_type, r.rule, r.outcome, 'revert', r.id, 'revert of ' || r.id::text, '{}'::jsonb, r.rules_version, case when r.kind = 'operator' then r.actor else ${q(actor)} end, ${q(runRef + ":revert")}, r.kind
  from _cdrr_rev v join public.claim_delta_rule_refusals r on r.id = v.refusal_id;`;
}

if (mode === "plan") {
  const co = arg("company"), out = arg("out");
  if (!co || !out) { console.error("--company and --out required"); Deno.exit(2); }
  const ops = arg("operator") ? JSON.parse(await Deno.readTextFile(arg("operator")!)) as OperatorReq[] : [];
  const opActor = arg("operator-actor") ?? "";
  const refusals = await planFor(co!, ops, opActor);
  const file: PlanFile = { company_id: co!, rules_version: DELTA_RULES_VERSION, planned_at: new Date().toISOString(), operator: ops, operator_actor: opActor, refusals };
  await Deno.writeTextFile(out!, JSON.stringify(file, null, 2));
  console.log(JSON.stringify({ mode, company: co, refusals: refusals.length, by_rule: refusals.reduce((m, r) => ({ ...m, [r.rule]: (m[r.rule] ?? 0) + 1 }), {} as Record<string, number>), plan_md5: await sha(planKey(refusals)), out }));
  for (const r of refusals) console.log(`  ${r.delta_id}\t${r.delta_type}\t${r.kind}\t${r.rule}\t${r.kind === "operator" ? r.reason : ((r.detail.rules_fired as string[]) ?? []).join("+")}`);
  Deno.exit(0);
}

if (mode === "revert-probe" || mode === "apply") {
  const plan = JSON.parse(await Deno.readTextFile(arg("plan") ?? "")) as PlanFile;
  const co = plan.company_id;
  const runRef = mode === "apply" ? `delta-rule-refusals:${co}:${new Date().toISOString()}` : `revert-probe:${crypto.randomUUID()}`;
  const actor = "scripts/delta-rule-refusals.ts";
  if (mode === "revert-probe") {
    const n = plan.refusals.length;
    const sql = `begin;
create temp table _probe_md5 as select ${DELTA_MD5(co)} as m;
${applySql(plan, runRef, actor)}
select 'applied_active=' || ${ACTIVE_N(co, runRef)};
select 'audit_rows=' || (select count(*) from public.claim_delta_rule_refusal_audit where run_ref = ${q(runRef)});
do $$ begin if ${ACTIVE_N(co, runRef)} <> ${n} then raise exception 'probe: active after apply <> ${n}'; end if; end $$;
${revertSql(co, runRef, actor)}
select 'reverted_active=' || ${ACTIVE_N(co, runRef)};
do $$ begin if ${ACTIVE_N(co, runRef)} <> 0 then raise exception 'probe: active after revert <> 0'; end if; end $$;
select 'claim_deltas_md5_unchanged=' || ((select m from _probe_md5) = ${DELTA_MD5(co)});
do $$ begin if (select m from _probe_md5) <> ${DELTA_MD5(co)} then raise exception 'probe: claim_deltas changed'; end if; end $$;
rollback;
select 'after_rollback_rows=' || (select count(*) from public.claim_delta_rule_refusals where run_ref like ${q(runRef + "%")});`;
    const r = await psql(sql);
    console.log(r.out.trim());
    console.log(r.code === 0 ? "revert-probe: PASS (rolled back)" : "revert-probe: FAIL");
    Deno.exit(r.code === 0 ? 0 : 1);
  }
  // apply
  const want = arg("plan-md5");
  const fileMd5 = await sha(planKey(plan.refusals));
  if (!want || want !== fileMd5) { console.error(`plan md5 mismatch: given ${want}, file ${fileMd5}`); Deno.exit(1); }
  const fresh = await planFor(co, plan.operator ?? [], plan.operator_actor ?? "");
  if (planKey(fresh) !== planKey(plan.refusals)) { console.error("re-plan differs from the plan file by id — refused"); Deno.exit(1); }
  const short = (ids?: string) => (ids ?? "").split(",").map((s) => s.trim()).filter(Boolean).sort().join(",");
  const got = (f: (r: PlannedRefusal) => boolean) => plan.refusals.filter(f).map((r) => r.delta_id.slice(0, 8)).sort().join(",");
  const sets: Array<[string, (r: PlannedRefusal) => boolean]> = [
    ["expect-disputed", (r) => r.kind !== "operator" && r.delta_type === "divergent"],
    ["expect-raised", (r) => r.kind !== "operator" && r.delta_type === "internally_silent"],
    ["expect-echoed", (r) => r.kind !== "operator" && r.delta_type === "echoed"],
    ["expect-operator", (r) => r.kind === "operator"],
  ];
  for (const [k, f] of sets) {
    const e = arg(k); if (e !== undefined && short(e) !== got(f)) { console.error(`${k} differs:\n  expected ${short(e)}\n  planned  ${got(f)}`); Deno.exit(1); }
  }
  const sql = `begin;
${applySql(plan, runRef, actor)}
insert into public.integrity_runs (company_id, component, status, examined, admitted, excluded_by_rule, run_ref, ran_at)
  values ('${co}', 'claim_delta_rule_refusals', 'completed', ${plan.refusals.length}, ${plan.refusals.length},
          ${q(JSON.stringify({ rules_version: DELTA_RULES_VERSION, plan_md5: fileMd5, by_rule: plan.refusals.reduce((m, r) => ({ ...m, [r.rule]: (m[r.rule] ?? 0) + 1 }), {} as Record<string, number>) }))}::jsonb, ${q(runRef)}, now());
select 'refusals=' || ${ACTIVE_N(co, runRef)};
select 'audit_rows=' || (select count(*) from public.claim_delta_rule_refusal_audit where run_ref = ${q(runRef)});
commit;`;
  const r = await psql(sql);
  console.log(r.out.trim());
  console.log(JSON.stringify({ mode, company: co, run_ref: runRef, ok: r.code === 0 }));
  Deno.exit(r.code === 0 ? 0 : 1);
}

if (mode === "revert") {
  const co = arg("company"), runRef = arg("run-ref");
  if (!co || !runRef) { console.error("--company and --run-ref required"); Deno.exit(2); }
  const r = await psql(`begin;\n${revertSql(co!, runRef!, "scripts/delta-rule-refusals.ts")}\nselect 'active_after=' || ${ACTIVE_N(co!, runRef!)};\ncommit;`);
  console.log(r.out.trim()); Deno.exit(r.code === 0 ? 0 : 1);
}
