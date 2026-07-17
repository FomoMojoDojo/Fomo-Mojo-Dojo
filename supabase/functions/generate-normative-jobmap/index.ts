// ACT-C-1 — generate-normative-jobmap. Discovers broad INDUSTRY sources for the
// anchor market's executor, synthesizes an ODI-skeleton-seeded normative job-step
// sequence, and stores both. This is NOT the client's internal job_steps and it
// NEVER reads client uploads — it is the public, industry-normative "how this job
// is typically done in your world," Outside-lane material.
//
// BOUNDARY LAW (Outside-safe): the outbound web-search prompt embeds ONLY the
// executor/jtbd + refined industry category + ODI anchor labels — no client
// document content. Discovery is a re-keyed sibling of competitor-discovery
// (`claude_web_search`), keyed on the INDUSTRY/EXECUTOR, never the company. This
// function deliberately does NOT import loadContributingDocs and never reads
// input_files / .extracted.txt sidecars — the exact contrast with
// local-jobmap-synthesis (which reads sidecars → internal_derived steps).
//
// Two-model discipline for GENERATION: qwen2.5:14b-instruct generates, llama3:70b
// judges (ODI-shape + solution-agnostic) — no 70b generation. Discovery is web
// search (external Anthropic) because nothing internal crosses the boundary.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { normalizeForHash, sha256Hex } from "../_shared/contentIdentity.ts";
import { registrableDomain } from "../_shared/signalRecurrence.ts";
import {
  anchorsToPromptBlock,
  getIndustryStepAnchors,
  type IndustryStepAnchor,
  inferStandardMarketCategory,
} from "../_shared/industryStepAnchors.ts";
import { type NormStep, validateSubsetOfEight } from "./logic.ts";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

