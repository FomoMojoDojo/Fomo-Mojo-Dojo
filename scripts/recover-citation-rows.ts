#!/usr/bin/env -S deno run --allow-all
// ── RECOVER A RUN'S DROPPED CITATION ROWS FROM ITS STORED RESPONSE (operator ruling 2026-10-21, re-run 2 brief ruling 1) ──
//
// Run 83 paid for 44 citations and minted 24: mergeDiscoveredEvidenceIntoLedger capped the evidence ledger at 24 entries
// (fixed: citation entries are no longer capped). This script mints the dropped ones from the run's STORED raw response
// (result_json.web_search_raw.main — the verbatim text + citation blocks) with ZERO model calls and no network:
//   entries   citationEntries over the stored blocks — the live path's builder; excluded hosts (company + every confirmed
//             entity's exclude list) mint nothing; a cited_text already standing as one of the company's excerpts is not
//             re-minted (that is how the 24 already minted are skipped)
//   voice     the live overlay: source_type = public-baseline's own inferSourceType (extracted from its source at run time),
//             voice = decideVoiceClassBeforeJudge with the company's host and its confirmed related entities (entity stamp)
//   rows      mapPublicBaselineOutputToSignals → applyMintExcerptGuard (ruling 4, the stored spans) → normalizeSignalInsert,
//             source_id = the run; raw_payload.recovered names the source and the ruling
//   check     every row's evidence_excerpt is byte-equal to a cited_text in the stored blocks for its URL — else nothing is written
// Not done here (no model call allowed): the authorship judge and the syndication stamp; run 83's own pass judged 0 rows
// and its syndication flagged 0. Claims are not rebuilt by this script.
//
//   deno run --allow-all scripts/recover-citation-rows.ts --plan  --company=<uuid> --run=<public_baseline_runs.id>
//   deno run --allow-all scripts/recover-citation-rows.ts --write --company=<uuid> --run=<id> --actor=<name>
import { classifyBodyMode } from "../supabase/functions/_shared/bodyMode.ts";
import { argvBody } from "./r52/sweepCore.ts";
import { lit, PsqlSession } from "./lib/psqlBlankingStore.ts";
import { citationEntries } from "../supabase/functions/_shared/citationRows.ts";
import { normalizeForHash } from "../supabase/functions/_shared/contentIdentity.ts";
import { decideVoiceClassBeforeJudge } from "../supabase/functions/_shared/voiceClassAtMint.ts";
import { seedHostOf, type RelatedEntityRow } from "../supabase/functions/_shared/ownHosts.ts";
import { mapPublicBaselineOutputToSignals } from "../src/lib/evidenceMappers.ts";
import { applyMintExcerptGuard, normalizeSignalInsert } from "../supabase/functions/_shared/evidencePhase1.ts";
import { extractCitedSpans } from "../src/lib/firstRead/citationSource.ts";
import { normalizeUrlKey } from "../src/lib/firstRead/quoteProducer.ts";

const out = (o: unknown) => console.log(JSON.stringify(o, null, 1));
const body = argvBody(Deno.args);
const v = classifyBodyMode(body, ["plan", "write"] as const, ["plan", "write", "company", "run", "actor"]);
if (!v.ok) { out({ ok: false, refused: true, code: "mode_unnamed", error: v.detail }); Deno.exit(3); }
const company = String(body.company ?? ""), runId = String(body.run ?? "");
if (!/^[0-9a-f-]{36}$/.test(company) || !/^\d+$/.test(runId)) { out({ ok: false, refused: true, code: "args", error: "--company=<uuid> and --run=<id> are required" }); Deno.exit(3); }
if (v.mode === "write" && !String(body.actor ?? "").trim()) { out({ ok: false, refused: true, code: "args", error: "--write needs --actor" }); Deno.exit(3); }

// public-baseline's own inferSourceType (+ its helpers), extracted from the served source — the live path's classifier
const pbSrc = await Deno.readTextFile(new URL("../supabase/functions/public-baseline/index.ts", import.meta.url));
const fnText = (name: string) => { const i = pbSrc.indexOf(`\nfunction ${name}(`); if (i < 0) throw new Error(`public-baseline: ${name} not found`); return pbSrc.slice(i + 1, pbSrc.indexOf("\n}\n", i) + 2); };
const dir = await Deno.makeTempDir();
await Deno.writeTextFile(`${dir}/infer.ts`, ["getDomain", "hostMatchesAnyDomain", "pathOf", "inferSourceType"].map((n) => `export ${fnText(n)}`).join("\n"));
const { inferSourceType } = await import(`file://${dir}/infer.ts`) as { inferSourceType: (url: string, title?: string, snippet?: string) => string };

