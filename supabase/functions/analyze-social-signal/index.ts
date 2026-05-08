import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ── Types ─────────────────────────────────────────────────────────────────────

type SourceType = "reddit" | "forum" | "review" | "other";

interface RequestBody {
  need_id: string;
  text: string;
  source_type: SourceType;
}

export interface SocialExtraction {
  customer_problems: string[];
  repeated_themes: string[];
  emotional_language: string[];
  possible_needs: string[];
  suggested_job_step: string | null;
  confidence: "early" | "inferred";
  validated: false;
  extracted_at: string;
  model: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const LOCAL_HOST_ALLOWLIST = new Set(["localhost", "127.0.0.1", "::1", "host.docker.internal"]);

function isLocalOllamaUrl(rawUrl: string) {
  try {
    const url = new URL(rawUrl);
    return LOCAL_HOST_ALLOWLIST.has(String(url.hostname || "").trim().toLowerCase());
  } catch {
    return false;
  }
}

function safeStringArray(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((v) => String(v ?? "").trim()).filter(Boolean);
}

function parseExtraction(raw: unknown): Omit<SocialExtraction, "confidence" | "validated" | "extracted_at" | "model"> {
  if (!raw || typeof raw !== "object") {
    return { customer_problems: [], repeated_themes: [], emotional_language: [], possible_needs: [], suggested_job_step: null };
  }
  const r = raw as Record<string, unknown>;
  return {
    customer_problems: safeStringArray(r.customer_problems),
    repeated_themes:   safeStringArray(r.repeated_themes),
    emotional_language: safeStringArray(r.emotional_language),
    possible_needs:    safeStringArray(r.possible_needs),
    suggested_job_step: typeof r.suggested_job_step === "string" && r.suggested_job_step.trim()
      ? r.suggested_job_step.trim()
      : null,
  };
}

// ── Edge function ─────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const OLLAMA_BASE_URL =
      Deno.env.get("OLLAMA_BASE_URL") ?? "http://host.docker.internal:11434/v1";
    const OLLAMA_MODEL = Deno.env.get("OLLAMA_MODEL") ?? "llama3:70b";
    const OLLAMA_TIMEOUT_MS = 30_000;

    if (!isLocalOllamaUrl(OLLAMA_BASE_URL)) {
      return new Response(JSON.stringify({ error: "Local-only policy: OLLAMA_BASE_URL must point to localhost." }), {
        status: 412,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body: RequestBody = await req.json();
    const { need_id, text, source_type } = body;

    if (!need_id || !text?.trim()) {
      return new Response(JSON.stringify({ error: "need_id and text are required." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sourceLabel: Record<SourceType, string> = {
      reddit: "Reddit post or comment",
      forum:  "forum thread",
      review: "product or service review",
      other:  "social conversation",
    };

    const systemPrompt =
      "You are a customer research analyst. " +
      "Given a piece of social content — a Reddit post, forum comment, review, or similar — " +
      "extract signal that may reveal real customer problems or unmet needs. " +
      "Be conservative: extract only what is clearly present in the text. " +
      "Use plain, direct language. No consulting jargon. " +
      "Do not invent or infer beyond what the text shows. " +
      "This is early-stage signal, not validated customer evidence.";

    const userPrompt =
      `Source type: ${sourceLabel[source_type] ?? "social content"}\n\n` +
      `Content:\n${text.trim().slice(0, 3000)}\n\n` +
      "Extract the following from this content.";

    const toolDef = {
      type: "function",
      function: {
        name: "extract_social_signal",
        description: "Extract customer signal from a social post or comment",
        parameters: {
          type: "object",
          properties: {
            customer_problems: {
              type: "array",
              items: { type: "string" },
              description: "Specific problems or frustrations the author describes. Quote or closely paraphrase the text. Max 5.",
            },
            repeated_themes: {
              type: "array",
              items: { type: "string" },
              description: "Topics or patterns that appear more than once in the text. Max 4.",
            },
            emotional_language: {
              type: "array",
              items: { type: "string" },
              description: "Words or phrases showing frustration, urgency, or strong feeling. Copy from text directly. Max 6.",
            },
            possible_needs: {
              type: "array",
              items: { type: "string" },
              description: "Restate each problem as a solution-free desired outcome. Use the format: verb + object. Example: 'find the right provider quickly'. Max 5.",
            },
            suggested_job_step: {
              type: "string",
              description: "The job-to-be-done step this content most likely belongs to. Examples: 'Evaluate options', 'Onboard and set up', 'Troubleshoot problems'. One phrase only, or null if unclear.",
              nullable: true,
            },
          },
          required: ["customer_problems", "repeated_themes", "emotional_language", "possible_needs"],
          additionalProperties: false,
        },
      },
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), OLLAMA_TIMEOUT_MS);

    let rawResult: Record<string, unknown> = {};

    try {
      const resp = await fetch(`${OLLAMA_BASE_URL}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          model: OLLAMA_MODEL,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user",   content: userPrompt },
          ],
          tools: [toolDef],
          tool_choice: { type: "function", function: { name: "extract_social_signal" } },
        }),
      });

      if (resp.ok) {
        const json = await resp.json();
        const toolCall = json?.choices?.[0]?.message?.tool_calls?.[0];
        if (toolCall?.function?.arguments) {
          try {
            rawResult = JSON.parse(toolCall.function.arguments);
          } catch {
            rawResult = {};
          }
        }
      } else {
        // Fallback: ask for plain JSON if tools unsupported
        const toolsUnsupported = resp.status === 400;
        if (toolsUnsupported) {
          const fallback = await fetch(`${OLLAMA_BASE_URL}/chat/completions`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            signal: controller.signal,
            body: JSON.stringify({
              model: OLLAMA_MODEL,
              messages: [
                { role: "system", content: systemPrompt + "\n\nRespond with JSON only, no other text." },
                {
                  role: "user",
                  content:
                    userPrompt +
                    '\n\nReturn a JSON object with keys: customer_problems (array of strings), repeated_themes (array), emotional_language (array), possible_needs (array), suggested_job_step (string or null).',
                },
              ],
              format: "json",
            }),
          });
          if (fallback.ok) {
            const fb = await fallback.json();
            const content = fb?.choices?.[0]?.message?.content ?? "";
            try {
              rawResult = JSON.parse(content);
            } catch {
              rawResult = {};
            }
          }
        }
      }
    } finally {
      clearTimeout(timeout);
    }

    const parsed = parseExtraction(rawResult);

    const extraction: SocialExtraction = {
      ...parsed,
      confidence: "early",
      validated: false,
      extracted_at: new Date().toISOString(),
      model: OLLAMA_MODEL,
    };

    // Write the extraction back to the odi_needs row.
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const { error: updateErr } = await supabase
      .from("odi_needs")
      .update({ social_extraction_json: extraction })
      .eq("id", need_id);

    if (updateErr) {
      console.error("Failed to write extraction:", updateErr.message);
    }

    return new Response(JSON.stringify(extraction), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("analyze-social-signal error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
