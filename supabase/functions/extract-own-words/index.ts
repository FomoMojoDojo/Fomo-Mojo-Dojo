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
//
// C3b (ruling 2026-09-18): a registry PROFILE page whose C3a stamp carries byte-exact self_reported spans is
// minted SPAN BY SPAN from the stored registry page (outside_page_snapshots — never fetched, never copied into
// own_words_page_snapshots): the generator/judge see one span's text, provability is bounded to that span, the
// write re-verifies the quote against the stored span (span_mismatch ⇒ no claim), the claim carries
// registry_origin and supports the self_reported signals attributed to its span, and those signals'
// publicly_declared paraphrase twins retire (one statement, one row). See _shared/registryOwnWords.ts.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { recomputeValidationStateQuietly } from "../_shared/validationState.ts";
import { fetchAndExtract } from "../_shared/fetchAndExtract.ts";
import { sha256Hex, contentIdentity } from "../_shared/contentIdentity.ts";
import {
  assembleOwnWords, assertPublicClientVoice, pickPageSignals,
  type Candidate, type JudgeVerdict, type SignalGate,
} from "../_shared/ownWordsExtract.ts";
import { JUDGE_SYSTEM, callModel, parseJudgeVerdicts, takeLastJudgeUsage } from "../_shared/ownWordsJudge.ts";
import type { Survivor } from "../_shared/ownWordsExtract.ts";
import { parseOwnWordsKind } from "../_shared/ownWordsKinds.ts";
import { isRegistryUrl } from "../_shared/registryClassifier.ts";
import {
  attributeSignalsToSpans, hostOf, isQuestionnaireSpan, loadRegistryPageForOwnWords, partitionOwnWordsCorpus, registrySpanText, retireParaphraseTwins,
  spanQuoteVerified, type RegistryOrigin, type RetiredTwin,
} from "../_shared/registryOwnWords.ts";
import { openaiRecord, recordModelCall } from "../_shared/recordModelCall.ts";

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
// Local qwen is WIRED but off — flip OWN_WORDS_LOCAL=1 to route to a local ollama instead of
// OpenAI (only ever for non-public input, which this extractor structurally never has).

const GEN_SYSTEM =
  `Extract ONLY statements the company asserts ABOUT ITSELF — positioning, promise, who it serves, why it wins. ` +
  `Return each as an EXACT substring of the supplied page text, with its character offset and length. ` +
  `EXCLUDE navigation, menus, hours, prices, legal/policy, cookie/consent, and third-party embeds or quotes. ` +
  `Each quote must be at most ${QUOTE_MAX_WORDS} words. Invent nothing — every quote must be copy-paste from the text. ` +
  `Respond with ONLY JSON: {"statements":[{"quote":"...","offset":0,"length":0}]}. No other text.`;

