// ── R52 sweep store over ONE psql session (the b2 channel: scripts/lib/psqlBlankingStore.ts) ───────────────
//
// Every read and write the sweep makes goes through here, over the single long-lived `docker exec -i <db> psql`
// session PsqlSession drives — so a guard probe can wrap a whole apply (ledger rows included) in BEGIN … ROLLBACK.
//
// WRITE LAW (R52, signed): the sweep writes FOUR things and nothing else —
//   integrity_runs        one row per company, opened `running` before the first judge call, finished at the end;
//   model_calls           one row per judge call, written before the answer is parsed (the judges' required ledgers);
//   signal_voice_restamps one audit row per class change, in the same transaction as the change;
//   signals               voice_class (only with its audit row) and raw_payload (the r52 stamp) — no other column.
// writeSignal refuses any patch key outside {voice_class, raw_payload}: superseded_at, held_at, a delete — an un-mint —
// cannot be expressed through this store (guard p1). A class change carries `exists(audit row)` in its WHERE clause,
// so a class write without its audit row touches zero rows and is refused (guard p3).
import { lit, PsqlSession } from "../lib/psqlBlankingStore.ts";

export { lit, PsqlSession };

export type SweepCompany = { id: string; name: string; website: string | null; entity_anchors_json: unknown; fixture_hold: string | null; frozen: boolean };
export type SweepSignal = {
  id: string; company_id: string; source_url: string | null; voice_class: string | null; signal_band: string | null;
  claim_text: string | null; evidence_excerpt: string | null; quote_source_text: string | null;
  raw_payload: Record<string, unknown> | null; superseded_at: string | null; held_at: string | null; created_at: string;
};
export type SweepSnapshot = { clean_text: string; text_sha256: string; structured: unknown };
export type SweepAuditRow = { id: string; company_id: string; signal_id: string; run_ref: string; old_voice_class: string | null; new_voice_class: string; reverted_at: string | null };
export type SweepAuditInsert = {
  company_id: string; signal_id: string; run_ref: string; old_voice_class: string | null; new_voice_class: string;
  judge_verdict: string; judge_entity: string | null; judge_reason: string; judge_model: string; source_url: string | null;
  /** R58: the prompt sha the verdict answered (null for a revert row or a deterministic authority) */
  judge_prompt_sha?: string | null;
  /** backfill only: the time of the event the row records (default now()) */
  applied_at?: string;
};
/** A revert's own audit rows carry this verdict and reason; judge_entity names what they undo ("apply_audit:<id>", or
 *  "stamp_only" for a stamp removed from a row whose class apply never changed). They are never themselves reverted. */
export const R52_REVERT = "r52_revert";
export type ModelCallInsert = {
  company_id: string; call_site: string; provider: string; model: string;
  prompt_tokens: number | null; completion_tokens: number | null; usd: number | null; attempt: number; prompt_sha: string;
};

const jlit = (v: unknown) => v === null || v === undefined ? "null" : `${lit(JSON.stringify(v))}::jsonb`;
const idList = (ids: readonly string[]) => ids.length ? ids.map((i) => `${lit(i)}::uuid`).join(",") : "'00000000-0000-0000-0000-000000000000'::uuid";
const num = (v: number | null) => (v === null || !Number.isFinite(v) ? "null" : String(v));

/** The only signal columns the sweep may write. Anything else — superseded_at, held_at, a delete — is an un-mint. */
export const WRITABLE_SIGNAL_KEYS: ReadonlyArray<string> = ["voice_class", "raw_payload"];
export class SweepRefusedError extends Error {
  constructor(public code: string, message: string) { super(message); this.name = "SweepRefusedError"; }
}

