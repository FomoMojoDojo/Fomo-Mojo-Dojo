// GATE OW-2 (2026-08-20) — own-words extractor, DRY-RUN (plan) capable.
//
// For each client_voice PUBLIC page: fetchAndExtract → immutable snapshot (written in BOTH
// modes; snapshots are corpus, not substance) → generator (gpt-4.1-mini, fallback nano; local
// qwen wired but OFF) → judge → the honesty rails in ownWordsExtract.ts (channelJunk →
// self-assertion → keep → DETERMINISTIC verbatim guard → dedup).
//
// mode:'plan'  → return the would-be own-words + rejections with reasons; write ONLY snapshots
//                and one integrity_runs 'planned' row. NOTHING is written to claims.
// mode:'write' → REFUSED this gate (OW-2 is dry-run; claim writes are a later gate).
//
// Privacy (Option B): every URL's signal must be voice_class='client_voice' AND a public-web
// source; a frozen company is refused outright (never fetched). No internal/uploaded/intake text
// ever reaches the external model.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { fetchAndExtract } from "../_shared/fetchAndExtract.ts";
import { sha256Hex } from "../_shared/contentIdentity.ts";
import {
  assembleOwnWords, assertPublicClientVoice,
  type Candidate, type JudgeVerdict, type SignalGate,
} from "../_shared/ownWordsExtract.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
};
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

const QUOTE_MAX_WORDS = 40;
const GEN_MODEL = Deno.env.get("OWN_WORDS_MODEL") ?? "gpt-4.1-mini";
const GEN_FALLBACK = Deno.env.get("OWN_WORDS_FALLBACK_MODEL") ?? "gpt-4.1-nano";
// Local qwen is WIRED but off — flip OWN_WORDS_LOCAL=1 to route to a local ollama instead of
// OpenAI (only ever for non-public input, which this extractor structurally never has).
const USE_LOCAL = Deno.env.get("OWN_WORDS_LOCAL") === "1";
const OLLAMA_BASE_URL = Deno.env.get("OLLAMA_BASE_URL") ?? "http://host.docker.internal:11434/v1";
const LOCAL_MODEL = Deno.env.get("OWN_WORDS_LOCAL_MODEL") ?? "qwen2.5:14b-instruct";

const GEN_SYSTEM =
  `Extract ONLY statements the company asserts ABOUT ITSELF — positioning, promise, who it serves, why it wins. ` +
  `Return each as an EXACT substring of the supplied page text, with its character offset and length. ` +
  `EXCLUDE navigation, menus, hours, prices, legal/policy, cookie/consent, and third-party embeds or quotes. ` +
  `Each quote must be at most ${QUOTE_MAX_WORDS} words. Invent nothing — every quote must be copy-paste from the text. ` +
  `Respond with ONLY JSON: {"statements":[{"quote":"...","offset":0,"length":0}]}. No other text.`;

const JUDGE_SYSTEM =
  `You judge candidate own-words quotes pulled from a company's OWN web page. For each candidate decide: ` +
  `keep (true ONLY if it is the company asserting something about itself — positioning, promise, who it serves, why it wins); ` +
  `selfAssertion (is the company speaking about ITSELF, not a third party, review, menu item, or navigation); ` +
  `fidelity ('verbatim' if an exact copy from the page, else 'paraphrased'). Reject third-party quotes, navigation, menus, prices, legal. ` +
  `Respond with ONLY JSON: {"verdicts":[{"quote":"...","keep":true,"selfAssertion":true,"fidelity":"verbatim","reason":"..."}]}. No other text.`;

