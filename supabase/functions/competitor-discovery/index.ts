// B2.1 — Dedicated competitor-discovery run (council 2026-06-11): clean class separation
// from the client baseline, independently retryable, ~$0.15–0.40/run accepted.
//
// BOUNDARY LAW (the highest-stakes constraint): the outbound prompt may contain
// PUBLIC-DERIVED content ONLY. buildAdmissibleQueryInputs below is allowlist-by-
// construction — it can only read: companies.name/website; the latest
// public_baseline_runs.result_json.category_archetype; and pinned job-step framing IFF
// every step's source_run_id resolves to a public_baseline_runs row. It never loads
// odi_market_definitions, input_files, odi_needs, or anything provenance_type='manual'.
//
// Class law: an item on a searched competitor's own domain ⇒ competitor_voice (its
// self-claims about itself); third-party items about a competitor or the category ⇒
// market_context. Neither class corroborates anything or fires tensions (enforced by
// B1's outside_voice_about_client-only filters — this run produces no
// outside_voice_about_client items by construction; client-related items are DROPPED
// and logged, they belong to client-baseline runs). Syndication stamping is skipped —
// these classes hold no corroboration rights to strip.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { persistSignalsAndRebuildClaims } from "../_shared/evidencePhase1.ts";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function urlHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

// ── Allowlist-by-construction query inputs ─────────────────────────────────────
// Every field this returns names its provenance. Nothing else is readable by the
// prompt builder — it receives ONLY this object.
type AdmissibleInputs = {
  companyName: string;        // companies.name (public identity)
  companyDomain: string;      // companies.website host (public identity)
  categoryArchetype: string | null; // public_baseline_runs.result_json.category_archetype (public-derived)
  jobFraming: { journeyTitle: string; stepLabels: string[] } | null; // job_steps, ONLY when public-derived (gate below)
  jobFramingGate: "public_derived" | "inadmissible_fell_back" | "no_pin";
  excludeDomains: string[];   // companies.public_source_filters_json.exclude_domains
};

async function buildAdmissibleQueryInputs(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  companyId: string,
): Promise<AdmissibleInputs | { error: string }> {
  const { data: company } = await supabase
    .from("companies")
    .select("name, website, public_source_filters_json")
    .eq("id", companyId)
    .maybeSingle();
  if (!company) return { error: "Company not found" };
  const companyName = String((company as any).name || "");
  const companyDomain = urlHost(String((company as any).website || ""));
  const excludeDomains = Array.isArray((company as any)?.public_source_filters_json?.exclude_domains)
    ? ((company as any).public_source_filters_json.exclude_domains as unknown[]).map(String).filter(Boolean)
    : [];

  // Category framing: latest prior public run's archetype — public-derived by origin.
  const { data: priorRun } = await supabase
    .from("public_baseline_runs")
    .select("id, result_json")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const categoryArchetype = String((priorRun as any)?.result_json?.category_archetype || "").trim() || null;

  // Job framing: admissible ONLY when the pinned set is public-derived end to end —
  // every step's source_run_id must resolve to a public_baseline_runs row. Manual/
  // Dify/null-provenance steps fail the gate and we fall back to category+locale.
  let jobFraming: AdmissibleInputs["jobFraming"] = null;
  let jobFramingGate: AdmissibleInputs["jobFramingGate"] = "no_pin";
  const { data: pin } = await supabase
    .from("operator_primary_selection")
    .select("item_key")
    .eq("company_id", companyId)
    .eq("domain", "job_step_set")
    .maybeSingle();
  const pinnedKey = String((pin as any)?.item_key || "").trim();
  if (pinnedKey) {
    const { data: steps } = await supabase
      .from("job_steps")
      .select("journey_title, step_label, source_run_id")
      .eq("company_id", companyId)
      .eq("journey_key", pinnedKey)
      .order("step_number", { ascending: true });
    const stepRows = Array.isArray(steps) ? steps : [];
    const runIds = Array.from(new Set(stepRows.map((s: any) => s?.source_run_id).filter((v: unknown) => v != null)));
    let allPublic = stepRows.length > 0 && runIds.length > 0 && stepRows.every((s: any) => s?.source_run_id != null);
    if (allPublic) {
      const { data: runRows } = await supabase
        .from("public_baseline_runs")
        .select("id")
        .in("id", runIds as never[]);
      const found = new Set((Array.isArray(runRows) ? runRows : []).map((r: any) => String(r.id)));
      allPublic = runIds.every((id) => found.has(String(id)));
    }
    if (allPublic) {
      jobFraming = {
        journeyTitle: String((stepRows[0] as any)?.journey_title || ""),
        stepLabels: stepRows.map((s: any) => String(s?.step_label || "")).filter(Boolean),
      };
      jobFramingGate = "public_derived";
    } else {
      jobFramingGate = "inadmissible_fell_back";
      console.log("[competitor-discovery] job framing INADMISSIBLE (non-public provenance) — falling back to category+locale framing", {
        pinned_key: pinnedKey,
        steps: stepRows.length,
      });
    }
  }

  return { companyName, companyDomain, categoryArchetype, jobFraming, jobFramingGate, excludeDomains };
}

