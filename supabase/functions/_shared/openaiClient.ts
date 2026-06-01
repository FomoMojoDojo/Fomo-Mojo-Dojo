// Shared OpenAI client utilities for edge functions — extracted from research-company

const PLAIN_LANGUAGE_RULES =
  "Writing style rules: Use clear, plain language that a non-expert can understand. " +
  "Avoid consulting jargon, business cliches, and buzzwords. " +
  "Prefer concrete wording over abstract phrasing. Keep sentences short and direct. " +
  "For ODI needs and outcomes, keep one idea per sentence and use everyday wording. " +
  "Prefer 'tracked decision results' over abstract phrasing like 'monitored decision outcomes'. " +
  "Only keep specialized terms when they are required by the evidence or provided explicitly by the user/client. " +
  "If source evidence includes direct quotes, preserve them verbatim. Do not paraphrase direct quotes. " +
  "If company-specific phrasing/taglines exist, keep them as-is and, when useful, add a separate optional suggestion prefixed exactly with 'Suggested clearer version:' rather than replacing the original wording.";

const STANDARD_MARKET_CATEGORY_GUIDANCE =
  "Use a standard, well-known market category anchor. " +
  "Preferred anchors: B2B SaaS, B2C SaaS, Marketplace, E-commerce, Professional Services, Healthcare Services, Financial Services, Education Services, Nonprofit Services, Hospitality/Foodservice, Logistics/Transportation, Manufacturing, Public Sector/Government. " +
  "If the company is niche, format as '<well-known category> for <specific job executor/job>' rather than inventing proprietary category names.";

