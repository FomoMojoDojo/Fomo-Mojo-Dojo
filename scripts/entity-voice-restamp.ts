#!/usr/bin/env -S deno run --allow-all
// ── ENTITY VOICE RESTAMP — rulings 12 + 13 applied to stored rows (operator ruling 17, 2026-10-22) ───────────────────────
//
// Rulings 12 (a confirmed parent's own SEC filing is the company's own voice) and 13 (the related-entity rules read the
// PAGE's published date) decide at mint. This restamps ONE company's EXISTING rows to what the same shipped authority
// decides today, under the data-act pattern. Named mode, no default:
//
//   --mode=plan          --company=<id> --out=<plan.json>     read-only; prints the plan md5 (sha of the sorted
//                                                             id:kind:to list)
//   --mode=revert-probe  --plan=<plan.json>                   BEGIN; apply; revert; assert md5s; ROLLBACK
//   --mode=apply         --plan=<plan.json> --plan-md5=<md5>  re-plans read-only and refuses unless it equals the file
//                        --expect-filing=<ids,..> --expect-undated=<ids,..>   and the two kinds are exactly these 8-char ids;
//                                                             then ONE transaction: an integrity_runs row (component
//                                                             entity_voice_restamp, md5s before) first, per row a
//                                                             signal_voice_restamps audit row BEFORE the signal write
//   --mode=revert        --company=<id> --run-ref=<ref>       per restamped row a revert audit row first, then the row's
//                                                             recorded before-state restored; apply audit rows marked
//                                                             reverted_at
//
// WRITE LAW: signals.voice_class (only where its audit row of this run exists) and signals.raw_payload (merged in SQL) —
// no other column, no delete. Each restamped row carries raw_payload.entity_restamp {run_ref, audit_id, before}, which
// the revert reads. Kinds:
//   filing   ruling 12 — EDGAR under a confirmed parent's signed CIK, today classed otherwise → client_voice, entity
//            stamp, voice_authority own_filing_related
//   undated  ruling 13 — a related-entity row whose entity has a start date and whose page carries no published date
//            (stored page_date, else the newest snapshot's og / ld+json) → basis page_undated; class unchanged
//   a row ruling 13 would move OUT of own voice (a page dated before the start) is planned as kind `dated_out` and the
//   apply refuses it — that is a class change no ruling has signed.
import { lit, PsqlSession } from "./lib/psqlBlankingStore.ts";
import { decideVoiceClassBeforeJudge } from "../supabase/functions/_shared/voiceClassAtMint.ts";
import { entityBasisAtPage, publishedDayOf, publishedDayOfSnapshot, type EntityStamp, type RelatedEntityRow } from "../supabase/functions/_shared/ownHosts.ts";
import { edgarCikOf } from "../supabase/functions/_shared/filerCiks.ts";

const arg = (k: string) => Deno.args.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
const mode = arg("mode");
if (!mode || !["plan", "revert-probe", "apply", "revert"].includes(mode)) { console.error("mode required: plan | revert-probe | apply | revert"); Deno.exit(2); }
const out = (o: unknown) => console.log(JSON.stringify(o));
const COMPONENT = "entity_voice_restamp";
const REVERT_VERDICT = "entity_restamp_revert";

type Kind = "filing" | "undated" | "dated_out";
type Planned = {
  signal_id: string; kind: Kind; source_url: string;
  before: { voice_class: string | null; entity: EntityStamp | null; voice_authority: unknown };
  after: { voice_class: string | null; entity: EntityStamp; voice_authority: unknown };
  page_date: string | null; reason: string;
};
type PlanFile = { company_id: string; planned_at: string; restamps: Planned[] };

async function sha(s: string) { return [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)))].map((b) => b.toString(16).padStart(2, "0")).join(""); }
const planMd5 = (p: Planned[]) => sha(p.map((r) => `${r.signal_id}:${r.kind}:${r.after.voice_class}:${r.after.entity.basis}`).sort().join("\n"));
const jlit = (v: unknown) => v === null || v === undefined ? "null::jsonb" : `${lit(JSON.stringify(v))}::jsonb`;

