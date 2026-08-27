// GATE R3b — client_voice REGENERATION (the own-voice refresh generator).
//
// The own-band analog of extract-outside-evidence. For each CURRENT-site page it reads the STORED
// own_words_page_snapshots basis (R1's fresh 2026-08-26 crawl — NO fetch), asks gpt-4.1-mini to lift
// SELF-DESCRIPTIVE channel statements (what the company says about itself/its offering on its own
// channels) as EXACT substrings, then admits each through the deterministic birth guard
// (admitClientVoice = CLASSIFICATION backstop + FAITHFULNESS). Admitted excerpts are minted as NEW
// client_voice signals (voice_class='client_voice', source_type='client_voice_regen') that
// rebuild-claims turns into the declared side of beat 4. The old analysis-flavored client_voice are
// superseded-with-audit in a SEPARATE step (never here, never deleted).
//
// Router: own-site is PUBLIC corpus → external gpt-4.1-mini (per the router law; matches extract-own-
// words). READ-DATE stamped at mint: event_date = the snapshot's crawl date (deriveSourceTag renders
// "· read <date>" from it) — applying task_13983caf's lesson forward so new rows are never date-less.
// Provenance routes to public_observed at rebuild (source_type is neither analysis nor upload/intake).
// Frozen company → 403.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { contentIdentity } from "../_shared/contentIdentity.ts";
import { admitClientVoice } from "../_shared/clientVoiceGuard.ts";

const nowIso = () => new Date().toISOString();
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
};
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

const GEN_MODEL = Deno.env.get("CLIENT_VOICE_MODEL") ?? "gpt-4.1-mini";
const GEN_FALLBACK = Deno.env.get("CLIENT_VOICE_FALLBACK_MODEL") ?? "gpt-4.1-nano";
const PER_URL_CAP = Number(Deno.env.get("CLIENT_VOICE_PER_URL_CAP") ?? "12");
const QUOTE_MAX_WORDS = 60;
const WALL_MS = 140_000;

const GEN_SYSTEM =
  `You are reading a company's OWN website page. Extract ONLY statements the company asserts ABOUT ITSELF ` +
  `on its own channel — positioning, promise, who it serves, what it offers, how it works, partnerships, ` +
  `and offering-model statements ("we provide…", "our coffees are available for wholesale partners", ` +
  `"we partner with…"). Return each as an EXACT substring of the supplied page text (copy-paste, invent ` +
  `nothing), at most ${QUOTE_MAX_WORDS} words. ` +
  `EXCLUDE: navigation, menus with prices, hours, cookie/consent, legal, AND any ANALYSIS or outside read — ` +
  `market assessment, competitor comparison, growth-constraint / weakness framing, review summaries, ratings. ` +
  `Respond with ONLY JSON: {"statements":["...","..."]}. No other text.`;
const JUDGE_SYSTEM =
  `You judge candidate quotes lifted from a company's OWN web page. keep=true ONLY if it is the company ` +
  `describing ITSELF or its OFFERING on its own channel (positioning, promise, who it serves, what it offers, ` +
  `a partnership it states). keep=false if it is an ANALYSIS or outside read (market position, growth ` +
  `constraint, brand (in)visibility, competitive landscape, reputational risk, a review/ratings summary), ` +
  `a numbered analysis list item, navigation, a menu/price line, hours, or boilerplate. The test: would the ` +
  `company say this to promote ITSELF? Respond with ONLY JSON: {"verdicts":[{"quote":"...","keep":true,"reason":"..."}]}. No other text.`;

