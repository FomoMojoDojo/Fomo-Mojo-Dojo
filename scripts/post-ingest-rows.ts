#!/usr/bin/env -S deno run --allow-all
// ── POST-INGEST FOR ROWS MINTED OUTSIDE THE INGEST (operator ruling 2026-10-22) ──────────────────────────────────────────
//
// The 33 rows minted by scripts/recover-citation-rows.ts and the seed-host lane skipped two steps the live ingest runs:
//   authorship  public-baseline's gate (demoteAggregatorSelfVoiceInResult) with the live judge (judgeAggregatorAuthorship,
//               local Ollama, ledgered per call as public-baseline-authorship) and the live page rule: an entry is judged
//               only against a page this run crawled for its URL — none of these URLs were crawled, so the gate is
//               expected to judge none (run 83's own pass: considered 42, judged 0).
//   syndication the ingest stamp (B2.0): buildClientCorpus + resolveSyndicationDurable per outside_voice_about_client row →
//               signals.syndication_score / syndicated_from_client (and the durable syndication_verdicts row it writes).
// The claim rebuild is the rebuild-claims function (the live trigger), run separately.
//
//   deno run --allow-all scripts/post-ingest-rows.ts --plan  --company=<uuid> --since=<iso>   (authorship only; no writes)
//   deno run --allow-all scripts/post-ingest-rows.ts --write --company=<uuid> --since=<iso>
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { classifyBodyMode } from "../supabase/functions/_shared/bodyMode.ts";
import { argvBody } from "./r52/sweepCore.ts";
import { demoteAggregatorSelfVoiceInResult, judgeAggregatorAuthorship, ollamaAuthorshipTransport, resolveLocalOllamaUrl } from "../supabase/functions/_shared/aggregatorAuthorship.ts";
import { recordModelCall } from "../supabase/functions/_shared/recordModelCall.ts";
import { buildClientCorpus, resolveSyndicationDurable } from "../supabase/functions/_shared/syndication.ts";
import { seedHostOf, loadConfirmedRelatedEntities } from "../supabase/functions/_shared/ownHosts.ts";

const out = (o: unknown) => console.log(JSON.stringify(o, null, 1));
const body = argvBody(Deno.args);
const v = classifyBodyMode(body, ["plan", "write"] as const, ["plan", "write", "company", "since"]);
if (!v.ok) { out({ ok: false, refused: true, code: "mode_unnamed", error: v.detail }); Deno.exit(3); }
const company = String(body.company ?? ""), since = String(body.since ?? "");
if (!/^[0-9a-f-]{36}$/.test(company) || !since) { out({ ok: false, refused: true, code: "args", error: "--company and --since are required" }); Deno.exit(3); }
const url = Deno.env.get("SUPABASE_URL") ?? "", key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
if (!url || !key) { out({ ok: false, refused: true, code: "env", error: "SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY required" }); Deno.exit(3); }
const supabase = createClient(url, key);

const { data: co } = await supabase.from("companies").select("name, website").eq("id", company).single();
const { data: rows, error } = await supabase.from("signals").select("id, source_url, voice_class, claim_text, evidence_excerpt, raw_payload, syndicated_from_client")
  .eq("company_id", company).gte("created_at", since).is("superseded_at", null).is("held_at", null).neq("voice_class", "analysis");
if (error || !co) { out({ ok: false, error: error?.message ?? "company not found" }); Deno.exit(1); }
const related = await loadConfirmedRelatedEntities(supabase, company);
const host = seedHostOf((co as { website: string }).website) ?? "";

// authorship — the live gate, the live judge, ledgered
const ollamaUrl = resolveLocalOllamaUrl();
const transport = ollamaUrl ? ollamaAuthorshipTransport(ollamaUrl) : null;
const tally = { calls: 0, ledger_failed: 0 };
const entries = (rows ?? []).map((r: any) => ({ ...(r.raw_payload ?? {}), url: r.source_url, voice_class: r.voice_class, snippet: r.evidence_excerpt, _id: r.id }));
const gate = await demoteAggregatorSelfVoiceInResult({ evidence_ledger: entries }, {
  subjectName: (co as { name: string }).name, subjectHost: host, ...(related.length ? { related } : {}),
  pageFor: () => null, // the live rule: judged only against a page this run crawled for the URL — none were
  judge: transport
    ? (input) => judgeAggregatorAuthorship(input, { transport, ledger: async (e) => { const ok = await recordModelCall(supabase, { companyId: company, runId: null, callSite: "public-baseline-authorship", usage: e.usage, attempt: 1, promptSha: e.promptSha }); tally.calls++; if (!ok) tally.ledger_failed++; return ok; } })
    : () => Promise.resolve({ verdict: "judge_failed" as const, entity: null, reason: "local Ollama unavailable", model: "none" }),
});
const after = (gate.result.evidence_ledger as Array<Record<string, unknown>>);
const classChanges = after.filter((e, i) => e.voice_class !== entries[i].voice_class).map((e) => ({ id: e._id, from: entries.find((x) => x._id === e._id)?.voice_class, to: e.voice_class }));

if (v.mode === "plan") {
  out({ mode: "plan", rows: (rows ?? []).length, authorship: gate.stats, authorship_model_calls: tally, class_changes: classChanges, syndication_candidates: (rows ?? []).filter((r: any) => r.voice_class === "outside_voice_about_client").length });
  Deno.exit(0);
}
for (const c of classChanges) await supabase.from("signals").update({ voice_class: c.to }).eq("id", c.id as string);

// syndication — the ingest stamp
const clientTexts = (rows ?? []).filter((r: any) => r.voice_class === "client_voice").map((r: any) => r.claim_text).filter(Boolean);
const corpus = await buildClientCorpus(supabase, company, host, clientTexts);
const sample = clientTexts.join("\n").slice(0, 4000);
let stamped = 0, flagged = 0; const stampedIds: string[] = [];
for (const r of (rows ?? []) as any[]) {
  if (r.voice_class !== "outside_voice_about_client") continue;
  const verdict = await resolveSyndicationDurable({ supabase, companyId: company, sourceUrl: String(r.source_url || ""), itemText: r.claim_text || "", corpus, clientSampleForLlm: sample, label: "ingest" });
  const patch: Record<string, unknown> = { syndication_score: Number(verdict.score.toFixed(4)) };
  if (verdict.syndicated !== null) { patch.syndicated_from_client = verdict.syndicated; stamped++; if (verdict.syndicated) flagged++; }
  const { error: uErr } = await supabase.from("signals").update(patch).eq("id", r.id);
  if (uErr) throw new Error(`syndication stamp failed for ${r.id}: ${uErr.message}`);
  stampedIds.push(r.id);
}
out({ mode: "write", rows: (rows ?? []).length, authorship: gate.stats, authorship_model_calls: tally, class_changes: classChanges, syndication: { examined: stampedIds.length, stamped, flagged_syndicated: flagged } });
