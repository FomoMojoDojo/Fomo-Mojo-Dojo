import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  buildFrameworkBrief,
  getFrameworkRoutingPlan,
} from "../_shared/frameworkLibrary.ts";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
};

const PLAIN_LANGUAGE_RULES =
  "Writing style rules: Use clear, plain language that a non-expert can understand. " +
  "Avoid consulting jargon, business cliches, and buzzwords. " +
  "Prefer concrete wording over abstract phrasing. Keep sentences short and direct. " +
  "Never mention framework creator names in labels or recommendations. " +
  "If source evidence includes direct quotes, preserve them verbatim. " +
  "If company-specific phrasing/taglines exist, keep them unchanged and optionally add a second line prefixed exactly with 'Suggested clearer version:' if clarity is needed.";

type RecommendationRow = {
  title: string;
  recommendation: string;
  rationale: string;
  category: string;
  priority: "high" | "medium" | "low";
  confidence: number;
  source_basis: string;
  references: string[];
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function extractResponsesOutputText(data: any): string | null {
  if (typeof data?.output_text === "string" && data.output_text.trim()) return data.output_text;

  const out = Array.isArray(data?.output) ? data.output : [];
  for (const item of out) {
    if (item?.type !== "message") continue;
    const content = Array.isArray(item?.content) ? item.content : [];
    for (const part of content) {
      if (part?.type === "output_text" && typeof part?.text === "string" && part.text.trim()) {
        return part.text;
      }
    }
  }
  return null;
}

function isMissingTableError(error: unknown) {
  const err = error as { code?: string; message?: string } | null;
  const code = String(err?.code || "").trim();
  const message = String(err?.message || "").toLowerCase();
  return (
    code === "42P01" ||
    message.includes("could not find the table") ||
    message.includes("relation") && message.includes("does not exist")
  );
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function asText(value: unknown, fallback = "") {
  const text = typeof value === "string" ? value.trim() : "";
  return text.length > 0 ? text : fallback;
}

function sliceArray<T>(value: unknown, limit: number): T[] {
  return Array.isArray(value) ? (value as T[]).slice(0, limit) : [];
}

function pick(row: Record<string, unknown>, keys: string[]) {
  const out: Record<string, unknown> = {};
  for (const key of keys) {
    const value = row[key];
    if (value === undefined || value === null || value === "") continue;
    out[key] = value;
  }
  return out;
}

function truncateText(text: string, maxChars = 120_000) {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}\n\n[Context truncated by ${text.length - maxChars} characters]`;
}

async function callOpenAIJSON(opts: {
  apiKey: string;
  model: string;
  schemaName: string;
  schema: Record<string, unknown>;
  systemText: string;
  userText: string;
  maxOutputTokens?: number;
  temperature?: number;
}) {
  const {
    apiKey,
    model,
    schemaName,
    schema,
    systemText,
    userText,
    maxOutputTokens = 3500,
    temperature = 0.15,
  } = opts;

  const buildBody = (outputBudget: number, retryNote = "") => ({
    model,
    temperature,
    max_output_tokens: outputBudget,
    input: [
      {
        role: "system",
        content: [{
          type: "input_text",
          text: `${systemText}\n\n${PLAIN_LANGUAGE_RULES}${retryNote ? `\n\n${retryNote}` : ""}`,
        }],
      },
      { role: "user", content: [{ type: "input_text", text: userText }] },
    ],
    text: {
      format: {
        type: "json_schema",
        name: schemaName,
        strict: true,
        schema,
      },
    },
  });

  const budgets = [maxOutputTokens, Math.round(maxOutputTokens * 1.7)];

  for (let attempt = 0; attempt < budgets.length; attempt++) {
    const retryNote =
      attempt === 0
        ? ""
        : "Your previous response was truncated or invalid. Return one complete JSON object that exactly matches the schema.";

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(buildBody(budgets[attempt], retryNote)),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI error ${response.status}: ${errorText}`);
    }

    const payload = await response.json();
    const text = extractResponsesOutputText(payload);
    if (!text) throw new Error("OpenAI response missing output_text");

    try {
      return JSON.parse(text);
    } catch (error) {
      const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
      const truncated = message.includes("unterminated") || message.includes("unexpected end");
      if (attempt < budgets.length - 1 && truncated) continue;
      throw error;
    }
  }

  throw new Error("OpenAI JSON generation failed after retries");
}