function urlHost(url: string): string {
  try {
    return new URL(url.includes("://") ? url : `https://${url}`).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

const DEFAULT_GEN_MODEL = "qwen2.5:14b-instruct";
const DEFAULT_JUDGE_MODEL = "llama3:70b";
const GEN_TIMEOUT_MS = 180_000;
const JUDGE_TIMEOUT_MS = 180_000;
const LOCAL_HOST_ALLOWLIST = new Set(["localhost", "127.0.0.1", "::1", "host.docker.internal"]);

function isLocalOllamaUrl(rawUrl: string): boolean {
  try {
    return LOCAL_HOST_ALLOWLIST.has(String(new URL(rawUrl).hostname || "").trim().toLowerCase());
  } catch {
    return false;
  }
}

async function callOllamaJson(ollamaUrl: string, model: string, system: string, user: string, timeoutMs: number): Promise<string> {
  const nativeBase = ollamaUrl.replace(/\/v1\/?$/, "");
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const resp = await fetch(`${nativeBase}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer ollama" },
      body: JSON.stringify({
        model,
        format: "json",
        stream: false,
        options: { num_ctx: 8192, temperature: 0.2 },
        messages: [{ role: "system", content: system }, { role: "user", content: user }],
      }),
      signal: ctrl.signal,
    });
    if (!resp.ok) throw new Error(`ollama call failed: HTTP ${resp.status} (${model})`);
    const data = await resp.json().catch(() => ({}));
    const content = String((data as { message?: { content?: unknown } })?.message?.content ?? "");
    if (!content) throw new Error(`ollama call returned empty content (${model})`);
    return content;
  } finally {
    clearTimeout(t);
  }
}

// ── Allowlist-by-construction query inputs (public-derived ONLY) ────────────────
type NormInputs = {
  companyName: string;
  companyDomain: string;
  executor: string;
  jtbd: string;
  journeyKey: string;
  titleSource: "pmk" | "anchor";
  categoryArchetype: string | null;
  coarseCategory: string;
  anchors: IndustryStepAnchor | null;
  excludeDomains: string[];
};

// deno-lint-ignore no-explicit-any
async function buildNormInputs(supabase: any, companyId: string, journeyKeyOverride: string): Promise<NormInputs | { error: string }> {
  const { data: company } = await supabase.from("companies").select("name, website, public_source_filters_json").eq("id", companyId).maybeSingle();
  if (!company) return { error: "Company not found" };
  const companyName = String((company as any).name || "");
  const companyDomain = urlHost(String((company as any).website || ""));
  const excludeDomains = Array.isArray((company as any)?.public_source_filters_json?.exclude_domains)
    ? ((company as any).public_source_filters_json.exclude_domains as unknown[]).map(String).filter(Boolean)
    : [];

  // Category framing: latest public run's archetype — public-derived by origin.
  const { data: priorRun } = await supabase
    .from("public_baseline_runs").select("result_json").eq("company_id", companyId)
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  const categoryArchetype = String((priorRun as any)?.result_json?.category_archetype || "").trim() || null;

  // Titling market: prefer a PUBLIC pmk-* market (title_source='pmk'); fall to the
  // anchor spine ('customer') ONLY if none exists (title_source='anchor'). An
  // explicit journey_key override is honored. NOTE: only the executor/jtbd
  // descriptor of the market is read — never input_files/uploads.
  let journeyKey = "";
  let titleSource: "pmk" | "anchor" = "anchor";
  let executor = "";
  let jtbd = "";
  const pickMarket = async (jk: string) => {
    const { data } = await supabase.from("odi_market_definitions").select("journey_key, job_executor, jtbd").eq("company_id", companyId).eq("journey_key", jk).maybeSingle();
    return data as { journey_key: string; job_executor: string; jtbd: string } | null;
  };
  if (journeyKeyOverride) {
    const m = await pickMarket(journeyKeyOverride);
    if (!m) return { error: `No market definition for journey_key '${journeyKeyOverride}'` };
    journeyKey = m.journey_key;
    titleSource = journeyKey.startsWith("pmk-") ? "pmk" : "anchor";
    executor = String(m.job_executor || "");
    jtbd = String(m.jtbd || "");
  } else {
    const { data: pmks } = await supabase.from("odi_market_definitions").select("journey_key, job_executor, jtbd")
      .eq("company_id", companyId).like("journey_key", "pmk-%").order("journey_key", { ascending: true }).limit(1);
    const pmk = Array.isArray(pmks) && pmks.length > 0 ? pmks[0] as { journey_key: string; job_executor: string; jtbd: string } : null;
    if (pmk) {
      journeyKey = pmk.journey_key;
      titleSource = "pmk";
      executor = String(pmk.job_executor || "");
      jtbd = String(pmk.jtbd || "");
    } else {
      const anchor = await pickMarket("customer");
      if (!anchor) return { error: "No pmk-* market and no anchor 'customer' market definition — cannot title the norm map." };
      journeyKey = anchor.journey_key;
      titleSource = "anchor";
      executor = String(anchor.job_executor || "");
      jtbd = String(anchor.jtbd || "");
    }
  }
  if (!executor.trim()) return { error: "Titling market has no executor — cannot key the industry discovery." };

  const coarseCategory = inferStandardMarketCategory(categoryArchetype || "", executor, jtbd);
  const anchors = coarseCategory ? getIndustryStepAnchors(coarseCategory) : null;

  return { companyName, companyDomain, executor, jtbd, journeyKey, titleSource, categoryArchetype, coarseCategory, anchors, excludeDomains };
}

// ── Discovery prompt (WIDE-FIRST, EXPAND-NOT-NARROW) ────────────────────────────
export function buildIndustryDiscoveryPrompt(inputs: NormInputs): string {
  const schemaHint =
    `{\n` +
    `  "refined_industry": "<the generally-accepted industry for this executor, sharpened from the corpus>",\n` +
    `  "expand_used": "none|adjacent_category|skeleton_backstop",\n` +
    `  "sources": [ { "url":"<real url returned by a search>","title":"<string>","snippet":"<how this source describes a step of how the job is typically done>" } ]\n` +
    `}`;
  return (
    `You are discovering how a job is TYPICALLY done in an INDUSTRY, using web search. ` +
    `You are NOT researching any one company — you are researching the generally-accepted, standard way this job is performed across the industry.\n\n` +
    `The job performer (executor): "${inputs.executor}".\n` +
    `The job they are getting done: "${inputs.jtbd}".\n` +
    (inputs.categoryArchetype ? `Industry category frame (public-derived): ${inputs.categoryArchetype}.\n` : "") +
    (inputs.coarseCategory ? `Standard category bucket: ${inputs.coarseCategory}.\n` : "") +
    (inputs.anchors ? `\nODI universal job-step scaffold (define→conclude) — the shape the standard follows:\n${anchorsToPromptBlock(inputs.anchors)}\n` : "") +
    `\nWIDE-FIRST: default to the GENERALLY-ACCEPTED industry and its STANDARD steps — a broad baseline of how this job is usually done. ` +
    `Search process guides, industry standards, professional-body descriptions, "how X works" explainers, directories, review/how-to platforms.\n` +
    `EXPAND-NOT-NARROW: if the wide pool is thin, EXPAND — first to ADJACENT industry categories, then fall back to describing the ODI universal scaffold above. NEVER narrow to a niche, region, or a single company to fill a thin pool. Report which expansion you used in "expand_used".\n\n` +
    `Rules:\n` +
    `- Use ONLY facts found via your web searches. Do NOT fabricate URLs, sources, or steps.\n` +
    `- Every url MUST be a real URL returned by a search.\n` +
    `- Each source's snippet should describe a STEP of how this job is typically done (a stage in the standard process), in the industry's own words.\n` +
    `- Collect industry/standard sources — NOT this company's own pages, and NOT a single vendor's marketing.\n` +
    `- Output a SINGLE JSON object matching exactly this shape — no markdown fences, no prose:\n${schemaHint}`
  );
}

// ── Generation prompt (14b): skeleton-seeded, discovered-length ─────────────────
function buildGenSystem(): string {
  return (
    "You synthesize an INDUSTRY-NORMATIVE job map — the standard, solution-agnostic sequence of job STEPS for how this job is typically done in the industry. " +
    "The ODI universal scaffold has 8 canonical checkpoints in a FIXED order: define, locate, prepare, confirm, execute, monitor, modify, conclude. " +
    "You MUST use a SUBSET of these keys IN THIS ORDER — you may OMIT a checkpoint the industry genuinely doesn't exhibit, but you may NEVER reorder them and NEVER invent a step outside these 8. " +
    "Each step is solution-agnostic (no product, tool, brand, or prescribed method) and describes job PROGRESS, not a company's offering. " +
    'JSON only: {"steps":[{"step_key":"define|locate|prepare|confirm|execute|monitor|modify|conclude","step_label":"2-8 words","description":"one sentence, industry-typical"}]}'
  );
}

function buildGenUser(inputs: NormInputs, sources: Array<{ snippet: string }>): string {
  const corpus = sources.slice(0, 40).map((s, i) => `${i + 1}. ${s.snippet}`).join("\n");
  return (
    `Executor: ${inputs.executor}\nJob to be done: ${inputs.jtbd}\n` +
    (inputs.coarseCategory ? `Industry: ${inputs.coarseCategory}\n` : "") +
    (inputs.anchors ? `\nODI scaffold (labels are hypotheses to sharpen, not to copy verbatim):\n${anchorsToPromptBlock(inputs.anchors)}\n` : "") +
    `\nDiscovered industry sources (how this job is typically done):\n${corpus || "(thin — lean on the ODI scaffold as the backstop)"}\n\n` +
    `Produce the industry-normative job step sequence for THIS executor. Use only the canonical keys, in canonical order, omitting any the industry doesn't exhibit.`
  );
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
    const anthropicModel = Deno.env.get("ANTHROPIC_MODEL") || "claude-sonnet-4-6";
    const ollamaUrl = Deno.env.get("OLLAMA_BASE_URL") ?? "http://host.docker.internal:11434/v1";
    const genModel = Deno.env.get("OLLAMA_MODEL") || DEFAULT_GEN_MODEL;
    const judgeModel = Deno.env.get("OLLAMA_JUDGE_MODEL") || DEFAULT_JUDGE_MODEL;
    if (!supabaseUrl || !serviceRoleKey || !anonKey) return json({ error: "Missing Supabase env vars" }, 500);
    if (!isLocalOllamaUrl(ollamaUrl)) return json({ error: "Local-only policy violation: OLLAMA_BASE_URL must resolve to localhost/host.docker.internal." }, 500);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "No auth header" }, 401);
    const bearerToken = authHeader.replace(/^Bearer\s+/i, "").trim();
    const SERVICE_ROLE_UUID = "1a27cf29-554a-46e9-bab8-0e238f9dc088";
    if (bearerToken !== serviceRoleKey) {
      const anonClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
      const { data: userRes, error: authError } = await anonClient.auth.getUser();
      if (authError || !userRes?.user) return json({ error: "Unauthorized" }, 401);
    }
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const body = await req.json().catch(() => ({}));
    const company_id = String((body as Record<string, unknown>)?.company_id || "").trim();
    const journey_key_override = String((body as Record<string, unknown>)?.journey_key || "").trim();
    const dry_run = !!(body as Record<string, unknown>)?.dry_run;
    if (!company_id) return json({ error: "company_id required" }, 400);

    const inputs = await buildNormInputs(supabase, company_id, journey_key_override);
    if ("error" in inputs) return json({ error: inputs.error }, 404);
    const discoveryPrompt = buildIndustryDiscoveryPrompt(inputs);

    if (dry_run) {
      // Return the LITERAL outbound payload without any external/model call — proves
      // the query embeds only executor/jtbd + category (Outside-safe).
      return json({ status: "dry_run", company_id, inputs, discovery_prompt: discoveryPrompt });
    }

    if (!anthropicKey) return json({ error: "Missing ANTHROPIC_API_KEY (discovery engine)" }, 500);
    const sourceRunId = crypto.randomUUID();

    // ── Discovery (claude_web_search) ───────────────────────────────────────────
    const webSearchTool: Record<string, unknown> = { type: "web_search_20250305", name: "web_search", max_uses: 16 };
    if (inputs.excludeDomains.length > 0) webSearchTool.blocked_domains = inputs.excludeDomains;
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": anthropicKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: anthropicModel, max_tokens: 8000, tools: [webSearchTool], messages: [{ role: "user", content: discoveryPrompt }] }),
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      return json({ error: `Anthropic discovery failed: HTTP ${res.status} ${errText.slice(0, 300)}` }, 502);
    }
    const disc = await res.json();
    const blocks = Array.isArray((disc as any)?.content) ? (disc as any).content : [];
    const textBlocks = blocks.filter((b: any) => b?.type === "text" && typeof b?.text === "string");
    const finalText = textBlocks.length > 0 ? String(textBlocks[textBlocks.length - 1].text) : "";
    let parsed: any = null;
    try {
      const start = finalText.indexOf("{");
      const end = finalText.lastIndexOf("}");
      parsed = start >= 0 && end > start ? JSON.parse(finalText.slice(start, end + 1)) : null;
    } catch { parsed = null; }
    if (!parsed) return json({ error: "Could not parse industry-discovery JSON" }, 502);

    const rawSources = Array.isArray(parsed?.sources) ? parsed.sources : [];
    const expandUsed = String(parsed?.expand_used || "none");
    const refinedIndustry = String(parsed?.refined_industry || inputs.coarseCategory || "");

    // Store discovered sources — pre-computed independence fields (registrable_domain,
    // host, content_sha) in the shape signalRecurrence consumes. Own-domain exclusion
    // is a C-2 SCORE-TIME concern (the recurrence law); C-1 stores the pool.
    const seenSha = new Set<string>();
    const sourceRows: any[] = [];
    for (const s of rawSources) {
      const text = String(s?.snippet || "").trim();
      if (!text) continue;
      const sha = await sha256Hex(normalizeForHash(text));
      if (seenSha.has(sha)) continue;
      seenSha.add(sha);
      const url = String(s?.url || "").trim() || null;
      sourceRows.push({
        company_id,
        source_run_id: sourceRunId,
        source_url: url,
        host: url ? urlHost(url) : null,
        registrable_domain: registrableDomain(url),
        source_text: text,
        content_sha: sha,
        syndicated: false,
      });
    }
    if (sourceRows.length > 0) {
      const { error: srcErr } = await supabase.from("normative_industry_sources").insert(sourceRows);
      if (srcErr && !String(srcErr.message ?? "").toLowerCase().includes("duplicate")) {
        return json({ error: `industry sources insert failed: ${srcErr.message}` }, 500);
      }
    }

    // ── Generation (14b) + shape judge (70b) ────────────────────────────────────
    const genRaw = await callOllamaJson(ollamaUrl, genModel, buildGenSystem(), buildGenUser(inputs, sourceRows.map((r) => ({ snippet: r.source_text }))), GEN_TIMEOUT_MS);
    let genSteps: NormStep[] = [];
    try {
      const p = JSON.parse(genRaw) as { steps?: unknown };
      genSteps = (Array.isArray(p.steps) ? p.steps : []).map((s: any) => ({
        step_key: String(s?.step_key || "").trim().toLowerCase(),
        step_label: String(s?.step_label || "").trim(),
        description: String(s?.description || "").trim(),
      }));
    } catch {
      return json({ error: `norm generation unparseable: ${genRaw.slice(0, 160)}` }, 502);
    }
    const subset = validateSubsetOfEight(genSteps);
    if (!subset.ok) return json({ error: `subset-of-8 validation failed: ${subset.issue}`, steps: genSteps }, 422);

    // 70b judge-only: ODI-shape + solution-agnostic validation (no generation).
    const judgeSystem =
      "You are a strict judge. You are given an ordered industry job-step sequence. Answer whether it is a legitimate, solution-agnostic ODI job map: " +
      "each step describes job PROGRESS (not a product/solution/method), the sequence reads as how this job is typically done, and nothing is a marketing claim. " +
      'JSON only: {"ok":true|false,"reason":"one sentence"}.';
    const judgeUser =
      `Executor: ${inputs.executor}\nJob: ${inputs.jtbd}\nSteps:\n` +
      genSteps.map((s, i) => `${i + 1} (${s.step_key}): ${s.step_label} — ${s.description}`).join("\n");
    const judgeRaw = await callOllamaJson(ollamaUrl, judgeModel, judgeSystem, judgeUser, JUDGE_TIMEOUT_MS);
    let judgeOk = false;
    let judgeReason = "";
    try {
      const jv = JSON.parse(judgeRaw) as { ok?: unknown; reason?: unknown };
      judgeOk = jv.ok === true;
      judgeReason = String(jv.reason ?? "").trim();
    } catch {
      return json({ error: `norm judge unparseable: ${judgeRaw.slice(0, 160)}` }, 502);
    }
    if (!judgeOk) return json({ error: `70b shape judge rejected the norm sequence: ${judgeReason}`, steps: genSteps }, 422);

    // Store the norm steps (render order 1..N), immutable-per-content.
    const executorContext = `${inputs.executor}${inputs.jtbd ? ` — ${inputs.jtbd}` : ""}`;
    const stepRows: any[] = [];
    for (let i = 0; i < genSteps.length; i++) {
      const s = genSteps[i];
      const statement = `${s.step_label}. ${s.description}`;
      stepRows.push({
        company_id,
        journey_key: inputs.journeyKey,
        executor_context: executorContext,
        step_number: i + 1,
        step_key: s.step_key,
        step_label: s.step_label,
        description: s.description,
        provenance: "industry_normative",
        title_source: inputs.titleSource,
        source_run_id: sourceRunId,
        content_sha: await sha256Hex(normalizeForHash(statement)),
      });
    }
    const { error: stepErr } = await supabase.from("normative_job_steps").insert(stepRows);
    if (stepErr && !String(stepErr.message ?? "").toLowerCase().includes("duplicate")) {
      return json({ error: `normative_job_steps insert failed: ${stepErr.message}` }, 500);
    }

    return json({
      status: "ok",
      company_id,
      source_run_id: sourceRunId,
      title_source: inputs.titleSource,
      journey_key: inputs.journeyKey,
      refined_industry: refinedIndustry,
      expand_used: expandUsed,
      industry_sources: sourceRows.length,
      steps: genSteps,
      judge_reason: judgeReason,
    });
  } catch (err) {
    console.error("[generate-normative-jobmap] error:", String((err as Error)?.message ?? err));
    return json({ error: String((err as Error)?.message ?? err) }, 500);
  }
});
