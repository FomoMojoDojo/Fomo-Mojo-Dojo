// ── generate-reference-jobmap ─────────────────────────────────────────────────
//
// FD-2: the COMPANY-AGNOSTIC, industry-keyed reference-map generator. Fills the
// front-door library (industry_reference_job_maps) with is_published=FALSE DRAFTS
// — an industry-STANDARD ODI job map for the primary job a customer engages a
// business in that industry to get done. Stated AS the standard, true-by-
// reference.
//
// LAW (structural): reference content is true-by-reference — NO web discovery, NO
// sources, NO corroboration. This function reads NO company data: it imports only
// PURE helpers (anchors, the ODI guards, the subset-of-8 validator, the TS hash)
// and writes ONLY the walled reference table (no company_id, no source/verdict
// columns). Nothing here can enter signalRecurrence / claims / normative_step_* /
// finding_*.
//
// MODEL DISCIPLINE: qwen2.5:14b-instruct generates (label + subset-of-8 steps);
// llama3:70b judges ODI-shape / solution-agnostic ONLY (never generates). Failing
// guard/judge ⇒ one regeneration attempt, else the industry is reported failed
// (no partial write). content_sha via the single TS authority.
//
// LEDGER NOTE: long_runner_runs is company-scoped (company_id NOT NULL) and cannot
// hold a company-agnostic run, so it is NOT used. Resume is stronger here: drafts
// are content-identity idempotent — a re-run SKIPS an industry that already has a
// draft (and NEVER touches a published/signed row). The durable rows are the
// resume truth.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { normalizeForHash, sha256Hex } from "../_shared/contentIdentity.ts";
import { anchorsToPromptBlock, getIndustryStepAnchors, inferStandardMarketCategory } from "../_shared/industryStepAnchors.ts";
import { JTBD_ODI_CHECKPOINTS } from "../_shared/jtbdProcess.ts";
import { type NormStep, validateSubsetOfEight } from "../generate-normative-jobmap/logic.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
};

const DEFAULT_GEN_MODEL = "qwen2.5:14b-instruct";
const DEFAULT_JUDGE_MODEL = "llama3:70b";
const GEN_TIMEOUT_MS = 120_000;
const JUDGE_TIMEOUT_MS = 180_000;
const TAXONOMY_VERSION = "fd1-priority-8";
const LOCAL_HOST_ALLOWLIST = new Set(["localhost", "127.0.0.1", "::1", "host.docker.internal"]);

// The 8 SIGNED priority slugs → a SEED label (anchor seeding + 14b context only).
// The stored industry_label is what the model refines (provisional, unpublished).
const SIGNED_SLUGS: Record<string, string> = {
  "nonprofit-social-services": "Nonprofit and social services organizations",
  "coffee-cafe": "Coffee shops and cafés",
  "cloud-infrastructure": "Cloud infrastructure and hosting providers",
  "insurance-agency": "Insurance agencies and brokerages",
  "environmental-remediation": "Environmental and remediation services",
  "management-consulting": "Management and strategy consulting firms",
  "b2b-saas": "B2B software (SaaS) companies",
  "home-improvement-remodeling": "Home improvement and remodeling contractors",
};

function isLocalOllamaUrl(u: string): boolean {
  try {
    return LOCAL_HOST_ALLOWLIST.has(String(new URL(u).hostname || "").trim().toLowerCase());
  } catch {
    return false;
  }
}
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