async function callModel(system: string, user: string): Promise<Record<string, unknown>> {
  const endpoint = USE_LOCAL ? `${OLLAMA_BASE_URL}/chat/completions` : "https://api.openai.com/v1/chat/completions";
  const apiKey = USE_LOCAL ? "ollama" : Deno.env.get("OPENAI_API_KEY");
  if (!USE_LOCAL && !apiKey) throw new Error("OPENAI_API_KEY not set");
  const models = USE_LOCAL ? [LOCAL_MODEL] : [GEN_MODEL, GEN_FALLBACK];
  let lastErr: unknown = null;
  for (const model of models) {
    try {
      const resp = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model, temperature: 0,
          response_format: { type: "json_object" },
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
    const mode = String(body.mode ?? "plan");
    const urlFilter: string[] | null = Array.isArray(body.urls) ? body.urls.map(String) : null;
    if (!company_id) return json({ error: "company_id is required" }, 400);
    if (mode === "write") return json({ error: "write mode is not enabled (OW-2 is a dry-run gate)" }, 501);
    if (mode !== "plan") return json({ error: `unknown mode '${mode}'` }, 422);

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // ── Frozen refusal — a frozen company is never fetched. ──────────────────
    const { data: co } = await supabase.from("companies").select("id, frozen").eq("id", company_id).maybeSingle();
    if (!co) return json({ error: "company not found" }, 404);
    if ((co as { frozen?: boolean }).frozen) return json({ error: "own-words refused: company is frozen" }, 403);

    // ── Corpus: client_voice public signals, dedup by URL (first signal per URL). ──
    const { data: sigRows } = await supabase
      .from("signals")
      .select("id, source_url, source_title, voice_class, source_type")
      .eq("company_id", company_id)
      .eq("voice_class", "client_voice");
    const sigs = ((sigRows ?? []) as Array<{ id: string; source_url: string | null; source_title: string | null; voice_class: string | null; source_type: string | null }>)
      .filter((s) => !!s.source_url);

    // Privacy gate (Option B) — refuse if ANY selected signal is not public client-voice.
    assertPublicClientVoice(sigs as SignalGate[]);

    const byUrl = new Map<string, { id: string; source_title: string | null }>();
    for (const s of sigs) {
      if (!byUrl.has(s.source_url!)) byUrl.set(s.source_url!, { id: s.id, source_title: s.source_title });
    }
    let urls = [...byUrl.keys()];
    if (urlFilter) urls = urls.filter((u) => urlFilter.includes(u));

    // ── Per-page pipeline (chunked by page; honor a 150s wall-clock). ────────
    const WALL_MS = 150_000;
    const pages: Array<Record<string, unknown>> = [];
    let candidates_total = 0, kept_total = 0, paraphrased_total = 0, rejected_total = 0, guard_rejected_total = 0;
    const wouldBe: Array<{ quote: string; page: string; fidelity: string }> = [];
    let processed = 0, stoppedForTime = false;

    for (const url of urls) {
      if (Date.now() - startedAt > WALL_MS) { stoppedForTime = true; break; }
      const meta = byUrl.get(url)!;
      const fetched = await fetchAndExtract(url);
      if (!fetched.ok || !fetched.text.trim()) {
        pages.push({ url, fetched: false, status: fetched.status, snapshot_chars: 0, candidates: 0 });
        continue;
      }
      const cleanText = fetched.text;
      const text_sha256 = await sha256Hex(cleanText);
      // Snapshot — written in BOTH modes (corpus, not substance). Immutable at the DB level.
      const { error: snapErr } = await supabase.from("own_words_page_snapshots").insert({
        company_id, source_url: url, signal_id: meta.id, clean_text: cleanText, text_sha256, run_id: null,
      });
      if (snapErr) throw new Error(`snapshot insert failed for ${url}: ${snapErr.message}`);

      // Generate.
      let candidates: Candidate[] = [];
      try {
        const gen = await callModel(GEN_SYSTEM, `PAGE TEXT:\n${cleanText}`);
        candidates = (Array.isArray(gen.statements) ? gen.statements : [])
          .map((s: unknown) => {
            const o = s as { quote?: unknown; offset?: unknown; length?: unknown };
            const quote = String(o.quote ?? "").trim();
            return { quote, offset: Number(o.offset ?? -1), length: Number(o.length ?? quote.length) };
          })
          .filter((c: Candidate) => c.quote && c.quote.split(/\s+/).length <= QUOTE_MAX_WORDS);
      } catch (e) {
        pages.push({ url, fetched: true, snapshot_chars: cleanText.length, candidates: 0, error: `gen: ${(e as Error).message}` });
        continue;
      }
      candidates_total += candidates.length;

      // Judge (one call for the page's candidates).
      let verdictByQuote = new Map<string, JudgeVerdict>();
      if (candidates.length > 0) {
        try {
          const j = await callModel(JUDGE_SYSTEM, `PAGE TEXT:\n${cleanText}\n\nCANDIDATES:\n${candidates.map((c) => `- ${c.quote}`).join("\n")}`);
          const verdicts = (Array.isArray(j.verdicts) ? j.verdicts : []) as Array<Record<string, unknown>>;
          verdictByQuote = new Map(
            verdicts.map((v) => [String(v.quote ?? "").trim(), {
              keep: v.keep === true,
              fidelity: v.fidelity === "paraphrased" ? "paraphrased" : "verbatim",
              selfAssertion: v.selfAssertion === true,
              reason: v.reason ? String(v.reason) : undefined,
            } as JudgeVerdict]),
          );
        } catch (e) {
          pages.push({ url, fetched: true, snapshot_chars: cleanText.length, candidates: candidates.length, error: `judge: ${(e as Error).message}` });
          continue;
        }
      }
      const verdicts = candidates.map((c) => verdictByQuote.get(c.quote));

      // Honesty rails (shared, deterministic where possible).
      const { survivors, rejections } = await assembleOwnWords(candidates, verdicts, cleanText, meta.source_title);
      const guardRej = rejections.filter((r) => r.reason === "not_verbatim_provable").length;
      kept_total += survivors.filter((s) => s.fidelity === "verbatim").length;
      paraphrased_total += survivors.filter((s) => s.fidelity === "paraphrased").length;
      rejected_total += rejections.length;
      guard_rejected_total += guardRej;
      for (const s of survivors) wouldBe.push({ quote: s.quote, page: url, fidelity: s.fidelity });

      pages.push({
        url, fetched: true, snapshot_chars: cleanText.length,
        candidates: candidates.length, kept: survivors.length, guard_rejected: guardRej,
        rejections: rejections.map((r) => ({ quote: r.quote.slice(0, 80), reason: r.reason })),
        survivors: survivors.map((s) => ({ quote: s.quote, fidelity: s.fidelity })),
      });
      processed++;
    }

    // Integrity — plan mode writes ONLY snapshots (above) + this planned record.
    const admitted = wouldBe.length;
    const { error: intErr } = await supabase.from("integrity_runs").insert({
      company_id, component: "first_read_own_words", status: "planned",
      examined: candidates_total, admitted,
      excluded_by_rule: { rejected_total, guard_rejected_total, pages: processed, urls: urls.length, mode },
    });
    if (intErr) throw new Error(`integrity insert failed: ${intErr.message}`);

    return json({
      ok: true, mode, company_id,
      pages_total: urls.length, pages_processed: processed, stopped_for_time: stoppedForTime,
      totals: { candidates: candidates_total, verbatim: kept_total, paraphrased: paraphrased_total, rejected: rejected_total, guard_rejected: guard_rejected_total },
      would_be_own_words: wouldBe,
      pages,
    });
  } catch (e) {
    return json({ ok: false, error: (e as Error).message }, 500);
  }
});
