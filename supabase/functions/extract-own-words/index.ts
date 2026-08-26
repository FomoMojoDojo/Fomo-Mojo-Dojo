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
import { sha256Hex, contentIdentity } from "../_shared/contentIdentity.ts";
import {
  assembleOwnWords, assertPublicClientVoice,
  type Candidate, type JudgeVerdict, type SignalGate,
} from "../_shared/ownWordsExtract.ts";

const nowIso = () => new Date().toISOString();

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
  `ALSO reject: (i) PRODUCT/SKU descriptions — tasting notes, roast profiles, or format/price copy describing a SPECIFIC item ` +
  `(e.g. "This medium roast is fruity and full-bodied", "our Pour-Over packs let you…"); ` +
  `(ii) RECRUITING/JOB copy — hiring calls, benefits lists, role descriptions ("we're looking for…", "competitive compensation", "as a X you'll…"). ` +
  `But KEEP offering-model statements — what the company provides, to whom, and how (e.g. "we provide crisis stabilization to Bay Area youth", "all of our coffees are available in 12oz bags for wholesale partners"). ` +
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

// ── WRITE MODE (ruling B) — materialize own_words claims from the LATEST frozen plan run.
// Reads own_words_candidates + snapshots, re-applies the DETERMINISTIC rails (assembleOwnWords),
// and upserts claims by content identity (preserve-on-upsert: existing rows keep birth
// provenance; nothing is superseded by absence). NEVER calls the generator/judge. Refuses if the
// cache is empty (no silent regeneration).
// deno-lint-ignore no-explicit-any
async function writeFromFrozen(supabase: any, company_id: string, nowStr: string) {
  const { data: latest } = await supabase.from("own_words_candidates")
    .select("run_id, created_at").eq("company_id", company_id)
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  const runId = (latest as { run_id?: string } | null)?.run_id ?? null;
  if (!runId) return json({ ok: false, error: "own-words write refused: no frozen candidates — run a plan first (no silent regeneration)" }, 409);

  const { data: candRows } = await supabase.from("own_words_candidates")
    .select("source_url, signal_id, snapshot_text_sha256, quote, quote_offset, quote_length, judge_keep, judge_self_assertion, judge_fidelity, judge_reason, content_identity")
    .eq("company_id", company_id).eq("run_id", runId);
  const cands = (candRows ?? []) as Array<Record<string, unknown>>;
  if (cands.length === 0) return json({ ok: false, error: "own-words write refused: frozen run has no candidates" }, 409);

  const byUrl = new Map<string, Array<Record<string, unknown>>>();
  for (const c of cands) {
    const u = String(c.source_url);
    if (!byUrl.has(u)) byUrl.set(u, []);
    byUrl.get(u)!.push(c);
  }

  const survivorsAll: Array<{ quote: string; offset: number; length: number; fidelity: string; contentIdentity: string; url: string; signal_id: string | null }> = [];
  const perPage: Array<Record<string, unknown>> = [];
  for (const [url, list] of byUrl) {
    const sha = String(list[0].snapshot_text_sha256);
    const { data: snap } = await supabase.from("own_words_page_snapshots")
      .select("clean_text").eq("company_id", company_id).eq("source_url", url).eq("text_sha256", sha)
      .order("fetched_at", { ascending: false }).limit(1).maybeSingle();
    const cleanText = (snap as { clean_text?: string } | null)?.clean_text ?? "";
    const sigId = (list[0].signal_id as string | null) ?? null;
    let sourceTitle: string | null = null;
    if (sigId) {
      const { data: sig } = await supabase.from("signals").select("source_title").eq("id", sigId).maybeSingle();
      sourceTitle = (sig as { source_title?: string | null } | null)?.source_title ?? null;
    }
    const candidates: Candidate[] = list.map((c) => ({ quote: String(c.quote), offset: Number(c.quote_offset), length: Number(c.quote_length) }));
    const verdicts: JudgeVerdict[] = list.map((c) => ({
      keep: c.judge_keep === true, selfAssertion: c.judge_self_assertion === true,
      fidelity: c.judge_fidelity === "paraphrased" ? "paraphrased" : "verbatim",
      reason: c.judge_reason ? String(c.judge_reason) : undefined,
    }));
    const { survivors } = await assembleOwnWords(candidates, verdicts, cleanText, sourceTitle);
    for (const s of survivors) survivorsAll.push({ ...s, url, signal_id: sigId });
    perPage.push({ url, candidates: list.length, survivors: survivors.length });
  }

  // Cross-page dedup by content identity (write-time collapse of repeats).
  const seen = new Set<string>();
  const finalSurv = survivorsAll.filter((s) => (seen.has(s.contentIdentity) ? false : (seen.add(s.contentIdentity), true)));

  // Preserve-on-upsert: existing own_words claims keep birth provenance.
  const { data: existing } = await supabase.from("claims")
    .select("id, raw_payload").eq("company_id", company_id).eq("claim_type", "own_words");
  const existingByCI = new Map<string, string>();
  for (const e of (existing ?? []) as Array<{ id: string; raw_payload?: { content_identity?: string } }>) {
    const ci = e.raw_payload?.content_identity;
    if (ci) existingByCI.set(ci, e.id);
  }

  let inserted = 0, preserved = 0, refs = 0;
  for (const s of finalSurv) {
    if (existingByCI.has(s.contentIdentity)) { preserved++; continue; }
    const { data: ins, error: cErr } = await supabase.from("claims").insert({
      company_id, statement: s.quote, claim_type: "own_words", provenance: "public_observed",
      proof_category: "public_answerable", topic: "own_words", status: "active",
      raw_payload: { content_identity: s.contentIdentity, page_url: s.url, verbatim_span: { offset: s.offset, length: s.length }, fidelity: s.fidelity, source: "own_words_extractor", read_at: nowStr },
    }).select("id").single();
    if (cErr) throw new Error(`own_words claim insert failed: ${cErr.message}`);
    inserted++;
    if (s.signal_id) {
      const { error: rErr } = await supabase.from("claim_signal_refs")
        .insert({ company_id, claim_id: (ins as { id: string }).id, signal_id: s.signal_id, relationship: "supports" });
      if (rErr) throw new Error(`claim_signal_ref insert failed: ${rErr.message}`);
      refs++;
    }
  }

  const { error: intErr } = await supabase.from("integrity_runs").insert({
    company_id, component: "first_read_own_words", status: "completed",
    examined: cands.length, admitted: finalSurv.length,
    excluded_by_rule: { inserted, preserved, refs, run_id: runId, mode: "write" },
  });
  if (intErr) throw new Error(`integrity insert failed: ${intErr.message}`);

  return json({ ok: true, mode: "write", company_id, run_id: runId, frozen_candidates: cands.length, survivors_distinct: finalSurv.length, inserted, preserved, refs, pages: perPage });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const startedAt = Date.now();
  try {
    const body = await req.json().catch(() => ({}));
    const company_id = String(body.company_id ?? "");
    const mode = String(body.mode ?? "plan");
    const urlFilter: string[] | null = Array.isArray(body.urls) ? body.urls.map(String) : null;
    // R1 re-snapshot (2026-08-26): when true, plan mode does NOT reuse the existing immutable snapshot
    // — it re-fetches the (redesigned) page and, when the content identity differs, writes a NEW
    // moment-in-time snapshot row (drift; old rows are never touched or merged). An unchanged page
    // yields the same hash → no duplicate row. Absent/false = the default reuse-existing behaviour.
    const resnapshot = body.resnapshot === true;
    // Plan run_id groups a logical plan run across its batches (the caller passes one uuid for all
    // batches). Absent → one is minted per invocation. Write mode ignores it (reads the latest run).
    const planRunId: string | null = typeof body.run_id === "string" && body.run_id ? body.run_id : null;
    if (!company_id) return json({ error: "company_id is required" }, 400);
    if (mode !== "plan" && mode !== "write") return json({ error: `unknown mode '${mode}'` }, 422);

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // ── Frozen refusal — a frozen company is never fetched or written. ───────
    const { data: co } = await supabase.from("companies").select("id, frozen").eq("id", company_id).maybeSingle();
    if (!co) return json({ error: "company not found" }, 404);
    if ((co as { frozen?: boolean }).frozen) return json({ error: "own-words refused: company is frozen" }, 403);

    // ══ WRITE MODE (ruling B) ══ read the LATEST plan run's frozen candidates, apply the
    // DETERMINISTIC rails, and materialize own_words claims. NEVER calls the generator/judge.
    if (mode === "write") return await writeFromFrozen(supabase, company_id, nowIso());

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
    // One run_id groups this logical plan run across its batches (ruling B) — the write reads
    // the LATEST run. The caller passes a shared run_id for all batches; absent → mint one.
    const runId = planRunId ?? crypto.randomUUID();
    const WALL_MS = 150_000;
    const pages: Array<Record<string, unknown>> = [];
    let candidates_total = 0, kept_total = 0, paraphrased_total = 0, rejected_total = 0, guard_rejected_total = 0;
    const wouldBe: Array<{ quote: string; page: string; fidelity: string }> = [];
    let processed = 0, stoppedForTime = false;

    for (const url of urls) {
      if (Date.now() - startedAt > WALL_MS) { stoppedForTime = true; break; }
      const meta = byUrl.get(url)!;
      // Snapshot REUSE (R1/step-2): by default, if this URL already has an immutable snapshot, judge
      // against that exact stored text — do NOT re-fetch, do NOT write a new snapshot. Only fetch when
      // absent. R1 RE-SNAPSHOT (resnapshot=true): skip reuse, re-fetch the redesigned page, and write a
      // NEW moment-in-time row ONLY when the content identity is new (drift never merges; unchanged =
      // same hash = no duplicate row).
      let cleanText = "";
      let reused = false;
      if (!resnapshot) {
        const { data: existingSnap } = await supabase
          .from("own_words_page_snapshots")
          .select("clean_text")
          .eq("company_id", company_id).eq("source_url", url)
          .order("fetched_at", { ascending: false }).limit(1).maybeSingle();
        if (existingSnap && typeof (existingSnap as { clean_text?: string }).clean_text === "string") {
          cleanText = (existingSnap as { clean_text: string }).clean_text;
          reused = true;
        }
      }
      if (!reused) {
        const fetched = await fetchAndExtract(url);
        if (!fetched.ok || !fetched.text.trim()) {
          pages.push({ url, fetched: false, status: fetched.status, snapshot_chars: 0, candidates: 0 });
          continue;
        }
        cleanText = fetched.text;
        const text_sha256 = await sha256Hex(cleanText);
        // Content-identity idempotency: only insert when this hash is not already stored for the URL.
        const { data: dupSnap } = await supabase.from("own_words_page_snapshots")
          .select("id").eq("company_id", company_id).eq("source_url", url).eq("text_sha256", text_sha256)
          .limit(1).maybeSingle();
        if (!dupSnap) {
          const { error: snapErr } = await supabase.from("own_words_page_snapshots").insert({
            company_id, source_url: url, signal_id: meta.id, clean_text: cleanText, text_sha256, run_id: null,
          });
          if (snapErr) throw new Error(`snapshot insert failed for ${url}: ${snapErr.message}`);
        }
      }

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

      // FREEZE the generator's candidates + judge verdicts (ruling B) — the write reads these and
      // re-applies the deterministic rails, so it never calls the model. Keyed to the snapshot text.
      const snapSha = await sha256Hex(cleanText);
      const candRows = await Promise.all(candidates.map(async (c, i) => {
        const v = verdicts[i];
        return {
          company_id, source_url: url, signal_id: meta.id, snapshot_text_sha256: snapSha, run_id: runId,
          quote: c.quote, quote_offset: c.offset, quote_length: c.length,
          judge_keep: v?.keep ?? false, judge_self_assertion: v?.selfAssertion ?? false,
          judge_fidelity: v?.fidelity ?? "verbatim", judge_reason: v?.reason ?? null,
          content_identity: await contentIdentity(c.quote),
        };
      }));
      if (candRows.length > 0) {
        const { error: candErr } = await supabase.from("own_words_candidates").insert(candRows);
        if (candErr) throw new Error(`candidate freeze failed for ${url}: ${candErr.message}`);
      }

      // Honesty rails (shared, deterministic where possible).
      const { survivors, rejections } = await assembleOwnWords(candidates, verdicts, cleanText, meta.source_title);
      const guardRej = rejections.filter((r) => r.reason === "not_verbatim_provable").length;
      kept_total += survivors.filter((s) => s.fidelity === "verbatim").length;
      paraphrased_total += survivors.filter((s) => s.fidelity === "paraphrased").length;
      rejected_total += rejections.length;
      guard_rejected_total += guardRej;
      for (const s of survivors) wouldBe.push({ quote: s.quote, page: url, fidelity: s.fidelity });

      pages.push({
        url, fetched: true, reused, snapshot_chars: cleanText.length,
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
      excluded_by_rule: { rejected_total, guard_rejected_total, pages: processed, urls: urls.length, run_id: runId, mode },
    });
    if (intErr) throw new Error(`integrity insert failed: ${intErr.message}`);

    return json({
      ok: true, mode, company_id, run_id: runId,
      pages_total: urls.length, pages_processed: processed, stopped_for_time: stoppedForTime,
      totals: { candidates: candidates_total, verbatim: kept_total, paraphrased: paraphrased_total, rejected: rejected_total, guard_rejected: guard_rejected_total },
      would_be_own_words: wouldBe,
      pages,
    });
  } catch (e) {
    return json({ ok: false, error: (e as Error).message }, 500);
  }
});
