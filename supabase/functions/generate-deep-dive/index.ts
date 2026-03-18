import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const AREA_LABELS: Record<string, string> = {
  positioning: "Positioning & Story",
  strategy: "Program Strategy",
  product: "Service Delivery",
  marketing: "Awareness & Outreach",
  sales: "Referral Pipeline",
  cx: "Family Experience",
};

const AREA_INPUT_MAP: Record<string, string[]> = {
  positioning: ["Positioning"],
  strategy: ["Strategy"],
  product: ["Service Delivery"],
  marketing: ["Awareness"],
  sales: ["Referral Pipeline", "Fundraising"],
  cx: ["Family Experience", "Fundraising"],
};

type DeepDiveResult = {
  why_it_matters: string;
  what_we_found: string;
  what_good_looks_like: string;
  path_forward: Array<{
    step: string;
    duration: string;
    owner: string;
    impact_pts: number;
    action_label?: string;
  }>;
  holding_back: Array<{
    gap: string;
    description: string;
  }>;
};

function envFlag(name: string, fallback: boolean) {
  const raw = Deno.env.get(name);
  if (raw == null) return fallback;
  return ["1", "true", "yes", "on"].includes(raw.toLowerCase());
}

function safeParseJsonObject(input: unknown): Record<string, unknown> | null {
  if (typeof input !== "string") return null;
  const trimmed = input.trim();
  if (!trimmed) return null;

  try {
    const parsed = JSON.parse(trimmed);
    if (parsed && typeof parsed === "object") return parsed as Record<string, unknown>;
  } catch {
    // fall through
  }

  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) {
    const slice = trimmed.slice(start, end + 1);
    try {
      const parsed = JSON.parse(slice);
      if (parsed && typeof parsed === "object") return parsed as Record<string, unknown>;
    } catch {
      return null;
    }
  }
  return null;
}

function asText(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : fallback;
}