async function fetchRowsOptional(
  supabase: ReturnType<typeof createClient>,
  table: string,
  companyId: string,
  limit = 300,
) {
  const { data, error } = await supabase
    .from(table)
    .select("*")
    .eq("company_id", companyId)
    .limit(limit);

  if (error) {
    if (isMissingTableError(error)) return [];
    throw error;
  }

  return Array.isArray(data) ? data : [];
}

async function fetchOptionalSingleLatest(
  supabase: ReturnType<typeof createClient>,
  table: string,
  companyId: string,
) {
  const { data, error } = await supabase
    .from(table)
    .select("*")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    if (isMissingTableError(error)) return null;
    throw error;
  }
  return data ?? null;
}

function normalizeRecommendations(raw: unknown): RecommendationRow[] {
  if (!Array.isArray(raw)) return [];

  return raw
    .map((item) => {
      const row = (item && typeof item === "object" ? item : {}) as Record<string, unknown>;
      const priorityRaw = asText(row.priority, "medium").toLowerCase();
      const priority: "high" | "medium" | "low" =
        priorityRaw === "high" || priorityRaw === "low" ? priorityRaw : "medium";
      const confidenceRaw = Number(row.confidence);

      return {
        title: asText(row.title, "Recommendation"),
        recommendation: asText(row.recommendation, ""),
        rationale: asText(row.rationale, ""),
        category: asText(row.category, "strategy").toLowerCase(),
        priority,
        confidence: Number.isFinite(confidenceRaw) ? clamp(Math.round(confidenceRaw), 0, 100) : 60,
        source_basis: asText(row.source_basis, "all_company_context"),
        references: sliceArray<string>(row.references, 8)
          .map((value) => asText(value, ""))
          .filter(Boolean),
      };
    })
    .filter((row) => row.recommendation.length > 0)
    .slice(0, 12);
}