async function plan(s: PsqlSession, companyId: string): Promise<Planned[]> {
  const [co] = await s.query<{ id: string; website: string | null; frozen: boolean; fixture_hold: string | null }>(`select id, website, coalesce(frozen,false) frozen, fixture_hold from companies where id=${lit(companyId)}::uuid`);
  if (!co) throw new Error(`no company ${companyId}`);
  if (co.frozen || co.fixture_hold) throw new Error(`company ${companyId} is frozen or held — refused`);
  const host = (() => { try { return new URL(String(co.website)).hostname.replace(/^www\./i, "").toLowerCase(); } catch { return null; } })();
  const related = await s.query<RelatedEntityRow>(`select id, name, host, relation, effective_from::text effective_from, effective_basis, status from company_related_entities where company_id=${lit(companyId)}::uuid and status='confirmed' order by host`);
  if (!related.length) return [];
  const rows = await s.query<{ id: string; source_url: string | null; voice_class: string | null; raw_payload: Record<string, unknown> | null }>(`select id, source_url, voice_class, raw_payload from signals where company_id=${lit(companyId)}::uuid and source_url is not null order by id`);
  const snaps = await s.query<{ source_url: string; structured: unknown }>(`select distinct on (source_url) source_url, structured from outside_page_snapshots where company_id=${lit(companyId)}::uuid order by source_url, crawled_at desc`);
  const snapByUrl = new Map(snaps.map((x) => [x.source_url, x.structured]));
  const outRows: Planned[] = [];
  for (const r of rows) {
    const url = String(r.source_url);
    const rp = r.raw_payload ?? {};
    const storedEntity = (rp.entity ?? null) as EntityStamp | null;
    const before = { voice_class: r.voice_class, entity: storedEntity, voice_authority: rp.voice_authority ?? null };
    const pageDate = publishedDayOf(typeof rp.page_date === "string" ? rp.page_date : null) ?? publishedDayOfSnapshot(snapByUrl.get(url) ?? null);
    // ruling 12 — the shipped authority on the row's URL, with the row's page date
    if (edgarCikOf(url) != null) {
      const d = decideVoiceClassBeforeJudge({ url, item: null, labeledClass: r.voice_class, pageText: null, judgedText: null, company: { name: "", host, related }, pageDate: { date: pageDate }, registry: null, judge: null, gate: "profile", onJudgeFailure: "keep_label" });
      if ("ok" in d && d.ok && d.authority === "own_filing_related" && d.entity) {
        const authOk = (rp.voice_authority as { authority?: unknown } | null)?.authority === "own_filing_related";
        if (r.voice_class !== "client_voice" || !authOk || storedEntity?.id !== d.entity.id) {
          outRows.push({ signal_id: r.id, kind: "filing", source_url: url, before, after: { voice_class: "client_voice", entity: d.entity, voice_authority: { authority: "own_filing_related" } }, page_date: pageDate, reason: `ruling 12: ${d.detail}` });
        }
      }
      continue;
    }
    // ruling 13 — a row the related-entity rule stamped, on an entity WITH a start date
    if (!storedEntity || !storedEntity.effective_from) continue;
    const ent = related.find((e) => e.id === storedEntity.id);
    if (!ent || !ent.effective_from) continue;
    const basis = entityBasisAtPage(ent, pageDate);
    if (basis === storedEntity.basis) continue;
    if (basis === "before_effective") {
      outRows.push({ signal_id: r.id, kind: "dated_out", source_url: url, before, after: { voice_class: "outside_voice_about_client", entity: { ...storedEntity, basis }, voice_authority: null }, page_date: pageDate, reason: `ruling 13: page dated ${pageDate}, before ${ent.effective_from}` });
    } else {
      outRows.push({ signal_id: r.id, kind: "undated", source_url: url, before, after: { voice_class: r.voice_class, entity: { ...storedEntity, basis }, voice_authority: rp.voice_authority ?? null }, page_date: pageDate, reason: basis === "page_undated" ? "ruling 13: the page carries no published date — own voice, · date not confirmed" : `ruling 13: page dated ${pageDate} — basis ${basis}` });
    }
  }
  return outRows;
}

async function md5s(s: PsqlSession, companyId: string, ids: readonly string[]) {
  const idl = ids.length ? ids.map((i) => `${lit(i)}::uuid`).join(",") : "null";
  const [r] = await s.query<{ company: string; others: string; targets: string }>(`select
    (select md5(coalesce(string_agg(id::text||'|'||coalesce(voice_class,'∅')||'|'||coalesce(raw_payload::text,'∅')||'|'||coalesce(superseded_at::text,'∅')||'|'||coalesce(held_at::text,'∅'), ',' order by id),'')) from signals where company_id=${lit(companyId)}::uuid) company,
    (select md5(coalesce(string_agg(t::text, ',' order by t.id),'')) from (select id, company_id, source_url, voice_class, raw_payload, claim_text, evidence_excerpt, superseded_at, held_at, created_at from signals where id not in (${idl})) t) others,
    (select md5(coalesce(string_agg(id::text||'|'||coalesce(voice_class,'∅')||'|'||coalesce(raw_payload::text,'∅'), ',' order by id),'')) from signals where id in (${idl})) targets`);
  return r;
}