async function callOllamaJson(ollamaUrl: string, model: string, system: string, user: string, timeoutMs: number): Promise<string> {
  const nativeBase = ollamaUrl.replace(/\/v1\/?$/, "");
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const resp = await fetch(`${nativeBase}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer ollama" },
      body: JSON.stringify({ model, format: "json", stream: false, options: { num_ctx: 8192, temperature: 0.2 }, messages: [{ role: "system", content: system }, { role: "user", content: user }] }),
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

// Bare ODI scaffold (JTBD_ODI_CHECKPOINTS) — used when no industry anchor matches.
function bareScaffoldBlock(): string {
  return JTBD_ODI_CHECKPOINTS.map((c, i) => `${i + 1} (${c.key}): ${c.canonicalLabel}`).join("\n");
}

// Local hint copy of the banned vocabulary — used ONLY to tell the model which
// exact words tripped (better regeneration feedback). The authoritative pass/fail
// is always the imported validateSubsetOfEight; this list may drift harmlessly.
const JARGON_HINTS = [
  "feature", "dashboard", "portal", "campaign", "launch", "tool", "app", "platform", "build", "implement",
  "rollout", "workflow", "template", "mvp", "ui", "productize", "standardize", "integrate", "promote",
  "negotiate", "supplier", "vendor", "pricing", "terms", "partnership", "onboarding",
  "awareness", "acquisition", "activation", "retention", "engagement", "funnel", "pipeline",
  // multi-word NON_ODI phrases (esp. consulting):
  "consulting process", "delivery process", "implementation plan", "pipeline stage", "marketing funnel", "sales funnel",
];
function trippedWords(steps: NormStep[]): string[] {
  const found = new Set<string>();
  for (const s of steps) {
    const text = `${s.step_label} ${s.description}`.toLowerCase();
    for (const w of JARGON_HINTS) if (new RegExp(`\\b${w}\\b`, "i").test(text)) found.add(w);
  }
  return [...found];
}

const GEN_SYSTEM =
  "You produce an INDUSTRY-STANDARD job map — the standard, solution-agnostic sequence of ODI job STEPS for the PRIMARY job a customer engages a business in a given industry to get done. " +
  "This is the generally-accepted standard for the industry, stated as the norm — NOT any one company's process. " +
  "The ODI universal scaffold has 8 canonical checkpoints in FIXED order: define, locate, prepare, confirm, execute, monitor, modify, conclude. " +
  "Use a SUBSET of these keys IN THIS ORDER — you may OMIT a checkpoint the industry genuinely doesn't exhibit, NEVER reorder, NEVER invent a step outside the 8. " +
  "Each step is solution-agnostic (no product, tool, brand, vendor, or prescribed method) and describes the customer's job PROGRESS. " +
  "NEVER use these words or phrases (they are solution/process jargon, not job progress): feature, dashboard, portal, campaign, launch, tool, app, platform, build, implement, rollout, workflow, template, mvp, ui, productize, standardize, integrate, promote, negotiate, supplier, vendor, pricing, terms, partnership, onboarding, awareness, acquisition, activation, retention, engagement, funnel, pipeline, implementation plan, delivery process, consulting process. Describe the plain progress a customer makes, in everyday words. " +
  'Also produce a concise client-facing industry_label (2-6 words, Title Case). ' +
  'JSON only: {"industry_label":"...","steps":[{"step_key":"define|locate|prepare|confirm|execute|monitor|modify|conclude","step_label":"2-8 words","description":"one sentence, industry-typical"}]}';

function buildGenUser(seedLabel: string, scaffold: string, feedback?: string): string {
  return (
    `Industry: ${seedLabel}\n` +
    `\nODI scaffold (labels are hypotheses to sharpen, not to copy verbatim):\n${scaffold}\n\n` +
    (feedback ? `${feedback}\n\n` : "") +
    `Produce the industry-standard ODI job map for the primary customer job in this industry. Use only the canonical keys, in canonical order, omitting any the industry doesn't exhibit.`
  );
}

const JUDGE_SYSTEM =
  "You are a strict judge. You are given an ordered industry job-step sequence. Answer whether it is a legitimate, solution-agnostic ODI job map for the industry's primary customer job: " +
  "each step describes customer job PROGRESS (not a product/solution/method/vendor), the sequence reads as the industry standard, and nothing is a marketing claim. " +
  'JSON only: {"ok":true|false,"reason":"one sentence"}.';

type GenResult = { industry_label: string; steps: NormStep[] };