function buildBaselineSummary(latestBaselineRun: Record<string, unknown> | null) {
  if (!latestBaselineRun) return null;

  const result = (latestBaselineRun.result_json && typeof latestBaselineRun.result_json === "object")
    ? latestBaselineRun.result_json as Record<string, unknown>
    : {};

  const evidenceLedger = sliceArray<Record<string, unknown>>(result.evidence_ledger, 8).map((entry) => ({
    bucket: asText(entry.bucket, "signal"),
    signal_strength: asText(entry.signal_strength, "unknown"),
    confidence: Number(entry.confidence) || null,
    snippet: asText(entry.snippet, "").slice(0, 220),
  }));

  return {
    id: latestBaselineRun.id ?? null,
    status: asText(latestBaselineRun.status, "unknown"),
    created_at: latestBaselineRun.created_at ?? null,
    category_archetype: asText(result.category_archetype, "unknown"),
    lens_card: result.lens_card ?? null,
    top_hypotheses: sliceArray<string>(result.top_hypotheses, 5),
    open_questions: sliceArray<string>(result.open_questions, 5),
    outside_voice_signals: sliceArray<Record<string, unknown>>(result.outside_voice_signals, 5).map((signal) => ({
      perspective: asText(signal.perspective, "outside_voice"),
      sentiment: asText(signal.sentiment, "unknown"),
      alignment: asText(signal.alignment, "unknown"),
      signal: asText(signal.signal, "").slice(0, 220),
      confidence: Number(signal.confidence) || null,
    })),
    evidence_ledger: evidenceLedger,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const startedAtIso = new Date().toISOString();
  let runId: string | null = null;
  let sourceSnapshot: Record<string, unknown> = {};

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

    const serviceClient = createClient(supabaseUrl, serviceRoleKey);
    const anonClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: userRes, error: authError } = await anonClient.auth.getUser();
    if (authError || !userRes?.user) return jsonResponse({ error: "Unauthorized" }, 401);
    const userId = userRes.user.id;

    const body = await req.json().catch(() => ({}));
    const companyId = asText(body?.company_id, "");
    if (!companyId) return jsonResponse({ error: "company_id is required" }, 400);

    const { data: accessibleCompany, error: accessErr } = await anonClient
      .from("companies")
      .select("id")
      .eq("id", companyId)
      .maybeSingle();

    if (accessErr) return jsonResponse({ error: accessErr.message }, 403);
    if (!accessibleCompany) return jsonResponse({ error: "Company not found or access denied" }, 404);

    const { data: company, error: companyErr } = await serviceClient
      .from("companies")
      .select("id,name,website,archetype,quarter,tier,mojo_score,potential_score,projected_score,evidence_status,evidence_note,area_scores_json,last_scored_at")
      .eq("id", companyId)
      .maybeSingle();

    if (companyErr || !company) {
      return jsonResponse({ error: companyErr?.message || "Company not found" }, 404);
    }

    const { data: runInsert, error: runInsertErr } = await serviceClient
      .from("council_review_runs")
      .insert({
        company_id: companyId,
        user_id: userId,
        model: openaiModel,
        status: "running",
        summary: "",
        source_snapshot_json: {},
      })
      .select("id")
      .single();

    if (runInsertErr || !runInsert?.id) {
      const errorMessage = runInsertErr?.message || "Failed to create council review run";
      return jsonResponse({ error: errorMessage }, 500);
    }
    runId = runInsert.id as string;

    const [
      latestBaselineRun,
      inputs,
      jobSteps,
      opportunities,
      routes,
      positioningCanvases,
      strategyCascades,
      strategyProblems,
      strategyAssumptions,
      odiMarketDefinitions,
      odiNeeds,
      deepDives,
    ] = await Promise.all([
      fetchOptionalSingleLatest(serviceClient, "public_baseline_runs", companyId),
      (async () => {
        const { data, error } = await serviceClient
          .from("inputs")
          .select("*, input_files(*)")
          .eq("company_id", companyId)
          .limit(500);
        if (error) throw error;
        return Array.isArray(data) ? data : [];
      })(),
      fetchRowsOptional(serviceClient, "job_steps", companyId, 500),
      fetchRowsOptional(serviceClient, "opportunities", companyId, 500),
      fetchRowsOptional(serviceClient, "routes", companyId, 500),
      fetchRowsOptional(serviceClient, "positioning_canvases", companyId, 20),
      fetchRowsOptional(serviceClient, "strategy_cascades", companyId, 20),
      fetchRowsOptional(serviceClient, "strategy_problem_statements", companyId, 200),
      fetchRowsOptional(serviceClient, "strategy_assumptions", companyId, 200),
      fetchRowsOptional(serviceClient, "odi_market_definitions", companyId, 50),
      fetchRowsOptional(serviceClient, "odi_needs", companyId, 500),
      fetchRowsOptional(serviceClient, "deep_dive_analyses", companyId, 200),
    ]);

    const normalizedInputs = inputs.map((item) => {
      const row = item as Record<string, unknown>;
      const files = Array.isArray(row.input_files) ? row.input_files as Record<string, unknown>[] : [];
      return {
        ...pick(row, [
          "id",
          "input_key",
          "label",
          "description",
          "group_key",
          "sub_group",
          "done",
          "completion",
          "frameworks_used",
          "context_summary",
          "source_tier",
          "updated_at",
          "created_at",
        ]),
        input_files: files.slice(0, 12).map((file) => pick(file, [
          "id",
          "file_name",
          "file_type",
          "tags",
          "uploaded_at",
        ])),
      };
    });

    const contextPayload = {
      company,
      baseline: buildBaselineSummary(latestBaselineRun as Record<string, unknown> | null),
      strategic_problems: strategyProblems.map((row) =>
        pick(row as Record<string, unknown>, [
          "id",
          "title",
          "statement",
          "source",
          "status",
          "decision_ask",
          "summary",
          "reconciliation_note",
          "created_at",
          "updated_at",
        ])
      ),
      strategy_assumptions: strategyAssumptions.map((row) =>
        pick(row as Record<string, unknown>, [
          "id",
          "assumption",
          "title",
          "status",
          "evidence_needed",
          "impact_level",
          "created_at",
          "updated_at",
          "source",
        ])
      ),
      inputs: normalizedInputs,
      job_steps: jobSteps.map((row) =>
        pick(row as Record<string, unknown>, [
          "id",
          "job_map_name",
          "job_step",
          "step_label",
          "title",
          "description",
          "desired_outcome",
          "importance",
          "satisfaction",
          "opportunity_score",
          "source_tier",
          "frameworks_used",
          "created_at",
          "updated_at",
        ])
      ),
      odi_market_definitions: odiMarketDefinitions.map((row) => row as Record<string, unknown>),
      odi_needs: odiNeeds.map((row) =>
        pick(row as Record<string, unknown>, [
          "id",
          "need_statement",
          "job_step",
          "importance",
          "satisfaction",
          "opportunity_score",
          "source_tier",
          "created_at",
          "updated_at",
        ])
      ),
      opportunities: opportunities.map((row) =>
        pick(row as Record<string, unknown>, [
          "id",
          "title",
          "description",
          "priority",
          "score",
          "impact",
          "effort",
          "source_tier",
          "frameworks_used",
          "created_at",
          "updated_at",
        ])
      ),
      routes: routes.map((row) =>
        pick(row as Record<string, unknown>, [
          "id",
          "title",
          "description",
          "pillar",
          "priority",
          "points",
          "source_tier",
          "frameworks_used",
          "steps",
          "evidence_needed",
          "why_this_matters",
          "created_at",
          "updated_at",
        ])
      ),
      positioning_canvases: positioningCanvases.map((row) => row as Record<string, unknown>),
      strategy_cascades: strategyCascades.map((row) => row as Record<string, unknown>),
      deep_dive_analyses: deepDives.map((row) =>
        pick(row as Record<string, unknown>, [
          "id",
          "area_key",
          "what_we_found",
          "why_it_matters",
          "what_good_looks_like",
          "path_forward",
          "holding_back",
          "generated_at",
          "updated_at",
        ])
      ),
    };

    sourceSnapshot = {
      started_at: startedAtIso,
      company_id: companyId,
      counts: {
        strategic_problems: contextPayload.strategic_problems.length,
        strategy_assumptions: contextPayload.strategy_assumptions.length,
        inputs: contextPayload.inputs.length,
        input_files: contextPayload.inputs.reduce((sum, row) => sum + ((row.input_files?.length as number) || 0), 0),
        job_steps: contextPayload.job_steps.length,
        odi_market_definitions: contextPayload.odi_market_definitions.length,
        odi_needs: contextPayload.odi_needs.length,
        opportunities: contextPayload.opportunities.length,
        routes: contextPayload.routes.length,
        positioning_canvases: contextPayload.positioning_canvases.length,
        strategy_cascades: contextPayload.strategy_cascades.length,
        deep_dive_analyses: contextPayload.deep_dive_analyses.length,
        has_public_baseline: Boolean(contextPayload.baseline),
      },
    };

    const frameworkGuidance = [
      buildFrameworkBrief("inputs", getFrameworkRoutingPlan("inputs")),
      buildFrameworkBrief("journeys", getFrameworkRoutingPlan("journeys")),
      buildFrameworkBrief("positioning", getFrameworkRoutingPlan("positioning")),
      buildFrameworkBrief("opportunities", getFrameworkRoutingPlan("opportunities")),
      buildFrameworkBrief("routes", getFrameworkRoutingPlan("routes")),
    ].join("\n\n");

    const contextJson = truncateText(JSON.stringify(contextPayload, null, 2), 125_000);
    const sourceSnapshotJson = JSON.stringify(sourceSnapshot, null, 2);

    const schema = {
      type: "object",
      additionalProperties: false,
      required: ["summary", "recommendations"],
      properties: {
        summary: { type: "string", minLength: 1, maxLength: 600 },
        recommendations: {
          type: "array",
          maxItems: 12,
          items: {
            type: "object",
            additionalProperties: false,
            required: [
              "title",
              "recommendation",
              "rationale",
              "category",
              "priority",
              "confidence",
              "source_basis",
              "references",
            ],
            properties: {
              title: { type: "string", minLength: 3, maxLength: 120 },
              recommendation: { type: "string", minLength: 8, maxLength: 900 },
              rationale: { type: "string", minLength: 8, maxLength: 900 },
              category: {
                type: "string",
                enum: ["strategy", "positioning", "jtbd", "execution", "evidence", "measurement", "routes"],
              },
              priority: { type: "string", enum: ["high", "medium", "low"] },
              confidence: { type: "integer", minimum: 0, maximum: 100 },
              source_basis: { type: "string", minLength: 3, maxLength: 120 },
              references: {
                type: "array",
                maxItems: 8,
                items: { type: "string", minLength: 2, maxLength: 180 },
              },
            },
          },
        },
      },
    };

    const systemText =
      "You are the MojoMap strategy council. Review all company context and produce recommendation cards that can be accepted or ignored by advisors. " +
      "Use a positioning-first and evidence-led approach across customer jobs, positioning clarity, strategy cascade coherence, and execution readiness. " +
      "Use weakest-link reasoning: if one critical area is weak, prioritize that first. " +
      "Never use framework creator names in output. " +
      "Do not pretend evidence exists when it does not. " +
      "When public claims and company-uploaded evidence conflict, call it out directly and explain the likely reason.";

    const userText =
      `Company context snapshot:\n${sourceSnapshotJson}\n\n` +
      `Applied framework guidance:\n${frameworkGuidance}\n\n` +
      `Full company context JSON:\n${contextJson}\n\n` +
      "Return recommendations that are clear next steps, include what evidence is missing, and identify likely causes for major gaps.";

    const parsed = await callOpenAIJSON({
      apiKey: openaiKey,
      model: openaiModel,
      schemaName: "council_company_recommendations",
      schema,
      systemText,
      userText,
      maxOutputTokens: 4200,
      temperature: 0.1,
    });

    const summary = asText(parsed?.summary, "Council review completed.");
    const recommendations = normalizeRecommendations(parsed?.recommendations);

    if (recommendations.length > 0) {
      const insertPayload = recommendations.map((item) => ({
        run_id: runId,
        company_id: companyId,
        user_id: userId,
        title: item.title,
        recommendation: item.recommendation,
        rationale: item.rationale,
        category: item.category,
        priority: item.priority,
        confidence: item.confidence,
        status: "pending",
        source_basis: item.source_basis,
        source_context_json: {
          references: item.references,
          source_snapshot: sourceSnapshot,
        },
      }));

      const { error: insertRecommendationError } = await serviceClient
        .from("council_recommendations")
        .insert(insertPayload);

      if (insertRecommendationError) throw insertRecommendationError;
    }

    const { error: runUpdateError } = await serviceClient
      .from("council_review_runs")
      .update({
        status: "completed",
        summary,
        source_snapshot_json: sourceSnapshot,
        recommendation_count: recommendations.length,
        updated_at: new Date().toISOString(),
      })
      .eq("id", runId);

    if (runUpdateError) throw runUpdateError;

    return jsonResponse({
      run_id: runId,
      summary,
      recommendation_count: recommendations.length,
      status: "completed",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.log("[council-review] error", message);

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (runId && supabaseUrl && serviceRoleKey) {
      const serviceClient = createClient(supabaseUrl, serviceRoleKey);
      await serviceClient
        .from("council_review_runs")
        .update({
          status: "failed",
          summary: message.slice(0, 500),
          source_snapshot_json: sourceSnapshot,
          updated_at: new Date().toISOString(),
        })
        .eq("id", runId);
    }

    return jsonResponse({ error: message }, 500);
  }
});
