// Phase 2 Gate 3b — local-strategy-synthesis (operator-approved design, 2026-06-12).
//
// Generates the DECLARED-DIRECTION positioning canvas + strategy cascade for a
// company whose framing is internal: declared job steps + internal definition +
// uploaded-document sidecars, grounded in the PUBLIC market evidence (baseline,
// store supplement, fresh competitor set — public→local is legal; the artifacts
// this writes are internal_declared and mechanically inadmissible externally via
// the Gate 3a strategyArtifactGate).
//
// Laws on this path (Gate 2a precedent):
// - LOCAL ONLY: Ollama allowlist; no external model call exists in this file.
// - NO deterministic fallback code path exists at all — model failure is a loud
//   error with zero writes.
// - Native /api/chat with explicit num_ctx (the /v1 compat endpoint ignores
//   options and silently truncates context).
// - Declared override post-normalization: every attribute evidence_status
//   'declared', basis_urls [] (declared claims cite no public sources).
// - Abort-over-truncate: assembled user text > ABORT_CHARS fails loudly.
// - INSERT-fail-loudly: re-derivation requires deliberate deletion of the
//   existing declared artifact first (Option A consent flow).
// - Cascade first, then canvas with the declared cascade as anchor.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { classifyVoice } from "../_shared/claimProvenance.ts";
import { buildClientCorpus } from "../_shared/syndication.ts";
import { buildStoreSupplement, buildStoreSupplementBrief, type StoreSupplement } from "../_shared/storeSupplement.ts";
import { buildCompetitorMarketBrief } from "../_shared/contextBuilders.ts";
import { fireCascadeReconcile } from "../_shared/cascadeReconcileTrigger.ts";
import { sidecarCapForFile } from "../_shared/sidecarAllocation.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
};

const LOCAL_HOST_ALLOWLIST = new Set(["localhost", "127.0.0.1", "::1", "host.docker.internal"]);
const OLLAMA_TIMEOUT_MS = 300_000;
const NUM_CTX = 32_768;
const ABORT_CHARS = 90_000;

const DECLARED_EVIDENCE_BASIS =
  "Declared direction, derived from your internal documents. Not yet validated by market or customer evidence.";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function safeText(value: unknown) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function isLocalOllamaUrl(rawUrl: string) {
  try {
    const url = new URL(rawUrl);
    return LOCAL_HOST_ALLOWLIST.has(String(url.hostname || "").trim().toLowerCase());
  } catch {
    return false;
  }
}

function safeParseJsonObject(input: unknown): Record<string, unknown> | null {
  if (typeof input !== "string") return null;
  const trimmed = input.trim();
  if (!trimmed) return null;
  try {
    const parsed = JSON.parse(trimmed);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
  } catch { /* fall through */ }
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try {
      const parsed = JSON.parse(trimmed.slice(start, end + 1));
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
    } catch { /* no */ }
  }
  return null;
}

function slugify(value: string) {
  return safeText(value).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 60) || "item";
}

function strCap(value: unknown, cap: number) {
  return safeText(value).slice(0, cap);
}

