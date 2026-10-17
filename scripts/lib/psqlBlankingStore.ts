// ── A BlankingStore over ONE psql session (operator ruling 2026-10-16, act b2) ─────────────────────
//
// WHY A SESSION AND NOT supabase-js. The local runner has to prove apply + revert on a sample of the
// real 714 rows WITHOUT writing them: BEGIN … apply … revert … ROLLBACK. PostgREST has no
// transactions and this repo keeps no Postgres driver, so the store drives a single long-lived
// `docker exec -i <db> psql` — the audited superuser channel every local data act already uses
// (first-read-outside-recrawl.ts, the guards). One process, one connection, one transaction when asked.
//
// PROTOCOL. Each statement is written followed by `\echo <marker>`; stdout is read until the marker;
// anything psql wrote to stderr meanwhile is an error and is thrown. Reads are wrapped as
// `select coalesce(json_agg(t),'[]') from (<sql>) t` so a result is always exactly one JSON line.
// Literals are dollar-quoted with a tag the value cannot contain — excerpt text goes in verbatim.
import type { BlankingAuditRow, BlankingCompany, BlankingSignal, BlankingSnapshot, BlankingStore } from "../../supabase/functions/_shared/excerptBlanking.ts";

export const DB_CONTAINER = "supabase_db_dzlgyxcvuwiulgifbmew";

export class PsqlSession {
  private proc: Deno.ChildProcess;
  private stdin: WritableStreamDefaultWriter<Uint8Array>;
  private stdoutLines: AsyncIterator<string>;
  private stderrBuf = "";
  private n = 0;
  constructor(container = DB_CONTAINER) {
    const proc = new Deno.Command("docker", {
      args: ["exec", "-i", container, "psql", "-U", "postgres", "-d", "postgres", "-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=0"],
      stdin: "piped", stdout: "piped", stderr: "piped",
    }).spawn();
    this.proc = proc;
    this.stdin = proc.stdin.getWriter();
    this.stdoutLines = lines(proc.stdout)[Symbol.asyncIterator]();
    const stderr = proc.stderr.pipeThrough(new TextDecoderStream());
    (async () => { for await (const chunk of stderr) this.stderrBuf += chunk; })();
  }
  /** Run one statement; return its stdout lines (0 for a write, 1 JSON line for a wrapped read). */
  async exec(sql: string): Promise<string[]> {
    const mark = `__PSQL_DONE_${++this.n}__`;
    const stderrBefore = this.stderrBuf.length;
    await this.stdin.write(new TextEncoder().encode(`${sql}\n\\echo ${mark}\n`));
    const out: string[] = [];
    for (;;) {
      const r = await this.stdoutLines.next();
      if (r.done) throw new Error(`psql exited before ${mark}: ${this.stderrBuf.slice(stderrBefore)}`);
      if (r.value === mark) break;
      out.push(r.value);
    }
    await new Promise((res) => setTimeout(res, 5)); // let a trailing stderr chunk land
    const err = this.stderrBuf.slice(stderrBefore).trim();
    if (err) throw new Error(`psql: ${err}\n  on: ${sql.slice(0, 200)}`);
    return out;
  }
  async query<T = Record<string, unknown>>(sql: string): Promise<T[]> {
    // jsonb_agg, not json_agg: json's text form breaks the array across lines, jsonb's is one compact line
    const out = await this.exec(`select coalesce(jsonb_agg(t),'[]'::jsonb)::text from (${sql}) t;`);
    if (out.length !== 1) throw new Error(`expected one JSON line, got ${out.length}: ${out.join(" | ").slice(0, 200)}`);
    return JSON.parse(out[0]) as T[];
  }
  /** A data-modifying statement with RETURNING: Postgres allows it only in a WITH, never in FROM. */
  async mutate<T = Record<string, unknown>>(sql: string): Promise<T[]> {
    const out = await this.exec(`with w as (${sql}) select coalesce(jsonb_agg(w),'[]'::jsonb)::text from w;`);
    if (out.length !== 1) throw new Error(`expected one JSON line, got ${out.length}: ${out.join(" | ").slice(0, 200)}`);
    return JSON.parse(out[0]) as T[];
  }
  async close(): Promise<void> {
    try { await this.stdin.write(new TextEncoder().encode("\\q\n")); await this.stdin.close(); } catch { /* already closed */ }
    await this.proc.status;
  }
}