const s = new PsqlSession();
try {
  await s.exec(v.mode === "plan" ? "begin transaction read only;" : "begin;");
  const [co] = await s.query<{ website: string | null; name: string; ex: string[] | null }>(`select website, name,
    coalesce((select array_agg(x) from jsonb_array_elements_text(coalesce(public_source_filters_json->'exclude_domains','[]'::jsonb)) x), '{}') ex from companies where id=${lit(company)}::uuid`);
  const [run] = await s.query<{ raw: { text_blocks?: unknown[] } | null }>(`select result_json->'web_search_raw'->'main' raw from public_baseline_runs where id=${runId} and company_id=${lit(company)}::uuid`);
  if (!co || !run?.raw?.text_blocks) throw new Error(`run ${runId}: no stored web_search_raw.main for this company`);
  const related = await s.query<RelatedEntityRow & { exclude_hosts: string[] }>(`select id, name, host, relation, effective_from::text effective_from, effective_basis, status, exclude_hosts from company_related_entities where company_id=${lit(company)}::uuid and status='confirmed'`);
  const existing = await s.query<{ evidence_excerpt: string }>(`select evidence_excerpt from signals where company_id=${lit(company)}::uuid and superseded_at is null and evidence_excerpt <> ''`);
  const response = { content: run.raw.text_blocks };
  const excludeHosts = [...(co.ex ?? []), ...related.flatMap((r) => r.exclude_hosts ?? [])];
  const { entries, stats } = citationEntries(response, { excludeHosts, existingExcerpts: new Set(existing.map((r) => normalizeForHash(r.evidence_excerpt))) });
  // the live overlay (reclassify): source_type, voice, entity
  const host = seedHostOf(co.website);
  const overlaid = entries.map((e) => {
    const inferred = inferSourceType(e.url, e.bucket, e.snippet);
    const source_type = inferred !== "public_web" ? inferred : (e.source_type || "public_web");
    const d = decideVoiceClassBeforeJudge({ url: e.url, item: e, labeledClass: e.voice_class, pageText: null, judgedText: null, company: { name: "", host, ...(related.length ? { related } : {}) }, registry: null, judge: null, gate: "profile", onJudgeFailure: "keep_label" } as never) as Record<string, any>;
    const voice_class = "needs_judge" in d ? d.label : d.ok ? d.voice_class : null;
    return { ...e, source_type, voice_class, ...(d.entity ? { entity: d.entity } : {}), recovered: { from: `public_baseline_runs.${runId}.result_json.web_search_raw.main`, ruling: "2026-10-21 re-run 2 brief ruling 1", reason: "evidence ledger capped at 24" } };
  });
  const drafts = mapPublicBaselineOutputToSignals({ companyId: company, sourceId: runId, sourceTitle: `${co.name} public baseline`, sourceUrl: co.website, resultJson: { evidence_ledger: overlaid, outside_voice_signals: [] } });
  const spans = extractCitedSpans(response);
  const quiet = console.log; console.log = () => {};
  await applyMintExcerptGuard({ supabase: { from: () => ({}) }, companyId: company, runId, signals: drafts, sourceTextByUrl: new Map(), webSearchCitedSpans: spans });
  console.log = quiet;
  const rows = drafts.map((d) => normalizeSignalInsert(d));
  const notByteEqual = rows.filter((r) => !(spans.get(normalizeUrlKey(String(r.source_url))) ?? []).includes(String(r.evidence_excerpt)));
  const summary = rows.map((r) => ({ host: (() => { try { return new URL(String(r.source_url)).hostname; } catch { return ""; } })(), voice_class: r.voice_class, entity: (r.raw_payload as any)?.entity?.name ?? null, byte_equal: !notByteEqual.includes(r), excerpt: String(r.evidence_excerpt).slice(0, 120) }));
  if (v.mode === "plan" || notByteEqual.length) {
    const xid = (await s.query<{ x: string | null }>(`select pg_current_xact_id_if_assigned()::text x`))[0].x;
    await s.exec("rollback;");
    out({ mode: v.mode, ok: notByteEqual.length === 0, refused: notByteEqual.length > 0, xid_assigned: xid, model_calls: 0, stats, rows: rows.length, not_byte_equal: notByteEqual.length, summary });
    Deno.exit(notByteEqual.length ? 3 : 0);
  }
  const ids: string[] = [];
  for (const r of rows) {
    const cols = Object.keys(r).filter((k) => (r as Record<string, unknown>)[k] !== undefined);
    const val = (k: string) => { const x = (r as Record<string, unknown>)[k]; return x == null ? "null" : typeof x === "object" ? `${lit(JSON.stringify(x))}::jsonb` : lit(String(x)); };
    const [ins] = await s.mutate<{ id: string }>(`insert into signals (${cols.join(",")}) values (${cols.map(val).join(",")}) returning id`);
    ids.push(ins.id);
  }
  await s.exec("commit;");
  out({ mode: "write", ok: true, model_calls: 0, stats, inserted: ids.length, ids, summary });
} catch (e) {
  try { await s.exec("rollback;"); } catch { /* none */ }
  out({ ok: false, error: String((e as Error)?.message ?? e) });
  await s.close();
  Deno.exit(1);
}
await s.close();
