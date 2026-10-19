#!/usr/bin/env -S deno run --allow-all
// ── b2 runner: plan / apply / revert for excerpt blanking (operator ruling 2026-10-16) ───────────────
//
// The law: claim_text may be our summary; evidence_excerpt is the page's words or absent. This runner
// drives _shared/excerptBlanking.ts over the audited psql channel (scripts/lib/psqlBlankingStore.ts).
//
//   deno run --allow-all scripts/excerpt-blanking.ts --plan [--company=<uuid>] [--out=<plan.json>]
//       DRY RUN (the default and the only mode without a flag): zero writes; prints the per-company
//       table and writes the reviewable plan.
//   deno run --allow-all scripts/excerpt-blanking.ts --apply-excerpt-blanking --plan-file=<plan.json> [--run-ref=<uuid>]
//       APPLY the reviewed plan. The switch is BLANKING_APPLY_FLAG, read from the module — the runner
//       accepts `--${BLANKING_APPLY_FLAG}` and nothing else. Refuses: no plan file, frozen rows, a plan
//       that differs from a fresh re-plan by id or action. One audit row before each signal write.
//   deno run --allow-all scripts/excerpt-blanking.ts --revert=<run_ref>
//       Restore every un-reverted row of that run; marks reverted_at.
//   deno run --allow-all scripts/excerpt-blanking.ts --probe=<name>
//       GUARD PROBES, each inside BEGIN … ROLLBACK, printing one JSON line and committing NOTHING:
//         no-plan | no-flag | struck-row | frozen-row | apply-revert-sample:<n>
import {
  BLANKING_APPLY_FLAG, BlankingRefusedError, applyExcerptBlanking, planExcerptBlanking, revertExcerptBlanking,
  type BlankingPlan, type BlankingPlanRow,
} from "../supabase/functions/_shared/excerptBlanking.ts";
import { lit, makePsqlBlankingStore, PsqlSession } from "./lib/psqlBlankingStore.ts";

const args = Deno.args;
const flag = (name: string) => args.includes(`--${name}`);
const opt = (name: string) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? null;
const out = (o: unknown) => console.log(JSON.stringify(o));

const session = new PsqlSession();
const store = makePsqlBlankingStore(session);
const FROZEN_CB1 = "58b2b15b-bada-4bcd-9c12-b7e66a37d0bc";

function planFile(plan: BlankingPlan): Record<string, unknown> {
  return { generated_at: new Date().toISOString(), counts: { rows: plan.rows.length, blanked: plan.rows.filter((r) => r.action === "blanked").length, stamped_only: plan.rows.filter((r) => r.action === "stamped_only").length, urls: new Set(plan.rows.map((r) => r.source_url)).size, companies: plan.per_company.length, scanned: plan.scanned, verified_by_snapshot: plan.verified_by_snapshot, verified_by_quote_source_text: plan.verified_by_quote_source_text, no_snapshot: plan.no_snapshot, already_stamped: plan.already_stamped, skipped_frozen: plan.skipped_frozen }, per_company: plan.per_company, rows: plan.rows };
}

async function refusal(fn: () => Promise<unknown>): Promise<{ refused: boolean; code: string | null; message: string | null }> {
  try { await fn(); return { refused: false, code: null, message: null }; } catch (e) {
    if (e instanceof BlankingRefusedError) return { refused: true, code: e.code, message: e.message };
    return { refused: true, code: `error:${(e as Error).name}`, message: String((e as Error).message).slice(0, 300) };
  }
}