async function* lines(stream: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  let buf = "";
  for await (const chunk of stream.pipeThrough(new TextDecoderStream())) {
    buf += chunk;
    let i: number;
    while ((i = buf.indexOf("\n")) >= 0) { yield buf.slice(0, i); buf = buf.slice(i + 1); }
  }
  if (buf) yield buf;
}

/** A dollar-quoted literal with a tag the value cannot contain. */
export function lit(v: string | null | undefined): string {
  if (v === null || v === undefined) return "null";
  let tag = "zq";
  while (v.includes(`$${tag}$`)) tag += "x";
  return `$${tag}$${v}$${tag}$`;
}
const jlit = (v: unknown) => v === null || v === undefined ? "null" : `${lit(JSON.stringify(v))}::jsonb`;
const idList = (ids: readonly string[]) => ids.length ? ids.map((i) => `${lit(i)}::uuid`).join(",") : "'00000000-0000-0000-0000-000000000000'::uuid";

export function makePsqlBlankingStore(s: PsqlSession): BlankingStore {
  return {
    async loadCompanies() {
      return (await s.query<{ id: string; name: string; frozen: boolean | null }>(`select id, name, frozen from companies`)).map((c) => ({ id: c.id, name: c.name, frozen: !!c.frozen }));
    },
    async loadCandidateSignals(companyIds) {
      if (companyIds.length === 0) return [];
      return await s.query<BlankingSignal>(`select id, company_id, source_url, voice_class, claim_text, evidence_excerpt, quote_source_text, raw_payload from signals
        where company_id in (${idList(companyIds)}) and signal_band='outside' and superseded_at is null and held_at is null
          and nullif(trim(evidence_excerpt),'') is not null and nullif(trim(source_url),'') is not null order by created_at, id`);
    },
    async loadSnapshots(pairs) {
      if (pairs.length === 0) return [];
      const vals = pairs.map((p) => `(${lit(p.company_id)}::uuid, ${lit(p.source_url)})`).join(",");
      return await s.query<BlankingSnapshot>(`select p.company_id, p.source_url, p.clean_text, p.text_sha256, p.crawled_at from outside_page_snapshots p
        join (values ${vals}) w(company_id, source_url) on w.company_id=p.company_id and w.source_url=p.source_url
        where p.fetch_status='ok' and p.clean_text is not null`);
    },
    async loadSignalsById(ids) {
      if (ids.length === 0) return [];
      return await s.query<BlankingSignal>(`select id, company_id, source_url, voice_class, claim_text, evidence_excerpt, quote_source_text, raw_payload from signals where id in (${idList(ids)})`);
    },
    async insertAudit(row) {
      const r = await s.mutate<{ id: string }>(`insert into signal_excerpt_blankings (company_id, signal_id, run_ref, action, old_evidence_excerpt, old_excerpt_guard, new_excerpt_guard, basis_kind, basis_sha, basis_at, source_url, voice_class)
        values (${lit(row.company_id)}::uuid, ${lit(row.signal_id)}::uuid, ${lit(row.run_ref)}, ${lit(row.action)}, ${lit(row.old_evidence_excerpt)}, ${jlit(row.old_excerpt_guard)}, ${jlit(row.new_excerpt_guard)}, ${lit(row.basis_kind)}, ${lit(row.basis_sha)}, ${row.basis_at ? `${lit(row.basis_at)}::timestamptz` : "null"}, ${lit(row.source_url)}, ${lit(row.voice_class)})
        returning id`);
      if (r.length !== 1) throw new Error("audit insert returned no id");
      return r[0].id;
    },
    async writeSignal(id, patch) {
      const r = await s.mutate<{ id: string }>(`update signals set evidence_excerpt=${lit(patch.evidence_excerpt)}, raw_payload=${jlit(patch.raw_payload)} where id=${lit(id)}::uuid returning id`);
      if (r.length !== 1) throw new Error(`signal write touched ${r.length} rows for ${id}`);
    },
    async loadAudit(runRef) {
      return await s.query<BlankingAuditRow>(`select id, company_id, signal_id, run_ref, action, old_evidence_excerpt, old_excerpt_guard, new_excerpt_guard, reverted_at from signal_excerpt_blankings where run_ref=${lit(runRef)} order by applied_at, id`);
    },
    async markReverted(auditId) {
      const r = await s.mutate<{ id: string }>(`update signal_excerpt_blankings set reverted_at=now() where id=${lit(auditId)}::uuid returning id`);
      if (r.length !== 1) throw new Error(`audit mark touched ${r.length} rows`);
    },
  };
}

export type { BlankingCompany };