async function apply(s: PsqlSession, p: PlanFile, runRef: string) {
  const ids = p.restamps.map((r) => r.signal_id);
  const before = await md5s(s, p.company_id, ids);
  const [ir] = await s.mutate<{ id: number }>(`insert into integrity_runs (company_id, component, status, examined, admitted, excluded_by_rule, run_ref)
    values (${lit(p.company_id)}::uuid, ${lit(COMPONENT)}, 'running', ${p.restamps.length}, 0, ${jlit({ ruling: 17, mode: "apply", md5_before: before, planned: p.restamps.map((r) => ({ id: r.signal_id, kind: r.kind })) })}, ${lit(runRef)}) returning id`);
  const audits: Array<{ signal_id: string; audit_id: string }> = [];
  for (const r of p.restamps) {
    const [a] = await s.mutate<{ id: string }>(`insert into signal_voice_restamps (company_id, signal_id, run_ref, ledger_run_id, old_voice_class, new_voice_class, judge_verdict, judge_entity, judge_reason, judge_model, source_url)
      values (${lit(p.company_id)}::uuid, ${lit(r.signal_id)}::uuid, ${lit(runRef)}, null, ${lit(r.before.voice_class)}, ${lit(String(r.after.voice_class))}, ${lit(r.kind === "filing" ? "own_filing_related" : "page_undated")}, ${lit(r.after.entity.name)}, ${lit(r.reason)}, 'deterministic (no model)', ${lit(r.source_url)}) returning id`);
    const stamp = { entity: r.after.entity, ...(r.after.voice_authority ? { voice_authority: r.after.voice_authority } : {}), entity_restamp: { run_ref: runRef, audit_id: a.id, ruling: 17, kind: r.kind, before: r.before, at: new Date().toISOString() } };
    const w = await s.mutate(`update signals set voice_class=${lit(String(r.after.voice_class))}, raw_payload=coalesce(raw_payload,'{}'::jsonb) || ${jlit(stamp)}
      where id=${lit(r.signal_id)}::uuid and company_id=${lit(p.company_id)}::uuid
        and exists (select 1 from signal_voice_restamps x where x.id=${lit(a.id)}::uuid and x.signal_id=signals.id and x.run_ref=${lit(runRef)}) returning id`);
    if (w.length !== 1) throw new Error(`signal ${r.signal_id}: write touched ${w.length} rows`);
    audits.push({ signal_id: r.signal_id, audit_id: a.id });
  }
  const after = await md5s(s, p.company_id, ids);
  if (after.others !== before.others) throw new Error(`a row outside the plan changed: others md5 ${before.others} → ${after.others}`);
  await s.mutate(`update integrity_runs set status='completed', admitted=${audits.length}, excluded_by_rule=excluded_by_rule || ${jlit({ md5_after: after, audit_rows: audits })} where id=${ir.id} returning id`);
  return { integrity_id: ir.id, audits, before, after };
}

async function revert(s: PsqlSession, companyId: string, runRef: string) {
  const rows = await s.query<{ id: string; raw_payload: Record<string, unknown> }>(`select id, raw_payload from signals where company_id=${lit(companyId)}::uuid and raw_payload->'entity_restamp'->>'run_ref'=${lit(runRef)} order by id`);
  const [ir] = await s.mutate<{ id: number }>(`insert into integrity_runs (company_id, component, status, examined, admitted, excluded_by_rule, run_ref)
    values (${lit(companyId)}::uuid, ${lit(COMPONENT)}, 'running', ${rows.length}, 0, ${jlit({ ruling: 17, mode: "revert", reverts: runRef })}, ${lit(runRef)}) returning id`);
  const done: string[] = [];
  for (const r of rows) {
    const er = r.raw_payload.entity_restamp as { audit_id: string; before: { voice_class: string | null; entity: unknown; voice_authority: unknown }; kind: string };
    const b = er.before;
    await s.mutate(`insert into signal_voice_restamps (company_id, signal_id, run_ref, ledger_run_id, old_voice_class, new_voice_class, judge_verdict, judge_entity, judge_reason, judge_model, source_url)
      select company_id, signal_id, run_ref, null, new_voice_class, ${lit(String(b.voice_class))}, ${lit(REVERT_VERDICT)}, ${lit(`apply_audit:${er.audit_id}`)}, 'ruling 17 revert: the before-state recorded on the row restored', 'deterministic (no model)', source_url
      from signal_voice_restamps where id=${lit(er.audit_id)}::uuid returning id`);
    const restore = `(coalesce(raw_payload,'{}'::jsonb) - 'entity' - 'voice_authority' - 'entity_restamp')`
      + (b.entity ? ` || jsonb_build_object('entity', ${jlit(b.entity)})` : "")
      + (b.voice_authority ? ` || jsonb_build_object('voice_authority', ${jlit(b.voice_authority)})` : "");
    const w = await s.mutate(`update signals set voice_class=${lit(b.voice_class)}, raw_payload=${restore} where id=${lit(r.id)}::uuid returning id`);
    if (w.length !== 1) throw new Error(`revert ${r.id}: touched ${w.length}`);
    await s.mutate(`update signal_voice_restamps set reverted_at=now() where id=${lit(er.audit_id)}::uuid returning id`);
    done.push(r.id);
  }
  await s.mutate(`update integrity_runs set status='completed', admitted=${done.length} where id=${ir.id} returning id`);
  return { integrity_id: ir.id, reverted: done };
}

