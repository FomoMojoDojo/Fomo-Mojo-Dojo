import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { encodeBase64 } from "https://deno.land/std@0.168.0/encoding/base64.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const FILE_CATEGORIES = [
  "Research", "Strategy", "Competitive", "Brand", "Financial",
  "Positioning", "Marketing", "Customer Data", "Operations", "Legal", "Other",
];

const LOCAL_HOST_ALLOWLIST = new Set(["localhost", "127.0.0.1", "::1", "host.docker.internal"]);

interface InputArea {
  id: string;
  input_key?: string;
  group_key?: string;
  input_label: string;
  sub_group: string;
}

type FileMetadataResult = {
  suggested_tags: string[];
  suggested_input_id: string | null;
  cross_area_input_ids: string[];
  odi_needs_candidates: Array<{
    desired_outcome: string;
    importance: number;
    satisfaction: number;
  }>;
  other_area_signals: string[];
  parser_engine: string;
  extraction_source: string;
  reasoning: string;
};

function envFlag(name: string, fallback: boolean) {
  const raw = Deno.env.get(name);
  if (raw == null) return fallback;
  return ["1", "true", "yes", "on"].includes(raw.toLowerCase());
}

function isLocalOllamaUrl(rawUrl: string) {
  try {
    const url = new URL(rawUrl);
    return LOCAL_HOST_ALLOWLIST.has(String(url.hostname || "").trim().toLowerCase());
  } catch {
    return false;
  }
}

function isLocalUrl(rawUrl: string) {
  try {
    const url = new URL(rawUrl);
    return LOCAL_HOST_ALLOWLIST.has(String(url.hostname || "").trim().toLowerCase());
  } catch {
    return false;
  }
}

function extensionFromName(name: string) {
  const parts = String(name || "").toLowerCase().split(".");
  return parts.length > 1 ? parts[parts.length - 1] : "";
}

async function extractTextViaLocalParser(params: {
  parserUrl: string;
  fileName: string;
  fileType: string;
  bytes: Uint8Array;
}) {
  const { parserUrl, fileName, fileType, bytes } = params;
  const base64 = encodeBase64(bytes);
  const response = await fetch(parserUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      file_name: fileName,
      file_type: fileType,
      content_base64: base64,
    }),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Local parser error (${response.status}): ${text}`);
  }
  const data = await response.json().catch(() => ({}));
  const text = typeof data?.text === "string" ? data.text : "";
  const source = typeof data?.source === "string" ? data.source : "local_parser";
  return { text, source };
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

function clampScale(value: unknown, fallback: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(10, Math.round(parsed)));
}

function normalizeOdiCandidates(raw: unknown) {
  if (!Array.isArray(raw)) return [] as FileMetadataResult["odi_needs_candidates"];
  const normalized: FileMetadataResult["odi_needs_candidates"] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    const desired_outcome = String(record.desired_outcome || "").trim();
    if (!desired_outcome) continue;
    const key = desired_outcome.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    normalized.push({
      desired_outcome,
      importance: clampScale(record.importance, 7),
      satisfaction: clampScale(record.satisfaction, 4),
    });
    if (normalized.length >= 8) break;
  }
  return normalized;
}

function normalizeSignals(raw: unknown) {
  if (!Array.isArray(raw)) return [] as string[];
  const unique = new Set<string>();
  for (const item of raw) {
    const text = typeof item === "string" ? item.trim() : "";
    if (!text) continue;
    unique.add(text);
    if (unique.size >= 8) break;
  }
  return [...unique];
}

function normalizeFileMetadata(
  raw: Record<string, unknown>,
  inputAreas?: InputArea[],
  extraction?: { source?: string; text?: string },
): FileMetadataResult {
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

  const rawCrossAreas = Array.isArray(raw.cross_area_input_ids) ? raw.cross_area_input_ids : [];
  const crossAreaSet = new Set<string>();
  for (const item of rawCrossAreas) {
    if (typeof item !== "string") continue;
    const normalized = item.trim();
    if (!normalized) continue;
    if (!validInputIds.has(normalized)) continue;
    if (normalized === suggested_input_id) continue;
    crossAreaSet.add(normalized);
    if (crossAreaSet.size >= 6) break;
  }
  const cross_area_input_ids = [...crossAreaSet];

  const reasoningRaw = typeof raw.reasoning === "string" ? raw.reasoning.trim() : "";
  const reasoning = reasoningRaw || "Analysis completed using local model output.";

  return {
    suggested_tags,
    suggested_input_id,
    cross_area_input_ids,
    odi_needs_candidates: normalizeOdiCandidates(raw.odi_needs_candidates),
    other_area_signals: normalizeSignals(raw.other_area_signals),
    parser_engine: "local_ollama",
    extraction_source: String(extraction?.source || "none"),
    reasoning,
  };
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
    const OLLAMA_MODEL = Deno.env.get("OLLAMA_MODEL") ?? "llama3:70b";
    const LOCAL_PARSER_URL =
      Deno.env.get("LOCAL_PARSER_URL") ?? "http://host.docker.internal:8789/extract";
    if (!isLocalOllamaUrl(OLLAMA_BASE_URL)) {
      return new Response(JSON.stringify({
        error: "Local-only policy violation: OLLAMA_BASE_URL must be localhost/host.docker.internal.",
      }), {
        status: 412,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!isLocalUrl(LOCAL_PARSER_URL)) {
      return new Response(JSON.stringify({
        error: "Local-only policy violation: LOCAL_PARSER_URL must be localhost/host.docker.internal.",
      }), {
        status: 412,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { fileName, fileContent, extractionSource, filePath, fileType, inputAreas } = await req.json() as {
      fileName?: string;
      fileContent?: string;
      extractionSource?: string;
      filePath?: string;
      fileType?: string;
      inputAreas?: InputArea[];
    };

    if (!fileName) throw new Error("fileName is required");

    let effectiveFileContent = String(fileContent || "");
    let effectiveExtractionSource = String(extractionSource || "").trim() || "none";

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    if (!effectiveFileContent.trim() && filePath) {
      try {
        const { data: downloaded, error: downloadError } = await supabase
          .storage
          .from("input-files")
          .download(filePath);
        if (downloadError) throw downloadError;

        const bytes = new Uint8Array(await downloaded.arrayBuffer());
        const ext = extensionFromName(fileName);
        const normalizedType = String(fileType || downloaded.type || "").toLowerCase();
        if (
          normalizedType.startsWith("text/") ||
          normalizedType.includes("json") ||
          normalizedType.includes("csv") ||
          ["txt", "csv", "md", "json", "xml", "yaml", "yml", "toml"].includes(ext)
        ) {
          effectiveFileContent = await downloaded.text();
          effectiveExtractionSource = "local_text_reader";
        } else {
          const parsed = await extractTextViaLocalParser({
            parserUrl: LOCAL_PARSER_URL,
            fileName,
            fileType: normalizedType,
            bytes,
          });
          effectiveFileContent = parsed.text;
          effectiveExtractionSource = parsed.source;
        }

        if (effectiveFileContent.trim()) {
          const sidecarPath = `${filePath}.extracted.txt`;
          const sidecarBlob = new Blob([effectiveFileContent], { type: "text/plain;charset=utf-8" });
          await supabase.storage.from("input-files").upload(sidecarPath, sidecarBlob, {
            upsert: true,
            contentType: "text/plain;charset=utf-8",
          });
        }
      } catch (extractError) {
        console.error("analyze-file extraction failed:", extractError);
        effectiveExtractionSource = "local_parser_error";
      }
    }

    const systemPrompt = `You are a document classification assistant for a strategic consulting platform. 