try {
  if (flag("plan")) {
    const plan = await planExcerptBlanking(store, { companyId: opt("company") ?? undefined });
    const file = planFile(plan);
    const dest = opt("out");
    if (dest) await Deno.writeTextFile(dest, JSON.stringify(file, null, 1));
    console.error(`plan: ${plan.rows.length} rows (${file.counts && (file.counts as Record<string, number>).blanked} blanked, ${(file.counts as Record<string, number>).stamped_only} stamped_only) · verified_by_snapshot ${plan.verified_by_snapshot} · verified_by_quote_source_text ${plan.verified_by_quote_source_text} · no_snapshot ${plan.no_snapshot} · skipped_frozen ${plan.skipped_frozen.length}${dest ? ` · written to ${dest}` : ""}`);
    for (const p of plan.per_company) console.error(`  ${p.company_name.padEnd(34)} blanked ${String(p.blanked).padStart(4)}  stamped_only ${String(p.stamped_only).padStart(3)}  urls ${String(p.urls).padStart(3)}`);
    out({ mode: "plan", ...(file.counts as Record<string, unknown>) });
  } else if (flag(BLANKING_APPLY_FLAG)) {
    const pf = opt("plan-file");
    if (!pf) throw new BlankingRefusedError("no_plan", "apply refused: --plan-file=<plan.json> from a reviewed dry run is required");
    const plan = JSON.parse(await Deno.readTextFile(pf)) as { rows: BlankingPlanRow[] };
    await session.exec("begin;");
    const r = await applyExcerptBlanking(store, { plan: plan.rows, confirm: BLANKING_APPLY_FLAG, runRef: opt("run-ref") ?? undefined, log: (s) => console.error(s) });
    await session.exec("commit;");
    out({ mode: "apply", ...r });
  } else if (opt("revert")) {
    await session.exec("begin;");
    const r = await revertExcerptBlanking(store, { runRef: opt("revert")!, log: (s) => console.error(s) });
    await session.exec("commit;");
    out({ mode: "revert", ...r });
  } else if (opt("probe")) {
    // Every probe: BEGIN … ROLLBACK. Nothing it does survives.
    const probe = opt("probe")!;
    await session.exec("begin;");
    const auditCount = async () => (await session.query<{ n: number }>(`select count(*)::int n from signal_excerpt_blankings`))[0].n;
    const auditBefore = await auditCount();
    // --company= scopes a probe's plan: once the fleet plan has been applied it is EMPTY, so the guard
    // seeds a throwaway company and probes against that (scripts/guards/excerpt-blanking-guard.sh).
    const plan = await planExcerptBlanking(store, { companyId: opt("company") ?? undefined });
    let result: Record<string, unknown>;
    if (probe === "no-plan") {
      result = { ...(await refusal(() => applyExcerptBlanking(store, { plan: [], confirm: BLANKING_APPLY_FLAG }))) };
    } else if (probe === "no-flag") {
      result = { ...(await refusal(() => applyExcerptBlanking(store, { plan: plan.rows, confirm: "apply" }))) };
    } else if (probe === "struck-row") {
      result = { ...(await refusal(() => applyExcerptBlanking(store, { plan: plan.rows.slice(1), confirm: BLANKING_APPLY_FLAG }))), struck: plan.rows[0]?.signal_id ?? null };
    } else if (probe === "frozen-row") {
      const cb1 = await session.query<{ id: string }>(`select id from signals where company_id=${lit(FROZEN_CB1)}::uuid and signal_band='outside' and superseded_at is null and held_at is null and nullif(trim(evidence_excerpt),'') is not null order by created_at limit 1`);
      const frozenRow: BlankingPlanRow = { ...plan.rows[0], signal_id: cb1[0].id, company_id: FROZEN_CB1, company_name: "Cafe Barra" };
      result = { ...(await refusal(() => applyExcerptBlanking(store, { plan: [...plan.rows, frozenRow], confirm: BLANKING_APPLY_FLAG }))), frozen_signal: cb1[0].id };
    } else if (probe.startsWith("apply-revert-sample:")) {
      const n = Math.max(2, Number(probe.split(":")[1] || 5));
      // the sample: n-1 blanked rows plus one analysis row, so the carve-out is exercised too
      const analysis = plan.rows.find((r) => r.action === "stamped_only");
      const sampleIds = new Set([...plan.rows.filter((r) => r.action === "blanked").slice(0, n - (analysis ? 1 : 0)).map((r) => r.signal_id), ...(analysis ? [analysis.signal_id] : [])]);
      // the SAMPLE is applied as the whole plan of its companies would be: the re-plan check needs the
      // reviewed plan to equal the fresh plan, so the probe applies the full per-company plan and reports the sample
      const companies = new Set(plan.rows.filter((r) => sampleIds.has(r.signal_id)).map((r) => r.company_id));
      const scoped = plan.rows.filter((r) => companies.has(r.company_id));
      const idl = [...sampleIds].map((i) => `${lit(i)}::uuid`).join(",");
      const snap = () => session.query<{ id: string; evidence_excerpt: string; claim_text: string; raw_payload: Record<string, unknown>; md5: string }>(`select id, evidence_excerpt, claim_text, raw_payload, md5(evidence_excerpt || '|' || claim_text || '|' || raw_payload::text) md5 from signals where id in (${idl}) order by id`);
      const before = await snap();
      const applied = await applyExcerptBlanking(store, { plan: scoped, confirm: BLANKING_APPLY_FLAG, runRef: "probe-run" });
      const afterApply = await snap();
      const auditAfterApply = await auditCount();
      const sampleAudit = await session.query<{ signal_id: string; action: string; reverted_at: string | null }>(`select signal_id, action, reverted_at from signal_excerpt_blankings where run_ref='probe-run' and signal_id in (${idl})`);
      const reverted = await revertExcerptBlanking(store, { runRef: "probe-run" });
      const afterRevert = await snap();
      const unrevertedAudit = (await session.query<{ n: number }>(`select count(*)::int n from signal_excerpt_blankings where run_ref='probe-run' and reverted_at is null`))[0].n;
      const unrestored = afterRevert.filter((a) => { const b = before.find((x) => x.id === a.id)!; const { excerpt_blanking_reverted: _n, ...rp } = a.raw_payload; return a.evidence_excerpt !== b.evidence_excerpt || a.claim_text !== b.claim_text || JSON.stringify(rp) !== JSON.stringify(b.raw_payload); }).map((a) => a.id);
      result = {
        sample: before.map((b) => ({ id: b.id, action: scoped.find((r) => r.signal_id === b.id)?.action ?? null })),
        applied: { blanked: applied.blanked, stamped_only: applied.stamped_only, audit_rows: applied.audit_rows, skipped: applied.skipped.length, scoped_rows: scoped.length },
        audit_rows_written: auditAfterApply - auditBefore,
        after_apply: afterApply.map((a) => ({ id: a.id, excerpt_empty: a.evidence_excerpt === "", claim_text_kept: a.claim_text === before.find((b) => b.id === a.id)!.claim_text, stamp_reason: (a.raw_payload.excerpt_guard as Record<string, unknown> | undefined)?.reason ?? null, carve_out: (a.raw_payload.excerpt_guard as Record<string, unknown> | undefined)?.analysis_carve_out ?? null, run_ref: (a.raw_payload.excerpt_guard as Record<string, unknown> | undefined)?.backfill_run_ref ?? null })),
        sample_audit: sampleAudit,
        reverted: reverted.reverted, revert_skipped: reverted.skipped.length,
        unrestored, audit_unreverted_after_revert: unrevertedAudit,
        md5_before: before.map((b) => b.md5), md5_after_revert_wo_note: afterRevert.map((a) => { const { excerpt_blanking_reverted: _n, ...rp } = a.raw_payload; return rp; }).length,
      };
    } else if (probe.startsWith("revert-rollback:")) {
      // After a REAL apply: prove the run is reversible without reversing it — revert inside this
      // rolled-back transaction, compare every audited signal to its audit row, then ROLLBACK.
      const runRef = probe.slice("revert-rollback:".length);
      const audit = await store.loadAudit(runRef);
      const idl = audit.map((a) => `${lit(a.signal_id)}::uuid`).join(",") || "'00000000-0000-0000-0000-000000000000'::uuid";
      const stampedBefore = (await session.query<{ n: number }>(`select count(*)::int n from signals where id in (${idl}) and raw_payload->'excerpt_guard'->>'backfill_run_ref'=${lit(runRef)}`))[0].n;
      const rv = await revertExcerptBlanking(store, { runRef });
      const after = await session.query<{ id: string; evidence_excerpt: string; raw_payload: Record<string, unknown> }>(`select id, evidence_excerpt, raw_payload from signals where id in (${idl})`);
      const byId = new Map(after.map((a) => [a.id, a]));
      const notRestored = audit.filter((a) => {
        const s = byId.get(a.signal_id); if (!s) return true;
        const { excerpt_blanking_reverted: _n, ...rp } = s.raw_payload;
        const g = (rp as Record<string, unknown>).excerpt_guard ?? null;
        return s.evidence_excerpt !== a.old_evidence_excerpt || JSON.stringify(g) !== JSON.stringify(a.old_excerpt_guard);
      }).map((a) => a.signal_id);
      const unreverted = (await session.query<{ n: number }>(`select count(*)::int n from signal_excerpt_blankings where run_ref=${lit(runRef)} and reverted_at is null`))[0].n;
      result = { run_ref: runRef, audit_rows: audit.length, stamped_before: stampedBefore, reverted: rv.reverted, revert_skipped: rv.skipped.length, not_restored: notRestored.length, not_restored_ids: notRestored.slice(0, 5), audit_unreverted_after_revert: unreverted };
    } else {
      throw new Error(`unknown probe ${probe}`);
    }
    await session.exec("rollback;");
    const auditAfterRollback = await auditCount();
    out({ mode: "probe", probe, ...result, audit_rows_before: auditBefore, audit_rows_after_rollback: auditAfterRollback, rolled_back: true });
  } else {
    console.error("usage: --plan [--company=] [--out=]  |  --" + BLANKING_APPLY_FLAG + " --plan-file=  |  --revert=<run_ref>  |  --probe=<name>");
    Deno.exit(2);
  }
} catch (e) {
  try { await session.exec("rollback;"); } catch { /* no open transaction */ }
  if (e instanceof BlankingRefusedError) { out({ ok: false, refused: true, code: e.code, error: e.message }); await session.close(); Deno.exit(3); }
  console.error(String((e as Error)?.stack ?? e));
  await session.close();
  Deno.exit(1);
}
await session.close();
