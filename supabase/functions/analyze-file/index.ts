import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const FILE_CATEGORIES = [
  "Research", "Strategy", "Competitive", "Brand", "Financial",
  "Positioning", "Marketing", "Customer Data", "Operations", "Legal", "Other",
];

interface InputArea {
  id: string;
  input_label: string;
  sub_group: string;
}

type FileMetadataResult = {
  suggested_tags: string[];
  suggested_input_id: string | null;
  reasoning: string;
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

function normalizeFileMetadata(raw: Record<string, unknown>, inputAreas?: InputArea[]): FileMetadataResult {
  const allowedTags = new Set(FILE_CATEGORIES);
  const validInputIds = new Set((inputAreas ?? []).map((area) => area.id));

  const rawTags = Array.isArray(raw.suggested_tags) ? raw.suggested_tags : [];
  const suggested_tags = rawTags
    .filter((tag): tag is string => typeof tag === "string")
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0 && allowedTags.has(tag))
    .slice(0, 6);

  const rawInputId = typeof raw.suggested_input_id === "string" ? raw.suggested_input_id.trim() : "";
  const suggested_input_id =
    rawInputId && validInputIds.has(rawInputId) ? rawInputId : null;

  const reasoningRaw = typeof raw.reasoning === "string" ? raw.reasoning.trim() : "";
  const reasoning = reasoningRaw || "Analysis completed using local model output.";

  return { suggested_tags, suggested_input_id, reasoning };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    if (!envFlag("INTERNAL_AI_FILE_ANALYSIS_ENABLED", true)) {
      return new Response(JSON.stringify({
        error: "Internal file AI analysis is disabled. Upload still works, but tags and input suggestions must be chosen manually.",
      }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const OLLAMA_BASE_URL =
      Deno.env.get("OLLAMA_BASE_URL") ?? "http://host.docker.internal:11434/v1";

    const { fileName, fileContent, inputAreas } = await req.json() as {
      fileName?: string;
      fileContent?: string;
      inputAreas?: InputArea[];
    };

    if (!fileName) throw new Error("fileName is required");

    const systemPrompt = `You are a document classification assistant for a strategic consulting platform. 
Given a file name and optionally its text content, suggest:
1. Which tags from this list best apply: ${FILE_CATEGORIES.join(", ")}
2. Which strategic input area (from the provided list) this file most likely belongs to.

Be precise — only suggest tags that clearly apply. Suggest 1-4 tags. 
For the input area, pick the single best match or return null if unclear.`;

    const userPrompt = `File name: "${fileName}"
${fileContent ? `\nFile content preview (first 2000 chars):\n${fileContent.slice(0, 2000)}` : ""}
${inputAreas ? `\nAvailable input areas:\n${inputAreas.map((a) => `- ${a.id}: ${a.input_label} (${a.sub_group})`).join("\n")}` : ""}

Return your analysis.`;

    const response = await fetch(`${OLLAMA_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "llama3:70b",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "suggest_file_metadata",
              description: "Suggest tags and input area for an uploaded file",
              parameters: {
                type: "object",
                properties: {
                  suggested_tags: {
                    type: "array",
                    items: {
                      type: "string",
                      enum: FILE_CATEGORIES,
                    },
                    description: "1-4 tags from the predefined list",
                  },
                  suggested_input_id: {
                    type: "string",
                    description: "The ID of the best matching input area, or null",
                    nullable: true,
                  },
                  reasoning: {
                    type: "string",
                    description: "Brief explanation of why these tags and area were chosen",
                  },
                },
                required: ["suggested_tags", "reasoning"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "suggest_file_metadata" } },
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
  "suggested_tags": string[],
  "suggested_input_id": string | null,
  "reasoning": string
}
Only JSON, no markdown.`,
          },
          { role: "user", content: userPrompt },
        ];

        let fallbackResponse = await fetch(`${OLLAMA_BASE_URL}/chat/completions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "llama3:70b",
            response_format: { type: "json_object" },
            messages: fallbackMessages,
          }),
        });

        if (!fallbackResponse.ok) {
          fallbackResponse = await fetch(`${OLLAMA_BASE_URL}/chat/completions`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              model: "llama3:70b",
              messages: fallbackMessages,
            }),
          });

          if (!fallbackResponse.ok) {
            const fallbackText = await fallbackResponse.text();
            console.error("AI gateway fallback error:", fallbackResponse.status, fallbackText);
            throw new Error("AI analysis failed");
          }
        }

        const fallbackData = await fallbackResponse.json();
        const content = fallbackData?.choices?.[0]?.message?.content;
        const parsed = safeParseJsonObject(content) ?? {};
        const normalized = normalizeFileMetadata(parsed, inputAreas);

        return new Response(JSON.stringify(normalized), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limited, please try again" }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted" }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      console.error("AI gateway error:", response.status, t);
      throw new Error("AI analysis failed");
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];

    const fromTools = typeof toolCall?.function?.arguments === "string"
      ? safeParseJsonObject(toolCall.function.arguments)
      : null;
    const fromContent = safeParseJsonObject(data?.choices?.[0]?.message?.content);
    const result = normalizeFileMetadata(fromTools ?? fromContent ?? {}, inputAreas);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("analyze-file error:", err);
    const message = err instanceof Error ? err.message : "Unknown analyze-file error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
