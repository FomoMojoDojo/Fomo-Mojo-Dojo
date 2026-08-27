// GATE R3 — outside-evidence REGENERATION (the restore gate's generator).
//
// The outside analog of extract-own-words. For each regen URL it reads the STORED
// outside_page_snapshots basis (NO fetch — R2 already captured the page), asks
// gpt-4.1-mini to lift statements a third-party source makes ABOUT the client as
// EXACT substrings, then admits each through the deterministic gate-2 birth guard
// (admitOutsideEvidence = E4 verbatim-substring + E2 specificity, default-deny).
// Admitted excerpts are minted as NEW outside_voice_about_client signals with
// held_at/superseded_at NULL — the RESTORE law: old held/superseded rows stay as
// audit, restoration mints NEW rows. Nothing is fetched; no flag is ever cleared.
//
// Router: the input is PUBLIC snapshot corpus → external gpt-4.1-mini (matching
// extract-own-words: "corpus not substance → external"; the router law all-public →
// gpt-4.1-mini). No non-public text ever reaches the model.
//
// Provenance is stamped at the CLAIM layer by rebuild-claims (deriveClaimProvenance:
// outside band + outside_voice → public_observed); we record the intent + run_id +
// content_identity + snapshot hash in raw_payload for audit. Frozen company → 403.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sha256Hex, contentIdentity, normalizeForHash } from "../_shared/contentIdentity.ts";
import { admitOutsideEvidence, snapshotReadDate } from "../_shared/outsideEvidenceRegen.ts";

const nowIso = () => new Date().toISOString();
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
};
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

const EMPTY_SHA = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
const GEN_MODEL = Deno.env.get("OUTSIDE_REGEN_MODEL") ?? "gpt-4.1-mini";
const GEN_FALLBACK = Deno.env.get("OUTSIDE_REGEN_FALLBACK_MODEL") ?? "gpt-4.1-nano";
const PER_URL_CAP = Number(Deno.env.get("OUTSIDE_REGEN_PER_URL_CAP") ?? "12");
const QUOTE_MAX_WORDS = 60;
const WALL_MS = 140_000;