// ── Prompt (two-phase in one call) ─────────────────────────────────────────────
export function buildCompetitorDiscoveryPrompt(inputs: AdmissibleInputs): string {
  const schemaHint =
    `{\n` +
    `  "competitors": [ { "name":"<string>","domain":"<anchored domain>","anchor_basis":"<how the domain was confirmed>",` +
    `"items":[ { "url":"<real url>","voice_class":"competitor_voice|market_context","source_type":"<type>","snippet":"<string>","confidence":<0-100 int> } ] } ],\n` +
    `  "market_context_items": [ { "url":"<real url>","source_type":"<type>","snippet":"<string>","confidence":<0-100 int> } ],\n` +
    `  "excluded_candidates": [ { "name":"<string>","reason":"<why entity could not be anchored>" } ]\n` +
    `}`;

  return (
    `You are mapping the competitive set around a specific job in a specific market, using web search.\n` +
    `The client company is "${inputs.companyName}" (domain: ${inputs.companyDomain}). You are NOT researching the client — ` +
    `you are researching WHO ELSE competes for the same job in its market.\n` +
    (inputs.categoryArchetype ? `Category frame (from the client's public baseline): ${inputs.categoryArchetype}.\n` : "") +
    (inputs.jobFraming
      ? `The job this market is organized around (public-derived job map): "${inputs.jobFraming.journeyTitle}" — steps: ${inputs.jobFraming.stepLabels.join("; ")}.\n`
      : `Establish the client's locale and service category from its own public site, then work from that.\n`) +
    `\nPHASE 1 — DISCOVER: search for the businesses that compete for this job in this market/locale ` +
    `(directories, "best of" lists, category searches, review platforms). Build a candidate set of 3-6 genuine competitors.\n` +
    `PHASE 2 — ANCHOR + COLLECT: for each candidate,\n` +
    `- ANCHOR it to its own domain first (its real website). If you cannot confidently anchor a candidate to a domain, ` +
    `EXCLUDE it and record it in excluded_candidates with the reason. Never guess. Same-named businesses elsewhere are contamination.\n` +
    `- Then collect: (a) its OWN claims from its OWN domain → voice_class "competitor_voice"; ` +
    `(b) third-party reads about it (reviews, press, directories) → voice_class "market_context".\n` +
    `Also collect category/market items not about any one company (market size, category norms, local market coverage) → market_context_items.\n` +
    `\nRules:\n` +
    `- Use ONLY facts found via your web searches. Do NOT fabricate competitors, quotes, ratings, or URLs.\n` +
    `- Every url MUST be a real URL returned by a search.\n` +
    `- Do NOT collect items about the client itself (${inputs.companyDomain}) — those belong to a different run and will be dropped.\n` +
    `- source_type ∈ {competitor_site, customer_review, third_party_profile, news_signal, directory, public_web}.\n` +
    `- confidence is 0-100. Output a SINGLE JSON object matching exactly this shape — no markdown fences, no prose:\n${schemaHint}`
  );
}