Given a file name and optionally its text content, suggest:
1. Which tags from this list best apply: ${FILE_CATEGORIES.join(", ")}
2. Which strategic input area (from the provided list) this file most likely belongs to.
3. Any additional input areas this file could support as secondary evidence.
4. ODI need candidates found in the file, rewritten as solution-free desired outcomes when possible.
5. Other cross-area signals that could improve scoring context.

Be precise — only suggest tags that clearly apply. Suggest 1-4 tags. 
For the primary input area, pick the single best match or return null if unclear.
ODI candidates should follow desired-outcome structure and avoid prescribing a solution.`;

    const plainLanguageRule =
      "Use clear, plain language in reasoning. Avoid consulting jargon, business cliches, and buzzwords unless the source text explicitly uses them.";
    const quoteAndVoiceRule =
      "Preserve direct quotes exactly. If company-specific language or taglines are present, keep them unchanged. " +
      "If clarity help is useful, keep original wording and add a separate optional line prefixed with 'Suggested clearer version:'.";

    const userPrompt = `File name: "${fileName}"
${effectiveFileContent ? `\nFile content preview (first 2000 chars):\n${effectiveFileContent.slice(0, 2000)}` : ""}
${effectiveExtractionSource ? `\nText extraction source: ${effectiveExtractionSource}` : ""}
${inputAreas ? `\nAvailable input areas:\n${inputAreas.map((a) => `- ${a.id}: ${a.input_label} (${a.sub_group})`).join("\n")}` : ""}

Return your analysis.`;

    const response = await fetch(`${OLLAMA_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        messages: [
          { role: "system", content: `${systemPrompt}\n\n${plainLanguageRule}\n${quoteAndVoiceRule}` },
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
                  cross_area_input_ids: {
                    type: "array",
                    items: { type: "string" },
                    description: "Optional additional input IDs this file may support as secondary evidence",
                  },
                  odi_needs_candidates: {
                    type: "array",
                    description: "Optional ODI desired-outcome candidates inferred from this file",
                    items: {
                      type: "object",
                      properties: {
                        desired_outcome: { type: "string" },
                        importance: { type: "number" },
                        satisfaction: { type: "number" },
                      },
                      required: ["desired_outcome"],
                    },
                  },
                  other_area_signals: {
                    type: "array",
                    items: { type: "string" },
                    description: "Short notes about where this file likely contributes outside the primary area",
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
  "cross_area_input_ids": string[],
  "odi_needs_candidates": [{ "desired_outcome": string, "importance"?: number, "satisfaction"?: number }],
  "other_area_signals": string[],
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
            model: OLLAMA_MODEL,
            response_format: { type: "json_object" },
            messages: fallbackMessages,
          }),
        });

        if (!fallbackResponse.ok) {
          fallbackResponse = await fetch(`${OLLAMA_BASE_URL}/chat/completions`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              model: OLLAMA_MODEL,
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
        const normalized = normalizeFileMetadata(parsed, inputAreas, {
          source: effectiveExtractionSource,
          text: effectiveFileContent,
        });

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
    const result = normalizeFileMetadata(fromTools ?? fromContent ?? {}, inputAreas, {
      source: effectiveExtractionSource,
      text: effectiveFileContent,
    });

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