async function callModel(system: string, user: string): Promise<Record<string, unknown>> {
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) throw new Error("OPENAI_API_KEY not set");
  let lastErr: unknown = null;
  for (const model of [GEN_MODEL, GEN_FALLBACK]) {
    try {
      const resp = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model, temperature: 0, response_format: { type: "json_object" },
          messages: [{ role: "system", content: system }, { role: "user", content: user }],
        }),
      });
      if (!resp.ok) { lastErr = new Error(`${model} ${resp.status}: ${(await resp.text()).slice(0, 200)}`); continue; }
      const data = await resp.json();
      const content = String(data?.choices?.[0]?.message?.content ?? "");
      const m = content.match(/\{[\s\S]*\}/);
      if (!m) { lastErr = new Error(`${model} returned no JSON`); continue; }
      return JSON.parse(m[0]) as Record<string, unknown>;
    } catch (e) { lastErr = e; }
  }
  throw lastErr ?? new Error("all models failed");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const startedAt = Date.now();
  try {
    const body = await req.json().catch(() => ({}));
    const company_id = String(body.company_id ?? "");
    const urlFilter: string[] | null = Array.isArray(body.urls) ? body.urls.map(String) : null;
    const sinceDate = String(body.since ?? "2026-08-26"); // current-site snapshots only (R1's fresh crawl)
    const runId: string = typeof body.run_id === "string" && body.run_id ? body.run_id : crypto.randomUUID();
    if (!company_id) return json({ error: "company_id is required" }, 400);

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Frozen refusal — a frozen company is never regenerated or written.
    const { data: co } = await supabase.from("companies").select("id, frozen").eq("id", company_id).maybeSingle();
    if (!co) return json({ error: "company not found" }, 404);
    if ((co as { frozen?: boolean }).frozen) return json({ error: "client-voice refused: company is frozen" }, 403);

    // Basis: newest CURRENT-site snapshot per URL (fetched on/after `sinceDate`). NO fetch.
    const { data: snapRows } = await supabase
      .from("own_words_page_snapshots")
      .select("source_url, clean_text, text_sha256, fetched_at")
      .eq("company_id", company_id)
      .gte("fetched_at", `${sinceDate}T00:00:00Z`)
      .order("fetched_at", { ascending: false });
    const newestByUrl = new Map<string, { clean_text: string; sha: string; readDate: string }>();
    for (const r of (snapRows ?? []) as Array<{ source_url: string; clean_text: string | null; text_sha256: string; fetched_at: string }>) {
      if (newestByUrl.has(r.source_url)) continue;
      if (!r.clean_text || !r.clean_text.trim()) continue;
      newestByUrl.set(r.source_url, { clean_text: r.clean_text, sha: r.text_sha256, readDate: String(r.fetched_at).slice(0, 10) });
    }
    let urls = [...newestByUrl.keys()];
    if (urlFilter) urls = urls.filter((u) => urlFilter.includes(u));

    // Existing client_voice content identities (dedup — never mint a duplicate of an existing excerpt).
    const { data: existSig } = await supabase
      .from("signals").select("evidence_excerpt, raw_payload")
      .eq("company_id", company_id).eq("voice_class", "client_voice");
    const existingCI = new Set<string>();
    for (const s of (existSig ?? []) as Array<{ evidence_excerpt: string | null; raw_payload?: { content_identity?: string } }>) {
      if (s.raw_payload?.content_identity) existingCI.add(s.raw_payload.content_identity);
      if (s.evidence_excerpt) existingCI.add(await contentIdentity(s.evidence_excerpt));
    }

    const pages: Array<Record<string, unknown>> = [];
    const seenThisRun = new Set<string>();
    let candidates_total = 0, admitted_total = 0, guard_rejected_total = 0;
    const rejectReasons: Record<string, number> = {};
    let processed = 0, stoppedForTime = false;

    for (const url of urls) {
      if (Date.now() - startedAt > WALL_MS) { stoppedForTime = true; break; }
      const { clean_text, sha, readDate } = newestByUrl.get(url)!;

      let cands: string[] = [];
      try {
        const gen = await callModel(GEN_SYSTEM, `PAGE TEXT:\n${clean_text}`);
        cands = (Array.isArray(gen.statements) ? gen.statements : []).map((s: unknown) => String(s ?? "").trim())
          .filter((s) => s && s.split(/\s+/).length <= QUOTE_MAX_WORDS);
      } catch (e) {
        pages.push({ url, error: `gen: ${(e as Error).message}`, candidates: 0, admitted: 0 });
        continue;
      }
      candidates_total += cands.length;

      let keepByQuote = new Map<string, boolean>();
      if (cands.length) {
        try {
          const j = await callModel(JUDGE_SYSTEM, `PAGE TEXT:\n${clean_text}\n\nCANDIDATES:\n${cands.map((c) => `- ${c}`).join("\n")}`);
          const verdicts = (Array.isArray(j.verdicts) ? j.verdicts : []) as Array<Record<string, unknown>>;
          keepByQuote = new Map(verdicts.map((v) => [String(v.quote ?? "").trim(), v.keep === true]));
        } catch (e) {
          pages.push({ url, error: `judge: ${(e as Error).message}`, candidates: cands.length, admitted: 0 });
          continue;
        }
      }

      const admittedRows: Array<Record<string, unknown>> = [];
      const rejected: Array<{ quote: string; reason: string }> = [];
      for (const c of cands) {
        if (admittedRows.length >= PER_URL_CAP) break;
        if (keepByQuote.size && keepByQuote.get(c) === false) { rejected.push({ quote: c.slice(0, 80), reason: "judge_reject_class" }); continue; }
        const verdict = admitClientVoice(c, clean_text);
        if (!verdict.admit) {
          guard_rejected_total++;
          rejectReasons[verdict.reason] = (rejectReasons[verdict.reason] ?? 0) + 1;
          rejected.push({ quote: c.slice(0, 80), reason: verdict.reason });
          continue;
        }
        const ci = await contentIdentity(verdict.excerpt);
        if (existingCI.has(ci) || seenThisRun.has(ci)) { rejected.push({ quote: c.slice(0, 80), reason: "duplicate_identity" }); continue; }
        seenThisRun.add(ci);
        admittedRows.push({
          company_id, source_id: null, source_type: "client_voice_regen", source_title: "Cafe Barra own site",
          source_url: url, signal_band: "outside", evidence_type: "founder_narrative",
          claim_text: verdict.excerpt, evidence_excerpt: verdict.excerpt,
          topic: "client_voice_signal", directness: "direct", recency: "recent", framing_fit: "partial",
          structure_level: "extracted", validation_status: "directional", confidence_to_use: "medium",
          voice_class: "client_voice",
          event_date: readDate, // READ-DATE stamped at mint (deriveSourceTag renders "· read <date>")
          raw_payload: {
            source: "client_voice_regen", content_identity: ci, page_url: url, snapshot_text_sha256: sha,
            run_id: runId, provenance: "public_observed", read_at: nowIso(),
          },
        });
      }

      if (admittedRows.length) {
        const { error: insErr } = await supabase.from("signals").insert(admittedRows);
        if (insErr) throw new Error(`signal insert failed for ${url}: ${insErr.message}`);
      }
      admitted_total += admittedRows.length;
      processed++;
      pages.push({
        url, read_date: readDate, candidates: cands.length, admitted: admittedRows.length,
        admitted_excerpts: admittedRows.map((r) => r.evidence_excerpt),
        rejected: rejected.slice(0, 20),
      });
    }

    const { error: intErr } = await supabase.from("integrity_runs").insert({
      company_id, component: "r3b_client_voice_regen", status: stoppedForTime ? "failed" : "completed",
      examined: candidates_total, admitted: admitted_total,
      excluded_by_rule: { guard_rejected_total, reject_reasons: rejectReasons, urls: urls.length, pages: processed, run_id: runId, stopped_for_time: stoppedForTime },
      run_ref: `r3b_client_voice_regen_${runId}`,
    });
    if (intErr) throw new Error(`integrity insert failed: ${intErr.message}`);

    return json({
      ok: true, company_id, run_id: runId, urls_total: urls.length, pages_processed: processed, stopped_for_time: stoppedForTime,
      totals: { candidates: candidates_total, admitted: admitted_total, guard_rejected: guard_rejected_total, reject_reasons: rejectReasons },
      pages,
    });
  } catch (e) {
    return json({ ok: false, error: (e as Error).message }, 500);
  }
});
