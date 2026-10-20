#!/usr/bin/env -S deno run --allow-all
// ── R52 — BACKFILL the record of the 2026-10-20 21:12:53Z Ground Up revert (written before revert recorded itself) ──
//
//   deno run --allow-all scripts/r52/backfill-revert-20261020.ts --dry-run    prints the rows it would write; writes nothing
//   deno run --allow-all scripts/r52/backfill-revert-20261020.ts --apply      writes them in ONE transaction, re-reads by id
//
// By value, never by query: run_ref r52_sweep_20261020, Ground Up Innovations, the three apply audit rows that revert
// marked (c920d867 / ccd13c6a / f2b6a087) and the one stamp it removed from a row apply never changed (4285a084).
// Refused unless the state is exactly what that revert left: each apply audit row reverted_at = REVERTED_AT, each row
// back at the apply row's old class and unstamped, and no r52_revert record yet. Writes: one integrity row (mode revert,
// reason backfill) and four r52_revert audit rows whose applied_at is the revert's own time. Touches no signal.
import { namedMode, R52_COMPONENT, R52_RULES, SweepRefusedError } from "./sweepCore.ts";
import { lit, makePsqlSweepStore, PsqlSession, R52_REVERT } from "./psqlSweepStore.ts";

const RUN_REF = "r52_sweep_20261020";
const COMPANY = "d6a08c74-b451-4637-baa5-012e394e2de9";
const REVERTED_AT = "2026-10-20 21:12:53.998241+00";
const APPLY_INTEGRITY_ID = 11830;
const APPLY_AUDIT_IDS = ["c920d867-70b8-4a2f-af64-8866fd9cdf9f", "ccd13c6a-726d-4a74-904f-026d0e56e13b", "f2b6a087-5a06-4100-bfe6-e13eb0ad52a4"];
const STAMP_ONLY = ["4285a084-425a-4846-8b1d-67be7bd89200"];

const out = (o: unknown) => console.log(JSON.stringify(o, null, 1));
const session = new PsqlSession();
const store = makePsqlSweepStore(session);
try {
  const { mode } = namedMode(Deno.args, ["dry_run", "apply"] as const, ["dry_run", "apply"]);
  const audit = await session.query<{ id: string; signal_id: string; company_id: string; run_ref: string; old_voice_class: string; new_voice_class: string; reverted_at: string | null; source_url: string | null; judge_verdict: string }>(
    `select id, signal_id, company_id, run_ref, old_voice_class, new_voice_class, reverted_at::text, source_url, judge_verdict from signal_voice_restamps where id in (${APPLY_AUDIT_IDS.map(lit).join(",")}) order by applied_at`);
  if (audit.length !== 3) throw new SweepRefusedError("backfill_state", `expected 3 apply audit rows, found ${audit.length}`);
  for (const a of audit) {
    if (a.run_ref !== RUN_REF || a.company_id !== COMPANY || a.judge_verdict === R52_REVERT) throw new SweepRefusedError("backfill_state", `audit ${a.id} is not an apply row of ${RUN_REF} for Ground Up`);
    if (a.reverted_at !== REVERTED_AT) throw new SweepRefusedError("backfill_state", `audit ${a.id} reverted_at ${a.reverted_at} ≠ ${REVERTED_AT}`);
  }
  const ids = [...audit.map((a) => a.signal_id), ...STAMP_ONLY];
  const sigs = new Map((await session.query<{ id: string; company_id: string; voice_class: string; source_url: string | null; stamped: boolean }>(
    `select id, company_id, voice_class, source_url, raw_payload ? 'r52' stamped from signals where id in (${ids.map(lit).join(",")})`)).map((s) => [s.id, s]));
  for (const id of ids) { const s = sigs.get(id); if (!s || s.company_id !== COMPANY || s.stamped) throw new SweepRefusedError("backfill_state", `signal ${id} is missing, not Ground Up's, or still stamped`); }
  for (const a of audit) if (sigs.get(a.signal_id)!.voice_class !== a.old_voice_class) throw new SweepRefusedError("backfill_state", `signal ${a.signal_id} is not at the restored class ${a.old_voice_class}`);
  const existing = await session.query<{ n: number }>(`select count(*)::int n from signal_voice_restamps where run_ref=${lit(RUN_REF)} and company_id=${lit(COMPANY)}::uuid and judge_verdict=${lit(R52_REVERT)}`);
  if (existing[0].n !== 0) throw new SweepRefusedError("backfill_done", `${existing[0].n} r52_revert rows already exist — the backfill has run`);
  const rows = [
    ...audit.map((a) => ({ company_id: COMPANY, signal_id: a.signal_id, run_ref: RUN_REF, old_voice_class: a.new_voice_class, new_voice_class: a.old_voice_class, judge_verdict: R52_REVERT, judge_entity: `apply_audit:${a.id}`, judge_reason: R52_REVERT, judge_model: "deterministic", source_url: a.source_url, applied_at: REVERTED_AT })),
    ...STAMP_ONLY.map((id) => { const s = sigs.get(id)!; return { company_id: COMPANY, signal_id: id, run_ref: RUN_REF, old_voice_class: s.voice_class, new_voice_class: s.voice_class, judge_verdict: R52_REVERT, judge_entity: "stamp_only", judge_reason: R52_REVERT, judge_model: "deterministic", source_url: s.source_url, applied_at: REVERTED_AT }; }),
  ];
  const md5Now = await store.companySignalsMd5(COMPANY);
  const integrity = { company_id: COMPANY, component: R52_COMPONENT, run_ref: RUN_REF, status: "completed", examined: ids.length, admitted: audit.length,
    excluded_by_rule: { mode: "revert", reason: "backfill", rules: R52_RULES, run_ref: RUN_REF, reverted_at: REVERTED_AT, apply_integrity_id: APPLY_INTEGRITY_ID, apply_audit_rows: audit.length, stamped_rows: ids.length, restored: audit.length, unstamped: ids.length, skipped: [], signals_md5_after: md5Now } };
  if (mode === "dry_run") { out({ mode: "dry_run", writes: "none", integrity_row: integrity, audit_rows: rows }); }
  else {
    await session.exec("begin;");
    const auditIds: string[] = [];
    for (const r of rows) auditIds.push(await store.insertAudit(r));
    const iid = await store.openIntegrity({ company_id: COMPANY, component: R52_COMPONENT, run_ref: RUN_REF, excluded_by_rule: { ...integrity.excluded_by_rule } });
    await store.finishIntegrity(iid, { status: "completed", examined: integrity.examined, admitted: integrity.admitted, excluded_by_rule: { ...integrity.excluded_by_rule, revert_audit_ids: auditIds, backfilled_at: new Date().toISOString() } });
    await session.exec("commit;");
    const ir = await session.query(`select id, company_id, component, run_ref, status, examined, admitted, ran_at::text, excluded_by_rule from integrity_runs where id=${iid}`);
    const ar = await session.query(`select id, signal_id, run_ref, old_voice_class, new_voice_class, judge_verdict, judge_entity, judge_reason, judge_model, applied_at::text, reverted_at from signal_voice_restamps where id in (${auditIds.map(lit).join(",")}) order by judge_entity`);
    out({ mode: "apply", integrity_row: ir, audit_rows: ar });
  }
} catch (e) {
  try { await session.exec("rollback;"); } catch { /* none open */ }
  if (e instanceof SweepRefusedError) { out({ ok: false, refused: true, code: e.code, error: e.message }); await session.close(); Deno.exit(3); }
  console.error(String((e as Error)?.stack ?? e)); await session.close(); Deno.exit(1);
}
await session.close();