function arrayOf(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

async function callLocalModel(args: {
  ollamaUrl: string;
  ollamaModel: string;
  systemText: string;
  userText: string;
  label: string;
}): Promise<Record<string, unknown>> {
  if (args.userText.length > ABORT_CHARS) {
    throw new Error(
      `Assembled ${args.label} prompt is ${args.userText.length} chars (> ${ABORT_CHARS}) — aborting rather than truncating.`,
    );
  }
  console.log(`[local-strategy-synthesis] ${args.label} prompt chars: system=${args.systemText.length} user=${args.userText.length}`);
  const nativeBase = args.ollamaUrl.replace(/\/v1\/?$/, "");
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), OLLAMA_TIMEOUT_MS);
  try {
    const resp = await fetch(`${nativeBase}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer ollama" },
      body: JSON.stringify({
        model: args.ollamaModel,
        format: "json",
        stream: false,
        options: { num_ctx: NUM_CTX },
        messages: [
          { role: "system", content: args.systemText },
          { role: "user", content: args.userText },
        ],
      }),
      signal: controller.signal,
    });
    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`Local model failed for ${args.label} (${resp.status}): ${text.slice(0, 300)}`);
    }
    const data = await resp.json().catch(() => ({}));
    const parsed = safeParseJsonObject(data?.message?.content);
    if (!parsed) {
      throw new Error(
        `Local model returned invalid JSON for ${args.label} (done_reason=${data?.done_reason ?? "unknown"}, eval_count=${data?.eval_count ?? "?"}, prompt_eval_count=${data?.prompt_eval_count ?? "?"}).`,
      );
    }
    return parsed;
  } finally {
    clearTimeout(timeoutId);
  }
}

// ── Normalizers (canvas-shaped; declared overrides applied post-normalization) ──

function normalizeDeclaredCascade(raw: Record<string, unknown>) {
  const caps = arrayOf(raw?.capabilities).slice(0, 6).map((c) => {
    const o = (c && typeof c === "object" ? c : { name: c }) as Record<string, unknown>;
    return { name: strCap(o?.name, 120), note: strCap(o?.note ?? o?.description, 240), status: "declared" };
  }).filter((c) => c.name);
  const systems = arrayOf(raw?.management_systems).slice(0, 6).map((m) => {
    const o = (m && typeof m === "object" ? m : { name: m }) as Record<string, unknown>;
    return { name: strCap(o?.name, 120), note: strCap(o?.note ?? o?.description, 240), status: "declared" };
  }).filter((m) => m.name);
  const assumptions = arrayOf(raw?.assumptions).slice(0, 8)
    .map((a) => strCap(typeof a === "object" ? (a as Record<string, unknown>)?.statement ?? (a as Record<string, unknown>)?.name : a, 240))
    .filter(Boolean);
  const cascade = {
    winning_aspiration: strCap(raw?.winning_aspiration, 600),
    where_to_play: strCap(raw?.where_to_play, 600),
    how_to_win: strCap(raw?.how_to_win, 600),
    capabilities_json: caps,
    management_systems_json: systems,
    assumptions_json: assumptions,
  };
  if (!cascade.winning_aspiration || !cascade.where_to_play || !cascade.how_to_win) {
    throw new Error("Declared cascade normalization failed: aspiration/where-to-play/how-to-win must all be present.");
  }
  return cascade;
}

function normalizeDeclaredCanvas(raw: Record<string, unknown>) {
  const alternatives = arrayOf(raw?.competitive_alternatives).slice(0, 6).map((a) => {
    const o = (a && typeof a === "object" ? a : { name: a }) as Record<string, unknown>;
    const name = strCap(o?.name, 120);
    return { id: slugify(name), name, description: strCap(o?.description, 400), highlighted: false };
  }).filter((a) => a.name);
  const attributes = arrayOf(raw?.unique_attributes).slice(0, 6).map((a) => {
    const o = (a && typeof a === "object" ? a : { name: a }) as Record<string, unknown>;
    const name = strCap(o?.name, 120);
    return {
      id: slugify(name),
      name,
      description: strCap(o?.description, 400),
      highlighted: false,
      // Declared override (operator-signed): declared claims cite no public sources.
      evidence_status: "declared",
      basis_urls: [],
    };
  }).filter((a) => a.name);
  const canvas = {
    market_category: strCap(raw?.market_category, 200),
    category_rationale: strCap(raw?.category_rationale, 800),
    value_for_customer: strCap(raw?.value_for_customer, 800),
    best_fit_customers: strCap(raw?.best_fit_customers, 800),
    proposed_tagline: strCap(raw?.proposed_tagline, 200),
    competitive_alternatives_json: alternatives,
    unique_attributes_json: attributes,
  };
  if (!canvas.market_category || !canvas.value_for_customer || attributes.length === 0) {
    throw new Error("Declared canvas normalization failed: market_category, value_for_customer and at least one attribute are required.");
  }
  return canvas;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const ollamaUrl = Deno.env.get("OLLAMA_BASE_URL") ?? "http://host.docker.internal:11434/v1";
    const ollamaModel = Deno.env.get("OLLAMA_MODEL") ?? "qwen2.5:7b-instruct";
    if (!isLocalOllamaUrl(ollamaUrl)) {
      return json({ error: "Local-only policy violation: OLLAMA_BASE_URL must resolve to localhost/host.docker.internal." }, 412);
    }
    console.log(`[local-strategy-synthesis] locality ok — resolved Ollama URL: ${ollamaUrl} model: ${ollamaModel}`);

    const body = await req.json().catch(() => ({}));
    const companyId = safeText((body as Record<string, unknown>)?.company_id);
    const directionKey = safeText((body as Record<string, unknown>)?.direction_key).toLowerCase();
    const baselineRunId = Number((body as Record<string, unknown>)?.baseline_run_id);
    if (!companyId) return json({ error: "company_id is required" }, 400);
    if (!directionKey) return json({ error: "direction_key is required" }, 400);
    if (!Number.isFinite(baselineRunId)) return json({ error: "baseline_run_id is required" }, 400);

    const supabase = createClient(supabaseUrl, serviceRole);

    const { data: companyRow } = await supabase
      .from("companies").select("id,name,website,created_by").eq("id", companyId).maybeSingle();
    if (!companyRow) return json({ error: "Company not found" }, 404);
    const userId = safeText((companyRow as Record<string, unknown>)?.created_by);
    const companyName = safeText((companyRow as Record<string, unknown>)?.name);
    const website = safeText((companyRow as Record<string, unknown>)?.website);

    // INSERT-fail-loudly precheck (clear error beats 23505 noise; the constraint
    // still backstops a race).
    const { data: existingDeclared } = await supabase
      .from("positioning_canvases").select("id")
      .eq("company_id", companyId).eq("artifact_role", "declared_direction").eq("source_direction_key", directionKey)
      .maybeSingle();
    const { data: existingDeclaredCascade } = await supabase
      .from("strategy_cascades").select("id")
      .eq("company_id", companyId).eq("artifact_role", "declared_direction").eq("source_direction_key", directionKey)
      .maybeSingle();
    if (existingDeclared || existingDeclaredCascade) {
      return json({
        error: `A declared artifact already exists for direction '${directionKey}' — re-derivation requires deliberately deleting it first (consent flow).`,
      }, 409);
    }

    // ── Inputs (council charter) ─────────────────────────────────────────────
    const { data: declaredSteps } = await supabase
      .from("job_steps")
      .select("step_number, step_label, description, journey_title, provenance_type")
      .eq("company_id", companyId).eq("journey_key", directionKey)
      .order("step_number");
    const declaredRows = (declaredSteps ?? []).filter((r) =>
      ["internal_derived", "operator_authored"].includes(String((r as Record<string, unknown>)?.provenance_type ?? "")));
    if (declaredRows.length === 0) {
      return json({ error: `No declared (internal-provenance) job steps found for direction '${directionKey}'.` }, 422);
    }

    const { data: marketDef } = await supabase
      .from("odi_market_definitions")
      .select("job_executor, chooser, jtbd, provenance_type")
      .eq("company_id", companyId).order("created_at", { ascending: false }).limit(1).maybeSingle();

    const { data: baselineRun } = await supabase
      .from("public_baseline_runs").select("id, result_json")
      .eq("id", baselineRunId).maybeSingle();
    if (!baselineRun) return json({ error: `public_baseline_runs ${baselineRunId} not found.` }, 404);
    const baselineResultJson = (baselineRun as Record<string, unknown>)?.result_json ?? {};

    const { data: competitorRun } = await supabase
      .from("competitor_discovery_runs").select("result_json")
      .eq("company_id", companyId).order("created_at", { ascending: false }).limit(1).maybeSingle();
    const competitorBrief = buildCompetitorMarketBrief((competitorRun as { result_json?: unknown } | null)?.result_json ?? null);

    // Sidecars — the signed Gate 2a allocation.
    const { data: inputRows } = await supabase.from("inputs").select("id").eq("company_id", companyId).limit(60);
    const inputIds = (inputRows ?? []).map((r) => String((r as Record<string, unknown>)?.id || "")).filter(Boolean);
    const { data: fileRows } = inputIds.length > 0
      ? await supabase.from("input_files").select("file_name, file_path").in("input_id", inputIds).limit(180)
      : { data: [] as unknown[] };
    const files = (fileRows ?? []) as Array<{ file_name?: string; file_path?: string }>;
    const ordered = [
      ...files.filter((f) => safeText(f?.file_name).startsWith("B2B_")),
      ...files.filter((f) => !safeText(f?.file_name).startsWith("B2B_")),
    ];
    const internalDocuments: Array<{ file_name: string; excerpt: string }> = [];
    for (const f of ordered) {
      const filePath = safeText(f?.file_path);
      const fileName = safeText(f?.file_name);
      if (!filePath) continue;
      // Operator-approved tiered allocation (shared with local-jobmap-synthesis).
      const cap = sidecarCapForFile(fileName);
      try {
        const { data: sidecar, error } = await supabase.storage.from("input-files").download(`${filePath}.extracted.txt`);
        if (error || !sidecar) continue;
        const text = (await sidecar.text()).replace(/\s+/g, " ").trim();
        if (text) internalDocuments.push({ file_name: fileName, excerpt: text.slice(0, cap) });
      } catch { /* missing sidecar contributes nothing */ }
    }

    // Store supplement (local DB reads; public-class content).
    let storeSupplement: StoreSupplement | null = null;
    try {
      const companyHost = (() => {
        try { return new URL(website).hostname.replace(/^www\./, "").toLowerCase(); } catch { return ""; }
      })();
      const snapshot = baselineResultJson as {
        evidence_ledger?: Array<{ snippet?: string; url?: string; bucket?: string; source_type?: string }>;
        outside_voice_signals?: Array<{ signal?: string; url?: string }>;
      };
      const ledgerItems = Array.isArray(snapshot?.evidence_ledger) ? snapshot.evidence_ledger : [];
      const currentRunItems = [
        ...ledgerItems.map((i) => ({ url: safeText(i?.url), text: safeText(i?.snippet) })),
        ...(Array.isArray(snapshot?.outside_voice_signals) ? snapshot.outside_voice_signals : []).map((s) => ({
          url: safeText(s?.url), text: safeText(s?.signal),
        })),
      ].filter((i) => i.url && i.text);
      const clientTexts = ledgerItems
        .filter((i) => classifyVoice(i, companyHost) === "client_voice")
        .map((i) => safeText(i?.snippet)).filter(Boolean);
      const corpus = await buildClientCorpus(supabase as unknown as { from: (t: string) => any }, companyId, companyHost, clientTexts);
      storeSupplement = await buildStoreSupplement({
        supabase: supabase as unknown as { from: (t: string) => any },
        companyId,
        pinnedRunId: baselineRunId,
        companyHost,
        corpus,
        clientSample: clientTexts.join("\n").slice(0, 4000),
        currentRunItems,
        classify: (entry) => classifyVoice(entry, companyHost),
        label: "local-strategy-synthesis",
      });
    } catch (error) {
      console.warn("[local-strategy-synthesis] store supplement unavailable (non-fatal)", String(error).slice(0, 200));
    }
    const supplementBrief = buildStoreSupplementBrief(storeSupplement) || "";

    // Market read carries (operator-ruled verbatim carries).
    const { data: marketReadCanvas } = await supabase
      .from("positioning_canvases").select("current_tagline, known_tensions_json")
      .eq("company_id", companyId).eq("artifact_role", "market_read").maybeSingle();
    const carriedTagline = safeText((marketReadCanvas as Record<string, unknown>)?.current_tagline);
    const carriedTensions = Array.isArray((marketReadCanvas as Record<string, unknown>)?.known_tensions_json)
      ? (marketReadCanvas as { known_tensions_json: unknown[] }).known_tensions_json
      : [];

    // ── Shared context ───────────────────────────────────────────────────────
    const declaredBrief = declaredRows
      .map((r) => `${(r as Record<string, unknown>).step_number}. ${safeText((r as Record<string, unknown>).step_label)} — ${safeText((r as Record<string, unknown>).description)}`)
      .join("\n");
    const definitionBrief = [
      `Job executor: ${safeText((marketDef as Record<string, unknown>)?.job_executor)}`,
      `Chooser: ${safeText((marketDef as Record<string, unknown>)?.chooser)}`,
      `Job to be done: ${safeText((marketDef as Record<string, unknown>)?.jtbd)}`,
    ].join("\n");
    const documentsBrief = internalDocuments
      .map((d) => `## ${d.file_name}\n${d.excerpt}`).join("\n");

    const sharedContext =
      `Company: ${companyName}\nWebsite: ${website || "unknown"}\n\n` +
      `DECLARED DIRECTION (the company's chosen strategic direction — '${directionKey}'):\n${declaredBrief}\n\n` +
      `Internal market definition (declared):\n${definitionBrief}\n\n` +
      `Internal documents (declared direction source material):\n${documentsBrief}\n\n` +
      `Public market evidence (grounding — what the market actually shows):\n${JSON.stringify(baselineResultJson)}\n\n` +
      (supplementBrief ? `${supplementBrief}\n\n` : "") +
      (competitorBrief ? `Discovered competitive set (public, anchored):\n${competitorBrief}\n\n` : "");

    const honestyRules =
      "HONESTY RULES: This is a DECLARED direction — what the company intends, derived from its internal documents. " +
      "Ground every statement in the declared direction and the internal documents; use the public evidence to stay realistic about the market, never to fabricate validation. " +
      "Do not claim market proof, customer evidence, or traction the public evidence does not show. Plain language, no consulting jargon. Output clean JSON only.";

    // ── Generation 1: declared cascade ───────────────────────────────────────
    const cascadeRaw = await callLocalModel({
      ollamaUrl, ollamaModel,
      label: "declared-cascade",
      systemText: "You are a strategy analyst running on private local inference. " + honestyRules,
      userText:
        sharedContext +
        "Produce the company's DECLARED strategy cascade for this direction.\n" +
        "Return JSON: { winning_aspiration, where_to_play, how_to_win, capabilities: [{name, note}], management_systems: [{name, note}], assumptions: [string] }\n" +
        "winning_aspiration: the change the company is building toward in this declared direction (1-2 sentences).\n" +
        "where_to_play: the market, segment and channels this direction commits to (1-2 sentences).\n" +
        "how_to_win: the basis of advantage in this direction (1-2 sentences).\n" +
        "capabilities: 3-6 capabilities the direction requires; note = current state honestly.\n" +
        "management_systems: 2-5 systems needed to deliver; assumptions: 3-8 declared assumptions that are not yet validated.",
    });
    const cascade = normalizeDeclaredCascade(cascadeRaw);

    // ── Generation 2: declared canvas (cascade as anchor) ────────────────────
    const canvasRaw = await callLocalModel({
      ollamaUrl, ollamaModel,
      label: "declared-canvas",
      systemText: "You are a positioning analyst (April Dunford framing) running on private local inference. " + honestyRules,
      userText:
        sharedContext +
        `Declared strategy cascade (anchor — generated from the same direction):\n` +
        `Winning aspiration: ${cascade.winning_aspiration}\nWhere to play: ${cascade.where_to_play}\nHow to win: ${cascade.how_to_win}\n\n` +
        "Produce the company's DECLARED positioning canvas for this direction.\n" +
        "Return JSON: { market_category, category_rationale, value_for_customer, best_fit_customers, proposed_tagline, competitive_alternatives: [{name, description}], unique_attributes: [{name, description}] }\n" +
        "market_category: frame of reference first; category_rationale: why this frame for this declared direction.\n" +
        "competitive_alternatives: 3-6 real alternatives the declared buyer would consider (use the discovered competitive set where relevant).\n" +
        "unique_attributes: 3-6 attributes the direction claims — declared claims, not market-proven ones.",
    });
    const canvas = normalizeDeclaredCanvas(canvasRaw);

    // ── Writes (INSERT, explicit role keys per 3a dropped defaults) ──────────
    const nowIso = new Date().toISOString();
    const frameworks = ["JTBD", "ODI", "local_ollama", "local_strategy_synthesis", "declared_direction"];

    const { error: cascadeInsertErr } = await supabase.from("strategy_cascades").insert({
      company_id: companyId,
      user_id: userId,
      artifact_role: "declared_direction",
      source_direction_key: directionKey,
      provenance_type: "internal_declared",
      source: "system",
      frameworks_used: frameworks,
      ...cascade,
      updated_at: nowIso,
    });
    if (cascadeInsertErr) {
      return json({ error: `Declared cascade insert failed (nothing else written): ${cascadeInsertErr.message}` }, 500);
    }

    const { error: canvasInsertErr } = await supabase.from("positioning_canvases").insert({
      company_id: companyId,
      user_id: userId,
      artifact_role: "declared_direction",
      source_direction_key: directionKey,
      provenance_type: "internal_declared",
      source: "system",
      frameworks_used: frameworks,
      market_category: canvas.market_category,
      category_rationale: canvas.category_rationale,
      value_for_customer: canvas.value_for_customer,
      best_fit_customers: canvas.best_fit_customers,
      proposed_tagline: canvas.proposed_tagline,
      competitive_alternatives_json: canvas.competitive_alternatives_json,
      unique_attributes_json: canvas.unique_attributes_json,
      // Operator-ruled verbatim carries from the market read: the actual current
      // tagline is a fact, and the declared direction doesn't erase known negatives.
      current_tagline: carriedTagline,
      known_tensions_json: carriedTensions,
      updated_at: nowIso,
    });
    if (canvasInsertErr) {
      // Loud partial-state report — the cascade row exists; operator decides.
      return json({
        error: `Declared canvas insert failed AFTER the cascade row was written — partial state, operator attention required: ${canvasInsertErr.message}`,
      }, 500);
    }

    // Phase 3a: the declared_direction cascade changed → fire the local cascade
    // compare (isolation-law: never breaks this run; self-records on failure).
    await fireCascadeReconcile({ supabase, companyId, source: "declared_direction_change" });

    return json({
      status: "ok",
      company_id: companyId,
      direction_key: directionKey,
      provider: "ollama_local",
      model: ollamaModel,
      declared_evidence_basis: DECLARED_EVIDENCE_BASIS,
      summary: {
        cascade: { capabilities: cascade.capabilities_json.length, systems: cascade.management_systems_json.length, assumptions: cascade.assumptions_json.length },
        canvas: { alternatives: canvas.competitive_alternatives_json.length, attributes: canvas.unique_attributes_json.length },
        internal_documents: internalDocuments.length,
        supplement: storeSupplement ? "present" : "absent",
        competitor_brief: competitorBrief ? "present" : "absent",
      },
    });
  } catch (error) {
    console.error("[local-strategy-synthesis] failed loudly, zero (or reported-partial) writes", error);
    return json({ error: error instanceof Error ? error.message : String(error) }, 502);
  }
});