function normalizeDeepDive(raw: Record<string, unknown>, areaLabel: string): DeepDiveResult {
  const rawPath = Array.isArray(raw.path_forward) ? raw.path_forward : [];
  const rawGaps = Array.isArray(raw.holding_back) ? raw.holding_back : [];

  const path_forward = rawPath
    .map((item) => (item && typeof item === "object" ? item as Record<string, unknown> : null))
    .filter((item): item is Record<string, unknown> => !!item)
    .map((item) => {
      const step = asText(item.step, "");
      const duration = asText(item.duration, "2-4 weeks");
      const owner = asText(item.owner, "Strategy Team");
      const impactRaw = Number(item.impact_pts);
      const impact_pts = Number.isFinite(impactRaw)
        ? Math.max(1, Math.min(10, Math.round(impactRaw)))
        : 3;
      const action_label = asText(item.action_label, "");
      return {
        step,
        duration,
        owner,
        impact_pts,
        ...(action_label ? { action_label } : {}),
      };
    })
    .filter((item) => item.step.length > 0)
    .slice(0, 8);

  const holding_back = rawGaps
    .map((item) => (item && typeof item === "object" ? item as Record<string, unknown> : null))
    .filter((item): item is Record<string, unknown> => !!item)
    .map((item) => ({
      gap: asText(item.gap, ""),
      description: asText(item.description, ""),
    }))
    .filter((item) => item.gap.length > 0 && item.description.length > 0)
    .slice(0, 10);

  return {
    why_it_matters: asText(
      raw.why_it_matters,
      `${areaLabel} directly affects overall strategic execution and success probability.`,
    ),
    what_we_found: asText(
      raw.what_we_found,
      "Current evidence is incomplete for this area. Upload files and re-run analysis to refine findings.",
    ),
    what_good_looks_like: asText(
      raw.what_good_looks_like,
      "A high-performing state combines clear strategy, validated evidence, and repeatable execution.",
    ),
    path_forward,
    holding_back,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    if (!envFlag("INTERNAL_AI_DEEP_DIVE_ENABLED", true)) {
      return new Response(JSON.stringify({
        error: "Internal deep-dive AI is disabled for this environment.",
      }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const OLLAMA_BASE_URL =
      Deno.env.get("OLLAMA_BASE_URL") ?? "http://host.docker.internal:11434/v1";

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "No auth" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const anonClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user }, error: authErr } = await anonClient.auth.getUser();
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { area_key, company_id } = await req.json();
    if (!area_key || !AREA_LABELS[area_key]) {
      return new Response(JSON.stringify({ error: "Invalid area_key" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (!company_id) {
      return new Response(JSON.stringify({ error: "company_id is required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: companyAccess, error: companyErr } = await anonClient
      .from("companies")
      .select("id")
      .eq("id", company_id)
      .maybeSingle();
    if (companyErr || !companyAccess) {
      return new Response(JSON.stringify({ error: "Unauthorized company access" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Get inputs for this area
    const subGroups = AREA_INPUT_MAP[area_key] || [];
    const { data: inputs } = await supabase
      .from("inputs")
      .select("*")
      .eq("user_id", user.id)
      .eq("company_id", company_id);

    const areaInputs = (inputs || []).filter((i: any) =>
      subGroups.some((sg) => i.sub_group.includes(sg))
    );

    // Get subitems for area inputs
    const inputIds = areaInputs.map((i: any) => i.id);
    const { data: subitems } = inputIds.length > 0
      ? await supabase.from("input_subitems").select("*").in("input_id", inputIds)
      : { data: [] };

    // Get files for area inputs
    const { data: files } = inputIds.length > 0
      ? await supabase.from("input_files").select("*").in("input_id", inputIds)
      : { data: [] };

    // Build context for AI
    const inputContext = areaInputs.map((input: any) => {
      const inputSubs = (subitems || []).filter((s: any) => s.input_id === input.id);
      const inputFiles = (files || []).filter((f: any) => f.input_id === input.id);
      return {
        label: input.input_label,
        sub_group: input.sub_group,
        completeness: input.completeness,
        status: input.status,
        score_impact: input.score_impact,
        description: input.description,
        why_it_matters: input.why_it_matters,
        subitems_done: inputSubs.filter((s: any) => s.done).map((s: any) => s.name),
        subitems_remaining: inputSubs.filter((s: any) => !s.done).map((s: any) => s.name),
        files_attached: inputFiles.map((f: any) => ({ name: f.file_name, tags: f.tags })),
      };
    });

    // Read text content from uploaded files (first 3000 chars each, max 3 files)
    const fileContents: string[] = [];
    const textFiles = (files || []).filter((f: any) =>
      /\.(txt|csv|md|json)$/i.test(f.file_name)
    ).slice(0, 3);

    for (const tf of textFiles) {
      try {
        const { data: fileData } = await supabase.storage.from("input-files").download(tf.file_path);
        if (fileData) {
          const text = await fileData.text();
          fileContents.push(`--- ${tf.file_name} ---\n${text.slice(0, 3000)}`);
        }
      } catch { /* skip unreadable */ }
    }

    const systemPrompt = `You are a strategic analyst for a consulting platform. Generate a deep-dive analysis for the "${AREA_LABELS[area_key]}" area based on actual client data.

Your output must reflect what evidence EXISTS (uploaded files, completed checklist items) vs what's MISSING (incomplete items, no files).

When files have been uploaded for an input, acknowledge this as evidence that work has been done — do NOT say "no data exists" if files are present.

Be specific, reference actual file names and completed items. Use markdown bold (**text**) for emphasis.`;

    const userPrompt = `Area: ${AREA_LABELS[area_key]}

Input status for this area:
${JSON.stringify(inputContext, null, 2)}

${fileContents.length > 0 ? `\nFile contents:\n${fileContents.join("\n\n")}` : ""}

Generate the analysis as structured data. For path_forward, each step should have: step (string), duration (string), owner (string), impact_pts (number 1-10), action_label (optional string). For holding_back, each item should have: gap (string), description (string). Only include genuine remaining gaps — if evidence exists, don't list it as a gap.`;

const response = await fetch(`${OLLAMA_BASE_URL}/chat/completions`, {
        method: "POST",
      headers: {
Authorization: "Bearer ollama",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "llama3:70b",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        tools: [{
          type: "function",
          function: {
            name: "suggest_deep_dive",
            description: "Generate deep dive analysis for a strategic area",
            parameters: {
              type: "object",
              properties: {
                why_it_matters: { type: "string", description: "Why this area matters strategically (2-3 sentences)" },
                what_we_found: { type: "string", description: "Detailed analysis of current state based on evidence. Use markdown bold. Multiple paragraphs separated by \\n\\n." },
                what_good_looks_like: { type: "string", description: "Benchmark description of excellence in this area (2-3 sentences)" },
                path_forward: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      step: { type: "string" },
                      duration: { type: "string" },
                      owner: { type: "string" },
                      impact_pts: { type: "number" },
                      action_label: { type: "string" },
                    },
                    required: ["step", "duration", "owner", "impact_pts"],
                  },
                },
                holding_back: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      gap: { type: "string" },
                      description: { type: "string" },
                    },
                    required: ["gap", "description"],
                  },
                },
              },
              required: ["why_it_matters", "what_we_found", "what_good_looks_like", "path_forward", "holding_back"],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "suggest_deep_dive" } },
      }),
    });

    if (!response.ok) {
      const t = await response.text();
      const toolUnsupported = response.status === 400 && t.includes("does not support tools");

      if (toolUnsupported) {
        const fallbackMessages = [
          {
            role: "system",
            content: `${systemPrompt}

Return STRICT JSON with shape:
{
  "why_it_matters": string,
  "what_we_found": string,
  "what_good_looks_like": string,
  "path_forward": [{ "step": string, "duration": string, "owner": string, "impact_pts": number, "action_label"?: string }],
  "holding_back": [{ "gap": string, "description": string }]
}
Only JSON, no markdown wrapper.`,
          },
          { role: "user", content: userPrompt },
        ];

        let fallbackResponse = await fetch(`${OLLAMA_BASE_URL}/chat/completions`, {
          method: "POST",
          headers: {
            Authorization: "Bearer ollama",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "llama3:70b",
            response_format: { type: "json_object" },
            messages: fallbackMessages,
          }),
        });

        if (!fallbackResponse.ok) {
          fallbackResponse = await fetch(`${OLLAMA_BASE_URL}/chat/completions`, {
            method: "POST",
            headers: {
              Authorization: "Bearer ollama",
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: "llama3:70b",
              messages: fallbackMessages,
            }),
          });

          if (!fallbackResponse.ok) {
            const fallbackText = await fallbackResponse.text();
            console.error("AI fallback error:", fallbackResponse.status, fallbackText);
            throw new Error("AI analysis failed");
          }
        }

        const fallbackData = await fallbackResponse.json();
        const parsed = safeParseJsonObject(fallbackData?.choices?.[0]?.message?.content) ?? {};
        const analysis = normalizeDeepDive(parsed, AREA_LABELS[area_key]);

        const { error: upsertErr } = await supabase
          .from("deep_dive_analyses")
          .upsert({
            user_id: user.id,
            company_id,
            area_key,
            why_it_matters: analysis.why_it_matters,
            what_we_found: analysis.what_we_found,
            what_good_looks_like: analysis.what_good_looks_like,
            path_forward: analysis.path_forward,
            holding_back: analysis.holding_back,
            generated_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }, { onConflict: "user_id,company_id,area_key" });

        if (upsertErr) throw upsertErr;

        return new Response(JSON.stringify(analysis), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limited, try again shortly" }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted" }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      console.error("AI error:", response.status, t);
      throw new Error("AI analysis failed");
    }

    const aiData = await response.json();
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    const parsedFromTools =
      typeof toolCall?.function?.arguments === "string"
        ? safeParseJsonObject(toolCall.function.arguments)
        : null;
    const parsedFromContent = safeParseJsonObject(aiData?.choices?.[0]?.message?.content);
    const analysis = normalizeDeepDive(
      parsedFromTools ?? parsedFromContent ?? {},
      AREA_LABELS[area_key],
    );

    // Upsert into deep_dive_analyses
    const { error: upsertErr } = await supabase
      .from("deep_dive_analyses")
      .upsert({
        user_id: user.id,
        company_id,
        area_key,
        why_it_matters: analysis.why_it_matters,
        what_we_found: analysis.what_we_found,
        what_good_looks_like: analysis.what_good_looks_like,
        path_forward: analysis.path_forward,
        holding_back: analysis.holding_back,
        generated_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id,company_id,area_key" });

    if (upsertErr) throw upsertErr;

    return new Response(JSON.stringify(analysis), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("generate-deep-dive error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