async function generateForIndustry(ollamaUrl: string, genModel: string, judgeModel: string, seedLabel: string): Promise<{ ok: true; result: GenResult; judge_reason: string } | { ok: false; issue: string }> {
  const coarse = inferStandardMarketCategory(seedLabel);
  const anchors = coarse ? getIndustryStepAnchors(coarse) : null;
  const scaffold = anchors ? anchorsToPromptBlock(anchors) : bareScaffoldBlock();

  // Up to 5 attempts — the ODI guards reject solution/process jargon strictly;
  // regenerate (with word-level feedback) rather than template past the guard.
  let lastIssue = "no attempt";
  let feedback = "";
  for (let attempt = 0; attempt < 5; attempt++) {
    let gen: GenResult;
    try {
      const raw = await callOllamaJson(ollamaUrl, genModel, GEN_SYSTEM, buildGenUser(seedLabel, scaffold, feedback || undefined), GEN_TIMEOUT_MS);
      const p = JSON.parse(raw) as { industry_label?: unknown; steps?: unknown };
      const label = String(p.industry_label ?? "").trim();
      const steps = (Array.isArray(p.steps) ? p.steps : []).map((s: any) => ({ step_key: String(s?.step_key || "").trim().toLowerCase(), step_label: String(s?.step_label || "").trim(), description: String(s?.description || "").trim() }));
      if (!label) { lastIssue = "missing industry_label"; continue; }
      gen = { industry_label: label, steps };
    } catch (e) {
      lastIssue = `generation unparseable: ${String((e as Error)?.message ?? e).slice(0, 120)}`;
      continue;
    }
    // Deterministic guards (canonical order, no invent, solution-agnostic, non-ODI).
    const subset = validateSubsetOfEight(gen.steps);
    if (!subset.ok) {
      lastIssue = `subset-of-8: ${subset.issue}`;
      const bad = trippedWords(gen.steps);
      feedback = bad.length > 0
        ? `Your previous attempt was REJECTED — it used these forbidden jargon words: ${bad.join(", ")}. Rewrite every step in plain everyday language a customer would use, using NONE of those words.`
        : `Your previous attempt was REJECTED (${subset.issue}). Rewrite in plain everyday customer language.`;
      continue;
    }
    // 70b ODI-shape / solution-agnostic judge (judge-only).
    const judgeUser = `Industry: ${seedLabel}\nSteps:\n` + gen.steps.map((s, i) => `${i + 1} (${s.step_key}): ${s.step_label} — ${s.description}`).join("\n");
    const jr = await callOllamaJson(ollamaUrl, judgeModel, JUDGE_SYSTEM, judgeUser, JUDGE_TIMEOUT_MS);
    let judgeOk = false; let reason = "";
    try {
      const jv = JSON.parse(jr) as { ok?: unknown; reason?: unknown };
      judgeOk = jv.ok === true; reason = String(jv.reason ?? "").trim();
    } catch { lastIssue = `judge unparseable: ${jr.slice(0, 120)}`; continue; }
    if (!judgeOk) { lastIssue = `70b judge rejected: ${reason}`; continue; }
    return { ok: true, result: gen, judge_reason: reason };
  }
  return { ok: false, issue: lastIssue };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { industry_key, industry_keys, force, dry_run } = await req.json();
    const keys: string[] = Array.isArray(industry_keys) ? industry_keys.map(String) : (industry_key ? [String(industry_key)] : []);
    if (keys.length === 0) return json({ ok: false, error: "industry_key or industry_keys required" }, 400);
    const unknown = keys.filter((k) => !SIGNED_SLUGS[k]);
    if (unknown.length > 0) return json({ ok: false, error: `unknown/unsigned industry_key(s): ${unknown.join(", ")}` }, 400);

    const ollamaUrl = Deno.env.get("OLLAMA_BASE_URL") ?? "http://host.docker.internal:11434/v1";
    if (!isLocalOllamaUrl(ollamaUrl)) return json({ ok: false, error: "Local-only policy violation: OLLAMA_BASE_URL must resolve to localhost/host.docker.internal." }, 500);
    const genModel = Deno.env.get("OLLAMA_MODEL") || DEFAULT_GEN_MODEL;
    const judgeModel = Deno.env.get("OLLAMA_JUDGE_MODEL") || DEFAULT_JUDGE_MODEL;
    const supabase = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "") as unknown as { from: (t: string) => any };

    const runId = crypto.randomUUID();
    const results: any[] = [];
    for (const key of keys) {
      // Reconciliation: never touch published; skip existing drafts unless force.
      const { data: existing, error: exErr } = await supabase.from("industry_reference_job_maps").select("id, is_published, content_sha").eq("industry_key", key);
      if (exErr) return json({ ok: false, error: `existing load failed: ${exErr.message}` }, 500);
      const rows = (existing ?? []) as Array<{ id: string; is_published: boolean; content_sha: string | null }>;
      if (rows.some((r) => r.is_published === true)) { results.push({ industry_key: key, status: "skipped_published" }); continue; }
      if (rows.length > 0 && !force) { results.push({ industry_key: key, status: "skipped_existing_draft", draft_rows: rows.length }); continue; }

      const gen = await generateForIndustry(ollamaUrl, genModel, judgeModel, SIGNED_SLUGS[key]);
      if (!gen.ok) { results.push({ industry_key: key, status: "failed", issue: gen.issue }); continue; }

      const stepRows = await Promise.all(gen.result.steps.map(async (s, i) => ({
        industry_key: key,
        industry_label: gen.result.industry_label,
        step_key: s.step_key,
        step_number: i + 1,
        step_label: s.step_label,
        description: s.description,
        provenance: "industry_standard_reference",
        taxonomy_version: TAXONOMY_VERSION,
        generator_run_id: runId,
        content_sha: await sha256Hex(normalizeForHash(`${gen.result.industry_label}|${s.step_key}|${s.step_label}. ${s.description}`)),
        is_published: false,
      })));

      if (dry_run) { results.push({ industry_key: key, status: "dry_run", industry_label: gen.result.industry_label, judge_reason: gen.judge_reason, steps: gen.result.steps }); continue; }

      // force replace: drop existing UNPUBLISHED drafts (published already skipped above).
      if (force && rows.length > 0) {
        const { error: delErr } = await supabase.from("industry_reference_job_maps").delete().eq("industry_key", key).eq("is_published", false);
        if (delErr) return json({ ok: false, error: `draft replace delete failed: ${delErr.message}` }, 500);
      }
      const { error: insErr } = await supabase.from("industry_reference_job_maps").insert(stepRows);
      if (insErr) return json({ ok: false, error: `draft insert failed (${key}): ${insErr.message}` }, 500);
      results.push({ industry_key: key, status: "generated", industry_label: gen.result.industry_label, steps: gen.result.steps.length, judge_reason: gen.judge_reason });
    }
    return json({ ok: true, dry_run: !!dry_run, run_id: runId, results });
  } catch (err) {
    console.error("[generate-reference-jobmap] error:", String((err as Error)?.message ?? err));
    return json({ ok: false, error: String((err as Error)?.message ?? err) }, 500);
  }
});