function genSystem(anchors: string[]): string {
  const names = anchors.length ? anchors.join(", ") : "the client";
  return (
    `You are reading a THIRD-PARTY web page (a review site, directory, marketplace, or partner). ` +
    `Extract ONLY statements this outside source makes ABOUT the client — the business known as: ${names}. ` +
    `Return each as an EXACT substring of the supplied page text (copy-paste, invent nothing), at most ${QUOTE_MAX_WORDS} words. ` +
    `KEEP: what the source says about the client's food/coffee/service/quality/reputation, ratings phrased in prose, ` +
    `what the client sells or offers, partner/wholesale relationships the source states. ` +
    `EXCLUDE: navigation, menus with prices, hours, cookie/consent, ads, other businesses, and anything not about the client. ` +
    `Respond with ONLY JSON: {"statements":["...","..."]}. No other text.`
  );
}
const JUDGE_SYSTEM =
  `You judge candidate quotes lifted from a THIRD-PARTY page about a client business. For each candidate decide keep=true ONLY if ` +
  `it is the outside source speaking ABOUT the client (its quality, offering, reputation, or a stated relationship) — NOT navigation, ` +
  `a menu/price line, hours, boilerplate, or a statement about a different business. ` +
  `Respond with ONLY JSON: {"verdicts":[{"quote":"...","keep":true,"reason":"..."}]}. No other text.`;

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
    const runId: string = typeof body.run_id === "string" && body.run_id ? body.run_id : crypto.randomUUID();
    if (!company_id) return json({ error: "company_id is required" }, 400);

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Frozen refusal — a frozen company is never regenerated or written.
    const { data: co } = await supabase.from("companies").select("id, frozen, entity_anchors_json").eq("id", company_id).maybeSingle();
    if (!co) return json({ error: "company not found" }, 404);
    if ((co as { frozen?: boolean }).frozen) return json({ error: "outside-regen refused: company is frozen" }, 403);
    const anchorsRaw = (co as { entity_anchors_json?: unknown }).entity_anchors_json;
    const anchors = Array.isArray(anchorsRaw) ? anchorsRaw.map((a) => String(a || "").trim()).filter(Boolean) : [];

    // Basis: newest ok (real-body) snapshot per URL. NO fetch.
    const { data: snapRows } = await supabase
      .from("outside_page_snapshots")
      .select("source_url, signal_id, clean_text, text_sha256, crawled_at, fetch_status")
      .eq("company_id", company_id).eq("fetch_status", "ok")
      .order("crawled_at", { ascending: false });
    const newestByUrl = new Map<string, { clean_text: string; sha: string; signal_id: string | null; readDate: string | null }>();
    for (const r of (snapRows ?? []) as Array<{ source_url: string; signal_id: string | null; clean_text: string | null; text_sha256: string; crawled_at?: string | null }>) {
      if (newestByUrl.has(r.source_url)) continue;
      if (!r.clean_text || r.text_sha256 === EMPTY_SHA) continue;
      // READ-DATE (task_13983caf, 2026-08-27): the page's true read date = when it was crawled. Carry
      // the snapshot's crawled_at so the minted signal stamps event_date and its source tag renders
      // "· read <date>" (deriveSourceTag uses runDate ?? eventDate). Null if the basis carries no date
      // — dates are real or hidden, never a convenience value.
      newestByUrl.set(r.source_url, { clean_text: r.clean_text, sha: r.text_sha256, signal_id: r.signal_id, readDate: snapshotReadDate(r.crawled_at) });
    }
    let urls = [...newestByUrl.keys()];
    if (urlFilter) urls = urls.filter((u) => urlFilter.includes(u));

    // Existing outside content identities (dedup — never mint a duplicate of an existing signal's excerpt).
    const { data: existSig } = await supabase
      .from("signals").select("evidence_excerpt, raw_payload")
      .eq("company_id", company_id).eq("voice_class", "outside_voice_about_client");
    const existingCI = new Set<string>();
    for (const s of (existSig ?? []) as Array<{ evidence_excerpt: string | null; raw_payload?: { content_identity?: string } }>) {
      if (s.raw_payload?.content_identity) existingCI.add(s.raw_payload.content_identity);
      if (s.evidence_excerpt) existingCI.add(await contentIdentity(s.evidence_excerpt));
    }

    // Source title per URL (reuse the held signal's title where present).
    const titleByUrl = new Map<string, string | null>();
    for (const [u, meta] of newestByUrl) {
      if (meta.signal_id) {
        const { data: sig } = await supabase.from("signals").select("source_title").eq("id", meta.signal_id).maybeSingle();
        titleByUrl.set(u, (sig as { source_title?: string | null } | null)?.source_title ?? null);
      } else titleByUrl.set(u, null);
    }

    const pages: Array<Record<string, unknown>> = [];
    const seenThisRun = new Set<string>();
    let candidates_total = 0, admitted_total = 0, guard_rejected_total = 0;
    const rejectReasons: Record<string, number> = {};
    let processed = 0, stoppedForTime = false;

    for (const url of urls) {
      if (Date.now() - startedAt > WALL_MS) { stoppedForTime = true; break; }
      const { clean_text, sha, readDate } = newestByUrl.get(url)!;

      // Generate.
      let cands: string[] = [];
      try {
        const gen = await callModel(genSystem(anchors), `PAGE TEXT:\n${clean_text}`);
        cands = (Array.isArray(gen.statements) ? gen.statements : []).map((s: unknown) => String(s ?? "").trim())
          .filter((s) => s && s.split(/\s+/).length <= QUOTE_MAX_WORDS);
      } catch (e) {
        pages.push({ url, error: `gen: ${(e as Error).message}`, candidates: 0, admitted: 0 });
        continue;
      }
      candidates_total += cands.length;

      // Judge (one call for the page).
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

      // Admit through the deterministic birth guard (E4+E2), judge-kept only, dedup, per-URL cap.
      const admittedRows: Array<Record<string, unknown>> = [];
      const rejected: Array<{ quote: string; reason: string }> = [];
      for (const c of cands) {
        if (admittedRows.length >= PER_URL_CAP) break;
        if (keepByQuote.size && keepByQuote.get(c) === false) { rejected.push({ quote: c.slice(0, 80), reason: "judge_reject" }); continue; }
        const verdict = admitOutsideEvidence(c, clean_text);
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
          company_id, source_id: null, source_type: "outside_recrawl_regen", source_title: titleByUrl.get(url) ?? null,
          source_url: url, signal_band: "outside", evidence_type: "market_signal",
          claim_text: verdict.excerpt, evidence_excerpt: verdict.excerpt,
          topic: "outside_voice_signal", directness: "direct", recency: "recent", framing_fit: "partial",
          structure_level: "extracted", validation_status: "directional", confidence_to_use: "medium",
          voice_class: "outside_voice_about_client",
          event_date: readDate, // READ-DATE stamped at mint from the snapshot's crawled_at (null if none)
          raw_payload: {
            source: "outside_recrawl_regen", content_identity: ci, page_url: url, snapshot_text_sha256: sha,
            run_id: runId, provenance: "public_observed", read_at: nowIso(),
            verbatim: normalizeForHash(verdict.excerpt).length,
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
        url, candidates: cands.length, admitted: admittedRows.length,
        admitted_excerpts: admittedRows.map((r) => r.evidence_excerpt),
        rejected: rejected.slice(0, 20),
      });
    }

    const { error: intErr } = await supabase.from("integrity_runs").insert({
      company_id, component: "r3_outside_regen", status: stoppedForTime ? "failed" : "completed",
      examined: candidates_total, admitted: admitted_total,
      excluded_by_rule: { guard_rejected_total, reject_reasons: rejectReasons, urls: urls.length, pages: processed, run_id: runId, stopped_for_time: stoppedForTime },
      run_ref: `r3_outside_regen_${runId}`,
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