// JUDGE_SYSTEM + callModel are shared with retype-own-words (ownWordsJudge.ts) so the typed kind question is asked ONE way.

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
    .select("id, source_url, signal_id, snapshot_text_sha256, quote, quote_offset, quote_length, judge_keep, judge_self_assertion, judge_fidelity, judge_reason, judge_kind, judge_kind_reason, content_identity, registry_origin")
    .eq("company_id", company_id).eq("run_id", runId);
  const cands = (candRows ?? []) as Array<Record<string, unknown>>;
  if (cands.length === 0) return json({ ok: false, error: "own-words write refused: frozen run has no candidates" }, 409);

  // Group by text unit: a site page (url) or ONE registry span (url#span) — a registry candidate is verified
  // against ITS span, never the page.
  const unitKey = (c: Record<string, unknown>) => {
    const ro = c.registry_origin as RegistryOrigin | null;
    return ro ? `${String(c.source_url)}#span${ro.span_index}` : String(c.source_url);
  };
  const byUnit = new Map<string, Array<Record<string, unknown>>>();
  for (const c of cands) {
    const k = unitKey(c);
    if (!byUnit.has(k)) byUnit.set(k, []);
    byUnit.get(k)!.push(c);
  }

  const survivorsAll: Array<Survivor & { url: string; signal_id: string | null; registry_origin: RegistryOrigin | null; read_at: string | null }> = [];
  const perPage: Array<Record<string, unknown>> = [];
  let span_mismatch = 0;
  for (const [unit, list] of byUnit) {
    const url = String(list[0].source_url);
    const sha = String(list[0].snapshot_text_sha256);
    const origin = (list[0].registry_origin as RegistryOrigin | null) ?? null;
    let cleanText = "";
    let readAt: string | null = null;
    if (origin) {
      // C3b: the registry store row the candidates name — by id, sha re-checked (drift ⇒ nothing mints).
      const { data: row } = await supabase.from("outside_page_snapshots")
        .select("id, text_sha256, clean_text, crawled_at").eq("company_id", company_id).eq("id", origin.snapshot_row_id).maybeSingle();
      const pg = row as { text_sha256?: string; clean_text?: string; crawled_at?: string | null } | null;
      if (!pg || pg.text_sha256 !== origin.snapshot_sha || !pg.clean_text) {
        perPage.push({ url: unit, candidates: list.length, survivors: 0, registry_skipped: !pg ? "snapshot_row_missing" : "snapshot_drift" });
        continue;
      }
      cleanText = registrySpanText(pg.clean_text, origin) ?? "";
      readAt = pg.crawled_at ?? null;
    } else {
      const { data: snap } = await supabase.from("own_words_page_snapshots")
        .select("clean_text").eq("company_id", company_id).eq("source_url", url).eq("text_sha256", sha)
        .order("fetched_at", { ascending: false }).limit(1).maybeSingle();
      cleanText = (snap as { clean_text?: string } | null)?.clean_text ?? "";
    }
    const sigId = (list[0].signal_id as string | null) ?? null;
    const titleSig = sigId ?? origin?.signal_ids?.[0] ?? null;
    let sourceTitle: string | null = null;
    if (titleSig) {
      const { data: sig } = await supabase.from("signals").select("source_title").eq("id", titleSig).maybeSingle();
      sourceTitle = (sig as { source_title?: string | null } | null)?.source_title ?? null;
    }
    const candidates: Candidate[] = list.map((c) => ({ quote: String(c.quote), offset: Number(c.quote_offset), length: Number(c.quote_length) }));
    const verdicts: JudgeVerdict[] = list.map((c) => ({
      keep: c.judge_keep === true, selfAssertion: c.judge_self_assertion === true,
      fidelity: c.judge_fidelity === "paraphrased" ? "paraphrased" : "verbatim",
      reason: c.judge_reason ? String(c.judge_reason) : undefined,
      kind: parseOwnWordsKind(c.judge_kind),
      kindReason: c.judge_kind_reason ? String(c.judge_kind_reason) : undefined,
    }));
    // rails over the unit text (the SPAN on a registry unit — provability bounded by construction)
    const { survivors } = await assembleOwnWords(candidates, verdicts, cleanText, sourceTitle);
    let admitted = 0;
    for (const s of survivors) {
      if (origin) {
        // WRITE-TIME VERIFICATION (C3b): the stored span contains the quote — else the frozen candidate is marked
        // span_mismatch and NO claim mints (the record says why, the surface stays silent).
        if (!spanQuoteVerified(s.quote, cleanText)) {
          span_mismatch++;
          const cid = list.find((c) => String(c.quote) === s.quote)?.id;
          if (cid) await supabase.from("own_words_candidates").update({ judge_keep: false, judge_reason: "span_mismatch" }).eq("id", cid).eq("company_id", company_id);
          continue;
        }
      }
      admitted++;
      survivorsAll.push({ ...s, url, signal_id: sigId, registry_origin: origin, read_at: readAt });
    }
    perPage.push({ url: unit, candidates: list.length, survivors: admitted, ...(origin ? { registry_span: { start: origin.start, end: origin.end, signal_ids: origin.signal_ids } } : {}) });
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

  let inserted = 0, preserved = 0, refs = 0, registry_inserted = 0;
  const retired: RetiredTwin[] = [];
  const mintedRegistry: Array<{ claim_id: string; quote: string; origin: RegistryOrigin }> = [];
  for (const s of finalSurv) {
    if (existingByCI.has(s.contentIdentity)) { preserved++; continue; }
    const ro = s.registry_origin;
    const { data: ins, error: cErr } = await supabase.from("claims").insert({
      company_id, statement: s.quote, claim_type: "own_words", provenance: "public_observed",
      proof_category: "public_answerable", topic: "own_words", status: "active",
      // ADMISSION CRITERION: the typed kind + eligibility from the frozen judge verdict (fail-toward-eligible).
      statement_kind: s.kind, declared_eligible: s.declaredEligible,
      raw_payload: {
        content_identity: s.contentIdentity, page_url: s.url,
        // a registry quote's offsets are relative to ITS span; the span itself is named by registry_origin
        verbatim_span: { offset: s.offset, length: s.length, ...(ro ? { relative_to: "registry_span" } : {}) },
        fidelity: s.fidelity, source: "own_words_extractor",
        // C3b: the read date of a registry quote is the registry snapshot's crawl date (the frame's "read {date}")
        read_at: ro ? (s.read_at ?? nowStr) : nowStr,
        ...(ro ? { registry_origin: { ...ro, verified_at: nowStr } } : {}),
      },
    }).select("id").single();
    if (cErr) throw new Error(`own_words claim insert failed: ${cErr.message}`);
    const claimId = (ins as { id: string }).id;
    inserted++;
    if (ro) registry_inserted++;
    // supports refs: the page's client_voice signal (site), or the self_reported signals attributed to the span (registry)
    const refSignals = ro ? ro.signal_ids : (s.signal_id ? [s.signal_id] : []);
    for (const sid of refSignals) {
      const { error: rErr } = await supabase.from("claim_signal_refs")
        .insert({ company_id, claim_id: claimId, signal_id: sid, relationship: "supports" });
      if (rErr) throw new Error(`claim_signal_ref insert failed: ${rErr.message}`);
      refs++;
    }
    if (ro) mintedRegistry.push({ claim_id: claimId, quote: s.quote, origin: ro });
  }

  // TWIN RETIREMENT (C3b, ruling 2026-09-18): a span-minted quote replaces the paraphrase twin — any LIVE
  // publicly_declared claim backed by a signal the quote now supports is struck (retireParaphraseTwins:
  // set_claim_status, audited in claim_events; reason names the replacing claim). By signal id only.
  const retiredIds = new Set<string>();
  for (const m of mintedRegistry) {
    retired.push(...await retireParaphraseTwins(supabase, { companyId: company_id, mintedClaimId: m.claim_id, signalIds: m.origin.signal_ids, already: retiredIds }));
  }

  // Own-words refs are 'supports' today; the recompute is the census-law terminal for any future
  // contradicting ref written on this path (validation_state writers, 2026-09-12).
  if (refs > 0) await recomputeValidationStateQuietly(supabase as never, company_id, "extract-own-words");

  const { error: intErr } = await supabase.from("integrity_runs").insert({
    company_id, component: "first_read_own_words", status: "completed",
    examined: cands.length, admitted: finalSurv.length,
    excluded_by_rule: {
      inserted, preserved, refs, run_id: runId, mode: "write",
      // C3b: registry quotes minted, span mismatches refused, paraphrase twins retired (reversal: set_claim_status(claim_id,'active'))
      registry_inserted, span_mismatch,
      registry_claims: mintedRegistry.map((m) => ({ claim_id: m.claim_id, snapshot_row_id: m.origin.snapshot_row_id, span: [m.origin.start, m.origin.end], signal_ids: m.origin.signal_ids })),
      twins_retired: retired,
    },
  });
  if (intErr) throw new Error(`integrity insert failed: ${intErr.message}`);

  return json({ ok: true, mode: "write", company_id, run_id: runId, frozen_candidates: cands.length, survivors_distinct: finalSurv.length, inserted, preserved, refs, registry_inserted, span_mismatch, twins_retired: retired, pages: perPage });
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
      .select("id, source_url, source_title, voice_class, source_type, claim_text, evidence_excerpt, raw_payload, superseded_at, created_at")
      .eq("company_id", company_id)
      .eq("voice_class", "client_voice");
    type CorpusSignal = { id: string; source_url: string | null; source_title: string | null; voice_class: string | null; source_type: string | null; claim_text: string | null; evidence_excerpt: string | null; raw_payload: unknown; superseded_at: string | null };
    const sigsAll = ((sigRows ?? []) as CorpusSignal[]).filter((s) => !!s.source_url);
    // C1 (2026-09-17): registry hosts are OUT of the own-words corpus regardless of voice_class — fail closed.
    // C3b (2026-09-18): EXCEPT a profile page whose C3a stamp carries byte-exact self_reported spans — the
    // organization's own words through the registry. Those URLs are minted SPAN BY SPAN below, from the stored
    // registry page (outside_page_snapshots), never from a fetch and never through own_words_page_snapshots.
    // (site pages: every client_voice signal exactly as before; registry entries: live rows only — a superseded
    // registry row neither names a snapshot nor receives a ref)
    const corpus = partitionOwnWordsCorpus(sigsAll.filter((s) => !isRegistryUrl(s.source_url) || !s.superseded_at), isRegistryUrl);
    const sigs = corpus.site;
    if (corpus.excluded.length) console.log(`[own-words] registry URLs excluded from corpus: ${corpus.excluded.map((e) => `${e.url} (${e.reason})`).join(", ")}`);
    if (corpus.registry.length) console.log(`[own-words] registry URLs admitted (self_reported spans): ${corpus.registry.map((e) => `${e.url} ×${e.spans.length}`).join(", ")}`);

    // Privacy gate (Option B) — refuse if ANY selected signal is not public client-voice.
    assertPublicClientVoice(sigs as SignalGate[]);
    assertPublicClientVoice(corpus.registry.flatMap((e) => e.signals as unknown as SignalGate[]));

    // S1 (2026-09-18): the page signal is never a synthesis row, whatever its stamp (pickPageSignals).
    const byUrl = pickPageSignals(sigs);
    let urls = [...byUrl.keys()];
    if (urlFilter) urls = urls.filter((u) => urlFilter.includes(u));
    let registryEntries = corpus.registry;
    if (urlFilter) registryEntries = registryEntries.filter((e) => urlFilter.includes(e.url));

    // ── Per-page pipeline (chunked by page; honor a 150s wall-clock). ────────
    // One run_id groups this logical plan run across its batches (ruling B) — the write reads
    // the LATEST run. The caller passes a shared run_id for all batches; absent → mint one.
    const runId = planRunId ?? crypto.randomUUID();
    const WALL_MS = 150_000;
    const pages: Array<Record<string, unknown>> = [];
    let candidates_total = 0, kept_total = 0, paraphrased_total = 0, rejected_total = 0, guard_rejected_total = 0;
    const wouldBe: Array<{ quote: string; page: string; fidelity: string }> = [];
    let processed = 0, stoppedForTime = false;

    // ONE generator → judge → freeze → rails pass over ONE text unit (a site page, or ONE registry span). The
    // registry unit's `text` is clean_text.slice(start, end) and nothing else — the page never enters a prompt.
    const runUnit = async (unit: {
      url: string; text: string; signal_id: string | null; source_title: string | null;
      snapshot_sha: string; registry_origin: RegistryOrigin | null; label: string; reused?: boolean;
    }): Promise<void> => {
      const { url, text, label } = unit;
      // Generate.
      let candidates: Candidate[] = [];
      try {
        const gen = await callModel(GEN_SYSTEM, `PAGE TEXT:\n${text}`);
        // GATE 3 — this transport used to drop data.usage entirely; drain and persist it.
        {
          const _u = takeLastJudgeUsage();
          if (_u) await recordModelCall(supabase, { companyId: company_id, runId: null, callSite: "own-words-judge", usage: openaiRecord(_u.model, _u) });
        }
        candidates = (Array.isArray(gen.statements) ? gen.statements : [])
          .map((s: unknown) => {
            const o = s as { quote?: unknown; offset?: unknown; length?: unknown };
            const quote = String(o.quote ?? "").trim();
            return { quote, offset: Number(o.offset ?? -1), length: Number(o.length ?? quote.length) };
          })
          .filter((c: Candidate) => c.quote && c.quote.split(/\s+/).length <= QUOTE_MAX_WORDS);
      } catch (e) {
        pages.push({ url: label, fetched: true, snapshot_chars: text.length, candidates: 0, error: `gen: ${(e as Error).message}` });
        return;
      }
      candidates_total += candidates.length;

      // Judge (one call for the unit's candidates).
      let verdictByQuote = new Map<string, JudgeVerdict>();
      if (candidates.length > 0) {
        try {
          const j = await callModel(JUDGE_SYSTEM, `PAGE TEXT:\n${text}\n\nCANDIDATES:\n${candidates.map((c) => `- ${c.quote}`).join("\n")}`);
          // GATE 3 — this transport used to drop data.usage entirely; drain and persist it.
          {
            const _u = takeLastJudgeUsage();
            if (_u) await recordModelCall(supabase, { companyId: company_id, runId: null, callSite: "own-words-judge", usage: openaiRecord(_u.model, _u) });
          }
          verdictByQuote = parseJudgeVerdicts(j); // keep / selfAssertion / fidelity / reason + the typed kind
        } catch (e) {
          pages.push({ url: label, fetched: true, snapshot_chars: text.length, candidates: candidates.length, error: `judge: ${(e as Error).message}` });
          return;
        }
      }
      const verdicts = candidates.map((c) => verdictByQuote.get(c.quote));

      // FREEZE the generator's candidates + judge verdicts (ruling B) — the write reads these and
      // re-applies the deterministic rails, so it never calls the model. Keyed to the snapshot text
      // (a registry unit is keyed to the registry store's sha + its span, via registry_origin).
      const candRows = await Promise.all(candidates.map(async (c, i) => {
        const v = verdicts[i];
        return {
          company_id, source_url: url, signal_id: unit.signal_id, snapshot_text_sha256: unit.snapshot_sha, run_id: runId,
          quote: c.quote, quote_offset: c.offset, quote_length: c.length,
          judge_keep: v?.keep ?? false, judge_self_assertion: v?.selfAssertion ?? false,
          judge_fidelity: v?.fidelity ?? "verbatim", judge_reason: v?.reason ?? null,
          judge_kind: v?.kind ?? null, judge_kind_reason: v?.kindReason ?? null,
          content_identity: await contentIdentity(c.quote),
          registry_origin: unit.registry_origin,
        };
      }));
      if (candRows.length > 0) {
        const { error: candErr } = await supabase.from("own_words_candidates").insert(candRows);
        if (candErr) throw new Error(`candidate freeze failed for ${label}: ${candErr.message}`);
      }

      // Honesty rails (shared, deterministic where possible) — provability is bounded to `text` (the span, on a
      // registry unit).
      const { survivors, rejections } = await assembleOwnWords(candidates, verdicts, text, unit.source_title);
      const guardRej = rejections.filter((r) => r.reason === "not_verbatim_provable").length;
      kept_total += survivors.filter((s) => s.fidelity === "verbatim").length;
      paraphrased_total += survivors.filter((s) => s.fidelity === "paraphrased").length;
      rejected_total += rejections.length;
      guard_rejected_total += guardRej;
      for (const s of survivors) wouldBe.push({ quote: s.quote, page: label, fidelity: s.fidelity });

      pages.push({
        url: label, fetched: true, reused: unit.registry_origin ? true : unit.reused, snapshot_chars: text.length,
        ...(unit.registry_origin ? { registry_span: { section: unit.registry_origin.section, start: unit.registry_origin.start, end: unit.registry_origin.end, signal_ids: unit.registry_origin.signal_ids } } : {}),
        candidates: candidates.length, kept: survivors.length, guard_rejected: guardRej,
        rejections: rejections.map((r) => ({ quote: r.quote.slice(0, 80), reason: r.reason })),
        survivors: survivors.map((s) => ({ quote: s.quote, fidelity: s.fidelity, kind: s.kind, declared_eligible: s.declaredEligible })),
      });
      processed++;
    };

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
      await runUnit({ url, text: cleanText, signal_id: meta.id, source_title: meta.source_title, snapshot_sha: await sha256Hex(cleanText), registry_origin: null, label: url, reused });
    }

    // ── Registry units (C3b): one generator/judge pass per self_reported SPAN of the stored page. ──
    for (const entry of registryEntries) {
      if (Date.now() - startedAt > WALL_MS) { stoppedForTime = true; break; }
      const page = await loadRegistryPageForOwnWords(supabase, company_id, entry.url);
      if (!page) { pages.push({ url: entry.url, fetched: false, registry_skipped: "no_stored_page", candidates: 0 }); continue; }
      // SNAPSHOT DRIFT — the stored page is not the one the spans were cut from: skip, never fetch, never guess.
      if (page.text_sha256 !== entry.snapshot_sha) { pages.push({ url: entry.url, fetched: false, registry_skipped: "snapshot_drift", stored_sha: page.text_sha256, basis_sha: entry.snapshot_sha, candidates: 0 }); continue; }
      const attributed = attributeSignalsToSpans(entry.signals, entry.spans, page.clean_text);
      const sourceTitle = entry.signals[0]?.source_title ?? null;
      for (let i = 0; i < entry.spans.length; i++) {
        if (Date.now() - startedAt > WALL_MS) { stoppedForTime = true; break; }
        const span = entry.spans[i];
        const text = registrySpanText(page.clean_text, span);
        if (!text) { pages.push({ url: `${entry.url}#span${i}`, fetched: false, registry_skipped: "span_unreadable", candidates: 0 }); continue; }
        // Candid's questionnaire blocks (How we listen / SDGs) are the registry's words, not the organization's prose.
        if (isQuestionnaireSpan(text)) { pages.push({ url: `${entry.url}#span${i}`, fetched: true, registry_skipped: "questionnaire_section", heading: text.split("\n")[0], snapshot_chars: text.length, candidates: 0 }); continue; }
        const origin: RegistryOrigin = {
          host: hostOf(entry.url), page_url: entry.url, snapshot_row_id: page.id, snapshot_sha: page.text_sha256,
          section: "self_reported", start: span.start, end: span.end, span_index: i, signal_ids: attributed.get(i) ?? [],
        };
        await runUnit({ url: entry.url, text, signal_id: null, source_title: sourceTitle, snapshot_sha: page.text_sha256, registry_origin: origin, label: `${entry.url}#span${i}` });
      }
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