const s = new PsqlSession();
try {
  if (mode === "plan") {
    const company = arg("company"), file = arg("out");
    if (!company || !file) throw new Error("--company and --out required");
    await s.exec("begin read only;");
    const restamps = await plan(s, company);
    await s.exec("rollback;");
    await Deno.writeTextFile(file, JSON.stringify({ company_id: company, planned_at: new Date().toISOString(), restamps } satisfies PlanFile, null, 2));
    out({ mode, company, restamps: restamps.length, by_kind: restamps.reduce((m, r) => ({ ...m, [r.kind]: (m[r.kind] ?? 0) + 1 }), {} as Record<string, number>), plan_md5: await planMd5(restamps), ids: restamps.map((r) => `${r.signal_id.slice(0, 8)}:${r.kind}`) });
  } else if (mode === "revert-probe") {
    const p = JSON.parse(await Deno.readTextFile(arg("plan")!)) as PlanFile;
    const runRef = `entity-voice-restamp:probe:${new Date().toISOString()}`;
    await s.exec("begin;");
    const ids = p.restamps.map((r) => r.signal_id);
    const m0 = await md5s(s, p.company_id, ids);
    const a = await apply(s, p, runRef);
    const applied = await s.query<{ n: number }>(`select count(*)::int n from signals where raw_payload->'entity_restamp'->>'run_ref'=${lit(runRef)}`);
    const rv = await revert(s, p.company_id, runRef);
    const m1 = await md5s(s, p.company_id, ids);
    await s.exec("rollback;");
    const left = await s.query<{ n: number }>(`select ((select count(*) from signal_voice_restamps where run_ref=${lit(runRef)}) + (select count(*) from integrity_runs where run_ref=${lit(runRef)}))::int n`);
    const m2 = await md5s(s, p.company_id, ids);
    const pass = applied[0].n === p.restamps.length && rv.reverted.length === p.restamps.length && m1.company === m0.company && m1.targets === m0.targets && m1.others === m0.others && left[0].n === 0 && m2.company === m0.company;
    out({ mode, pass, applied: applied[0].n, audit_rows: a.audits.length, reverted: rv.reverted.length, md5_before: m0, md5_after_revert: m1, after_rollback_rows: left[0].n, md5_after_rollback_equal: m2.company === m0.company });
    if (!pass) Deno.exit(1);
  } else if (mode === "apply") {
    const p = JSON.parse(await Deno.readTextFile(arg("plan")!)) as PlanFile;
    const want = arg("plan-md5");
    await s.exec("begin read only;");
    const re = await plan(s, p.company_id);
    await s.exec("rollback;");
    const [m, mf] = [await planMd5(re), await planMd5(p.restamps)];
    if (!want || m !== want || mf !== want) throw new Error(`re-plan md5 ${m} / file ${mf} ≠ --plan-md5 ${want} — refused`);
    const ids = (k: Kind) => re.filter((r) => r.kind === k).map((r) => r.signal_id.slice(0, 8)).sort().join(",");
    const exp = (k: string) => (arg(k) ?? "").split(",").filter(Boolean).sort().join(",");
    if (ids("dated_out")) throw new Error(`plan carries dated_out rows (${ids("dated_out")}) — a class change no ruling signed; refused`);
    if (ids("filing") !== exp("expect-filing") || ids("undated") !== exp("expect-undated")) throw new Error(`plan ≠ expected: filing [${ids("filing")}] vs [${exp("expect-filing")}]; undated [${ids("undated")}] vs [${exp("expect-undated")}] — refused`);
    const runRef = `entity-voice-restamp:${p.company_id}:${new Date().toISOString()}`;
    await s.exec("begin;");
    const a = await apply(s, { ...p, restamps: re }, runRef);
    await s.exec("commit;");
    out({ mode, run_ref: runRef, integrity_id: a.integrity_id, restamped: a.audits.length, audits: a.audits, md5_before: a.before, md5_after: a.after, others_unchanged: a.before.others === a.after.others });
  } else {
    const company = arg("company"), runRef = arg("run-ref");
    if (!company || !runRef) throw new Error("--company and --run-ref required");
    await s.exec("begin;");
    const r = await revert(s, company, runRef);
    await s.exec("commit;");
    out({ mode, run_ref: runRef, ...r });
  }
} catch (e) {
  try { await s.exec("rollback;"); } catch { /* none open */ }
  out({ ok: false, error: String((e as Error)?.message ?? e) });
  await s.close();
  Deno.exit(3);
}
await s.close();
