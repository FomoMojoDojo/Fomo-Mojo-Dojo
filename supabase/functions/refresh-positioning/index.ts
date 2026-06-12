// refresh-positioning: standalone leaf function to re-run the positioning LLM step.
// Reads existing DB state (baseline, inputs, opportunities, routes, job_steps),
// injects the current strategy cascade as a positioning anchor (strategy-as-lens),
// and writes a new positioning_canvases row.
//
// Safety: returns status='skipped_manual_preserved' without LLM call if the
// current positioning canvas has source LIKE 'manual_%'.
// dry_run=true returns the prompt without calling OpenAI or writing to DB.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { callOpenAIJSON, STANDARD_MARKET_CATEGORY_GUIDANCE } from "../_shared/openaiClient.ts";
import {
  buildBaselineBrief,
  buildCompetitorMarketBrief,
  buildKnownTensionsBrief,
  buildCascadeContext,
  buildInputBrief,
  buildJourneyBrief,
  buildJourneysFromJobSteps,
  buildOpportunityBrief,
  buildSelectedJobMapBrief,
  buildStrategicAssumptionBrief,
  buildStrategicProblemBrief,
  normalizeStrategicAssumptions,
  normalizeStrategicProblems,
} from "../_shared/contextBuilders.ts";
import { buildFrameworkBrief, getFrameworkRoutingPlan } from "../_shared/frameworkLibrary.ts";
import { classifyVoice, deriveClaimProvenance, judgeAttributeEvidence } from "../_shared/claimProvenance.ts";
import { buildStoreSupplement, buildStoreSupplementBrief, type StoreSupplement } from "../_shared/storeSupplement.ts";
import { buildClientCorpus } from "../_shared/syndication.ts";
import { recordIntegrityRun } from "../_shared/integrity.ts";
import { gateJobStepsForExternal, JOB_FRAMING_FALLBACK_LINE } from "../_shared/jobFramingGate.ts";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const positioningCanvasSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    competitive_alternatives: {
      type: "array",
      minItems: 3,
      maxItems: 6,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          description: { type: "string" },
          highlighted: { type: "boolean" },
        },
        required: ["id", "name", "description", "highlighted"],
      },
    },
    unique_attributes: {
      type: "array",
      minItems: 3,
      maxItems: 6,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          description: { type: "string" },
          highlighted: { type: "boolean" },
          // Structure over instruction: the model must choose a provenance status per
          // attribute. The choice is then VERIFIED by judgeAttributeEvidence — the judge's
          // verdict overrides this self-assignment.
          evidence_status: { type: "string", enum: ["corroborated", "self_reported"] },
          basis_urls: { type: "array", items: { type: "string" } },
        },
        required: ["id", "name", "description", "highlighted", "evidence_status", "basis_urls"],
      },
    },
    value_for_customer: { type: "string" },
    best_fit_customers: { type: "string" },
    market_category: { type: "string" },
    category_rationale: { type: "string" },
    current_tagline: { type: "string" },
    proposed_tagline: { type: "string" },
  },
  required: [
    "competitive_alternatives",
    "unique_attributes",
    "value_for_customer",
    "best_fit_customers",
    "market_category",
    "category_rationale",
    "current_tagline",
    "proposed_tagline",
  ],
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const openaiKey = Deno.env.get("OPENAI_API_KEY");
    const openaiModel = Deno.env.get("OPENAI_MODEL") || "gpt-4.1-mini";

    if (!supabaseUrl || !serviceRoleKey || !anonKey) {
      return jsonResponse({ error: "Missing Supabase env vars" }, 500);
    }
    if (!openaiKey) return jsonResponse({ error: "Missing OPENAI_API_KEY" }, 500);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return jsonResponse({ error: "No auth header" }, 401);
    const bearerToken = authHeader.replace(/^Bearer\s+/i, "").trim();

    // Accept service role key directly (internal/orchestrator calls) or user JWT.
    // Dedicated service-role identity in auth.users — email: system@mojomap.internal (A55).
    // user_id is a NOT NULL uuid; the literal "service_role" breaks the insert (22P02).
    // Migration: 20260518000002_create_service_role_user.sql
    const SERVICE_ROLE_UUID = "1a27cf29-554a-46e9-bab8-0e238f9dc088";
    let userId: string;
    if (bearerToken === serviceRoleKey) {
      userId = SERVICE_ROLE_UUID;
    } else {
      const anonClient = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: userRes, error: authError } = await anonClient.auth.getUser();
      if (authError || !userRes?.user) return jsonResponse({ error: "Unauthorized" }, 401);
      userId = userRes.user.id;
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const body = await req.json().catch(() => ({}));
    const company_id = String((body as Record<string, unknown>)?.company_id || "").trim();
    const dry_run = !!(body as Record<string, unknown>)?.dry_run;
    // skip_lock: accepted from orchestrator (research-company already holds the lock); no-op here
    const _skip_lock = !!(body as Record<string, unknown>)?.skip_lock;
    // Orchestrator-provided context: reviewed known tensions (persisted verbatim — they
    // already passed review) and claim provenance for the evidence brief. Optional; standalone
    // invocations carry tensions forward from the latest canvas instead of dropping them.
    const bodyKnownTensions = Array.isArray((body as Record<string, unknown>)?.known_tensions)
      ? ((body as Record<string, unknown>).known_tensions as unknown[])
      : null;
    const bodyClaimProvenance = Array.isArray((body as Record<string, unknown>)?.claim_provenance)
      ? ((body as Record<string, unknown>).claim_provenance as Array<{
          ledger_index?: number | null;
          claim?: string;
          status?: string;
          basis_urls?: string[];
        }>)
      : undefined;

    if (!company_id) return jsonResponse({ error: "company_id required" }, 400);

    // --- Safety check: skip if existing positioning canvas is manually curated ---
    const { data: manualCheck } = await supabase
      .from("positioning_canvases")
      .select("id, source")
      .eq("company_id", company_id)
      .like("source", "manual_%")
      .maybeSingle();

    if (manualCheck) {
      console.warn("[refresh-positioning] skipping — manual positioning canvas detected", {
        company_id,
        source: manualCheck.source,
        id: manualCheck.id,
      });
      return jsonResponse({
        status: "skipped_manual_preserved",
        message: "Positioning canvas has a manual source and was not overwritten.",
        source: manualCheck.source,
        canvas_id: manualCheck.id,
      });
    }

    // --- Fetch company ---
    const { data: companyRow, error: companyErr } = await supabase
      .from("companies")
      .select("name, website")
      .eq("id", company_id)
      .maybeSingle();
    if (companyErr || !companyRow) {
      return jsonResponse({ error: "Company not found", company_id }, 404);
    }
    const company_name = String(companyRow.name || "");
    const website = String(companyRow.website || "");

    // --- Fetch baseline ---
    // Optional baseline_run_id override (mirrors research-company's committed pattern):
    // pin a specific snapshot, scoped to company_id, 404 if not owned — never a silent
    // fallback. Absent → byte-identical newest-non-weak behavior.
    const bodyBaselineRunId = Number((body as Record<string, unknown>)?.baseline_run_id) || null;
    let baselineRun: { id: unknown; result_json: unknown } | null = null;
    if (bodyBaselineRunId) {
      const { data: pinnedRun } = await supabase
        .from("public_baseline_runs")
        .select("id, result_json")
        .eq("company_id", company_id)
        .eq("id", bodyBaselineRunId)
        .maybeSingle();
      if (!pinnedRun) {
        return jsonResponse(
          { error: "baseline_run_not_found", baseline_run_id: bodyBaselineRunId, company_id },
          404,
        );
      }
      baselineRun = pinnedRun;
      console.log("[refresh-positioning] building from baseline_run_id override", {
        baseline_run_id: bodyBaselineRunId,
      });
    } else {
      const { data: baselineRuns } = await supabase
        .from("public_baseline_runs")
        .select("id, result_json")
        .eq("company_id", company_id)
        .order("created_at", { ascending: false })
        .limit(12);

      const isWeakStatus = (run: { result_json?: unknown }) =>
        ["ambiguous_public_evidence", "insufficient_public_evidence"].includes(
          String((run?.result_json as { status?: string } | null)?.status || ""),
        );

      const runs = Array.isArray(baselineRuns) ? baselineRuns : [];
      baselineRun = runs.find((r) => !isWeakStatus(r)) ?? runs[0] ?? null;
    }
    const baselineResultJson = baselineRun?.result_json ?? null;

    // --- Fetch strategic problems and assumptions ---
    const { data: problemRows } = await supabase
      .from("strategy_problem_statements")
      .select("id, statement, source, status, reconciliation_note")
      .eq("company_id", company_id)
      .order("created_at", { ascending: true })
      .limit(80);

    const { data: assumptionRows } = await supabase
      .from("strategy_assumptions")
      .select("id, assumption, source, status, note")
      .eq("company_id", company_id)
      .order("created_at", { ascending: true })
      .limit(120);

    const strategicProblems = normalizeStrategicProblems(problemRows ?? []);
    const strategicAssumptions = normalizeStrategicAssumptions(assumptionRows ?? []);
    const strategicProblemBrief = [
      buildStrategicProblemBrief(strategicProblems),
      buildStrategicAssumptionBrief(strategicAssumptions),
      "Use both strategic problems and assumptions to determine what to prioritize, what to test next, and where confidence is still low.",
    ].join("\n\n");

    // --- Fetch job_steps → reconstruct journeys ---
    const { data: jobStepRows } = await supabase
      .from("job_steps")
      .select(
        "journey_key, journey_title, journey_subtitle, step_number, step_label, description, designed, has_gap, evidence_status, evidence_basis, evidence_confidence, provenance_type",
      )
      .eq("company_id", company_id)
      .order("journey_key", { ascending: true })
      .order("step_number", { ascending: true })
      .limit(240);

    // Phase 2 Gate 1: only public-provenance steps may reach external prompt framing.
    const jobGate = await gateJobStepsForExternal({
      supabase: supabase as unknown as { from: (t: string) => any },
      companyId: String(company_id),
      rows: (jobStepRows ?? []) as Array<{ provenance_type?: string | null }>,
      consumer: "refresh-positioning",
    });
    const journeys = buildJourneysFromJobSteps(jobGate.admissible);
    const selectedJobMapBrief = jobGate.fallback ? JOB_FRAMING_FALLBACK_LINE : buildSelectedJobMapBrief(journeys);

    // --- Fetch inputs ---
    const { data: inputRows } = await supabase
      .from("inputs")
      .select("input_key, input_label, sub_group, description, why_it_matters")
      .eq("company_id", company_id)
      .limit(20);

    // --- Fetch opportunities ---
    const { data: opportunityRows } = await supabase
      .from("opportunities")
      .select("outcome, journey_key, step_number, step_label, importance, satisfaction, opportunity_score, priority_tier")
      .eq("company_id", company_id)
      .order("opportunity_score", { ascending: false })
      .limit(30);

    // --- Fetch routes (non-manual) ---
    const { data: routeRows } = await supabase
      .from("routes")
      .select("category, title, short_description")
      .eq("company_id", company_id)
      .not("source", "like", "manual_%")
      .limit(20);

    // --- Fetch current cascade as positioning anchor (strategy-as-lens) ---
    const { data: cascadeRow } = await supabase
      .from("strategy_cascades")
      .select("winning_aspiration, where_to_play, how_to_win, source")
      .eq("company_id", company_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const cascadeContext = buildCascadeContext(cascadeRow ?? null);

    // B2.1: latest competitor-discovery snapshot grounds alternatives + category.
    const { data: competitorRun } = await supabase
      .from("competitor_discovery_runs")
      .select("id, result_json")
      .eq("company_id", company_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const competitorMarketBrief = buildCompetitorMarketBrief((competitorRun as { result_json?: unknown } | null)?.result_json ?? null);

    // --- Known tensions: orchestrator-provided, else carried forward from latest canvas ---
    let knownTensions: unknown[] = bodyKnownTensions ?? [];
    if (!bodyKnownTensions) {
      const { data: priorCanvas } = await supabase
        .from("positioning_canvases")
        .select("known_tensions_json")
        .eq("company_id", company_id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (Array.isArray((priorCanvas as { known_tensions_json?: unknown } | null)?.known_tensions_json)) {
        knownTensions = (priorCanvas as { known_tensions_json: unknown[] }).known_tensions_json;
      }
    }

    // --- B2.2a: store supplement (Option C) — previously-established outside evidence ---
    // Built ONCE per run; the gen brief and BOTH judges read the identical admitted set.
    // The pinned snapshot remains the brief; this only supplements it.
    let storeSupplement: StoreSupplement | null = null;
    if (baselineRun?.id != null && baselineResultJson) {
      try {
        const pinnedRunId = Number(baselineRun.id);
        const companyHost = (() => {
          try { return new URL(String(website || "")).hostname.replace(/^www\./, "").toLowerCase(); } catch { return ""; }
        })();
        const snapshot = baselineResultJson as {
          evidence_ledger?: Array<{ snippet?: string; url?: string; bucket?: string; source_type?: string }>;
          outside_voice_signals?: Array<{ signal?: string; url?: string }>;
        };
        const ledgerItems = Array.isArray(snapshot?.evidence_ledger) ? snapshot.evidence_ledger : [];
        // Content-identity dedup inputs (amended rule 3): url + text pairs.
        const currentRunItems = [
          ...ledgerItems.map((i) => ({ url: String(i?.url || "").trim(), text: String(i?.snippet || "").trim() })),
          ...(Array.isArray(snapshot?.outside_voice_signals) ? snapshot.outside_voice_signals : []).map((sig) => ({
            url: String(sig?.url || "").trim(),
            text: String(sig?.signal || "").trim(),
          })),
        ].filter((i) => i.url && i.text);
        const clientTexts = ledgerItems
          .filter((i) => classifyVoice(i, companyHost) === "client_voice")
          .map((i) => String(i?.snippet || ""))
          .filter(Boolean);
        const corpus = await buildClientCorpus(supabase as unknown as { from: (t: string) => any }, String(company_id), companyHost, clientTexts);
        storeSupplement = await buildStoreSupplement({
          supabase: supabase as unknown as { from: (t: string) => any },
          companyId: String(company_id),
          pinnedRunId,
          companyHost,
          corpus,
          clientSample: clientTexts.join("\n").slice(0, 4000),
          currentRunItems,
          classify: (entry) => classifyVoice(entry, companyHost),
          label: "refresh-positioning",
        });
      } catch (error) {
        console.warn("[storeSupplement] refresh-positioning build FAILED — brief and judges proceed snapshot-only (loud, not silent)", {
          message: String(error instanceof Error ? error.message : error),
        });
        await recordIntegrityRun(supabase as unknown as { from: (t: string) => any }, {
          company_id: String(company_id), component: "store_supplement", status: "failed",
          error: String(error instanceof Error ? error.message : error),
          run_ref: String(baselineRun.id),
        });
        storeSupplement = null;
      }
    }

    // --- Claim provenance: orchestrator-provided, else self-derived (standalone runs) ---
    // The tagged brief is what shapes the gen toward qualified claims; without it a
    // standalone refresh would regenerate from an untagged brief and re-overclaim.
    let claimProvenance = bodyClaimProvenance;
    if (!claimProvenance && baselineResultJson) {
      try {
        claimProvenance = await deriveClaimProvenance({
          apiKey: openaiKey,
          model: openaiModel,
          baselineResultJson,
          companyWebsite: website,
          supabase,
          companyId: company_id,
          supplement: storeSupplement,
          runRef: baselineRun?.id != null ? String(baselineRun.id) : null,
        });
        console.log("[refresh-positioning] claim provenance self-derived", {
          judged: claimProvenance.length,
        });
      } catch (error) {
        // LOUD: the brief proceeds untagged; the attribute judge below is the backstop.
        console.warn(
          "[refresh-positioning] ⚠ CLAIM PROVENANCE SELF-DERIVATION FAILED — brief proceeds untagged; attribute judge remains the backstop",
          { message: String(error instanceof Error ? error.message : error) },
        );
        await recordIntegrityRun(supabase as unknown as { from: (t: string) => any }, {
          company_id: String(company_id), component: "claim_provenance", status: "failed",
          error: String(error instanceof Error ? error.message : error),
          run_ref: baselineRun?.id != null ? String(baselineRun.id) : null,
        });
        claimProvenance = undefined;
      }
    }

    // --- Build context ---
    const baselineBrief = [
      "Public baseline context (augmented with uploaded files):",
      buildBaselineBrief(baselineResultJson, claimProvenance),
    ].filter(Boolean).join("\n\n");

    const routes = Array.isArray(routeRows) ? routeRows : [];
    const routesSummary = routes.slice(0, 10).map((r, i) =>
      `${i + 1}. ${(r as Record<string, unknown>).category || "improve"} | ${(r as Record<string, unknown>).title || "Untitled"} | ${(r as Record<string, unknown>).short_description || "No description"}`
    ).join("\n");

    // --- Framework keys (mirrors research-company §5) ---
    const positioningFrameworkKeys = getFrameworkRoutingPlan("positioning").map((f) => f.key);

    // --- Build prompts (matches research-company §5 exactly + cascade anchor) ---
    const systemText =
      `You are generating an April Dunford style positioning canvas for a strategy platform.\n` +
      `Return ONLY valid JSON matching the schema. No prose outside the JSON.\n` +
      `Apply the framework guidance below as decision rules, not as output headings.\n\n` +
      `Framework guidance:\n${buildFrameworkBrief("positioning", getFrameworkRoutingPlan("positioning"))}\n\n` +
      `Rules:\n` +
      `- Stay strictly consistent with the provided website, evidence, category, audience, and company context\n` +
      `- Use April Dunford frame-of-reference logic plus ODI role clarity (job executor, chooser, user)\n` +
      `- Never switch industries, populations, or buyer types from the baseline evidence\n` +
      `- competitive_alternatives should be real alternatives, including manual workarounds or doing nothing when relevant\n` +
      `- When ALTERNATIVES EVIDENCE is provided below, competitive_alternatives MUST name the real discovered competitors from it (with their substance) rather than inventing generic alternatives; manual workarounds and doing-nothing may still appear alongside\n` +
      `- When CATEGORY/MARKET EVIDENCE is provided below, market_category and category_rationale must stay consistent with it\n` +
      `- The ALTERNATIVES and CATEGORY/MARKET evidence sections ground alternatives and category ONLY — they may NEVER be used to support, corroborate, or strengthen any claim the client makes about itself\n` +
      `- The PREVIOUSLY ESTABLISHED OUTSIDE EVIDENCE section (when present) is established outside evidence from prior public scans, each item stamped with its run of origin: usable as corroboration context for evidence_status/basis_urls, NEVER a substitute for naming what the current scan shows\n` +
      `- competitive_alternatives must serve the same customer/job context as the company; do not list alternatives from unrelated sectors\n` +
      `- unique_attributes should be specific and credible, not vague marketing claims\n` +
      `- For each unique attribute, set evidence_status: "corroborated" ONLY when independent evidence (third-party profiles, news, customer/outside voice) attests the attribute's core fact, and cite the attesting URLs in basis_urls; otherwise "self_reported" with basis_urls []. Never treat the company's own pages or self-descriptions as corroboration\n` +
      `- A self_reported attribute keeps its substance — it is the company's claim, honestly labeled as not yet echoed by outside voices\n` +
      `- value_for_customer should describe what customers can do or achieve that they could not before\n` +
      `- best_fit_customers should describe the clearest-fit audience in one paragraph and name buyer/executor context when possible\n` +
      `- market_category should be the category the company should claim or reshape and must be concise (2-8 words)\n` +
      `- ${STANDARD_MARKET_CATEGORY_GUIDANCE}\n` +
      `- market_category and best_fit_customers must align with the public baseline and website evidence\n` +
      `- positioning should directly address the client-stated strategic problem framing when provided\n` +
      `- category_rationale should explain why this category frame of reference helps buyers understand the company in ODI job terms\n` +
      `- current_tagline should be an exact homepage or website phrase if publicly evidenced; if not clearly present, return 'unknown'\n` +
      `- proposed_tagline should be a strategist-quality direction, not a generic slogan\n` +
      `- highlighted=true only for the strongest or most differentiating items\n` +
      `- Any company self-claim marked SELF-REPORTED/UNCORROBORATED in the evidence must stay qualified (self-reported, aspirational, or developing) — never asserted as established fact; corroborated claims keep their substance\n` +
      `- The known tensions below are already acknowledged in the strategy spine. Keep the canvas coherent with them: do not contradict them, relitigate them, or let unique_attributes/value_for_customer overclaim against them.\n` +
      `- The current strategy cascade below is the strategic anchor. Positioning must be coherent with it.\n`;

    const userText =
      `Company: ${company_name}\nWebsite: ${website || "unknown"}\n\n` +
      `Public baseline context:\n${baselineBrief}\n\n` +
      (buildStoreSupplementBrief(storeSupplement) ? `${buildStoreSupplementBrief(storeSupplement)}\n\n` : "") +
      `Client-stated strategic problems:\n${strategicProblemBrief}\n\n` +
      `Current strategy cascade (positioning anchor):\n${cascadeContext}\n\n` +
      `Selected job maps:\n${selectedJobMapBrief || "none"}\n\n` +
      `Generated strategy inputs:\n${buildInputBrief(inputRows ?? [])}\n\n` +
      `Generated opportunities:\n${buildOpportunityBrief(opportunityRows ?? [])}\n\n` +
      `Generated routes:\n${routesSummary}\n\n` +
      `Known tensions (already acknowledged; keep the canvas coherent with them):\n${buildKnownTensionsBrief(knownTensions)}\n\n` +
      (competitorMarketBrief ? `${competitorMarketBrief}\n\n` : "") +
      `Generate a positioning canvas for this exact company.`;

    // --- Dry run: return prompts without calling LLM ---
    if (dry_run) {
      return jsonResponse({
        status: "dry_run",
        company_id,
        company_name,
        cascade_source: cascadeRow?.source ?? null,
        prompt_used: `SYSTEM:\n${systemText}\n\n---\n\nUSER:\n${userText}`,
      });
    }

    // --- Call LLM ---
    const positioningResult = await callOpenAIJSON({
      apiKey: openaiKey,
      model: openaiModel,
      schemaName: "mojo_positioning_canvas_v1",
      schema: positioningCanvasSchema,
      systemText,
      userText,
      maxOutputTokens: 2200,
      temperature: 0.2,
    });

    // --- Verify attribute evidence_status against the baseline's independent evidence ---
    // The schema forced the gen to choose a status; the judge re-derives it from the
    // evidence and its verdict WINS. Deterministic subset-check on citations happens inside
    // judgeAttributeEvidence (unearned corroboration downgrades). Failure fallback is loud
    // and provenance-true: every attribute self_reported.
    let uniqueAttributes: any[] = Array.isArray(positioningResult?.unique_attributes)
      ? positioningResult.unique_attributes
      : [];
    try {
      const verdicts = await judgeAttributeEvidence({
        apiKey: openaiKey,
        model: openaiModel,
        baselineResultJson,
        attributes: uniqueAttributes,
        companyWebsite: website,
        supabase,
        companyId: company_id,
        supplement: storeSupplement,
        runRef: baselineRun?.id != null ? String(baselineRun.id) : null,
      });
      const verdictByIndex = new Map(verdicts.map((verdict) => [verdict.index, verdict]));
      const disagreements: Array<{ index: number; name: string; gen: string; judge: string }> = [];
      uniqueAttributes = uniqueAttributes.map((attribute, index) => {
        const verdict = verdictByIndex.get(index);
        // No verdict for this index → provenance-true default: self_reported.
        const finalStatus = verdict?.evidence_status ?? "self_reported";
        const genStatus = attribute?.evidence_status === "corroborated" ? "corroborated" : "self_reported";
        if (genStatus !== finalStatus) {
          disagreements.push({ index, name: String(attribute?.name || ""), gen: genStatus, judge: finalStatus });
        }
        return {
          ...attribute,
          evidence_status: finalStatus,
          basis_urls: verdict?.basis_urls ?? [],
        };
      });
      // Countable quality signal (same class as operator-override frequency): one line,
      // fixed shape — grep "attr-evidence verdicts" and sum `disagreements`.
      console.log("[refresh-positioning] attr-evidence verdicts", {
        total: uniqueAttributes.length,
        corroborated: uniqueAttributes.filter((a) => a.evidence_status === "corroborated").length,
        self_reported: uniqueAttributes.filter((a) => a.evidence_status === "self_reported").length,
        disagreements: disagreements.length,
        disagreement_detail: disagreements,
      });
    } catch (error) {
      console.warn(
        "[refresh-positioning] ⚠ ATTRIBUTE EVIDENCE JUDGE FAILED — all attributes marked self_reported (provenance-true fallback)",
        { message: String(error instanceof Error ? error.message : error) },
      );
      // Integrity path 6: the fail-safe canvas is no longer indistinguishable from an
      // honestly-all-self-reported one — the failure is on record. Fail-safe-and-save
      // behavior unchanged (council Q1: blocking is not introduced).
      await recordIntegrityRun(supabase as unknown as { from: (t: string) => any }, {
        company_id: String(company_id), component: "attr_evidence", surface_type: "positioning",
        status: "failed", examined: uniqueAttributes.length,
        error: String(error instanceof Error ? error.message : error),
        run_ref: baselineRun?.id != null ? String(baselineRun.id) : null,
      });
      uniqueAttributes = uniqueAttributes.map((attribute) => ({
        ...attribute,
        evidence_status: "self_reported",
        basis_urls: [],
      }));
    }

    // --- Persist to DB ---
    const payload = {
      company_id,
      user_id: userId,
      source: "system",
      provenance_type: "public_research",
      frameworks_used: positioningFrameworkKeys,
      competitive_alternatives_json: Array.isArray(positioningResult?.competitive_alternatives)
        ? positioningResult.competitive_alternatives
        : [],
      unique_attributes_json: uniqueAttributes,
      value_for_customer: String(positioningResult?.value_for_customer || ""),
      best_fit_customers: String(positioningResult?.best_fit_customers || ""),
      market_category: String(positioningResult?.market_category || ""),
      category_rationale: String(positioningResult?.category_rationale || ""),
      current_tagline: String(positioningResult?.current_tagline || ""),
      proposed_tagline: String(positioningResult?.proposed_tagline || ""),
      // Persisted verbatim: these passed the orchestrator's review gate (or were carried
      // forward from the prior canvas). The canvas LLM never rewrites them.
      known_tensions_json: knownTensions,
      // No updated_at trigger on this table — set explicitly so refreshes are visible.
      updated_at: new Date().toISOString(),
    };

    // Upsert: positioning_canvases is one row per company (positioning_canvases_company_id_key),
    // so a plain insert can never refresh an existing canvas (23505). The manual-preserve
    // guard above already returned before any write for manual canvases.
    let { data: inserted, error: insertErr } = await supabase
      .from("positioning_canvases")
      .upsert(payload, { onConflict: "company_id" })
      .select("id")
      .single();

    if (insertErr && String(insertErr.message || "").toLowerCase().includes("frameworks_used")) {
      const fallback = await supabase
        .from("positioning_canvases")
        .upsert({
          company_id,
          user_id: userId,
          source: "system",
          provenance_type: "public_research",
          competitive_alternatives_json: payload.competitive_alternatives_json,
          unique_attributes_json: payload.unique_attributes_json,
          value_for_customer: payload.value_for_customer,
          best_fit_customers: payload.best_fit_customers,
          market_category: payload.market_category,
          category_rationale: payload.category_rationale,
          current_tagline: payload.current_tagline,
          proposed_tagline: payload.proposed_tagline,
          known_tensions_json: payload.known_tensions_json,
          updated_at: payload.updated_at,
        }, { onConflict: "company_id" })
        .select("id")
        .single();
      inserted = fallback.data;
      insertErr = fallback.error;
    }

    if (insertErr) {
      console.error("[refresh-positioning] insert error:", insertErr);
      return jsonResponse({ error: "positioning_insert_failed", detail: insertErr.message }, 500);
    }

    console.log("[refresh-positioning] canvas inserted", { company_id, canvas_id: inserted?.id });
    return jsonResponse({ status: "ok", company_id, canvas_id: inserted?.id });
  } catch (err) {
    console.error("[refresh-positioning] unhandled error:", err);
    return jsonResponse({ error: String(err instanceof Error ? err.message : err) }, 500);
  }
});