// ── Deterministic class guards (post-parse) ────────────────────────────────────
// The model labels; the guards CORRECT: competitor-domain ⇒ competitor_voice, client-
// domain or client-about ⇒ DROPPED (logged), anything else ⇒ market_context.
function applyClassGuards(parsed: any, clientDomain: string) {
  const competitors = Array.isArray(parsed?.competitors) ? parsed.competitors : [];
  const dropped: Array<{ url: string; reason: string }> = [];
  const competitorDomains = new Set<string>(
    competitors.map((c: any) => urlHost(`https://${String(c?.domain || "")}`) || String(c?.domain || "").toLowerCase()).filter(Boolean),
  );
  const isClient = (host: string) =>
    !!clientDomain && (host === clientDomain || host.endsWith(`.${clientDomain}`));
  const guardItem = (item: any, owningCompetitorDomain?: string) => {
    const host = urlHost(String(item?.url || ""));
    if (!host) return null;
    if (isClient(host)) {
      dropped.push({ url: String(item?.url || ""), reason: "client-domain item in competitor run" });
      return null;
    }
    const matchedCompetitor = owningCompetitorDomain && (host === owningCompetitorDomain || host.endsWith(`.${owningCompetitorDomain}`))
      ? owningCompetitorDomain
      : [...competitorDomains].find((d) => host === d || host.endsWith(`.${d}`));
    const voice_class = matchedCompetitor ? "competitor_voice" : "market_context";
    return { ...item, voice_class };
  };
  for (const competitor of competitors) {
    const cDomain = urlHost(`https://${String(competitor?.domain || "")}`) || String(competitor?.domain || "").toLowerCase();
    competitor.items = (Array.isArray(competitor?.items) ? competitor.items : [])
      .map((item: any) => guardItem(item, cDomain))
      .filter(Boolean);
  }
  parsed.market_context_items = (Array.isArray(parsed?.market_context_items) ? parsed.market_context_items : [])
    .map((item: any) => guardItem(item))
    .filter(Boolean);
  return { parsed, dropped };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
    const anthropicModel = Deno.env.get("ANTHROPIC_MODEL") || "claude-sonnet-4-6";
    if (!supabaseUrl || !serviceRoleKey || !anonKey) return json({ error: "Missing Supabase env vars" }, 500);
    if (!anthropicKey) return json({ error: "Missing ANTHROPIC_API_KEY" }, 500);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "No auth header" }, 401);
    const bearerToken = authHeader.replace(/^Bearer\s+/i, "").trim();
    // A55 service-role identity pattern (matches refresh-positioning/cascade).
    const SERVICE_ROLE_UUID = "1a27cf29-554a-46e9-bab8-0e238f9dc088";
    let _userId: string;
    if (bearerToken === serviceRoleKey) {
      _userId = SERVICE_ROLE_UUID;
    } else {
      const anonClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
      const { data: userRes, error: authError } = await anonClient.auth.getUser();
      if (authError || !userRes?.user) return json({ error: "Unauthorized" }, 401);
      _userId = userRes.user.id;
    }
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const body = await req.json().catch(() => ({}));
    const company_id = String((body as Record<string, unknown>)?.company_id || "").trim();
    const dry_run = !!(body as Record<string, unknown>)?.dry_run;
    if (!company_id) return json({ error: "company_id required" }, 400);

    const inputs = await buildAdmissibleQueryInputs(supabase, company_id);
    if ("error" in inputs) return json({ error: inputs.error }, 404);
    const prompt = buildCompetitorDiscoveryPrompt(inputs);
    console.log("[competitor-discovery] admissible inputs", {
      company: inputs.companyName,
      domain: inputs.companyDomain,
      category_from_prior_run: !!inputs.categoryArchetype,
      job_framing_gate: inputs.jobFramingGate,
      exclude_domains: inputs.excludeDomains.length,
    });

    // dry_run: return the LITERAL outbound payload without calling the external model.
    if (dry_run) {
      return json({ status: "dry_run", company_id, inputs, prompt_used: prompt });
    }

    // B2.1 budget: 16 searches ≈ $0.16 search billing + sonnet tokens — inside the
    // council-accepted $0.15–0.40 band (tokens may push the ceiling; per-run, operator-gated).
    const webSearchTool: Record<string, unknown> = { type: "web_search_20250305", name: "web_search", max_uses: 16 };
    if (inputs.excludeDomains.length > 0) webSearchTool.blocked_domains = inputs.excludeDomains;

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": anthropicKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: anthropicModel, max_tokens: 8000, tools: [webSearchTool], messages: [{ role: "user", content: prompt }] }),
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      return json({ error: `Anthropic call failed: HTTP ${res.status} ${errText.slice(0, 300)}` }, 502);
    }
    const data = await res.json();
    const blocks = Array.isArray((data as any)?.content) ? (data as any).content : [];
    const textBlocks = blocks.filter((b: any) => b?.type === "text" && typeof b?.text === "string");
    const finalText = textBlocks.length > 0 ? String(textBlocks[textBlocks.length - 1].text) : "";
    let parsed: any = null;
    try {
      const start = finalText.indexOf("{");
      const end = finalText.lastIndexOf("}");
      parsed = start >= 0 && end > start ? JSON.parse(finalText.slice(start, end + 1)) : null;
    } catch (_) { parsed = null; }
    if (!parsed) return json({ error: "Could not parse competitor-discovery JSON" }, 502);

    const { parsed: guarded, dropped } = applyClassGuards(parsed, inputs.companyDomain);
    const excluded = Array.isArray(guarded?.excluded_candidates) ? guarded.excluded_candidates : [];
    console.log("[competitor-discovery] anchoring", {
      competitors: (guarded?.competitors || []).map((c: any) => ({ name: c?.name, domain: c?.domain })),
      excluded_candidates: excluded,
      dropped_client_items: dropped,
    });

    const { data: runRow, error: runErr } = await supabase
      .from("competitor_discovery_runs")
      .insert({ company_id, result_json: guarded })
      .select("id")
      .single();
    if (runErr || !runRow?.id) return json({ error: `run insert failed: ${runErr?.message}` }, 500);

    // Signals: additive per-run; voice_class persisted; NO syndication stamping (these
    // classes hold no corroboration rights). signal_band 'outside' = run origin, semantics
    // untouched.
    const drafts: any[] = [];
    const pushDraft = (item: any, topic: string) => {
      const text = String(item?.snippet || "").trim();
      if (!text) return;
      drafts.push({
        company_id,
        source_id: String(runRow.id),
        source_type: "competitor_discovery_run",
        source_title: `${inputs.companyName} competitor discovery`,
        source_url: String(item?.url || "") || null,
        signal_band: "outside",
        voice_class: String(item?.voice_class || "market_context"),
        evidence_type: "market_signal",
        claim_text: text,
        evidence_excerpt: text,
        topic,
        framework: "competitor_discovery",
        directness: "direct",
        recency: "recent",
        framing_fit: "partial",
        structure_level: "extracted",
        validation_status: "directional",
        confidence_to_use: Number(item?.confidence ?? 0) >= 70 ? "high" : "medium",
        raw_payload: item,
      });
    };
    for (const competitor of (guarded?.competitors || [])) {
      for (const item of (competitor?.items || [])) pushDraft(item, `competitor:${competitor?.domain || competitor?.name || "unknown"}`);
    }
    for (const item of (guarded?.market_context_items || [])) pushDraft(item, "market");

    let signalStats: Record<string, unknown> = { signalCount: 0 };
    if (drafts.length > 0) {
      signalStats = await persistSignalsAndRebuildClaims({
        supabase: supabase as never,
        companyId: company_id,
        sourceId: runRow.id,
        sourceType: "competitor_discovery_run",
        signals: drafts as never[],
      });
    }
    const classTally: Record<string, number> = {};
    for (const d of drafts) classTally[d.voice_class] = (classTally[d.voice_class] || 0) + 1;
    console.log("[competitor-discovery] composition", {
      run_id: runRow.id,
      signals: drafts.length,
      by_class: classTally,
      excluded_candidates: excluded.length,
      dropped_client_items: dropped.length,
    });

    return json({ status: "ok", company_id, run_id: runRow.id, signals: drafts.length, by_class: classTally, excluded_candidates: excluded, dropped_client_items: dropped });
  } catch (err) {
    console.error("[competitor-discovery] unhandled error:", err);
    return json({ error: String(err instanceof Error ? err.message : err) }, 500);
  }
});
