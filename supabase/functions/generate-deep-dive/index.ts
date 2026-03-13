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

function envFlag(name: string, fallback: boolean) {
  const raw = Deno.env.get(name);
  if (raw == null) return fallback;
  return ["1", "true", "yes", "on"].includes(raw.toLowerCase());
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

Generate the analysis using the suggest_deep_dive tool. For path_forward, each step should have: step (string), duration (string), owner (string), impact_pts (number 1-10), action_label (optional string). For holding_back, each item should have: gap (string), description (string). Only include genuine remaining gaps — if evidence exists, don't list it as a gap.`;

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
      const t = await response.text();
      console.error("AI error:", response.status, t);
      throw new Error("AI analysis failed");
    }

    const aiData = await response.json();
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) throw new Error("No tool call in AI response");

    const analysis = JSON.parse(toolCall.function.arguments);

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