async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit,
  timeoutMs = 240_000,
) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.toLowerCase().includes("abort")) {
      throw new Error(`OpenAI request timed out after ${Math.round(timeoutMs / 1000)}s`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseModelList(raw: string) {
  return Array.from(
    new Set(
      String(raw || "")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  );
}

function buildOpenAIModelCandidates(primaryModel: string, extraFallbacks: string[] = []) {
  const envFallbacks = parseModelList(
    Deno.env.get("OPENAI_FALLBACK_MODELS") ||
      Deno.env.get("OPENAI_FALLBACK_MODEL") ||
      "",
  );
  const defaultFallbacks = ["gpt-4.1-mini", "gpt-4.1-nano"];
  return Array.from(
    new Set(
      [primaryModel, ...extraFallbacks, ...envFallbacks, ...defaultFallbacks]
        .map((item) => String(item || "").trim())
        .filter(Boolean),
    ),
  );
}

function isTransientOpenAIHttpStatus(status: number, errText: string) {
  if ([408, 409, 429, 500, 502, 503, 504].includes(status)) return true;
  const text = String(errText || "").toLowerCase();
  return text.includes("upstream server is timing out") ||
    text.includes("temporarily unavailable") ||
    text.includes("request timed out") ||
    text.includes("timeout");
}

function isTransientOpenAIError(error: unknown) {
  const message = String(error instanceof Error ? error.message : error).toLowerCase();
  return message.includes("timed out") ||
    message.includes("timeout") ||
    message.includes("capacity") ||
    message.includes("overloaded") ||
    message.includes("rate limit") ||
    message.includes("429") ||
    message.includes("temporarily unavailable") ||
    message.includes("unterminated string in json") ||
    message.includes("unexpected end of json input");
}

function isModelFailoverEligibleError(error: unknown) {
  const message = String(error instanceof Error ? error.message : error).toLowerCase();
  return message.includes("429") ||
    message.includes("rate limit") ||
    message.includes("capacity") ||
    message.includes("overloaded") ||
    message.includes("temporarily unavailable") ||
    message.includes("service unavailable") ||
    message.includes("timed out") ||
    message.includes("timeout") ||
    message.includes("upstream");
}

function extractResponsesOutputText(data: unknown): string | null {
  const d = data as Record<string, unknown>;
  if (typeof d?.output_text === "string" && (d.output_text as string).trim()) {
    return d.output_text as string;
  }
  const out = Array.isArray(d?.output) ? (d.output as unknown[]) : [];
  for (const item of out) {
    const typedItem = item as Record<string, unknown>;
    if (typedItem?.type !== "message") continue;
    const content = Array.isArray(typedItem?.content) ? (typedItem.content as unknown[]) : [];
    for (const part of content) {
      const typedPart = part as Record<string, unknown>;
      if (
        typedPart?.type === "output_text" &&
        typeof typedPart?.text === "string" &&
        (typedPart.text as string).trim()
      ) {
        return typedPart.text as string;
      }
    }
  }
  return null;
}

async function callOpenAIJSON(opts: {
  apiKey: string;
  model: string;
  fallbackModels?: string[];
  schemaName: string;
  schema: unknown;
  systemText: string;
  userText: string;
  maxOutputTokens?: number;
  temperature?: number;
  requestTimeoutMs?: number;
  transientRetries?: number;
}) {
  const {
    apiKey,
    model,
    fallbackModels = [],
    schemaName,
    schema,
    systemText,
    userText,
    maxOutputTokens = 2000,
    temperature = 0.2,
    requestTimeoutMs = 240_000,
    transientRetries = 2,
  } = opts;

  const withSchemaContext = (error: unknown) => {
    const message = String(error instanceof Error ? error.message : error);
    if (message.startsWith(`[${schemaName}]`)) return new Error(message);
    return new Error(`[${schemaName}] ${message}`);
  };

  const buildBody = (activeModel: string, outputBudget: number, retryNote = "") => ({
    model: activeModel,
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

  const budgets = [
    maxOutputTokens,
    Math.round(maxOutputTokens * 1.75),
    Math.round(maxOutputTokens * 2.5),
  ].filter((value, index, arr) => Number.isFinite(value) && value > 0 && arr.indexOf(value) === index);

  const modelCandidates = buildOpenAIModelCandidates(model, fallbackModels);
  let lastModelError: unknown = null;

  for (let modelIndex = 0; modelIndex < modelCandidates.length; modelIndex++) {
    const activeModel = modelCandidates[modelIndex];
    let modelError: unknown = null;
    try {
      for (let attempt = 0; attempt < budgets.length; attempt++) {
        const retryNote =
          attempt === 0
            ? ""
            : "Your previous response was truncated or invalid JSON. Return the full JSON object in one complete response that exactly matches the schema.";

        let lastError: unknown = null;
        for (let transientAttempt = 0; transientAttempt <= transientRetries; transientAttempt++) {
          try {
            const resp = await fetchWithTimeout(
              "https://api.openai.com/v1/responses",
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${apiKey}`,
                },
                body: JSON.stringify(buildBody(activeModel, budgets[attempt], retryNote)),
              },
              requestTimeoutMs,
            );

            if (!resp.ok) {
              const errText = await resp.text();
              if (transientAttempt < transientRetries && isTransientOpenAIHttpStatus(resp.status, errText)) {
                await sleep(1200 * (transientAttempt + 1));
                continue;
              }
              throw withSchemaContext(`OpenAI error ${resp.status}: ${errText}`);
            }

            const data = await resp.json();
            const text = extractResponsesOutputText(data);
            if (!text) throw withSchemaContext("OpenAI response missing output_text");

            try {
              return JSON.parse(text);
            } catch (e) {
              const parseMessage = e instanceof Error ? e.message : String(e);
              const looksTruncated =
                parseMessage.toLowerCase().includes("unterminated") ||
                parseMessage.toLowerCase().includes("unexpected end") ||
                (text.trim().length > 0 && !text.trim().endsWith("}"));

              if (attempt < budgets.length - 1 && looksTruncated) {
                lastError = e;
                break;
              }
              throw withSchemaContext(e);
            }
          } catch (error) {
            lastError = error;
            if (transientAttempt < transientRetries && isTransientOpenAIError(error)) {
              await sleep(1200 * (transientAttempt + 1));
              continue;
            }
            throw withSchemaContext(error);
          }
        }

        if (lastError) throw withSchemaContext(lastError);
      }
    } catch (error) {
      modelError = error;
    }

    if (!modelError) {
      throw new Error(`[${schemaName}] OpenAI JSON generation failed without a concrete error.`);
    }

    lastModelError = modelError;
    const canFailover = modelIndex < modelCandidates.length - 1 && isModelFailoverEligibleError(modelError);
    if (canFailover) continue;
    throw withSchemaContext(modelError);
  }

  throw withSchemaContext(lastModelError || "OpenAI JSON generation failed after retries and model fallback.");
}

export {
  PLAIN_LANGUAGE_RULES,
  STANDARD_MARKET_CATEGORY_GUIDANCE,
  fetchWithTimeout,
  sleep,
  buildOpenAIModelCandidates,
  isTransientOpenAIHttpStatus,
  isTransientOpenAIError,
  isModelFailoverEligibleError,
  extractResponsesOutputText,
  callOpenAIJSON,
};