export function makePsqlSweepStore(s: PsqlSession) {
  return {
    session: s,
    async loadCompanies(ids: readonly string[]): Promise<SweepCompany[]> {
      return (await s.query<SweepCompany>(`select id, name, website, entity_anchors_json, fixture_hold, coalesce(frozen,false) frozen from companies where id in (${idList(ids)})`));
    },
    async loadSignals(ids: readonly string[]): Promise<SweepSignal[]> {
      if (ids.length === 0) return [];
      return await s.query<SweepSignal>(`select id, company_id, source_url, voice_class, signal_band, claim_text, evidence_excerpt, quote_source_text,
        raw_payload, superseded_at, held_at, created_at from signals where id in (${idList(ids)})`);
    },
    /** The snapshot a b3 row was minted from (raw_payload.snapshot_text_sha256), newest crawl of that text. */
    async loadSnapshot(companyId: string, sha: string): Promise<SweepSnapshot | null> {
      const r = await s.query<SweepSnapshot>(`select clean_text, text_sha256, structured from outside_page_snapshots
        where company_id=${lit(companyId)}::uuid and text_sha256=${lit(sha)} and fetch_status='ok' and clean_text is not null order by crawled_at desc limit 1`);
      return r[0] ?? null;
    },
    /** R54: the newest ok snapshot of a URL (a baseline row's page when no sha names one). */
    async loadSnapshotByUrl(companyId: string, url: string): Promise<SweepSnapshot | null> {
      const r = await s.query<SweepSnapshot>(`select clean_text, text_sha256, structured from outside_page_snapshots
        where company_id=${lit(companyId)}::uuid and source_url=${lit(url)} and fetch_status='ok' and clean_text is not null order by crawled_at desc limit 1`);
      return r[0] ?? null;
    },
    /** A supabase-js-shaped reader for the ONE query buildClientCorpus makes (signals by company, limit 1000) — so the
     *  shipped corpus builder runs unchanged over this session. */
    corpusClient() {
      return {
        from: (table: string) => {
          if (table !== "signals") throw new Error(`corpus client reads signals only, not ${table}`);
          let cols = "*"; let companyId = ""; let lim = 1000;
          const q = {
            select(c: string) { cols = c; return q; },
            eq(k: string, v: string) { if (k !== "company_id") throw new Error(`corpus client filters company_id only, not ${k}`); companyId = v; return q; },
            async limit(n: number) {
              lim = n;
              const data = await s.query(`select ${cols} from signals where company_id=${lit(companyId)}::uuid limit ${lim}`);
              return { data, error: null };
            },
          };
          return q;
        },
      };
    },
    // ── writes ────────────────────────────────────────────────────────────────────────────────────────────
    async openIntegrity(row: { company_id: string; component: string; run_ref: string; excluded_by_rule: unknown }): Promise<number> {
      const r = await s.mutate<{ id: number }>(`insert into integrity_runs (company_id, component, status, examined, admitted, excluded_by_rule, run_ref)
        values (${lit(row.company_id)}::uuid, ${lit(row.component)}, 'running', 0, 0, ${jlit(row.excluded_by_rule)}, ${lit(row.run_ref)}) returning id`);
      if (r.length !== 1) throw new Error("integrity open returned no id");
      return Number(r[0].id);
    },
    async finishIntegrity(id: number, f: { status: "completed" | "failed"; examined: number; admitted: number; excluded_by_rule: unknown; error?: string | null }): Promise<void> {
      const r = await s.mutate(`update integrity_runs set status=${lit(f.status)}, examined=${f.examined}, admitted=${f.admitted},
        excluded_by_rule=${jlit(f.excluded_by_rule)}, error=${lit(f.error ?? null)} where id=${id} returning id`);
      if (r.length !== 1) throw new Error(`integrity finish touched ${r.length} rows`);
    },
    /** The replay key's evidence: every (judge role, model, prompt_sha) the company's ledger holds for the speaker and
     *  authorship judges. A stored judgment replays only when the prompt the shipped judge would send now is one of these. */
    async ledgeredPromptShas(companyId: string): Promise<{ role: "speaker" | "authorship"; model: string; prompt_sha: string }[]> {
      return await s.query<{ role: "speaker" | "authorship"; model: string; prompt_sha: string }>(`select distinct
        case when call_site like '%:speaker' then 'speaker' else 'authorship' end role, model, prompt_sha from model_calls
        where company_id=${lit(companyId)}::uuid and prompt_sha is not null
          and (call_site like '%:speaker' or call_site like '%:authorship' or call_site in ('public-baseline-authorship','restamp-aggregator-self-voice'))`);
    },
    /** One model_calls row. Resolves false on any failure (never throws) — recordModelCall's contract. */
    async insertModelCall(m: ModelCallInsert): Promise<boolean> {
      try {
        const r = await s.mutate(`insert into model_calls (company_id, run_id, call_site, provider, model, prompt_tokens, completion_tokens, usd, attempt, prompt_sha)
          values (${lit(m.company_id)}::uuid, null, ${lit(m.call_site)}, ${lit(m.provider)}, ${lit(m.model)}, ${num(m.prompt_tokens)}, ${num(m.completion_tokens)}, ${num(m.usd)}, ${m.attempt}, ${lit(m.prompt_sha)}) returning id`);
        return r.length === 1;
      } catch (e) {
        console.error(`[r52] model_calls insert failed (non-fatal, tallied): ${(e as Error).message.slice(0, 200)}`);
        return false;
      }
    },
    async insertAudit(a: SweepAuditInsert): Promise<string> {
      const r = await s.mutate<{ id: string }>(`insert into signal_voice_restamps (company_id, signal_id, run_ref, ledger_run_id, old_voice_class, new_voice_class, judge_verdict, judge_entity, judge_reason, judge_model, judge_prompt_sha, source_url)
        values (${lit(a.company_id)}::uuid, ${lit(a.signal_id)}::uuid, ${lit(a.run_ref)}, null, ${lit(a.old_voice_class)}, ${lit(a.new_voice_class)}, ${lit(a.judge_verdict)}, ${lit(a.judge_entity)}, ${lit(a.judge_reason)}, ${lit(a.judge_model)}, ${lit(a.judge_prompt_sha ?? null)}, ${lit(a.source_url)}) returning id`);
      if (a.applied_at) await s.mutate(`update signal_voice_restamps set applied_at=${lit(a.applied_at)}::timestamptz where id=${lit(r[0]?.id ?? "")}::uuid returning id`);
      if (r.length !== 1) throw new Error("audit insert returned no id");
      return r[0].id;
    },
    /** p1: the only door to a signal write. A patch key outside WRITABLE_SIGNAL_KEYS is an un-mint attempt — refused.
     *  A voice_class in the patch is written ONLY where its un-reverted audit row of this run exists (p3). */
    async writeSignal(id: string, runRef: string, patch: Record<string, unknown>): Promise<void> {
      const bad = Object.keys(patch).filter((k) => !WRITABLE_SIGNAL_KEYS.includes(k));
      if (bad.length) throw new SweepRefusedError("unmint_refused", `signal write refused: ${bad.join(", ")} is not a sweep column — the sweep never un-mints (keep_label)`);
      // every key of the patch becomes a SET — so the whitelist above is the ONE thing standing between a patch and an un-mint
      const sets = Object.entries(patch).map(([k, v]) => {
        if (!/^[a-z_]+$/.test(k)) throw new Error(`bad column ${k}`);
        // the stamp is MERGED into the stored payload in SQL — the stored jsonb is never round-tripped through JS
        if (k === "raw_payload") return `raw_payload=coalesce(raw_payload,'{}'::jsonb) || ${jlit(v)}`;
        return `${k}=${v === null ? "null" : lit(String(v))}`;
      });
      const audited = "voice_class" in patch
        ? ` and exists (select 1 from signal_voice_restamps a where a.signal_id=${lit(id)}::uuid and a.run_ref=${lit(runRef)} and a.new_voice_class=${lit(patch.voice_class as string)} and a.reverted_at is null and a.judge_verdict is distinct from ${lit(R52_REVERT)})`
        : "";
      const r = await s.mutate(`update signals set ${sets.join(", ")} where id=${lit(id)}::uuid${audited} returning id`);
      if (r.length !== 1) {
        if (audited) throw new SweepRefusedError("unaudited_class_change", `class write refused for ${id}: no un-reverted audit row of run ${runRef} names ${String(patch.voice_class)}`);
        throw new Error(`signal write touched ${r.length} rows for ${id}`);
      }
    },
    /** The apply run a revert undoes (2026-10-21): the NEWEST apply integrity row for run_ref + company that no revert
     *  integrity row names (excluded_by_rule.apply_integrity_id — the key the revert and the 2026-10-20 backfill write).
     *  A run_ref can carry several apply rows (a reverted run re-applied under the same ref); none left ⇒ refused. */
    async applyRunToRevert(runRef: string, companyId: string): Promise<{ id: number; md5_before: string | null }> {
      const r = await s.query<{ id: number; md5: string | null }>(`select a.id, a.excluded_by_rule->>'signals_md5_before' md5 from integrity_runs a
        where a.component='r52_voice_sweep' and a.excluded_by_rule->>'mode'='apply' and a.run_ref=${lit(runRef)} and a.company_id=${lit(companyId)}::uuid
          and not exists (select 1 from integrity_runs v where v.component='r52_voice_sweep' and v.excluded_by_rule->>'mode'='revert'
            and v.company_id=a.company_id and v.excluded_by_rule->>'apply_integrity_id' = a.id::text)
        order by a.id desc limit 1`);
      if (r.length !== 1) throw new SweepRefusedError("no_unreverted_apply", `run ${runRef} has no apply row for company ${companyId} that a revert has not already undone`);
      return { id: Number(r[0].id), md5_before: r[0].md5 };
    },
    async loadAudit(runRef: string, companyId: string): Promise<SweepAuditRow[]> {
      return await s.query<SweepAuditRow>(`select id, company_id, signal_id, run_ref, old_voice_class, new_voice_class, reverted_at from signal_voice_restamps
        where run_ref=${lit(runRef)} and company_id=${lit(companyId)}::uuid and judge_verdict is distinct from ${lit(R52_REVERT)} order by applied_at, id`);
    },
    /** The rows of the company the run stamped (what a revert must record and unstamp). */
    async stampedRows(runRef: string, companyId: string): Promise<{ id: string; voice_class: string | null; source_url: string | null }[]> {
      return await s.query<{ id: string; voice_class: string | null; source_url: string | null }>(`select id, voice_class, source_url from signals
        where company_id=${lit(companyId)}::uuid and raw_payload->'r52'->>'run_ref'=${lit(runRef)} order by id`);
    },
    async markReverted(auditId: string): Promise<void> {
      const r = await s.mutate(`update signal_voice_restamps set reverted_at=now() where id=${lit(auditId)}::uuid returning id`);
      if (r.length !== 1) throw new Error(`audit mark touched ${r.length} rows`);
    },
    /** Revert's one signal write: class back to the audit row's old value (where it still holds the new one) — and ONLY
     *  when THIS revert (same transaction: applied_at = now()) has already written its own audit row undoing that apply
     *  audit row. A restore with no record of its own touches nothing (false). */
    async restoreClass(signalId: string, oldClass: string | null, newClass: string, runRef: string, applyAuditId: string): Promise<boolean> {
      const r = await s.mutate(`update signals set voice_class=${lit(oldClass)} where id=${lit(signalId)}::uuid and voice_class=${lit(newClass)}
        and exists (select 1 from signal_voice_restamps v where v.signal_id=${lit(signalId)}::uuid and v.run_ref=${lit(runRef)} and v.judge_verdict=${lit(R52_REVERT)}
          and v.judge_entity=${lit(`apply_audit:${applyAuditId}`)} and v.old_voice_class=${lit(newClass)} and v.new_voice_class=${lit(oldClass)} and v.applied_at=now()) returning id`);
      return r.length === 1;
    },
    /** Revert's stamp removal: the keys apply added, on every row of the company the run stamped. */
    async unstamp(runRef: string, companyId: string): Promise<number> {
      const r = await s.mutate(`update signals set raw_payload = case when raw_payload->'r52'->>'payload_was_null'='true' then null else raw_payload - 'r52' - 'r52_unknown' end
        where company_id=${lit(companyId)}::uuid and raw_payload->'r52'->>'run_ref'=${lit(runRef)}
          and exists (select 1 from signal_voice_restamps v where v.signal_id=signals.id and v.run_ref=${lit(runRef)} and v.judge_verdict=${lit(R52_REVERT)} and v.applied_at=now()) returning id`);
      return r.length;
    },
    /** md5 of the company's signal rows over every column the sweep could touch, plus the liveness columns. */
    async companySignalsMd5(companyId: string): Promise<string> {
      const r = await s.query<{ md5: string | null }>(`select md5(coalesce(string_agg(id::text||'|'||coalesce(voice_class,'∅')||'|'||coalesce(raw_payload::text,'∅')||'|'||coalesce(superseded_at::text,'∅')||'|'||coalesce(held_at::text,'∅'), ',' order by id),'')) md5 from signals where company_id=${lit(companyId)}::uuid`);
      return String(r[0]?.md5 ?? "");
    },
  };
}
export type SweepStore = ReturnType<typeof makePsqlSweepStore>;
