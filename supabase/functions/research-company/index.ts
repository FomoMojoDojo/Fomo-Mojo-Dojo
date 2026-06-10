// supabase/functions/research-company/index.ts
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  buildFrameworkBrief,
  getFrameworkRoutingPlan,
} from "../_shared/frameworkLibrary.ts";
import {
  JTBD_CHECKPOINT_COUNT,
  buildCompanyVocabExclusions,
  containsSolutionPrescriptiveLanguage,
  normalizeToEightCheckpointSpine,
  validateEightCheckpointSpine,
} from "../_shared/jtbdProcess.ts";
import {
  ensureRequiredFrameworkKeys,
  validateParentChildOpportunityDistinctness,
  validateDesiredOutcome,
  validateOpportunity,
  validateOutcomeOpportunityDistinctness,
  validateSolutionIdea,
  validateSolutionTest,
} from "../_shared/opportunityTreeSemantics.ts";
import {
  composeDesiredOutcomeFromParts,
  deriveDesiredOutcomeParts,
  normalizeDesiredOutcomeDirection,
  classifyProblemType,
  deriveEvidenceLevel,
  EVIDENCE_CONFIDENCE_CEILING,
  type ProblemType,
  type EvidenceLevel,
} from "../_shared/desiredOutcome.ts";
import {
  getIndustryStepAnchors,
  anchorsToPromptBlock,
  inferStandardMarketCategory as inferAnchorCategory,
} from "../_shared/industryStepAnchors.ts";
import {
  buildRouteWhyThisMattersNarrative,
  rewriteRouteLanguage,
} from "../../../src/lib/routeLanguage.ts";

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

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

type BaselineSourceFilters = {
  exclude_domains: string[];
};

function normalizeDomainValue(value: string) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split("/")[0]
    .split("?")[0]
    .split("#")[0]
    .trim();
}

function normalizeBaselineSourceFilters(value: unknown): BaselineSourceFilters {
  const record = asRecord(value) ?? {};
  const excludeRaw = Array.isArray(record.exclude_domains) ? record.exclude_domains : [];
  return {
    exclude_domains: Array.from(
      new Set(
        excludeRaw
          .map((entry) => normalizeDomainValue(String(entry || "")))
          .filter(Boolean),
      ),
    ),
  };
}

function getUrlHost(value: string) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const candidate = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    return new URL(candidate).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

function domainMatches(host: string, domain: string) {
  if (!host || !domain) return false;
  return host === domain || host.endsWith(`.${domain}`);
}

function isBlockedByDomainPolicy(url: string, filters: BaselineSourceFilters) {
  if (!url || filters.exclude_domains.length === 0) return false;
  const host = getUrlHost(url);
  if (!host) return false;
  return filters.exclude_domains.some((domain) => domainMatches(host, domain));
}

function pruneBlockedReferencesFromBaseline(value: unknown, filters: BaselineSourceFilters): unknown {
  if (value === null || value === undefined) return value;

  if (typeof value === "string") {
    const candidate = value.trim();
    if (/^https?:\/\//i.test(candidate) && isBlockedByDomainPolicy(candidate, filters)) {
      return undefined;
    }
    return value;
  }

  if (Array.isArray(value)) {
    return value
      .map((entry) => pruneBlockedReferencesFromBaseline(entry, filters))
      .filter((entry) => entry !== undefined);
  }

  const record = asRecord(value);
  if (!record) return value;

  const urlCandidate = typeof record.url === "string" ? record.url.trim() : "";
  if (urlCandidate && isBlockedByDomainPolicy(urlCandidate, filters)) {
    return undefined;
  }

  const sourceUrlCandidate = typeof record.source_url === "string" ? record.source_url.trim() : "";
  if (sourceUrlCandidate && isBlockedByDomainPolicy(sourceUrlCandidate, filters)) {
    return undefined;
  }

  const output: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(record)) {
    const cleaned = pruneBlockedReferencesFromBaseline(entry, filters);
    if (cleaned !== undefined) output[key] = cleaned;
  }
  return output;
}

function addMinutesIso(minutes: number) {
  return new Date(Date.now() + minutes * 60_000).toISOString();
}

async function acquireCompanyRunLock(args: {
  supabase: ReturnType<typeof createClient>;
  companyId: string;
  userId: string;
  operation: string;
  ttlMinutes?: number;
}) {
  const ttlMinutes = args.ttlMinutes ?? 30;

  await args.supabase
    .from("company_run_locks")
    .delete()
    .eq("company_id", args.companyId)
    .lt("expires_at", new Date().toISOString());

  const { error } = await args.supabase
    .from("company_run_locks")
    .insert({
      company_id: args.companyId,
      operation: args.operation,
      started_by: args.userId,
      expires_at: addMinutesIso(ttlMinutes),
    });

  if (!error) return null;

  const { data: existing } = await args.supabase
    .from("company_run_locks")
    .select("operation, started_at, expires_at")
    .eq("company_id", args.companyId)
    .maybeSingle();

  return {
    error,
    existing,
  };
}

async function releaseCompanyRunLock(supabase: ReturnType<typeof createClient>, companyId: string) {
  const { error } = await supabase.from("company_run_locks").delete().eq("company_id", companyId);
  if (error) {
    console.log("[research-company] lock release error", error.message);
  }
}

function startCompanyRunLockHeartbeat(args: {
  supabase: ReturnType<typeof createClient>;
  companyId: string;
  ttlMinutes: number;
  intervalMs?: number;
}) {
  const intervalMs = args.intervalMs ?? 5 * 60_000;

  const timer = setInterval(async () => {
    const { error } = await args.supabase
      .from("company_run_locks")
      .update({ expires_at: addMinutesIso(args.ttlMinutes) })
      .eq("company_id", args.companyId);

    if (error) {
      console.log("[research-company] lock heartbeat error", error.message);
    }
  }, intervalMs);

  return () => clearInterval(timer);
}

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

function avg(nums: number[]) {
  if (!nums.length) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function roundInt(n: number) {
  return Math.round(n);
}

const STANDARD_MARKET_CATEGORY_PATTERNS: Array<{ label: string; pattern: RegExp }> = [
  { label: "B2B SaaS", pattern: /\b(b2b|enterprise|business)\b.*\b(saas|software|platform)\b|\benterprise software\b|\bbusiness software\b/i },
  { label: "B2C SaaS", pattern: /\bb2c\b.*\b(saas|software|platform)\b|\bconsumer software\b/i },
  { label: "Marketplace", pattern: /\bmarketplace\b/i },
  { label: "E-commerce", pattern: /\be-?commerce\b|\bonline retail\b/i },
  { label: "Professional Services", pattern: /\bconsult(ing|ancy)?\b|\bagency\b|\bprofessional services?\b/i },
  { label: "Healthcare Services", pattern: /\bhealth\s?care\b|\bmental health\b|\bclinic\b/i },
  { label: "Financial Services", pattern: /\bfintech\b|\bfinancial services?\b|\bbanking\b|\binsurance\b|\blending\b|\bdebt\b|\bcollections?\b/i },
  { label: "Education Services", pattern: /\bedtech\b|\beducation\b|\blearning\b|\bschool\b/i },
  { label: "Nonprofit Services", pattern: /\bnon-?profit\b|\bphilanthrop(y|ic)\b|\bdonor\b|\bgrant\b/i },
  { label: "Hospitality / Foodservice", pattern: /\bhospitality\b|\bfoodservice\b|\bcafe\b|\brestaurant\b|\bcoffee\b/i },
  { label: "Logistics / Transportation", pattern: /\blogistics\b|\btransport(ation)?\b|\bdelivery\b|\bmobility\b|\bfreight\b/i },
  { label: "Manufacturing", pattern: /\bmanufacturing\b|\bindustrial\b|\bfactory\b/i },
  { label: "Public Sector / Government", pattern: /\bpublic sector\b|\bgovernment\b|\bcivic\b|\bmunicipal\b/i },
];

function inferStandardMarketCategory(...values: unknown[]) {
  const corpus = values
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .join(" ");
  if (!corpus) return "";
  for (const candidate of STANDARD_MARKET_CATEGORY_PATTERNS) {
    if (candidate.pattern.test(corpus)) return candidate.label;
  }
  return "";
}

function normalizeMarketCategoryValue(rawValue: unknown, ...context: unknown[]) {
  const raw = String(rawValue || "")
    .replace(/^\s*category\s*:\s*/i, "")
    .replace(/\s+/g, " ")
    .trim();
  const inferred = inferStandardMarketCategory(raw, ...context);
  if (!raw) return inferred || "unknown";
  if (!inferred) return raw;
  if (raw.toLowerCase() === inferred.toLowerCase()) return inferred;
  if (raw.toLowerCase().startsWith(`${inferred.toLowerCase()} for `)) return raw;
  if (raw.toLowerCase().includes(inferred.toLowerCase())) return raw;
  if (/^[a-z0-9/&\-\s]{2,80}$/i.test(raw) && /\bfor\b/i.test(raw)) {
    return `${inferred} for ${raw.replace(/^.*?\bfor\b\s*/i, "").trim()}`;
  }
  return inferred;
}

function normalizeWhereToPlayValue(whereToPlayValue: unknown, normalizedMarketCategory: string) {
  const value = String(whereToPlayValue || "").replace(/\s+/g, " ").trim();
  const category = String(normalizedMarketCategory || "").trim();
  if (!value) return category ? `Category: ${category}.` : "Category: unknown.";
  if (/^\s*category\s*:/i.test(value)) return value;
  return category ? `Category: ${category}. ${value}` : value;
}

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

function buildBaselineBrief(baselineResultJson: unknown): string {
  const baseline = baselineResultJson as {
    category_archetype?: string;
    lens_card?: {
      primary_buyer?: string;
      chooser?: string;
      user?: string;
      adoption_constraints?: string;
      value_chain?: string;
      risk_surface?: string;
      economic_engine?: string;
    };
    evidence_ledger?: Array<{
      bucket?: string;
      snippet?: string;
      signal_strength?: string;
      confidence?: number;
    }>;
    top_hypotheses?: string[];
    open_questions?: string[];
    market_initiative_success?: {
      proven?: boolean;
      low_pct?: number;
      typical_pct?: number;
      high_pct?: number;
      source?: string;
      as_of?: string;
      confidence?: number;
      evidence_urls?: string[];
    };
    message_alignment?: {
      alignment_status?: string;
      alignment_summary?: string;
      outside_voice_posture?: string;
    };
    outside_voice_signals?: Array<{
      perspective?: string;
      sentiment?: string;
      alignment?: string;
      signal?: string;
      confidence?: number;
    }>;
  } | null;

  if (!baseline) return "No public baseline available.";

  const lens = baseline.lens_card ?? {};
  const evidence = Array.isArray(baseline.evidence_ledger)
    ? baseline.evidence_ledger.slice(0, 8)
    : [];
  const hypotheses = Array.isArray(baseline.top_hypotheses)
    ? baseline.top_hypotheses.slice(0, 4)
    : [];
  const openQuestions = Array.isArray(baseline.open_questions)
    ? baseline.open_questions.slice(0, 3)
    : [];
  const alignment = baseline.message_alignment ?? {};
  const marketSuccess = baseline.market_initiative_success ?? {};
  const outsideSignals = Array.isArray(baseline.outside_voice_signals)
    ? baseline.outside_voice_signals.slice(0, 3)
    : [];

  return [
    `Category archetype: ${baseline.category_archetype || "unknown"}`,
    `Primary buyer: ${lens.primary_buyer || "unknown"}`,
    `Chooser: ${lens.chooser || "unknown"}`,
    `User: ${lens.user || "unknown"}`,
    `Adoption constraints: ${lens.adoption_constraints || "unknown"}`,
    `Value chain: ${lens.value_chain || "unknown"}`,
    `Risk surface: ${lens.risk_surface || "unknown"}`,
    `Economic engine: ${lens.economic_engine || "unknown"}`,
    `Market initiative success baseline: proven=${marketSuccess.proven === true ? "yes" : "no"} | range=${marketSuccess.low_pct ?? "?"}-${marketSuccess.high_pct ?? "?"}% | typical=${marketSuccess.typical_pct ?? "?"}% | source=${marketSuccess.source || "unknown"} | as_of=${marketSuccess.as_of || "unknown"} | conf=${marketSuccess.confidence ?? "?"}`,
    `Message alignment: ${alignment.alignment_status || "unknown"}${alignment.alignment_summary ? ` — ${alignment.alignment_summary}` : ""}`,
    `Outside voice posture: ${alignment.outside_voice_posture || "unknown"}`,
    evidence.length
      ? `Evidence:\n${evidence
          .map(
            (item, index) =>
              `${index + 1}. [${item.bucket || "signal"} | ${item.signal_strength || "unknown"} | conf ${item.confidence ?? "?"}] ${item.snippet || "No snippet"}`
          )
          .join("\n")}`
      : "Evidence: none",
    outsideSignals.length
      ? `Outside voice signals:\n${outsideSignals
          .map(
            (item, index) =>
              `${index + 1}. [${item.perspective || "outside voice"} | ${item.sentiment || "unknown"} | ${item.alignment || "unknown"} | conf ${item.confidence ?? "?"}] ${item.signal || "No signal"}`
          )
          .join("\n")}`
      : "Outside voice signals: none",
    hypotheses.length ? `Top hypotheses:\n- ${hypotheses.join("\n- ")}` : "Top hypotheses: none",
    openQuestions.length ? `Open questions:\n- ${openQuestions.join("\n- ")}` : "Open questions: none",
  ].join("\n");
}

type UploadedEvidenceInputRow = {
  id?: string | null;
  input_key?: string | null;
  input_label?: string | null;
  description?: string | null;
  why_it_matters?: string | null;
};

type UploadedEvidenceFileRow = {
  input_id?: string | null;
  file_name?: string | null;
  file_path?: string | null;
  tags?: string[] | null;
  uploaded_at?: string | null;
};

function compactSnippet(value: unknown, maxChars = 220) {
  const text = String(value || "")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return "";
  if (text.length <= maxChars) return text;
  return `${text.slice(0, Math.max(0, maxChars - 1)).trim()}…`;
}

async function buildUploadedEvidenceContext(args: {
  supabase: ReturnType<typeof createClient>;
  companyId: string;
}) {
  const { supabase, companyId } = args;

  const { data: inputRows, error: inputErr } = await supabase
    .from("inputs")
    .select("id,input_key,input_label,description,why_it_matters")
    .eq("company_id", companyId)
    .limit(240);

  if (inputErr) {
    console.log("[research-company] uploaded evidence input fetch error:", inputErr.message);
  }

  const inputs = (Array.isArray(inputRows) ? inputRows : []) as UploadedEvidenceInputRow[];
  const inputById = new Map<string, UploadedEvidenceInputRow>();
  for (const row of inputs) {
    const id = String(row?.id || "").trim();
    if (!id) continue;
    inputById.set(id, row);
  }

  const inputIds = Array.from(inputById.keys());
  const { data: fileRows, error: filesErr } = inputIds.length > 0
    ? await supabase
        .from("input_files")
        .select("input_id,file_name,file_path,tags,uploaded_at")
        .in("input_id", inputIds)
        .order("uploaded_at", { ascending: false })
        .limit(120)
    : { data: [] as UploadedEvidenceFileRow[], error: null as { message?: string } | null };

  if (filesErr) {
    console.log("[research-company] uploaded evidence file fetch error:", filesErr.message);
  }

  const files = (Array.isArray(fileRows) ? fileRows : []) as UploadedEvidenceFileRow[];
  const fileCount = files.length;

  const inputCoverage = new Set<string>();
  const tagCounts = new Map<string, number>();
  for (const file of files) {
    const inputId = String(file?.input_id || "").trim();
    if (inputId) inputCoverage.add(inputId);
    const tags = Array.isArray(file?.tags) ? file.tags : [];
    for (const tag of tags) {
      const normalized = String(tag || "").trim();
      if (!normalized) continue;
      tagCounts.set(normalized, (tagCounts.get(normalized) ?? 0) + 1);
    }
  }

  const topTags = Array.from(tagCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([tag]) => tag);

  const sampleRows = files.slice(0, 6);
  const sampleLines: string[] = [];
  for (let index = 0; index < sampleRows.length; index++) {
    const file = sampleRows[index];
    const inputMeta = inputById.get(String(file?.input_id || "").trim());
    const inputKey = String(inputMeta?.input_key || "").trim();
    const inputLabel = String(inputMeta?.input_label || "").trim();
    const inputHint = compactSnippet(inputMeta?.description || inputMeta?.why_it_matters || "", 90);
    const tags = Array.isArray(file?.tags) ? file.tags.map((tag) => String(tag || "").trim()).filter(Boolean) : [];
    let extractedSnippet = "";
    const filePath = String(file?.file_path || "").trim();

    if (filePath) {
      const sidecarPath = `${filePath}.extracted.txt`;
      const { data: sidecar, error: sidecarErr } = await supabase.storage.from("input-files").download(sidecarPath);
      if (!sidecarErr && sidecar) {
        try {
          extractedSnippet = compactSnippet(await sidecar.text(), 210);
        } catch {
          extractedSnippet = "";
        }
      }
    }

    const row = [
      `${index + 1}. ${String(file?.file_name || "uploaded_file")}`,
      `input=${inputKey || inputLabel || "unknown"}`,
      tags.length ? `tags=${tags.slice(0, 4).join(", ")}` : "tags=none",
      inputHint ? `hint=${inputHint}` : "",
      extractedSnippet ? `excerpt=${extractedSnippet}` : "",
    ]
      .filter(Boolean)
      .join(" | ");
    sampleLines.push(row);
  }

  const briefParts = [
    fileCount > 0
      ? `Uploaded company evidence: ${fileCount} file(s) mapped across ${inputCoverage.size} input area(s).`
      : "Uploaded company evidence: none.",
    topTags.length > 0 ? `Top uploaded tags: ${topTags.join(", ")}` : "",
    sampleLines.length > 0 ? `Uploaded evidence samples:\n${sampleLines.join("\n")}` : "",
  ].filter(Boolean);

  return {
    fileCount,
    inputCoverageCount: inputCoverage.size,
    brief: briefParts.join("\n\n").slice(0, 6000),
  };
}

type StrategicProblemStatement = {
  id?: string;
  statement: string;
  source: "client" | "intake" | "company" | "public" | "evidence";
  status: "open" | "reconciled";
  reconciliation_note?: string;
};

function normalizeStrategicProblemSource(value: unknown): StrategicProblemStatement["source"] {
  const source = String(value || "").trim().toLowerCase();
  if (source === "intake" || source === "company" || source === "public" || source === "evidence") {
    return source;
  }
  return "client";
}

function normalizeStrategicProblemStatus(value: unknown): StrategicProblemStatement["status"] {
  return String(value || "").trim().toLowerCase() === "reconciled" ? "reconciled" : "open";
}

function normalizeStrategicProblems(rows: unknown): StrategicProblemStatement[] {
  if (!Array.isArray(rows)) return [];
  return rows
    .map((row) => {
      const item = row as Record<string, unknown>;
      const statement = String(item?.statement || "").trim();
      if (!statement) return null;
      const normalized: StrategicProblemStatement = {
        id: typeof item?.id === "string" ? item.id : undefined,
        statement,
        source: normalizeStrategicProblemSource(item?.source),
        status: normalizeStrategicProblemStatus(item?.status),
      };
      const note = String(item?.reconciliation_note || "").trim();
      if (note) normalized.reconciliation_note = note;
      return normalized;
    })
    .filter((item): item is StrategicProblemStatement => item !== null);
}

function buildStrategicProblemBrief(problems: StrategicProblemStatement[]): string {
  if (!problems.length) {
    return "No client-stated strategic problems recorded yet. Keep outputs grounded in evidence and surface what problem framing still needs clarification.";
  }

  const open = problems.filter((item) => item.status !== "reconciled");
  const reconciled = problems.filter((item) => item.status === "reconciled");
  const lines = problems.slice(0, 12).map((item, index) => {
    const note = item.reconciliation_note ? ` | note: ${item.reconciliation_note}` : "";
    return `${index + 1}. [${item.source} | ${item.status}] ${item.statement}${note}`;
  });

  return [
    `${problems.length} strategic problem statement(s) captured.`,
    `${open.length} open, ${reconciled.length} reconciled.`,
    `Use these as reference for prioritization, tradeoffs, and what must be true.`,
    `Strategic problems:\n${lines.join("\n")}`,
  ].join("\n");
}

type StrategicAssumptionStatement = {
  id?: string;
  assumption: string;
  source: "client" | "intake" | "company" | "public" | "evidence";
  status: "untested" | "validating" | "validated" | "invalidated";
  note?: string;
};

function normalizeStrategicAssumptionStatus(value: unknown): StrategicAssumptionStatement["status"] {
  const status = String(value || "").trim().toLowerCase();
  if (status === "validating" || status === "validated" || status === "invalidated") return status;
  return "untested";
}

function normalizeStrategicAssumptions(rows: unknown): StrategicAssumptionStatement[] {
  if (!Array.isArray(rows)) return [];
  return rows
    .map((row) => {
      const item = row as Record<string, unknown>;
      const assumption = String(item?.assumption || "").trim();
      if (!assumption) return null;

      const normalized: StrategicAssumptionStatement = {
        id: typeof item?.id === "string" ? item.id : undefined,
        assumption,
        source: normalizeStrategicProblemSource(item?.source),
        status: normalizeStrategicAssumptionStatus(item?.status),
      };
      const note = String(item?.note || "").trim();
      if (note) normalized.note = note;
      return normalized;
    })
    .filter((item): item is StrategicAssumptionStatement => item !== null);
}

function buildStrategicAssumptionBrief(assumptions: StrategicAssumptionStatement[]): string {
  if (!assumptions.length) {
    return "No manually tracked strategic assumptions recorded yet.";
  }

  const pending = assumptions.filter((item) => item.status === "untested" || item.status === "validating").length;
  const validated = assumptions.filter((item) => item.status === "validated").length;
  const invalidated = assumptions.filter((item) => item.status === "invalidated").length;
  const lines = assumptions.slice(0, 16).map((item, index) => {
    const note = item.note ? ` | note: ${item.note}` : "";
    return `${index + 1}. [${item.source} | ${item.status}] ${item.assumption}${note}`;
  });

  return [
    `${assumptions.length} strategic assumption(s) tracked manually.`,
    `${pending} pending validation, ${validated} validated, ${invalidated} invalidated.`,
    `Strategic assumptions:\n${lines.join("\n")}`,
  ].join("\n");
}

const INPUT_PUBLIC_EVIDENCE_WEIGHTS: Record<string, number> = {
  "comp-alt": 0.8,
  "unique-attr": 0.75,
  "val-prop": 0.72,
  "target-aud": 0.65,
  "market-cat": 0.68,
  "operating-model": 0.72,
  "customer-research": 0.55,
  "outcome-evidence": 0.4,
  "acquisition-map": 0.38,
  "brand-narrative": 0.45,
  "channel-strat": 0.3,
  "retention-signals": 0.22,
  "demand-pipeline": 0.24,
  "customer-signals": 0.22,
};

const INPUT_BASE_IMPACT_BY_KEY: Record<string, number> = {
  "comp-alt": 9.0,
  "unique-attr": 8.0,
  "val-prop": 7.0,
  "target-aud": 6.0,
  "market-cat": 7.0,
  "operating-model": 6.0,
  "customer-research": 5.0,
  "outcome-evidence": 6.0,
  "acquisition-map": 5.5,
  "brand-narrative": 5.0,
  "channel-strat": 5.5,
  "retention-signals": 4.5,
  "demand-pipeline": 4.5,
  "customer-signals": 4.0,
};

type InputContextMode = "nonprofit" | "commercial" | "unknown";
type InputBusinessProfile =
  | "nonprofit"
  | "fintech_collections"
  | "hospitality_coffee"
  | "telecom_saas"
  | "legal_services"
  | "mobility_aviation"
  | "generic_commercial";

function inferInputContextMode(args: {
  companyName: string;
  website: string;
  baselineResultJson: any | null;
}): InputContextMode {
  const textParts: string[] = [];
  textParts.push(String(args.companyName || ""));
  textParts.push(String(args.website || ""));
  textParts.push(String(args.baselineResultJson?.category_archetype || ""));
  textParts.push(String(args.baselineResultJson?.lens_card?.economic_engine || ""));
  textParts.push(String(args.baselineResultJson?.lens_card?.primary_buyer || ""));
  textParts.push(String(args.baselineResultJson?.lens_card?.chooser || ""));
  textParts.push(String(args.baselineResultJson?.lens_card?.user || ""));

  const evidenceLedger = Array.isArray(args.baselineResultJson?.evidence_ledger)
    ? args.baselineResultJson.evidence_ledger
    : [];
  for (const entry of evidenceLedger.slice(0, 10)) {
    textParts.push(String(entry?.bucket || ""));
    textParts.push(String(entry?.snippet || ""));
  }

  const text = textParts.join(" ").toLowerCase();

  const nonprofitSignals = [
    "nonprofit",
    "donor",
    "grant",
    "fundraising",
    "philanthropy",
    "foundation giving",
    "charity",
    "mission-driven",
  ];
  const commercialSignals = [
    "cafe",
    "coffee",
    "restaurant",
    "retail",
    "ecommerce",
    "revenue",
    "customer",
    "subscription",
    "wholesale",
    "pricing",
    "sales",
  ];

  const nonprofitScore = nonprofitSignals.reduce((score, signal) => score + (text.includes(signal) ? 1 : 0), 0);
  const commercialScore = commercialSignals.reduce((score, signal) => score + (text.includes(signal) ? 1 : 0), 0);

  if (nonprofitScore >= commercialScore + 2) return "nonprofit";
  if (commercialScore >= nonprofitScore + 1) return "commercial";
  return "unknown";
}

function inferInputBusinessProfile(args: {
  companyName: string;
  website: string;
  baselineResultJson: any | null;
  mode: InputContextMode;
}): InputBusinessProfile {
  if (args.mode === "nonprofit") return "nonprofit";

  const textParts: string[] = [];
  textParts.push(String(args.companyName || ""));
  textParts.push(String(args.website || ""));
  textParts.push(String(args.baselineResultJson?.category_archetype || ""));
  textParts.push(String(args.baselineResultJson?.lens_card?.economic_engine || ""));
  textParts.push(String(args.baselineResultJson?.lens_card?.primary_buyer || ""));
  textParts.push(String(args.baselineResultJson?.lens_card?.chooser || ""));
  textParts.push(String(args.baselineResultJson?.lens_card?.user || ""));

  const evidenceLedger = Array.isArray(args.baselineResultJson?.evidence_ledger)
    ? args.baselineResultJson.evidence_ledger
    : [];
  for (const entry of evidenceLedger.slice(0, 8)) {
    textParts.push(String(entry?.bucket || ""));
    textParts.push(String(entry?.snippet || ""));
  }
  const text = textParts.join(" ").toLowerCase();

  if (/\bindebted\b|\bdebt\b|\bcollections?\b|\bcreditor\b|\bfintech\b/.test(text)) {
    return "fintech_collections";
  }
  if (/\bcafe\b|\bcoffee\b|\broast|\broastery\b|\bboutique cafe\b|\bbarra\b/.test(text)) {
    return "hospitality_coffee";
  }
  if (/\btelecom\b|\bcarrier\b|\bdealer network\b|\bwireless retail\b|\bpos\b/.test(text)) {
    return "telecom_saas";
  }
  if (/\blaw\b|\blitigation\b|\btoxic tort\b|\bmesothelioma\b|\blegal\b|\bclaimant\b/.test(text)) {
    return "legal_services";
  }
  if (/\baviation\b|\bair taxi\b|\bevtol\b|\bflight\b|\burban air mobility\b/.test(text)) {
    return "mobility_aviation";
  }

  return "generic_commercial";
}

function applyProfileSpecificInputNaming(args: {
  key: string;
  profile: InputBusinessProfile;
  inputLabel: string;
  subGroup: string;
  description: string;
  whyItMatters: string;
  notApplicable: boolean;
}) {
  let { key, profile, inputLabel, subGroup, description, whyItMatters, notApplicable } = args;

  const setRetentionFields = (label: string, sub: string, desc: string, why: string) => {
    inputLabel = label;
    subGroup = sub;
    if (notApplicable) description = desc;
    if (notApplicable) whyItMatters = why;
  };

  if (profile === "fintech_collections") {
    if (key === "val-prop") inputLabel = "Recovery Value Themes";
    else if (key === "target-aud") inputLabel = "Best-Fit Creditors";
    else if (key === "operating-model") inputLabel = "Collections Operating Model";
    else if (key === "customer-research") { inputLabel = "Creditor & Debtor Jobs"; subGroup = "ODI"; }
    else if (key === "outcome-evidence") { inputLabel = "Recovery Outcome Evidence"; subGroup = "ODI"; }
    else if (key === "acquisition-map") { inputLabel = "Acquisition & Partner Channels"; subGroup = "GTM"; }
    else if (key === "brand-narrative") { inputLabel = "Trust & Compliance Story"; subGroup = "Messaging"; }
    else if (key === "channel-strat") { inputLabel = "Enterprise GTM Channels"; subGroup = "GTM"; }
    else if (key === "retention-signals") setRetentionFields("Client Retention", "Retention", "Client renewal and account expansion behavior", "Protects recurring enterprise revenue");
    else if (key === "demand-pipeline") setRetentionFields("Enterprise Pipeline", "Demand Pipeline", "Qualified creditor opportunities and procurement stages", "Predicts near-term contracted revenue");
    else if (key === "customer-signals") setRetentionFields("Debtor Experience Signals", "Customer Experience", "Complaint trends, resolution quality, and fairness sentiment", "Reduces compliance and reputational risk");
  } else if (profile === "hospitality_coffee") {
    if (key === "val-prop") inputLabel = "Roaster Value Themes";
    else if (key === "target-aud") inputLabel = "Best-Fit Buyers";
    else if (key === "operating-model") inputLabel = "Roaster Operating Model";
    else if (key === "customer-research") { inputLabel = "Buyer & Partner Jobs"; subGroup = "ODI"; }
    else if (key === "outcome-evidence") { inputLabel = "Cup Quality Evidence"; subGroup = "ODI"; }
    else if (key === "acquisition-map") { inputLabel = "Wholesale Acquisition Sources"; subGroup = "GTM"; }
    else if (key === "brand-narrative") { inputLabel = "Origin & Craft Story"; subGroup = "Messaging"; }
    else if (key === "channel-strat") { inputLabel = "Wholesale + DTC Channels"; subGroup = "GTM"; }
    else if (key === "retention-signals") setRetentionFields("Repeat Purchase Retention", "Retention", "Reorder frequency and wholesale account retention", "Protects recurring coffee revenue");
    else if (key === "demand-pipeline") setRetentionFields("Wholesale Pipeline", "Demand Pipeline", "Qualified cafe and restaurant partnership opportunities", "Predicts future wholesale volume");
    else if (key === "customer-signals") setRetentionFields("Customer Experience Signals", "Customer Experience", "Ratings, tasting feedback, and partner NPS", "Guides product quality and service improvements");
  } else if (profile === "telecom_saas") {
    if (key === "val-prop") inputLabel = "Platform Value Themes";
    else if (key === "target-aud") inputLabel = "Best-Fit Carrier Segments";
    else if (key === "operating-model") inputLabel = "Platform Operating Model";
    else if (key === "customer-research") { inputLabel = "Operator Jobs"; subGroup = "ODI"; }
    else if (key === "outcome-evidence") { inputLabel = "Adoption Evidence"; subGroup = "ODI"; }
    else if (key === "acquisition-map") { inputLabel = "Partner Acquisition Sources"; subGroup = "GTM"; }
    else if (key === "brand-narrative") { inputLabel = "Platform Positioning Story"; subGroup = "Messaging"; }
    else if (key === "channel-strat") { inputLabel = "Carrier GTM Channels"; subGroup = "GTM"; }
  } else if (profile === "legal_services") {
    if (key === "val-prop") inputLabel = "Case Value Themes";
    else if (key === "target-aud") inputLabel = "Best-Fit Claimants";
    else if (key === "operating-model") inputLabel = "Litigation Operating Model";
    else if (key === "customer-research") { inputLabel = "Claimant Decision Jobs"; subGroup = "ODI"; }
    else if (key === "outcome-evidence") { inputLabel = "Case Outcome Evidence"; subGroup = "ODI"; }
    else if (key === "acquisition-map") { inputLabel = "Case Referral Sources"; subGroup = "GTM"; }
    else if (key === "brand-narrative") { inputLabel = "Advocacy Story"; subGroup = "Messaging"; }
    else if (key === "channel-strat") { inputLabel = "Claim Intake Channels"; subGroup = "GTM"; }
  } else if (profile === "mobility_aviation") {
    if (key === "val-prop") inputLabel = "Mobility Value Themes";
    else if (key === "target-aud") inputLabel = "Best-Fit Riders & Partners";
    else if (key === "operating-model") inputLabel = "Flight Operating Model";
    else if (key === "customer-research") { inputLabel = "Rider & Partner Jobs"; subGroup = "ODI"; }
    else if (key === "outcome-evidence") { inputLabel = "Flight Readiness Evidence"; subGroup = "ODI"; }
    else if (key === "acquisition-map") { inputLabel = "Partnership Acquisition Sources"; subGroup = "GTM"; }
    else if (key === "brand-narrative") { inputLabel = "Mobility Story"; subGroup = "Messaging"; }
    else if (key === "channel-strat") { inputLabel = "Route Launch Channels"; subGroup = "GTM"; }
  } else if (profile === "generic_commercial") {
    if (key === "val-prop") inputLabel = "Value Themes";
    else if (key === "target-aud") inputLabel = "Best-Fit Customers";
    else if (key === "operating-model") inputLabel = "Operating Model";
    else if (key === "customer-research") { inputLabel = "Customer Jobs"; subGroup = "ODI"; }
    else if (key === "outcome-evidence") { inputLabel = "Outcome Evidence"; subGroup = "ODI"; }
    else if (key === "acquisition-map") { inputLabel = "Acquisition Sources"; subGroup = "GTM"; }
    else if (key === "brand-narrative") { inputLabel = "Positioning Story"; subGroup = "Messaging"; }
    else if (key === "channel-strat") { inputLabel = "GTM Channels"; subGroup = "GTM"; }
    else if (key === "retention-signals") setRetentionFields("Customer Retention", "Retention", "Repeat purchase and reorder behavior", "Protects recurring revenue and loyalty");
    else if (key === "demand-pipeline") setRetentionFields("Growth Pipeline", "Demand Pipeline", "Qualified leads and wholesale opportunities", "Predicts near-term revenue growth");
    else if (key === "customer-signals") setRetentionFields("Customer Satisfaction", "Customer Experience", "Ratings, reviews, and repeat sentiment", "Signals fit, quality, and retention risk");
  }

  return { inputLabel, subGroup, description, whyItMatters };
}

function replaceCompanyLeak(text: string, companyName: string): string {
  const safe = String(text || "");
  const target = String(companyName || "").trim();
  if (!target) return safe;
  if (/edgewood/i.test(target)) return safe;
  if (!/edgewood/i.test(safe)) return safe;
  return safe
    .replace(/\bEdgewood Center for Children & Families\b/gi, target)
    .replace(/\bEdgewood\b/gi, target);
}

function contextualizeInputForCompany(args: {
  input: any;
  mode: InputContextMode;
  profile: InputBusinessProfile;
  companyName: string;
}) {
  const raw = args.input ?? {};
  const key = String(raw?.input_key || "").trim();

  let inputLabel = replaceCompanyLeak(String(raw?.input_label || ""), args.companyName);
  let subGroup = replaceCompanyLeak(String(raw?.sub_group || ""), args.companyName);
  let description = replaceCompanyLeak(String(raw?.description || ""), args.companyName);
  let whyItMatters = replaceCompanyLeak(String(raw?.why_it_matters || ""), args.companyName);

  const combined = `${inputLabel} ${subGroup} ${description} ${whyItMatters}`.toLowerCase();
  const notApplicable = /not applicable|not relevant|n\/a/.test(combined);
  const shouldCommercialize = args.mode === "commercial" || (args.mode !== "nonprofit" && notApplicable);

  if (shouldCommercialize) {
    const mapped = applyProfileSpecificInputNaming({
      key,
      profile: args.profile,
      inputLabel,
      subGroup,
      description,
      whyItMatters,
      notApplicable,
    });
    inputLabel = mapped.inputLabel;
    subGroup = mapped.subGroup;
    description = mapped.description;
    whyItMatters = mapped.whyItMatters;
  }

  const needsOdiSignal = (text: string) =>
    !/\bodi\b|\bjob\b|\boutcome\b|\bimportance\b|\bsatisfaction\b/.test(String(text || "").toLowerCase());
  if (key === "customer-research") {
    if (needsOdiSignal(description)) {
      description = "Customer job map and desired outcomes by segment";
    }
    if (needsOdiSignal(whyItMatters)) {
      whyItMatters = "Shows what matters most and where current results are falling short";
    }
  }
  if (key === "outcome-evidence") {
    if (needsOdiSignal(description)) {
      description = "Track desired outcome satisfaction and completion signals";
    }
    if (needsOdiSignal(whyItMatters)) {
      whyItMatters = "Confirms progress on high-importance outcomes that are still underserved";
    }
  }
  if (key === "acquisition-map") {
    if (needsOdiSignal(description)) {
      description = "Map decision triggers and trusted channels customers use";
    }
    if (needsOdiSignal(whyItMatters)) {
      whyItMatters = "Shows where customers discover, evaluate, and choose with confidence";
    }
  }

  return {
    ...raw,
    input_label: inputLabel,
    sub_group: subGroup,
    description,
    why_it_matters: whyItMatters,
  };
}

function deriveInputScoreImpact(args: {
  inputKey: string;
  completeness: number;
  status: "complete" | "partial" | "gap" | "not_started";
}) {
  const key = String(args.inputKey || "").trim();
  const base = INPUT_BASE_IMPACT_BY_KEY[key] ?? 4.5;
  const completeness = clamp(Number(args.completeness) || 0, 0, 100);
  const status = args.status;

  if (status === "complete" || completeness >= 100) {
    return { scoreImpact: 0, impactTier: "done" as const };
  }

  const remainingWork = clamp(1 - completeness / 100, 0.12, 1);
  const statusBias = status === "gap" ? 1.08 : status === "not_started" ? 1.02 : 1;
  const scoreImpact = clamp(Math.round(base * (0.35 + 0.65 * remainingWork) * statusBias * 10) / 10, 0.5, 10);

  const impactTier =
    scoreImpact >= 6 ? ("high" as const) : scoreImpact >= 3 ? ("med" as const) : ("low" as const);

  return { scoreImpact, impactTier };
}

function seedInputProgress(args: {
  inputKey: string;
  description?: string;
  whyItMatters?: string;
  baselineResultJson: any | null;
}) {
  const ledger = Array.isArray(args.baselineResultJson?.evidence_ledger)
    ? args.baselineResultJson.evidence_ledger
    : [];

  const avgConfidence = avg(
    ledger
      .map((item: any) => Number(item?.confidence))
      .filter((value: number) => Number.isFinite(value)),
  );
  const confNorm = normalizeConfidence(avgConfidence);
  const strengthNorm = avg(ledger.map((item: any) => normalizeSignalStrength(item?.signal_strength)));
  const baselineSupport = clamp(0.55 * confNorm + 0.45 * strengthNorm, 0, 1);

  const key = String(args.inputKey || "").trim();
  const keyWeight = INPUT_PUBLIC_EVIDENCE_WEIGHTS[key] ?? 0.35;
  const text = `${String(args.description || "")} ${String(args.whyItMatters || "")}`.toLowerCase();

  const signalsUnclear =
    text.includes("unknown") ||
    text.includes("unclear") ||
    text.includes("not public") ||
    text.includes("not evidenced") ||
    text.includes("thin evidence");

  const baseCompleteness = 6 + baselineSupport * keyWeight * 52;
  const adjustedCompleteness = signalsUnclear ? baseCompleteness * 0.45 : baseCompleteness;
  const completeness = roundInt(clamp(adjustedCompleteness, 0, 48));

  return {
    completeness,
    status: completeness >= 8 ? "partial" : "not_started",
    impact_tier: completeness >= 28 ? "high" : completeness >= 16 ? "med" : "low",
  } as const;
}

function buildJourneyBrief(journeys: unknown): string {
  const items = Array.isArray(journeys) ? journeys : [];

  return items
    .map((journey, journeyIndex) => {
      const entry = journey as {
        journey_key?: string;
        journey_title?: string;
        journey_subtitle?: string;
        steps?: Array<{
          step_number?: number;
          step_label?: string;
          description?: string;
          designed?: boolean;
          has_gap?: boolean;
          evidence_status?: string;
          evidence_basis?: string;
          evidence_confidence?: number;
        }>;
      };

      const steps = Array.isArray(entry.steps) ? entry.steps : [];

      return [
        `${journeyIndex + 1}. ${entry.journey_key || "unknown"} :: ${entry.journey_title || "Untitled journey"}`,
        `Subtitle: ${entry.journey_subtitle || "unknown"}`,
        ...steps.map((step) => {
          const typedStep = step as {
            step_number?: number;
            step_label?: string;
            description?: string;
            designed?: boolean;
            has_gap?: boolean;
            evidence_status?: string;
            evidence_basis?: string;
            evidence_confidence?: number;
          };

          return `- Step ${typedStep.step_number ?? "?"}: ${typedStep.step_label || "Untitled"} | designed=${typedStep.designed ? "yes" : "no"} | gap=${typedStep.has_gap ? "yes" : "no"} | evidence=${typedStep.evidence_status || "unknown"} | conf=${typedStep.evidence_confidence ?? "?"} | basis=${typedStep.evidence_basis || "unknown"} | ${typedStep.description || "No description"}`;
        }),
      ].join("\n");
    })
    .join("\n\n");
}

function buildOpportunityBrief(opportunities: unknown): string {
  const items = Array.isArray(opportunities) ? opportunities : [];

  return items
    .slice(0, 20)
    .map((opportunity, index) => {
      const entry = opportunity as {
        outcome?: string;
        journey_key?: string;
        step_number?: number;
        step_label?: string;
        importance?: number;
        satisfaction?: number;
        opportunity_score?: number;
        priority_tier?: string;
      };

      return `${index + 1}. ${entry.outcome || "Untitled"} | ${entry.journey_key || "unknown"} | step ${entry.step_number ?? "?"} ${entry.step_label || ""} | score ${entry.opportunity_score ?? "?"} | ${entry.priority_tier || "unknown"} | importance ${entry.importance ?? "?"} | satisfaction ${entry.satisfaction ?? "?"}`;
    })
    .join("\n");
}

function buildManagedOutcomeBrief(outcomes: unknown): string {
  const items = Array.isArray(outcomes) ? outcomes : [];

  return items
    .map((outcome, index) => {
      const entry = outcome as {
        journey_key?: string;
        outcome_title?: string;
        outcome_statement?: string;
        leading_indicator?: string;
        target_direction?: string;
        confidence?: number;
      };

      return `${index + 1}. ${entry.journey_key || "unknown"} | ${entry.outcome_title || "Untitled"} | ${entry.outcome_statement || "No statement"} | leading indicator: ${entry.leading_indicator || "unknown"} | target direction: ${entry.target_direction || "unknown"} | confidence ${entry.confidence ?? "?"}`;
    })
    .join("\n");
}

const WEAK_OUTCOME_STARTERS = [
  "build ",
  "create ",
  "add ",
  "launch ",
  "implement ",
  "improve the ",
  "design ",
  "develop ",
  "roll out ",
  "introduce ",
  "use ",
];

const WEAK_OUTCOME_TERMS = [
  "dashboard",
  "portal",
  "feature",
  "tool",
  "campaign",
  "workflow",
  "form",
  "program",
  "website",
  "crm",
  "integration",
];

const ODI_PLAIN_LANGUAGE_RULES =
  "ODI wording rules: Keep desired outcomes in plain, human language. " +
  "Use one clear idea per sentence. Prefer everyday words over abstract consulting terms. " +
  "Keep outcomes concise (roughly 10-18 words when possible). " +
  "Prefer concrete phrasing like 'tracked decision results' instead of jargon like 'monitored decision outcomes'.";

const ODI_OUTCOME_PHRASE_REPLACEMENTS: Array<[RegExp, string]> = [
  [/\bmonitored decision outcomes\b/gi, "tracked decision results"],
  [/\bdecision outcomes\b/gi, "decision results"],
  [/\bbased on insights from\b/gi, "using evidence from"],
  [/\bstrategic alignment\b/gi, "fit with strategy"],
  [/\bcore audience\b/gi, "main audience"],
  [/\bleverage\b/gi, "use"],
  [/\butili[sz]e\b/gi, "use"],
  [/\boptimi[sz]e\b/gi, "improve"],
];

function normalizeOutcomeLanguage(outcome: string) {
  let text = String(outcome || "").trim();
  if (!text) return "";
  for (const [pattern, replacement] of ODI_OUTCOME_PHRASE_REPLACEMENTS) {
    text = text.replace(pattern, replacement);
  }
  text = text
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .trim();
  if (!text) return "";
  return text.charAt(0).toUpperCase() + text.slice(1);
}

const GENERIC_MANAGED_OUTCOME_PHRASES = [
  "improve customer progress",
  "improve demand and funding progress",
  "improve delivery and operating leverage",
  "increase successful progress",
  "increase customer progress",
  "increase delivery consistency",
  "increase conversion",
  "improve operations",
];

function analyzeOutcomeQuality(outcome: string) {
  const text = String(outcome || "").trim().toLowerCase();
  const issues: string[] = [];

  if (!text) issues.push("missing_text");
  if (text.split(/\s+/).length < 7) issues.push("too_short");
  if (WEAK_OUTCOME_STARTERS.some((starter) => text.startsWith(starter))) issues.push("starts_like_output");
  if (WEAK_OUTCOME_TERMS.some((term) => text.includes(term))) issues.push("contains_solution_language");
  if (!/^(minimize|reduce|increase|improve|maximize|avoid)\b/.test(text)) issues.push("missing_directional_verb");
  if (!/\b(time|effort|likelihood|confidence|consistency|clarity|risk|delay|drop-off|completion|cost|burden|visibility|follow-through|continuity|conversion|retention|readiness|access)\b/.test(text)) {
    issues.push("missing_measurable_dimension");
  }

  return {
    weak: issues.length >= 2,
    issues,
  };
}

type HierarchicalOpportunity = Record<string, unknown> & {
  __temp_key: string;
  __parent_key: string | null;
  __depth: number;
};

function tokenizeOutcomeText(value: string) {
  return String(value || "")
    .toLowerCase()
    .match(/[a-z][a-z-]{2,}/g) || [];
}

function tokenOverlapScore(a: string, b: string) {
  const aTokens = new Set(tokenizeOutcomeText(a));
  const bTokens = new Set(tokenizeOutcomeText(b));
  if (aTokens.size === 0 || bTokens.size === 0) return 0;
  let overlap = 0;
  for (const token of aTokens) {
    if (bTokens.has(token)) overlap += 1;
  }
  return overlap;
}

function hierarchyCandidateScore(parent: Record<string, unknown>, child: Record<string, unknown>) {
  const parentStep = Number(parent.step_number) || 0;
  const childStep = Number(child.step_number) || 0;
  let score = 0;

  if (parentStep > 0 && childStep > 0) {
    const distance = childStep - parentStep;
    if (distance < 0) score -= 6;
    else score += Math.max(0, 5 - distance);
  }

  score += tokenOverlapScore(
    `${String(parent.outcome || "")} ${String(parent.step_label || "")}`,
    `${String(child.outcome || "")} ${String(child.step_label || "")}`,
  ) * 1.25;
  score += (Number(parent.opportunity_score) || 0) * 0.03;
  return score;
}

function computeHierarchyDepth(
  key: string,
  byKey: Map<string, HierarchicalOpportunity>,
  memo: Map<string, number>,
  visiting: Set<string>,
) {
  if (memo.has(key)) return memo.get(key) || 0;
  if (visiting.has(key)) return 0;
  visiting.add(key);
  const row = byKey.get(key);
  if (!row || !row.__parent_key || !byKey.has(row.__parent_key)) {
    visiting.delete(key);
    memo.set(key, 0);
    return 0;
  }
  const parentDepth = computeHierarchyDepth(row.__parent_key, byKey, memo, visiting);
  const nextDepth = parentDepth + 1;
  visiting.delete(key);
  memo.set(key, nextDepth);
  return nextDepth;
}

function rankForHierarchy(opportunities: Array<Record<string, unknown>>): HierarchicalOpportunity[] {
  const ranked = [...opportunities].sort((a, b) => {
    const stepDelta = (Number(a.step_number) || 999) - (Number(b.step_number) || 999);
    if (stepDelta !== 0) return stepDelta;
    const scoreDelta = (Number(b.opportunity_score) || 0) - (Number(a.opportunity_score) || 0);
    if (scoreDelta !== 0) return scoreDelta;
    return String(a.outcome || "").localeCompare(String(b.outcome || ""));
  });

  return ranked.map((row, index) => ({
    ...row,
    __temp_key: `opp_${index + 1}`,
    __parent_key: null,
    __depth: 0,
  }));
}

function buildHierarchicalOpportunities(opportunities: Array<Record<string, unknown>>) {
  const ranked = rankForHierarchy(opportunities);
  for (let index = 0; index < ranked.length; index += 1) {
    const child = ranked[index];
    const candidates = ranked.slice(0, index);
    if (candidates.length === 0) continue;

    let best: HierarchicalOpportunity | null = null;
    let bestScore = Number.NEGATIVE_INFINITY;
    for (const candidate of candidates) {
      const score = hierarchyCandidateScore(candidate, child);
      if (score > bestScore) {
        bestScore = score;
        best = candidate;
      }
    }

    if (best && bestScore >= 1.25) {
      child.__parent_key = best.__temp_key;
    }
  }

  const byKey = new Map(ranked.map((row) => [row.__temp_key, row]));
  const depthMemo = new Map<string, number>();
  for (const row of ranked) {
    row.__depth = computeHierarchyDepth(row.__temp_key, byKey, depthMemo, new Set<string>());
  }

  return [...ranked].sort((a, b) => {
    if (a.__depth !== b.__depth) return a.__depth - b.__depth;
    const stepDelta = (Number(a.step_number) || 999) - (Number(b.step_number) || 999);
    if (stepDelta !== 0) return stepDelta;
    const scoreDelta = (Number(b.opportunity_score) || 0) - (Number(a.opportunity_score) || 0);
    if (scoreDelta !== 0) return scoreDelta;
    return String(a.__temp_key).localeCompare(String(b.__temp_key));
  });
}

function validateParentChildDistinctnessRows(rows: HierarchicalOpportunity[]) {
  const byKey = new Map(rows.map((row) => [row.__temp_key, row]));
  const failures: Array<{ child_key: string; parent_key: string; reasons: string[] }> = [];

  for (const row of rows) {
    if (!row.__parent_key) continue;
    const parent = byKey.get(row.__parent_key);
    if (!parent) continue;
    const distinctness = validateParentChildOpportunityDistinctness(
      String(parent.outcome || ""),
      String(row.outcome || ""),
    );
    if (!distinctness.valid) {
      failures.push({
        child_key: row.__temp_key,
        parent_key: row.__parent_key,
        reasons: distinctness.reasons,
      });
    }
  }

  return failures;
}

function repairParentChildDistinctnessRows(rows: HierarchicalOpportunity[]) {
  const next = rows.map((row) => ({ ...row }));
  const failures = validateParentChildDistinctnessRows(next);
  if (failures.length === 0) {
    return next;
  }

  const invalidChildKeys = new Set(failures.map((failure) => failure.child_key));
  for (const row of next) {
    if (invalidChildKeys.has(row.__temp_key)) {
      row.__parent_key = null;
      row.__depth = 0;
    }
  }

  const rebuilt = buildHierarchicalOpportunities(next);
  return rebuilt;
}

async function repairWeakOpportunities(args: {
  apiKey: string;
  model: string;
  companyName: string;
  website: string;
  baselineBrief: string;
  strategicProblemBrief?: string;
  managedOutcomes?: unknown;
  journeys: unknown;
  opportunities: unknown;
  schema: any;
}) {
  const systemText =
    `You are improving product discovery outcomes so they follow Teresa Torres style outcome rules.\n` +
    `Return ONLY valid JSON that matches the schema. No prose.\n` +
    `Keep journey_key, step_number, step_label, importance, satisfaction, opportunity_score, and priority_tier grounded to the original draft.\n` +
    `Rewrite only weak outcomes.\n` +
    `A strong outcome:\n` +
    `- describes a change in customer behavior, progress, or value rather than a feature or solution\n` +
    `- is within the team's influence, not a distant business KPI by itself\n` +
    `- spans multiple possible solutions rather than naming one implementation\n` +
    `- uses a directional construction like minimize, reduce, increase, improve, maximize, or avoid\n` +
    `- includes a measurable dimension in spirit: time, effort, risk, confidence, clarity, consistency, completion, follow-through, retention, conversion, continuity, or similar\n` +
    `- stays specific to the company, audience, and step context\n` +
    `Do not output feature ideas, initiatives, deliverables, launches, forms, portals, dashboards, or campaigns as outcomes.\n` +
    `Do not restate the parent desired outcome verbatim; opportunities must be narrower than desired outcomes.\n` +
    `${ODI_PLAIN_LANGUAGE_RULES}\n`;

  const userText =
    `Company: ${args.companyName}\nWebsite: ${args.website || "unknown"}\n\n` +
    `Evidence context:\n${args.baselineBrief}\n\n` +
    `Client-stated strategic problems:\n${args.strategicProblemBrief || "None provided"}\n\n` +
    `Managed outcomes:\n${buildManagedOutcomeBrief(args.managedOutcomes || [])}\n\n` +
    `Generated journeys:\n${buildJourneyBrief(args.journeys)}\n\n` +
    `Current opportunities:\n${buildOpportunityBrief(args.opportunities)}\n\n` +
    `Rewrite weak outcomes so they read like strong product discovery outcomes while staying faithful to the same step context and company reality.\n`;

  return callOpenAIJSON({
    apiKey: args.apiKey,
    model: args.model,
    schemaName: "mojo_opps_outcome_repair_v1",
    schema: args.schema,
    systemText,
    userText,
    maxOutputTokens: 2200,
    temperature: 0.1,
  });
}

// ── Stage/evidence rules injected into outcome generation prompts ─────────────

function buildStageEvidenceRules(
  programPhase: string,
  evidenceLevel: EvidenceLevel,
  problemType: ProblemType,
  confidenceCeiling: number,
): string {
  const stageDescriptions: Record<string, string> = {
    outside:  "OUTSIDE — external pattern recognition only; no validated root cause; outcomes are provisional hypotheses",
    diagnose: "DIAGNOSE — validating what is true; identifying real constraints; outcomes are directional but not yet locked",
    focus:    "FOCUS — narrowing to what matters most; primary outcome should be locked to the dominant bottleneck",
    flow:     "FLOW — execution and movement; outcomes tied to measurable behavior change and active route progress",
  };
  const problemDescriptions: Record<ProblemType, string> = {
    pre_conviction:  "PRE-CONVICTION / ACQUISITION — the bottleneck is before the first commitment; the primary outcome must be pre-sale",
    post_conviction: "POST-CONVICTION / DELIVERY — the bottleneck is after commitment; the dominant outcome is post-sale adoption or value realization",
    scale_retention: "SCALE / RETENTION / EXPANSION — the bottleneck is repeat engagement, expansion, or compounding growth",
    unknown:         "UNKNOWN — derive the most likely problem type from the strategic problem statements and journey context",
  };

  const levelGuidance: Record<ProblemType, string> = {
    pre_conviction:  "Primary outcome MUST describe pre-sale behavior (prospects booking, selecting, committing for the first time). Secondary outcome addresses post-sale adoption. Tertiary addresses scale.",
    post_conviction: "Primary outcome addresses post-sale value realization (clients adopting, deciding, completing). Secondary outcome may address a supporting pre-sale condition if evidence warrants it. Tertiary addresses expansion.",
    scale_retention: "Tertiary outcome is the anchor (past clients returning, renewing, expanding). Primary and secondary outcomes should address the upstream conditions that enable scale.",
    unknown:         "Generate the most appropriate primary outcome based on the dominant bottleneck visible in the strategic problem statements and journey context.",
  };

  const stageCountGuidance: Record<string, string> = {
    outside:  "Generate 1 outcome (primary only). Mark it as provisional — this is a hypothesis, not a locked target.",
    diagnose: "Generate 2 outcomes: 1 primary + 1 secondary. Both should be directional but not overconfident.",
    focus:    "Generate 3 outcomes: 1 primary (locked to dominant bottleneck) + 1 secondary + 1 tertiary.",
    flow:     "Generate 3–5 outcomes: 1 primary + 1–2 secondary + 1–2 tertiary. All should be specific and measurable.",
  };

  return [
    `=== STAGE-AWARE OUTCOME GENERATION RULES ===`,
    ``,
    `Current stage: ${stageDescriptions[programPhase] ?? stageDescriptions.outside}`,
    ``,
    `Problem type classified as: ${problemDescriptions[problemType]}`,
    ``,
    `OUTCOME COUNT FOR THIS STAGE: ${stageCountGuidance[programPhase] ?? stageCountGuidance.outside}`,
    ``,
    `LEVEL SELECTION RULE: ${levelGuidance[problemType]}`,
    ``,
    `Evidence state: ${evidenceLevel.replace("_", " ").toUpperCase()}`,
    `Confidence ceiling for all outcomes: ${confidenceCeiling}. Do not exceed this value.`,
    ``,
    `=== WHAT MUST NEVER HAPPEN ===`,
    `- Do NOT generate a post-sale outcome as the primary when the problem is pre-conviction.`,
    `- Do NOT generate a pre-sale actor (prospect, lead) on a post-conviction primary outcome.`,
    `- Do NOT use internal state language: "feel confident", "trust that", "believe in", "understand".`,
    `  These are not observable behaviors. Use what people DO, not what they think or feel.`,
    `- Do NOT describe a solution, tool, process, or implementation as an outcome.`,
    `- Do NOT use vague roots: "improve alignment", "improve clarity", "improve strategy".`,
    `  Every outcome must specify: who does what differently, at what rate, in what context.`,
    ``,
    `=== REQUIRED FORMAT ===`,
    `Every outcome = Direction + Behavioral Metric + Actor + Action + Context + optional Constraint`,
    `- direction: one of increase / reduce / improve / maximize / minimize / avoid`,
    `- metric: measurable dimension (rate, share, percentage, time, likelihood, count, etc.)`,
    `- actor: the specific human role performing the action`,
    `- action: an observable verb (book, schedule, commit, complete, adopt, select, return, etc.)`,
    `- context: when or where this behavior happens`,
    ``,
    `=== OUTCOME LEVEL DEFINITIONS ===`,
    `Primary   = Selection / Conviction — the pre-sale bottleneck; prospects choosing, booking, committing for the first time`,
    `Secondary = Value Realization — the post-sale adoption bottleneck; clients deciding, completing, progressing`,
    `Tertiary  = Scale / Expansion — repeat engagement, referral, renewal, compounding growth`,
  ].join("\n");
}

async function generateManagedOutcomes(args: {
  apiKey: string;
  model: string;
  companyName: string;
  website: string;
  baselineBrief: string;
  strategicProblemBrief?: string;
  journeys: unknown;
  programPhase: string;
  problemType: ProblemType;
  evidenceLevel: EvidenceLevel;
}) {
  const confidenceCeiling = EVIDENCE_CONFIDENCE_CEILING[args.evidenceLevel];
  const stageRules = buildStageEvidenceRules(
    args.programPhase,
    args.evidenceLevel,
    args.problemType,
    confidenceCeiling,
  );

  const systemText =
    `You are defining managed desired outcomes for a Teresa Torres opportunity solution tree.\n` +
    `Return ONLY valid JSON matching the schema. No prose.\n` +
    `All outcomes must be for journey_key=customer.\n` +
    `Apply Teresa Torres + ODI/JTBD framing: outcome first, behavior-first, no solution language.\n` +
    `\n` +
    `${stageRules}\n` +
    `\n` +
    `Each outcome must:\n` +
    `- describe a measurable change in observable behavior (who does what differently)\n` +
    `- be specific to the company's actual audience and journey steps\n` +
    `- read like a desired outcome, not a recommendation, feature, or plan\n` +
    `- use a concrete leading indicator (not just "progress" or "performance")\n` +
    `- be honest about evidence_basis: public inference vs. uploaded company evidence\n` +
    `- not exceed confidence ceiling of ${confidenceCeiling}\n` +
    `- populate why_this_level with a one-sentence rationale for the level choice\n` +
    `- populate why_behavioral with a one-sentence explanation of what makes the action observable\n` +
    `- populate leading_indicators with 2–3 early signals that precede the outcome moving\n` +
    `- populate lagging_indicators with 1–2 confirmatory signals\n` +
    `${ODI_PLAIN_LANGUAGE_RULES}\n`;

  const userText =
    `Company: ${args.companyName}\nWebsite: ${args.website || "unknown"}\n` +
    `Stage: ${args.programPhase} | Evidence: ${args.evidenceLevel} | Problem type: ${args.problemType}\n\n` +
    `Evidence context:\n${args.baselineBrief}\n\n` +
    `Client-stated strategic problems:\n${args.strategicProblemBrief || "None provided"}\n\n` +
    `Journeys:\n${buildJourneyBrief(args.journeys)}\n\n` +
    `Generate the outcomes appropriate for this stage. Anchor each one in the actual customer journey context.\n` +
    `Ensure the primary outcome addresses the dominant bottleneck visible in the strategic problems above.\n`;

  return callOpenAIJSON({
    apiKey: args.apiKey,
    model: args.model,
    schemaName: "mojo_managed_outcomes_v2",
    schema: managedOutcomesSchema,
    systemText,
    userText,
    maxOutputTokens: 2400,
    temperature: 0.15,
  });
}

function analyzeManagedOutcomeSpecificity(outcome: {
  outcome_title?: string;
  outcome_statement?: string;
  leading_indicator?: string;
}, contextTokens: string[] = []) {
  const text = [
    String(outcome?.outcome_title || ""),
    String(outcome?.outcome_statement || ""),
    String(outcome?.leading_indicator || ""),
  ]
    .join(" ")
    .toLowerCase()
    .trim();

  const normalizedContextTokens = contextTokens
    .map((token) => String(token || "").trim().toLowerCase())
    .filter((token) => token.length >= 4);

  const issues: string[] = [];
  if (!text) issues.push("missing_text");
  if (GENERIC_MANAGED_OUTCOME_PHRASES.some((phrase) => text.includes(phrase))) issues.push("generic_phrase");

  // Concrete context check: prefer step/journey tokens when available;
  // fall back to a broad domain-word list so professional-services and B2B
  // companies aren't penalised for not matching a healthcare/nonprofit list.
  const hasDomainWord = normalizedContextTokens.length > 0
    ? normalizedContextTokens.some((token) => text.includes(token))
    : /\b(family|families|patient|patients|referral|intake|enrollment|program|care|handoff|service|donor|grant|contract|renewal|screening|transition|follow-up|delivery|crisis|community|cafe|coffee|roaster|client|clients|prospect|prospects|consultant|consulting|engagement|strategy|decision|onboard|adoption|conviction|agreement|proposal|discovery|partnership|advisor|coaching)\b/.test(text);

  if (!hasDomainWord) {
    issues.push("missing_concrete_context");
  }

  if (!/\b(time|rate|share|likelihood|percentage|retention|completion|conversion|continuity|delay|drop-off|handoff|follow-through|readiness|access|consistency|quality|rework)\b/.test(text)) {
    issues.push("missing_indicator_language");
  }
  if (!/\b(increase|reduce|improve|maximize|minimize|avoid)\b/.test(text)) {
    issues.push("missing_direction");
  }

  // Only add missing_step_or_domain_context if missing_concrete_context hasn't already fired
  // for this same reason (avoids double-counting the same gap for low-info companies).
  if (normalizedContextTokens.length > 0 && !issues.includes("missing_concrete_context")) {
    const usesContextToken = normalizedContextTokens.some((token) => text.includes(token));
    if (!usesContextToken) issues.push("missing_step_or_domain_context");
  }

  return {
    // Threshold of 3+ lets a structurally valid outcome pass with one or two
    // minor specificity gaps — important for outside-phase / low-evidence runs
    // where company-specific vocabulary is scarce by definition.
    weak: issues.length >= 3,
    issues,
  };
}

function collectOutcomeContextTokensFromOpportunities(opportunities: unknown) {
  const stop = new Set([
    "increase", "reduce", "improve", "maximize", "minimize", "avoid", "with", "from", "into", "through", "across",
    "about", "their", "there", "this", "that", "these", "those", "your", "our", "for", "and", "the", "a", "an",
    "owners", "owner", "customers", "customer", "teams", "team", "users", "user", "partners", "partner",
    "process", "progress", "quality", "confidence", "consistency", "training",
  ]);

  const counts = new Map<string, number>();
  const rows = (Array.isArray(opportunities) ? opportunities : []) as Array<{ step_label?: string; outcome?: string }>;
  for (const row of rows) {
    const text = `${String(row?.step_label || "")} ${String(row?.outcome || "")}`.toLowerCase();
    for (const token of text.match(/[a-z][a-z-]{3,}/g) || []) {
      if (stop.has(token)) continue;
      counts.set(token, (counts.get(token) || 0) + 1);
    }
  }

  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([token]) => token);
}

function collectOutcomeContextTokensFromJourneys(journeys: unknown) {
  const stop = new Set([
    "define", "locate", "prepare", "confirm", "execute", "monitor", "modify", "conclude",
    "customer", "customers", "journey", "journeys", "step", "steps", "progress", "decision",
  ]);
  const counts = new Map<string, number>();
  const rows = (Array.isArray(journeys) ? journeys : []) as Array<{ steps?: Array<{ step_label?: string; description?: string }> }>;
  for (const journey of rows) {
    const steps = Array.isArray(journey?.steps) ? journey.steps : [];
    for (const step of steps) {
      const text = `${String(step?.step_label || "")} ${String(step?.description || "")}`.toLowerCase();
      for (const token of text.match(/[a-z][a-z-]{3,}/g) || []) {
        if (stop.has(token)) continue;
        counts.set(token, (counts.get(token) || 0) + 1);
      }
    }
  }

  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([token]) => token);
}

function inferManagedOutcomeAudience(args: { opportunities?: unknown; journeys?: unknown }) {
  const opportunitiesText = (Array.isArray(args.opportunities) ? args.opportunities : [])
    .map((row) => `${String((row as any)?.outcome || "")} ${String((row as any)?.step_label || "")}`)
    .join(" ")
    .toLowerCase();

  const journeysText = (Array.isArray(args.journeys) ? args.journeys : [])
    .map((journey) => {
      const steps = Array.isArray((journey as any)?.steps) ? (journey as any).steps : [];
      return steps.map((step: any) => `${String(step?.step_label || "")} ${String(step?.description || "")}`).join(" ");
    })
    .join(" ")
    .toLowerCase();
  const text = `${opportunitiesText} ${journeysText}`.trim();

  if (/\bcafe owners?\b/.test(text)) return "cafe owners";
  if (/\bpartner cafes?\b/.test(text)) return "partner cafes";
  if (/\bfamil(y|ies)\b/.test(text)) return "families";
  if (/\bpatients?\b/.test(text)) return "patients";
  if (/\bstudents?\b/.test(text)) return "students";
  if (/\boperators?\b/.test(text)) return "operators";
  if (/\bbuyers?\b/.test(text)) return "buyers";
  if (/\bpartners?\b/.test(text)) return "partners";
  if (/\bclients?\b/.test(text)) return "clients";
  if (/\bcustomers?\b/.test(text)) return "customers";
  return "target customers";
}

function lowerLeading(text: string) {
  const value = String(text || "").trim();
  if (!value) return "";
  return value.charAt(0).toLowerCase() + value.slice(1);
}

function humanizeStepPhrase(label: string) {
  const raw = lowerLeading(label);
  if (!raw) return "";

  const normalized = raw.replace(/\s+/g, " ").trim();
  if (/^execute onboarding and training\b/i.test(normalized)) return "onboarding and training completion";
  if (/^monitor coffee quality\b/i.test(normalized)) return "consistent coffee quality monitoring";
  if (/^confirm supplier alignment\b/i.test(normalized)) return "supplier alignment confirmation";

  const generic = normalized
    .replace(/^(define|locate|prepare|confirm|execute|monitor|modify|conclude)\s+/i, "")
    .trim();
  return generic || normalized;
}

function normalizeDirection(value: string) {
  return normalizeDesiredOutcomeDirection(String(value || ""));
}

function normalizeManagedOutcome(outcome: any, evidenceLevel?: EvidenceLevel) {
  const legacyStatement = normalizeOutcomeLanguage(String(outcome?.outcome_statement || ""));
  const legacyIndicator = normalizeOutcomeLanguage(String(outcome?.leading_indicator || ""));
  const structured = composeDesiredOutcomeFromParts(
    deriveDesiredOutcomeParts({
      journey_key: "customer",
      outcome_statement: legacyStatement,
      leading_indicator: legacyIndicator,
      target_direction: normalizeDirection(String(outcome?.target_direction || "")),
      direction: String(outcome?.direction || ""),
      metric: String(outcome?.metric || ""),
      actor: String(outcome?.actor || ""),
      action: String(outcome?.action || ""),
      object: String(outcome?.object || ""),
      context: String(outcome?.context || ""),
      constraint: String(outcome?.constraint || ""),
      is_primary: Boolean(outcome?.is_primary),
      level: String(outcome?.level || ""),
    }),
  );

  // Apply confidence ceiling for the evidence level
  const ceiling = evidenceLevel ? EVIDENCE_CONFIDENCE_CEILING[evidenceLevel] : 80;
  const rawConfidence = Number(outcome?.confidence) || 60;
  const cappedConfidence = clamp(rawConfidence, 35, ceiling);

  // Normalize level — fall back to "primary" for first outcome if missing
  const rawLevel = String(outcome?.level || "").trim();
  const level = ["primary", "secondary", "tertiary"].includes(rawLevel) ? rawLevel : "primary";

  return {
    journey_key: "customer",
    outcome_title: normalizeOutcomeLanguage(String(outcome?.outcome_title || structured.outcome_statement)),
    outcome_statement: normalizeOutcomeLanguage(String(legacyStatement || structured.outcome_statement)),
    leading_indicator: normalizeOutcomeLanguage(String(legacyIndicator || structured.leading_indicator)),
    target_direction: normalizeDirection(String(outcome?.target_direction || structured.target_direction)),
    direction: structured.direction,
    metric: structured.metric,
    actor: structured.actor || "",
    action: structured.action || "",
    object: structured.object,
    context: structured.context,
    constraint: structured.constraint || null,
    is_primary: Boolean(outcome?.is_primary),
    level,
    stage: String(outcome?.stage || "outside"),
    evidence_level: String(outcome?.evidence_level || evidenceLevel || "external_only"),
    why_this_level: String(outcome?.why_this_level || "").trim(),
    why_behavioral: String(outcome?.why_behavioral || "").trim(),
    leading_indicators: Array.isArray(outcome?.leading_indicators)
      ? outcome.leading_indicators.map((s: unknown) => String(s || "").trim()).filter(Boolean)
      : [],
    lagging_indicators: Array.isArray(outcome?.lagging_indicators)
      ? outcome.lagging_indicators.map((s: unknown) => String(s || "").trim()).filter(Boolean)
      : [],
    related_opportunity_areas: Array.isArray(outcome?.related_opportunity_areas)
      ? outcome.related_opportunity_areas.map((s: unknown) => String(s || "").trim()).filter(Boolean)
      : [],
    evidence_basis: String(outcome?.evidence_basis || "").trim()
      || "Inferred from public evidence and current opportunity map. Validate with customer interviews and ODI importance/satisfaction signals.",
    confidence: cappedConfidence,
  };
}

function buildDeterministicManagedOutcomeFallback(args: {
  opportunities?: unknown;
  journeys?: unknown;
}) {
  const rows = ((Array.isArray(args.opportunities) ? args.opportunities : []) as Array<{
    journey_key?: string;
    step_label?: string;
    step_number?: number;
    opportunity_score?: number;
    importance?: number;
  }>)
    .filter((row) => String(row?.journey_key || "customer") === "customer")
    .sort((a, b) => {
      const scoreDiff = (Number(b?.opportunity_score) || 0) - (Number(a?.opportunity_score) || 0);
      if (scoreDiff !== 0) return scoreDiff;
      const importanceDiff = (Number(b?.importance) || 0) - (Number(a?.importance) || 0);
      if (importanceDiff !== 0) return importanceDiff;
      return (Number(a?.step_number) || 999) - (Number(b?.step_number) || 999);
    });

  let first = rows[0];
  let second = rows.find((row) => String(row?.step_label || "").trim() && String(row?.step_label || "").trim() !== String(first?.step_label || "").trim());

  if (!first) {
    const customerJourney = (Array.isArray(args.journeys) ? args.journeys : []).find((journey) =>
      String((journey as any)?.journey_key || "").toLowerCase() === "customer"
    ) as { steps?: Array<{ step_label?: string; step_number?: number }> } | undefined;
    const steps = Array.isArray(customerJourney?.steps) ? customerJourney.steps : [];
    first = steps[0] ? { step_label: steps[0].step_label, step_number: steps[0].step_number } : undefined;
    second = steps[1] ? { step_label: steps[1].step_label, step_number: steps[1].step_number } : undefined;
  }

  const stepA = humanizeStepPhrase(String(first?.step_label || "the core customer journey"));
  const stepB = humanizeStepPhrase(String(second?.step_label || ""));
  const audience = inferManagedOutcomeAudience({ opportunities: rows, journeys: args.journeys });

  const outcomeTitle = stepB
    ? `Reliable progress from ${stepA} to ${stepB}`
    : `Reliable progress through ${stepA}`;
  const outcomeStatement = stepB
    ? `Increase the share of ${audience} who move from ${stepA} to ${stepB} with fewer delays and less rework.`
    : `Increase the share of ${audience} who complete ${stepA} with fewer delays and less rework.`;
  const leadingIndicator = stepB
    ? `Share of ${audience} who complete ${stepA} and reach ${stepB} within target time.`
    : `Share of ${audience} who complete ${stepA} on time without repeat support.`;

  return normalizeManagedOutcome({
    journey_key: "customer",
    outcome_title: outcomeTitle,
    outcome_statement: outcomeStatement,
    leading_indicator: leadingIndicator,
    target_direction: "increase",
    evidence_basis: "Fallback generated from top ODI/JTBD opportunity steps using public evidence only; validate with interviews and importance/satisfaction data.",
    confidence: 58,
  });
}

function buildDeterministicOpportunityOutcome(args: {
  audience: string;
  stepLabel: string;
  stepNumber: number;
  variant: number;
}) {
  const stepPhrase = humanizeStepPhrase(String(args.stepLabel || "").trim()) || `step ${Math.max(1, args.stepNumber || 1)}`;
  if (args.variant === 0) {
    return normalizeOutcomeLanguage(
      `Increase the share of ${args.audience} who complete ${stepPhrase} on time without rework.`,
    );
  }
  if (args.variant === 1) {
    return normalizeOutcomeLanguage(
      `Increase the share of ${args.audience} who complete ${stepPhrase} at first attempt without back-and-forth.`,
    );
  }
  return normalizeOutcomeLanguage(
    `Reduce the time it takes for ${args.audience} to complete ${stepPhrase} without repeat support.`,
  );
}

function recoverValidOpportunities(args: {
  opportunities: any[];
  journeys: unknown;
  primaryManagedOutcomeStatement: string;
  frameworkKeys: string[];
}) {
  const sourceRows = Array.isArray(args.opportunities) ? args.opportunities : [];
  const audience = inferManagedOutcomeAudience({ opportunities: sourceRows, journeys: args.journeys });
  const seenOutcomes = new Set<string>();
  const recovered: any[] = [];

  for (const row of sourceRows) {
    const base = { ...(row || {}) };
    const stepNumber = Math.max(1, Number(base?.step_number) || 1);
    const stepLabel = String(base?.step_label || "").trim() || `step ${stepNumber}`;

    const variants = [
      normalizeOutcomeLanguage(String(base?.outcome || "")),
      buildDeterministicOpportunityOutcome({ audience, stepLabel, stepNumber, variant: 0 }),
      buildDeterministicOpportunityOutcome({ audience, stepLabel, stepNumber, variant: 1 }),
      buildDeterministicOpportunityOutcome({ audience, stepLabel, stepNumber, variant: 2 }),
    ];

    let acceptedOutcome = "";
    for (const candidate of variants) {
      const normalizedCandidate = normalizeOutcomeLanguage(candidate);
      if (!normalizedCandidate) continue;
      if (seenOutcomes.has(normalizedCandidate.toLowerCase())) continue;

      const semantic = validateOpportunity({
        outcome: normalizedCandidate,
        importance: Number(base?.importance),
        satisfaction: Number(base?.satisfaction),
        frameworksUsed: ensureRequiredFrameworkKeys(args.frameworkKeys),
      });
      if (!semantic.valid) continue;

      if (args.primaryManagedOutcomeStatement) {
        const distinctness = validateOutcomeOpportunityDistinctness(
          args.primaryManagedOutcomeStatement,
          normalizedCandidate,
        );
        if (!distinctness.valid) continue;
      }

      acceptedOutcome = normalizedCandidate;
      break;
    }

    if (!acceptedOutcome) continue;
    seenOutcomes.add(acceptedOutcome.toLowerCase());
    recovered.push({
      ...base,
      outcome: acceptedOutcome,
      step_number: stepNumber,
      step_label: stepLabel,
    });
  }

  return recovered;
}

function isUsableManagedOutcome(outcome: ReturnType<typeof normalizeManagedOutcome>, contextTokens: string[]) {
  if (!outcome.outcome_title || !outcome.outcome_statement || !outcome.leading_indicator) return false;
  const quality = analyzeManagedOutcomeSpecificity(outcome, contextTokens);
  const semantics = validateDesiredOutcome({
    statement: outcome.outcome_statement,
    leadingIndicator: outcome.leading_indicator,
    targetDirection: outcome.target_direction,
    direction: outcome.direction,
    metric: outcome.metric,
    actor: outcome.actor,
    action: outcome.action,
    object: outcome.object,
    context: outcome.context,
    constraint: outcome.constraint || null,
    level: outcome.level,
    frameworksUsed: ["odi", "teresa_torres"],
    // Note: stage and problemType intentionally omitted here — alignment
    // signals are warnings only and should not block a usable outcome.
  });
  return !quality.weak && semantics.valid;
}

async function repairManagedOutcomes(args: {
  apiKey: string;
  model: string;
  companyName: string;
  website: string;
  baselineBrief: string;
  strategicProblemBrief?: string;
  journeys: unknown;
  opportunities?: unknown;
  outcomes: unknown;
  programPhase: string;
  problemType: ProblemType;
  evidenceLevel: EvidenceLevel;
}) {
  const confidenceCeiling = EVIDENCE_CONFIDENCE_CEILING[args.evidenceLevel];
  const stageRules = buildStageEvidenceRules(
    args.programPhase,
    args.evidenceLevel,
    args.problemType,
    confidenceCeiling,
  );

  const systemText =
    `You are repairing managed desired outcomes that are too generic or misaligned.\n` +
    `Return ONLY valid JSON matching the schema. No prose.\n` +
    `Keep the same number of outcomes for journey_key=customer. Rewrite only the ones that are weak.\n` +
    `Apply Teresa Torres + ODI/JTBD framing: outcome first, behavior-first, no solution language.\n` +
    `\n` +
    `${stageRules}\n` +
    `\n` +
    `Fix outcomes that:\n` +
    `- use generic language ("improve customer progress", "improve operations")\n` +
    `- have the wrong actor for the problem type (e.g. post-sale actor on a pre-conviction problem)\n` +
    `- describe an internal state instead of an observable behavior\n` +
    `- use solution language (build, launch, implement, design, etc.)\n` +
    `- have confidence above the ceiling of ${confidenceCeiling}\n` +
    `${ODI_PLAIN_LANGUAGE_RULES}\n`;

  const userText =
    `Company: ${args.companyName}\nWebsite: ${args.website || "unknown"}\n` +
    `Stage: ${args.programPhase} | Evidence: ${args.evidenceLevel} | Problem type: ${args.problemType}\n\n` +
    `Evidence context:\n${args.baselineBrief}\n\n` +
    `Client-stated strategic problems:\n${args.strategicProblemBrief || "None provided"}\n\n` +
    `Journeys:\n${buildJourneyBrief(args.journeys)}\n\n` +
    `Opportunities:\n${buildOpportunityBrief(args.opportunities || [])}\n\n` +
    `Current managed outcomes:\n${buildManagedOutcomeBrief(args.outcomes)}\n\n` +
    `Rewrite weak outcomes. Ensure each is company-specific, behavior-first, and level-appropriate.\n`;

  return callOpenAIJSON({
    apiKey: args.apiKey,
    model: args.model,
    schemaName: "mojo_managed_outcomes_repair_v2",
    schema: managedOutcomesSchema,
    systemText,
    userText,
    maxOutputTokens: 2400,
    temperature: 0.1,
  });
}

function buildInputBrief(inputs: unknown): string {
  const items = Array.isArray(inputs) ? inputs : [];

  return items
    .map((input, index) => {
      const entry = input as {
        input_key?: string;
        input_label?: string;
        sub_group?: string;
        description?: string;
        why_it_matters?: string;
      };

      return `${index + 1}. ${entry.input_key || "unknown"} | ${entry.input_label || "Untitled"} | ${entry.sub_group || "unknown"} | ${entry.description || "No description"} | why: ${entry.why_it_matters || "No rationale"}`;
    })
    .join("\n");
}

function buildRouteBrief(routes: unknown) {
  const items = Array.isArray(routes) ? routes : [];

  return items
    .slice(0, 20)
    .map((route, index) => {
      const entry = route as {
        category?: string;
        title?: string;
        short_description?: string;
        pts_value?: number;
        effort?: string;
      };

      return `${index + 1}. ${entry.category || "unknown"} | ${entry.title || "Untitled"} | ${entry.short_description || "No description"} | pts ${entry.pts_value ?? "?"} | ${entry.effort || "unknown"} effort`;
    })
    .join("\n");
}

const SOLUTION_MATCH_STOP_WORDS = new Set([
  "the", "and", "for", "with", "into", "from", "that", "this", "your", "their", "while", "through", "across",
  "customer", "customers", "partner", "partners", "team", "teams", "step", "journey",
  "increase", "reduce", "improve", "maximize", "minimize", "avoid",
]);

function solutionMatchTokens(value: string) {
  const tokens = String(value || "").toLowerCase().match(/[a-z][a-z-]{2,}/g) || [];
  return tokens.filter((token) => !SOLUTION_MATCH_STOP_WORDS.has(token));
}

function routeOpportunityFitScore(route: any, opportunity: any) {
  const routeText = `${String(route?.title || "")} ${String(route?.short_description || "")} ${(Array.isArray(route?.frameworks_used) ? route.frameworks_used : []).join(" ")}`;
  const routeTokens = new Set(solutionMatchTokens(routeText));
  const oppTokens = new Set(solutionMatchTokens(`${String(opportunity?.outcome || "")} ${String(opportunity?.step_label || "")}`));
  if (routeTokens.size === 0 || oppTokens.size === 0) return 0;

  let overlap = 0;
  for (const token of oppTokens) {
    if (routeTokens.has(token)) overlap += 1;
  }
  const desiredCategory =
    String(opportunity?.priority_tier || "") === "focus"
      ? "fix"
      : String(opportunity?.priority_tier || "") === "monitor"
        ? "improve"
        : "create";
  const routeCategory = String(route?.category || "").toLowerCase();
  const categoryScore = routeCategory === desiredCategory ? 0.6 : routeCategory ? -0.2 : 0;

  return overlap * 1.1 + categoryScore;
}

type FlatStep = {
  journey_key: string;
  step_number: number;
  step_label: string;
  designed: boolean;
  has_gap: boolean;
  gap_note: string;
};

type StoredDetailItem = { id: string; title: string; status: "complete" | "in_progress" | "missing" };

function routeDetailTokenSet(text: string): Set<string> {
  return new Set(
    String(text || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim()
      .split(" ")
      .filter((t) => t.length >= 4),
  );
}

function routeDetailOverlap(a: Set<string>, b: Set<string>): number {
  let hits = 0;
  for (const token of a) { if (b.has(token)) hits++; }
  return hits;
}

function routeStepStatus(step: FlatStep): "complete" | "in_progress" | "missing" {
  if (step.designed && !step.has_gap) return "complete";
  if (step.designed || step.has_gap) return "in_progress";
  return "missing";
}

function buildRouteDetailPayload(args: {
  routeId: string;
  routeTitle: string;
  routeShortDescription: string;
  category: string;
  opportunities: Array<{
    id: string;
    outcome: string;
    step_label: string;
    step_number: number;
    journey_key: string;
    priority_tier: string;
    opportunity_score: number;
  }>;
  allSteps: FlatStep[];
}): { steps: StoredDetailItem[]; evidence: StoredDetailItem[]; why_this_matters: string[] } {
  const { routeId, routeTitle, routeShortDescription, category, opportunities, allSteps } = args;

  const categoryPriority = category === "fix" ? "focus" : category === "improve" ? "monitor" : "defer";
  const routeTokens = routeDetailTokenSet(`${routeTitle} ${routeShortDescription}`);

  const rankedOpps = opportunities
    .map((opp) => {
      const text = `${opp.outcome} ${opp.step_label || ""} ${opp.journey_key}`;
      const overlap = routeDetailOverlap(routeTokens, routeDetailTokenSet(text));
      const priorityBoost = opp.priority_tier === categoryPriority ? 2 : 0;
      return { opp, score: overlap + priorityBoost + (opp.opportunity_score ?? 0) / 20 };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 4)
    .map((item) => item.opp);

  const relatedSteps = rankedOpps.length > 0
    ? rankedOpps
        .map((opp) =>
          allSteps.find(
            (s) =>
              s.journey_key === opp.journey_key &&
              s.step_number === opp.step_number &&
              s.step_label === opp.step_label,
          ),
        )
        .filter((s): s is FlatStep => !!s)
    : allSteps.filter((s) => category === "fix" ? s.has_gap : true).slice(0, 3);

  const uniqueSteps = Array.from(
    new Map(relatedSteps.map((s) => [`${s.journey_key}-${s.step_number}`, s])).values(),
  ).slice(0, 4);

  const steps: StoredDetailItem[] =
    uniqueSteps.length > 0
      ? uniqueSteps.map((s, i) => ({
          id: `${routeId}-step-${i + 1}`,
          title: `Step ${s.step_number ?? "?"}: ${s.step_label || "Untitled"}${s.gap_note ? ` — ${s.gap_note}` : ""}`,
          status: routeStepStatus(s),
        }))
      : [
          { id: `${routeId}-step-1`, title: "Define the concrete workstream and assign an owner.", status: "missing" },
          { id: `${routeId}-step-2`, title: "Confirm the customer, revenue, or operations point of friction this route addresses.", status: "missing" },
        ];

  const evidence: StoredDetailItem[] = [
    ...uniqueSteps.slice(0, 2).map((s, i) => ({
      id: `${routeId}-evidence-step-${i + 1}`,
      title: s.has_gap
        ? `Evidence for ${s.step_label || "this step"} is thin: ${s.gap_note || "clarify current-state proof points"}`
        : `Current-state evidence exists for ${s.step_label || "this step"}`,
      status: (s.has_gap ? "missing" : "complete") as StoredDetailItem["status"],
    })),
    {
      id: `${routeId}-evidence-owner`,
      title:
        category === "fix"
          ? "Decision owner and turnaround timing confirmed"
          : category === "create"
            ? "New capability owner and pilot scope defined"
            : "Improvement owner, baseline metric, and target state defined",
      status: "in_progress",
    },
    {
      id: `${routeId}-evidence-proof`,
      title:
        rankedOpps.length > 0
          ? "Validate this route against the linked outcome opportunities"
          : "Gather evidence that this route meaningfully changes an important outcome",
      status: rankedOpps.length > 0 ? "in_progress" : "missing",
    },
  ].slice(0, 4);

  const why_this_matters = buildRouteWhyThisMattersNarrative({
    category,
    title: routeTitle,
    shortDescription: routeShortDescription,
    whyThisMatters: [
      rankedOpps[0]?.outcome
        ? `This path is worth testing if it changes ${String(rankedOpps[0].outcome || "").replace(/[.?!]+$/g, "")}.`
        : null,
      uniqueSteps.some((s) => s.has_gap)
        ? `This path stays provisional until the linked gap in ${uniqueSteps[0]?.step_label || "the customer job"} is resolved.`
        : null,
    ].filter(Boolean) as string[],
    opportunityOutcome: rankedOpps[0]?.outcome || "",
    stepLabel: uniqueSteps[0]?.step_label || "",
  });

  return { steps, evidence, why_this_matters };
}

function buildSolutionTestsForIdea(args: {
  opportunity: { outcome?: string; step_label?: string };
  solutionIdea: { title?: string };
}) {
  const outcome = String(args.opportunity?.outcome || "").trim() || "this opportunity outcome";
  const stepLabel = String(args.opportunity?.step_label || "this journey step").trim().toLowerCase();
  const title = String(args.solutionIdea?.title || "this idea").trim();

  return [
    {
      title: "Desirability interview test",
      method: "Interview",
      metric: `Share of target users confirming ${outcome.toLowerCase()} is a high-priority friction in ${stepLabel}`,
      success_threshold: "At least 70% of interviews confirm this is a top-3 pain point",
      timebox: "2 weeks",
    },
    {
      title: "Pilot behavior test",
      method: "Pilot",
      metric: `Completion and quality change when running ${title}`,
      success_threshold: "At least 10% improvement vs. baseline with no quality regression",
      timebox: "2 weeks",
    },
  ];
}


function buildPositioningBrief(positioning: unknown) {
  const entry = (positioning ?? {}) as {
    competitive_alternatives?: Array<{ name?: string; description?: string; highlighted?: boolean }>;
    unique_attributes?: Array<{ name?: string; description?: string; highlighted?: boolean }>;
    value_for_customer?: string;
    best_fit_customers?: string;
    market_category?: string;
    category_rationale?: string;
    current_tagline?: string;
    proposed_tagline?: string;
  };

  const alternatives = Array.isArray(entry.competitive_alternatives)
    ? entry.competitive_alternatives.slice(0, 6)
    : [];
  const attributes = Array.isArray(entry.unique_attributes)
    ? entry.unique_attributes.slice(0, 6)
    : [];

  return [
    alternatives.length
      ? `Competitive alternatives:\n${alternatives.map((item, index) => `${index + 1}. ${item.name || "Unknown"} | ${item.description || "No description"} | highlighted=${item.highlighted ? "yes" : "no"}`).join("\n")}`
      : "Competitive alternatives: none",
    attributes.length
      ? `Unique attributes:\n${attributes.map((item, index) => `${index + 1}. ${item.name || "Unknown"} | ${item.description || "No description"} | highlighted=${item.highlighted ? "yes" : "no"}`).join("\n")}`
      : "Unique attributes: none",
    `Value for customer: ${entry.value_for_customer || "unknown"}`,
    `Best fit customers: ${entry.best_fit_customers || "unknown"}`,
    `Market category: ${entry.market_category || "unknown"}`,
    `Category rationale: ${entry.category_rationale || "unknown"}`,
    `Current tagline: ${entry.current_tagline || "unknown"}`,
    `Proposed tagline: ${entry.proposed_tagline || "unknown"}`,
  ].join("\n");
}

function buildStrategyBrief(strategy: unknown) {
  const entry = (strategy ?? {}) as {
    winning_aspiration?: string;
    where_to_play?: string;
    how_to_win?: string;
    capabilities?: Array<{ name?: string; status?: string; note?: string }>;
    management_systems?: Array<{ name?: string; status?: string; note?: string }>;
    assumptions?: Array<{ assumption?: string; tested?: boolean; note?: string }>;
  };

  const capabilities = Array.isArray(entry.capabilities) ? entry.capabilities.slice(0, 8) : [];
  const systems = Array.isArray(entry.management_systems) ? entry.management_systems.slice(0, 8) : [];
  const assumptions = Array.isArray(entry.assumptions) ? entry.assumptions.slice(0, 8) : [];

  return [
    `Winning aspiration: ${entry.winning_aspiration || "unknown"}`,
    `Where to play: ${entry.where_to_play || "unknown"}`,
    `How to win: ${entry.how_to_win || "unknown"}`,
    capabilities.length
      ? `Capabilities:\n${capabilities.map((item, index) => `${index + 1}. ${item.name || "Unknown"} | ${item.status || "unknown"} | ${item.note || "No note"}`).join("\n")}`
      : "Capabilities: none",
    systems.length
      ? `Management systems:\n${systems.map((item, index) => `${index + 1}. ${item.name || "Unknown"} | ${item.status || "unknown"} | ${item.note || "No note"}`).join("\n")}`
      : "Management systems: none",
    assumptions.length
      ? `Assumptions:\n${assumptions.map((item, index) => `${index + 1}. ${item.assumption || "Unknown"} | tested=${item.tested ? "yes" : "no"} | ${item.note || "No note"}`).join("\n")}`
      : "Assumptions: none",
  ].join("\n");
}

function summarizeReviews(reviews: Array<{ key?: string; review?: { severity?: string; summary?: string } }>) {
  const summaries = reviews
    .map((entry) => {
      const severity = String(entry?.review?.severity || "low").toUpperCase();
      const key = String(entry?.key || "review").replace(/_/g, " ");
      const summary = String(entry?.review?.summary || "").trim();
      if (!summary) return "";
      return `${key} (${severity}): ${summary}`;
    })
    .filter(Boolean);

  return summaries.slice(0, 3).join(" ");
}

async function persistResearchReviewRun(args: {
  supabase: ReturnType<typeof createClient>;
  companyId: string;
  userId: string;
  baselineRunId?: number | null;
  status: string;
  reviewSummary: string;
  reviews: unknown;
  finalizerApplied?: boolean;
}) {
  const { error } = await args.supabase
    .from("research_review_runs")
    .insert({
      company_id: args.companyId,
      user_id: args.userId,
      baseline_run_id: args.baselineRunId ?? null,
      status: args.status,
      review_summary: args.reviewSummary,
      reviews_json: args.reviews ?? [],
      finalizer_applied: Boolean(args.finalizerApplied),
    });

  if (error) {
    console.log("[research-company] review run persist error", error.message);
  }
}

async function persistResearchArtifactRun(args: {
  supabase: ReturnType<typeof createClient>;
  companyId: string;
  userId: string;
  baselineRunId?: number | null;
  status: string;
  mojoScore?: number | null;
  evidenceStatus?: string | null;
  summaryJson: Record<string, unknown>;
  artifactsJson: Record<string, unknown>;
}) {
  const { error } = await args.supabase
    .from("research_artifact_runs")
    .insert({
      company_id: args.companyId,
      user_id: args.userId,
      baseline_run_id: args.baselineRunId ?? null,
      status: args.status,
      mojo_score: args.mojoScore ?? null,
      evidence_status: args.evidenceStatus ?? null,
      summary_json: args.summaryJson,
      artifacts_json: args.artifactsJson,
    });

  if (error) {
    console.log("[research-company] artifact run persist error", error.message);
  }
}

function buildODIBrief(args: {
  baselineResultJson: unknown;
  customerJourneyTitle?: string;
  opportunities: unknown;
}) {
  const baselineLens = (args.baselineResultJson as {
    lens_card?: { primary_buyer?: string; chooser?: string; user?: string };
  } | null)?.lens_card ?? {};
  const opps = Array.isArray(args.opportunities) ? args.opportunities : [];
  const topOpps = opps.slice(0, 6).map((opp, index) => {
    const entry = opp as {
      outcome?: string;
      journey_key?: string;
      step_number?: number;
      step_label?: string;
      importance?: number;
      satisfaction?: number;
    };
    return `${index + 1}. ${entry.outcome || "Untitled"} | ${entry.journey_key || "unknown"} | step ${entry.step_number ?? "?"} ${entry.step_label || ""} | importance ${entry.importance ?? "?"} | satisfaction ${entry.satisfaction ?? "?"}`;
  });

  return [
    `Job executor: ${baselineLens.user || baselineLens.primary_buyer || "unknown"}`,
    `Chooser: ${baselineLens.chooser || "unknown"}`,
    `JTBD: ${args.customerJourneyTitle ? `Make progress through ${String(args.customerJourneyTitle).toLowerCase()}` : "unknown"}`,
    topOpps.length ? `Derived needs:\n${topOpps.join("\n")}` : "Derived needs: none",
  ].join("\n");
}

const reviewSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    pass: { type: "boolean" },
    severity: { type: "string", enum: ["low", "medium", "high"] },
    summary: { type: "string" },
    findings: {
      type: "array",
      maxItems: 8,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          artifact: {
            type: "string",
            enum: ["baseline", "odi", "inputs", "journeys", "opportunities", "routes", "positioning", "strategy"],
          },
          field: { type: "string" },
          issue: { type: "string" },
          suggestion: { type: "string" },
        },
        required: ["artifact", "field", "issue", "suggestion"],
      },
    },
  },
  required: ["pass", "severity", "summary", "findings"],
};

async function runConsistencyReview(opts: {
  apiKey: string;
  model: string;
  companyName: string;
  website: string;
  baselineBrief: string;
  strategicProblemBrief?: string;
  odiBrief: string;
  inputs: unknown;
  journeys: unknown;
  opportunities: unknown;
  routes: unknown;
  positioning: unknown;
  strategy: unknown;
}) {
  const userText =
    `Company: ${opts.companyName}\nWebsite: ${opts.website || "unknown"}\n\n` +
    `Evidence context:\n${opts.baselineBrief}\n\n` +
    `Client-stated strategic problems:\n${opts.strategicProblemBrief || "None provided"}\n\n` +
    `Derived ODI context:\n${opts.odiBrief}\n\n` +
    `Inputs:\n${buildInputBrief(opts.inputs)}\n\n` +
    `Journeys:\n${buildJourneyBrief(opts.journeys)}\n\n` +
    `Opportunities:\n${buildOpportunityBrief(opts.opportunities)}\n\n` +
    `Routes:\n${buildRouteBrief(opts.routes)}\n\n` +
    `Review the full draft bundle for cross-artifact consistency.`;

  const systemText =
    `You are a strict strategy QA reviewer.\n` +
    `Return ONLY valid JSON matching the schema. No prose.\n` +
    `Your job is to review, not rewrite.\n` +
    `Check for:\n` +
    `- strategic problem alignment: drafts should clearly connect to client-stated problems\n` +
    `- buyer / chooser / user consistency across baseline, journeys, and ODI\n` +
    `- opportunity rows correctly tied to journey steps\n` +
    `- routes that meaningfully connect to opportunities and job-step gaps\n` +
    `- any sign of wrong-company drift, adjacent-market drift, or contradictory language\n` +
    `Do NOT treat ordinary capability gaps, missing measurement systems, incomplete governance, or nonprofit operating weaknesses as high-severity review failures by themselves.\n` +
    `Those kinds of weaknesses are expected outputs of strategy work and should usually be medium or low severity unless they directly contradict the baseline or other generated artifacts.\n` +
    `Use severity=high only when there is wrong-company drift, market/category contradiction, buyer/user contradiction, or a material cross-artifact inconsistency that makes the draft unsafe to save.\n`;

  return await callOpenAIJSON({
    apiKey: opts.apiKey,
    model: opts.model,
    schemaName: "mojo_consistency_review_v1",
    schema: reviewSchema,
    systemText,
    userText,
    maxOutputTokens: 1600,
    temperature: 0.1,
  });
}

async function runPositioningReview(opts: {
  apiKey: string;
  model: string;
  companyName: string;
  website: string;
  baselineBrief: string;
  strategicProblemBrief?: string;
  positioning: unknown;
  opportunities: unknown;
  routes: unknown;
}) {
  const userText =
    `Company: ${opts.companyName}\nWebsite: ${opts.website || "unknown"}\n\n` +
    `Evidence context:\n${opts.baselineBrief}\n\n` +
    `Client-stated strategic problems:\n${opts.strategicProblemBrief || "None provided"}\n\n` +
    `Positioning draft:\n${buildPositioningBrief(opts.positioning)}\n\n` +
    `Opportunity context:\n${buildOpportunityBrief(opts.opportunities)}\n\n` +
    `Route context:\n${buildRouteBrief(opts.routes)}\n\n` +
    `Review the positioning draft for category fit, audience fit, alternative relevance, differentiation quality, and generic wording.`;

  const systemText =
    `You are a strict positioning reviewer.\n` +
    `Return ONLY valid JSON matching the schema. No prose.\n` +
    `Your job is to review, not rewrite.\n` +
    `Check for:\n` +
    `- positioning clearly addresses the client-stated strategic problem(s)\n` +
    `- market category credibility and alignment with baseline evidence\n` +
    `- market category written as a standard frame of reference (or '<known category> for <job>')\n` +
    `- best-fit customers matching the buyer/job context\n` +
    `- competitive alternatives serving the same job context\n` +
    `- unique attributes being specific and credible rather than generic\n` +
    `- current/proposed tagline quality and company fit\n` +
    `Use severity=high only when the positioning should not be saved without correction.\n`;

  return await callOpenAIJSON({
    apiKey: opts.apiKey,
    model: opts.model,
    schemaName: "mojo_positioning_review_v1",
    schema: reviewSchema,
    systemText,
    userText,
    maxOutputTokens: 1400,
    temperature: 0.1,
  });
}

async function runEvidenceReview(opts: {
  apiKey: string;
  model: string;
  companyName: string;
  website: string;
  baselineBrief: string;
  strategicProblemBrief?: string;
  journeys: unknown;
  opportunities: unknown;
  routes: unknown;
  positioning: unknown;
  strategy: unknown;
}) {
  const userText =
    `Company: ${opts.companyName}\nWebsite: ${opts.website || "unknown"}\n\n` +
    `Evidence context:\n${opts.baselineBrief}\n\n` +
    `Client-stated strategic problems:\n${opts.strategicProblemBrief || "None provided"}\n\n` +
    `Journeys:\n${buildJourneyBrief(opts.journeys)}\n\n` +
    `Opportunities:\n${buildOpportunityBrief(opts.opportunities)}\n\n` +
    `Routes:\n${buildRouteBrief(opts.routes)}\n\n` +
    `Review the draft bundle for evidence grounding and overclaiming.`;

  const systemText =
    `You are a strict evidence reviewer.\n` +
    `Return ONLY valid JSON matching the schema. No prose.\n` +
    `Your job is to review, not rewrite.\n` +
    `Check for:\n` +
    `- strategic-problem claims that are unsupported or not tied to evidence\n` +
    `- claims that go beyond the baseline evidence ledger or open questions\n` +
    `- invented specifics such as channels, buyer types, operating details, or differentiators not supported by evidence\n` +
    `- excessive certainty where baseline evidence is thin\n` +
    `- downstream artifacts that should say unknown, developing, or uncertain instead of asserting facts\n` +
    `Use severity=high only when the draft materially overclaims or presents unsupported specifics as fact.\n`;

  return await callOpenAIJSON({
    apiKey: opts.apiKey,
    model: opts.model,
    schemaName: "mojo_evidence_review_v1",
    schema: reviewSchema,
    systemText,
    userText,
    maxOutputTokens: 1400,
    temperature: 0.1,
  });
}

async function runStrategyReview(opts: {
  apiKey: string;
  model: string;
  companyName: string;
  website: string;
  baselineBrief: string;
  strategicProblemBrief?: string;
  strategy: unknown;
  routes: unknown;
  opportunities: unknown;
}) {
  const userText =
    `Company: ${opts.companyName}\nWebsite: ${opts.website || "unknown"}\n\n` +
    `Evidence context:\n${opts.baselineBrief}\n\n` +
    `Client-stated strategic problems:\n${opts.strategicProblemBrief || "None provided"}\n\n` +
    `Strategy draft:\n${buildStrategyBrief(opts.strategy)}\n\n` +
    `Route context:\n${buildRouteBrief(opts.routes)}\n\n` +
    `Opportunity context:\n${buildOpportunityBrief(opts.opportunities)}\n\n` +
    `Review the strategy draft for coherence, concreteness, and honest uncertainty.`;

  const systemText =
    `You are a strict strategy reviewer.\n` +
    `Return ONLY valid JSON matching the schema. No prose.\n` +
    `Your job is to review, not rewrite.\n` +
    `Check for:\n` +
    `- strategy directly addresses the client-stated strategic problem(s)\n` +
    `- winning aspiration, where to play, and how to win being coherent with each other\n` +
    `- capabilities and management systems being concrete rather than generic department labels\n` +
    `- assumptions reflecting real uncertainty rather than fake precision\n` +
    `- strategy language staying aligned with the baseline and generated opportunity/route context\n` +
    `Use severity=high only when the strategy is materially contradictory, switches company/market context, or presents unsupported specifics as established fact.\n` +
    `If the strategy is directionally coherent but still missing stronger capability detail, management-system detail, or better-framed assumptions, use severity=medium instead of high.\n`;

  return await callOpenAIJSON({
    apiKey: opts.apiKey,
    model: opts.model,
    schemaName: "mojo_strategy_review_v1",
    schema: reviewSchema,
    systemText,
    userText,
    maxOutputTokens: 1400,
    temperature: 0.1,
  });
}

async function runAllDraftReviews(opts: {
  apiKey: string;
  model: string;
  companyName: string;
  website: string;
  baselineBrief: string;
  strategicProblemBrief?: string;
  odiBrief: string;
  inputs: unknown;
  journeys: unknown;
  opportunities: unknown;
  routes: unknown;
  // positioning/strategy are leaf outputs — their review is deferred to A37+ leaf-output review pass
  positioning?: unknown;
  strategy?: unknown;
}) {
  // NOTE (A37): Orchestrator reviews only the 5 upstream surfaces: inputs, journeys,
  // managed_outcomes, opportunities, routes. positioningReview and strategyReview are
  // deferred — leaf functions own those tables and a separate review pass is a future enhancement.
  const [consistencyReview, evidenceReview] = await Promise.all([
    runConsistencyReview({
      apiKey: opts.apiKey,
      model: opts.model,
      companyName: opts.companyName,
      website: opts.website,
      baselineBrief: opts.baselineBrief,
      strategicProblemBrief: opts.strategicProblemBrief,
      odiBrief: opts.odiBrief,
      inputs: opts.inputs,
      journeys: opts.journeys,
      opportunities: opts.opportunities,
      routes: opts.routes,
      positioning: opts.positioning ?? null,
      strategy: opts.strategy ?? null,
    }),
    runEvidenceReview({
      apiKey: opts.apiKey,
      model: opts.model,
      companyName: opts.companyName,
      website: opts.website,
      baselineBrief: opts.baselineBrief,
      strategicProblemBrief: opts.strategicProblemBrief,
      journeys: opts.journeys,
      opportunities: opts.opportunities,
      routes: opts.routes,
      positioning: opts.positioning ?? null,
      strategy: opts.strategy ?? null,
    }),
  ]);
  const positioningReview = null;
  const strategyReview = null;

  return { consistencyReview, positioningReview, evidenceReview, strategyReview };
}

function frameworkKeysFor(artifact: "inputs" | "journeys" | "opportunities" | "routes") {
  return getFrameworkRoutingPlan(artifact).map((framework) => framework.key);
}

const STANDARD_MARKET_CATEGORY_GUIDANCE =
  "Use a standard, well-known market category anchor. " +
  "Preferred anchors: B2B SaaS, B2C SaaS, Marketplace, E-commerce, Professional Services, Healthcare Services, Financial Services, Education Services, Nonprofit Services, Hospitality/Foodservice, Logistics/Transportation, Manufacturing, Public Sector/Government. " +
  "If the company is niche, format as '<well-known category> for <specific job executor/job>' rather than inventing proprietary category names.";

const PLAIN_LANGUAGE_RULES =
  "Writing style rules: Use clear, plain language that a non-expert can understand. " +
  "Avoid consulting jargon, business cliches, and buzzwords. " +
  "Prefer concrete wording over abstract phrasing. Keep sentences short and direct. " +
  "For ODI needs and outcomes, keep one idea per sentence and use everyday wording. " +
  "Prefer 'tracked decision results' over abstract phrasing like 'monitored decision outcomes'. " +
  "Only keep specialized terms when they are required by the evidence or provided explicitly by the user/client. " +
  "If source evidence includes direct quotes, preserve them verbatim. Do not paraphrase direct quotes. " +
  "If company-specific phrasing/taglines exist, keep them as-is and, when useful, add a separate optional suggestion prefixed exactly with 'Suggested clearer version:' rather than replacing the original wording.";

function odiServiceState(importance: number, satisfaction: number) {
  const delta = importance - satisfaction;
  if (delta >= 3) return "underserved";
  if (delta <= -2) return "overserved";
  return "served";
}

async function callOpenAIJSON(opts: {
  apiKey: string;
  model: string;
  fallbackModels?: string[];
  schemaName: string;
  schema: any;
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
            const resp = await fetchWithTimeout("https://api.openai.com/v1/responses", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${apiKey}`,
              },
              body: JSON.stringify(buildBody(activeModel, budgets[attempt], retryNote)),
            }, requestTimeoutMs);

            if (!resp.ok) {
              const errText = await resp.text();
              if (transientAttempt < transientRetries && isTransientOpenAIHttpStatus(resp.status, errText)) {
                const backoffMs = 1200 * (transientAttempt + 1);
                console.log("[research-company] transient OpenAI HTTP error; retrying", {
                  schemaName,
                  model: activeModel,
                  status: resp.status,
                  attempt: transientAttempt + 1,
                  retries: transientRetries,
                  backoffMs,
                });
                await sleep(backoffMs);
                continue;
              }
              throw withSchemaContext(`OpenAI error ${resp.status}: ${errText}`);
            }

            const data = await resp.json();
            const text = extractResponsesOutputText(data);
            if (!text) {
              console.log("[research-company] OpenAI response missing output_text. keys=", Object.keys(data || {}));
              throw withSchemaContext("OpenAI response missing output_text");
            }

            try {
              return JSON.parse(text);
            } catch (e) {
              console.log("[research-company] OpenAI JSON parse failed. first200=", text.slice(0, 200));
              console.log("[research-company] OpenAI JSON parse failed. last200=", text.slice(-200));

              const parseMessage = e instanceof Error ? e.message : String(e);
              const looksTruncated =
                parseMessage.toLowerCase().includes("unterminated") ||
                parseMessage.toLowerCase().includes("unexpected end") ||
                text.trim().length > 0 && !text.trim().endsWith("}");

              if (attempt < budgets.length - 1 && looksTruncated) {
                console.log("[research-company] retrying OpenAI JSON parse with larger token budget", {
                  schemaName,
                  model: activeModel,
                  previousBudget: budgets[attempt],
                  nextBudget: budgets[attempt + 1],
                });
                lastError = e;
                break;
              }

              throw withSchemaContext(e);
            }
          } catch (error) {
            lastError = error;
            if (transientAttempt < transientRetries && isTransientOpenAIError(error)) {
              const backoffMs = 1200 * (transientAttempt + 1);
              console.log("[research-company] transient OpenAI request failure; retrying", {
                schemaName,
                model: activeModel,
                attempt: transientAttempt + 1,
                retries: transientRetries,
                backoffMs,
                message: String(error instanceof Error ? error.message : error),
              });
              await sleep(backoffMs);
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
    if (canFailover) {
      console.log("[research-company] switching OpenAI model after transient capacity-like failure", {
        schemaName,
        fromModel: activeModel,
        toModel: modelCandidates[modelIndex + 1],
        message: String(modelError instanceof Error ? modelError.message : modelError),
      });
      continue;
    }
    throw withSchemaContext(modelError);
  }

  throw withSchemaContext(lastModelError || "OpenAI JSON generation failed after retries and model fallback.");
}

const POSITIONING_KEYS = new Set([
  "comp-alt",
  "unique-attr",
  "val-prop",
  "target-aud",
  "market-cat",
]);
const CUSTOMER_KEYS = new Set(["customer-research", "customer-signals"]);
const STRATEGY_KEYS = new Set(["operating-model", "outcome-evidence"]);
const GTM_KEYS = new Set([
  "acquisition-map",
  "brand-narrative",
  "channel-strat",
  "retention-signals",
  "demand-pipeline",
]);
type JourneyKey = string;
type FrameworkMode = "dunford_positioning" | "torres_opportunity_map" | "martin_strategy_cascade";
type ProgramStage = "outside" | "diagnose" | "focus" | "flow";
type OrchestratorMode = "off" | "chained" | "parallel";

const FRAMEWORK_MODES: FrameworkMode[] = [
  "dunford_positioning",
  "torres_opportunity_map",
  "martin_strategy_cascade",
];
const PROGRAM_STAGES: ProgramStage[] = ["outside", "diagnose", "focus", "flow"];
const ORCHESTRATOR_MODES: OrchestratorMode[] = ["off", "chained", "parallel"];
const STRATEGIC_PROBLEM_STOPWORDS = new Set([
  "about",
  "after",
  "again",
  "against",
  "all",
  "also",
  "among",
  "and",
  "are",
  "because",
  "been",
  "being",
  "between",
  "both",
  "but",
  "can",
  "cannot",
  "could",
  "during",
  "each",
  "from",
  "have",
  "into",
  "just",
  "more",
  "most",
  "not",
  "only",
  "other",
  "our",
  "over",
  "same",
  "should",
  "that",
  "their",
  "there",
  "they",
  "this",
  "those",
  "through",
  "under",
  "very",
  "what",
  "when",
  "where",
  "which",
  "while",
  "with",
  "without",
  "would",
  "your",
]);

function round1(n: number) {
  return Math.round(n * 10) / 10;
}

function numberOrNull(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeJourneyKey(value: unknown) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function normalizeFrameworkMode(value: unknown): FrameworkMode | null {
  const normalized = String(value || "").trim().toLowerCase();
  return (FRAMEWORK_MODES as string[]).includes(normalized) ? normalized as FrameworkMode : null;
}

function parseFrameworkModes(value: unknown): FrameworkMode[] {
  if (!Array.isArray(value)) return [];
  const out: FrameworkMode[] = [];
  for (const item of value) {
    const mode = normalizeFrameworkMode(item);
    if (!mode || out.includes(mode)) continue;
    out.push(mode);
  }
  return out;
}

function normalizeProgramStage(value: unknown): ProgramStage | null {
  const normalized = String(value || "").trim().toLowerCase();
  return (PROGRAM_STAGES as string[]).includes(normalized) ? normalized as ProgramStage : null;
}

function normalizeOrchestratorMode(value: unknown): OrchestratorMode | null {
  const normalized = String(value || "").trim().toLowerCase();
  return (ORCHESTRATOR_MODES as string[]).includes(normalized) ? normalized as OrchestratorMode : null;
}

type RuntimeContract = {
  strict: boolean;
  request_id: string | null;
  run_id: string | null;
  orchestrator_mode: OrchestratorMode;
  framework_mode: FrameworkMode | null;
  framework_modes: FrameworkMode[];
  framework_schema_version: string | null;
  stage: ProgramStage | null;
  journey_key: JourneyKey | null;
  errors: string[];
};

function hasRuntimeContractFields(body: Record<string, unknown>) {
  const keys = [
    "framework_mode",
    "framework_modes",
    "orchestrator_mode",
    "stage",
    "framework_schema_version",
    "enforce_framework_contract",
  ];
  return keys.some((key) => body[key] !== undefined);
}

function isCustomerJourneyKey(value: unknown) {
  const key = normalizeJourneyKey(value);
  return key === "customer" || key.startsWith("customer-");
}

function normalizeAudienceSignal(value: unknown) {
  const normalized = String(value || "")
    .replace(/\s+/g, " ")
    .replace(/^[\s,.;:-]+|[\s,.;:-]+$/g, "")
    .trim();
  if (!normalized) return "";
  if (/^(unknown|n\/a|na|none|unset)$/i.test(normalized)) return "";
  return normalized;
}

function audienceFromJourneyTitle(title: unknown) {
  const raw = String(title || "").trim();
  if (!raw) return "";
  const withoutMapPrefix = raw.replace(/^job\s*map\s*:\s*/i, "").trim();
  const withoutCustomerPrefix = withoutMapPrefix.replace(/^customer\s+/i, "").trim();
  const withoutJourneySuffix = withoutCustomerPrefix.replace(/\s+journey$/i, "").trim();
  const candidate = normalizeAudienceSignal(withoutJourneySuffix || withoutCustomerPrefix || withoutMapPrefix || raw);
  return isInvalidAudienceLabel(candidate) ? "" : candidate;
}

function jtbdFromJourneyTitle(title: unknown) {
  const audience = audienceFromJourneyTitle(title);
  if (!audience) return "";
  const lower = audience.toLowerCase();

  if (/(cafe|coffee|specialty venue|venue buyer)/.test(lower)) {
    return "When choosing and managing a coffee partner, cafe owners and specialty venue buyers want to secure consistent quality, reliable supply, and responsive support, so they can deliver a strong guest experience and protect margins.";
  }
  if (/(debt|collection|debtor|repayment|arrears|delinquen|past due)/.test(lower)) {
    return "When resolving outstanding debt, consumers want to understand options, choose a workable repayment path, and complete payments with confidence, so they can regain financial control with minimal stress.";
  }
  if (/(financial investment|investor|capital|funding|raise)/.test(lower)) {
    return `When seeking growth capital, ${lower} want to identify, evaluate, and win the right funding partner, so they can execute their strategy on workable terms.`;
  }
  if (/(donor|grant|philanthrop)/.test(lower)) {
    return `When securing mission funding, ${lower} want to win and retain aligned donors and grant partners, so they can sustain impact without constant funding risk.`;
  }

  return `When trying to complete this job, ${lower} want to move from defining outcomes to executing and monitoring progress, so they can achieve the intended result with less risk and rework.`;
}

function parseRequestedJourneyKeys(value: unknown): JourneyKey[] {
  const raw = Array.isArray(value) ? value : [];
  const keys: JourneyKey[] = [];

  for (const item of raw) {
    const key = normalizeJourneyKey(item);
    if (!key) continue;
    if (keys.includes(key)) continue;
    keys.push(key);
  }

  return keys;
}

function parseRuntimeContract(body: Record<string, unknown>): RuntimeContract {
  const strict = body?.enforce_framework_contract === true || hasRuntimeContractFields(body);
  const requestId = String(body?.request_id || "").trim() || null;
  const runId = String(body?.run_id || "").trim() || null;

  if (!strict) {
    return {
      strict: false,
      request_id: requestId,
      run_id: runId,
      orchestrator_mode: "off",
      framework_mode: null,
      framework_modes: [],
      framework_schema_version: null,
      stage: null,
      journey_key: null,
      errors: [],
    };
  }

  const errors: string[] = [];
  const orchestratorMode = normalizeOrchestratorMode(body?.orchestrator_mode);
  const stage = normalizeProgramStage(body?.stage);
  const journeyKey = normalizeJourneyKey(body?.journey_key ?? body?.journey_id);
  const frameworkSchemaVersion = String(body?.framework_schema_version || "").trim() || null;
  const frameworkMode = normalizeFrameworkMode(body?.framework_mode);
  const frameworkModes = parseFrameworkModes(body?.framework_modes);

  if (!orchestratorMode) errors.push("orchestrator_mode must be one of: off, chained, parallel");
  if (!stage) errors.push("stage must be one of: outside, diagnose, focus, flow");
  if (!journeyKey) errors.push("journey_key is required");
  if (!frameworkSchemaVersion) errors.push("framework_schema_version is required");

  if (orchestratorMode === "off") {
    if (!frameworkMode) errors.push("framework_mode is required when orchestrator_mode=off");
    if (frameworkModes.length > 0) {
      errors.push("framework_modes is forbidden when orchestrator_mode=off");
    }
  } else if (orchestratorMode === "chained" || orchestratorMode === "parallel") {
    if (frameworkModes.length === 0) {
      errors.push("framework_modes is required when orchestrator_mode is chained or parallel");
    }
    if (String(body?.framework_mode || "").trim()) {
      errors.push("framework_mode is forbidden when orchestrator_mode is chained or parallel");
    }
    errors.push("orchestrator_mode chained/parallel is not supported by research-company yet");
  }

  for (const legacyField of ["journey", "journey_mode", "framework_journey"]) {
    if (String(body?.[legacyField] || "").trim()) {
      errors.push(`${legacyField} is deprecated; use framework_mode + stage + journey_key`);
    }
  }

  if (journeyKey && Array.isArray(body?.journeys_to_generate)) {
    const requested = parseRequestedJourneyKeys(body?.journeys_to_generate);
    if (requested.some((key) => key !== journeyKey)) {
      errors.push("journeys_to_generate must include only journey_key in strict framework mode");
    }
  }

  if (journeyKey && Array.isArray(body?.job_maps)) {
    const selected = parseSelectedJobMaps(body?.job_maps);
    if (selected.some((map) => map.journey_key !== journeyKey)) {
      errors.push("job_maps must include only journey_key in strict framework mode");
    }
  }

  return {
    strict: true,
    request_id: requestId,
    run_id: runId,
    orchestrator_mode: orchestratorMode || "off",
    framework_mode: orchestratorMode === "off" ? frameworkMode : null,
    framework_modes: orchestratorMode === "off" ? (frameworkMode ? [frameworkMode] : []) : frameworkModes,
    framework_schema_version: frameworkSchemaVersion,
    stage,
    journey_key: journeyKey || null,
    errors,
  };
}

type SelectedJobMap = {
  journey_key: JourneyKey;
  journey_title: string;
  journey_subtitle: string;
  source: "selected" | "custom" | "existing" | "requested";
};

function defaultJourneyTitle(key: JourneyKey) {
  if (key === "revenue") return "Job Map: Securing Revenue Outcomes";
  if (key === "operations") return "Job Map: Delivering Consistent Service";
  if (key === "customer") return "Job Map: Customer Progress";
  const human = key
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
  if (human) return `Job Map: ${human}`;
  return "Job Map: Customer Progress";
}

function defaultJourneySubtitle(key: JourneyKey) {
  if (key === "revenue") return "How demand converts into recurring economic outcomes.";
  if (key === "operations") return "How delivery operations prepare, execute, monitor, and improve service.";
  if (key === "customer") return "How the primary job performer defines, prepares, executes, and concludes progress.";
  return "How the primary job performer defines, prepares, executes, and concludes progress.";
}

function sanitizeJourneyStepEvidenceStatus(value: unknown) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "evidenced" || normalized === "implied") return normalized;
  return "unclear";
}

function enforceCustomerJourneySpine(journeys: Array<Record<string, unknown>>, industryExclusions?: Set<string>) {
  return journeys.map((journey) => {
    const journeyKey = normalizeJourneyKey(journey?.journey_key);
    if (!isCustomerJourneyKey(journeyKey)) return journey;

    const rawSteps = Array.isArray(journey?.steps)
      ? (journey.steps as Array<Record<string, unknown>>)
      : [];
    const normalizedSteps = normalizeToEightCheckpointSpine(
      rawSteps.map((step) => ({
        step_number: Number(step?.step_number) || null,
        step_label: String(step?.step_label || ""),
        description: String(step?.description || ""),
        designed: step?.designed === true,
        has_gap: step?.has_gap === true,
        evidence_status: sanitizeJourneyStepEvidenceStatus(step?.evidence_status),
        evidence_basis: String(step?.evidence_basis || ""),
        evidence_confidence: Number(step?.evidence_confidence),
        gap_note: String(step?.gap_note || ""),
      })),
      {
        defaultEvidenceBasis:
          "The generated sequence was inconsistent, so it was reset to the required 8-step customer sequence using available evidence.",
        defaultConfidence: 48,
      },
    );

    const validated = validateEightCheckpointSpine(normalizedSteps, industryExclusions);
    const fallbackSubtitle = "How the primary job performer moves through all 8 customer checkpoints.";
    const currentSubtitle = String(journey?.journey_subtitle || "").trim();
    const safeSubtitle = containsSolutionPrescriptiveLanguage(currentSubtitle, industryExclusions)
      ? fallbackSubtitle
      : currentSubtitle || fallbackSubtitle;

    return {
      ...journey,
      journey_subtitle: safeSubtitle,
      steps: validated.isValid ? normalizedSteps : normalizeToEightCheckpointSpine([], {
        defaultEvidenceBasis:
          "The first pass produced invalid steps, so this map was rebuilt into the required 8-step customer sequence.",
        defaultConfidence: 42,
        defaultGapNote:
          "This step is marked as a gap until we capture direct evidence about what is slowing progress.",
      }),
    };
  });
}

function sanitizeJobMapTitle(value: unknown, key: JourneyKey) {
  const title = String(value || "").trim();
  if (!title) return defaultJourneyTitle(key);
  if (isCustomerJourneyKey(key) && isInvalidAudienceLabel(audienceFromJourneyTitle(title))) {
    return defaultJourneyTitle(key);
  }
  return title;
}

function sanitizeJobMapSubtitle(value: unknown, key: JourneyKey) {
  const subtitle = String(value || "").trim();
  return subtitle || defaultJourneySubtitle(key);
}

function isGenericAudienceLabel(value: unknown) {
  const normalized = normalizeAudienceSignal(value).toLowerCase();
  if (!normalized) return true;
  return (
    normalized === "core audience" ||
    normalized === "audience" ||
    normalized === "target audience" ||
    normalized === "customer" ||
    normalized === "customers" ||
    normalized === "primary customer" ||
    normalized === "primary buyer" ||
    normalized === "user" ||
    normalized === "users" ||
    normalized === "buyer" ||
    normalized === "buyers" ||
    normalized === "decision maker" ||
    normalized === "decision-maker" ||
    normalized === "progress" ||
    normalized === "outcome" ||
    normalized === "outcomes" ||
    normalized === "strategy" ||
    normalized === "execution" ||
    normalized === "monitoring" ||
    normalized === "journey" ||
    normalized === "process" ||
    normalized === "unknown from public evidence" ||
    normalized === "unknown from uploaded evidence"
  );
}

function hasAudienceRoleNoun(value: string) {
  return /\b(owner|manager|director|lead|officer|team|department|specialist|buyer|user|customer|consumer|operator|administrator|executive|committee|sponsor|partner|staff|organization|organisation|enterprise|company|client|debtor|creditor|collector|agent|analyst|founder|ceo|cfo|coo|vp|head)\b/.test(value);
}

function isAbstractSingleTokenAudience(value: unknown) {
  const normalized = normalizeAudienceSignal(value).toLowerCase();
  if (!normalized) return true;
  const tokens = normalized.split(/\s+/).filter(Boolean);
  if (tokens.length !== 1) return false;
  if (hasAudienceRoleNoun(normalized)) return false;
  return true;
}

function isLikelyJobActionLabel(value: unknown) {
  const normalized = normalizeAudienceSignal(value).toLowerCase();
  if (!normalized) return false;
  const hasRoleNoun = hasAudienceRoleNoun(normalized);
  if (hasRoleNoun) return false;
  if (/^(getting|securing|converting|delivering|improving|optimizing|building|driving|increasing|reducing|achieving|executing|obtaining|winning|raising|funding|acquiring)\b/.test(normalized)) {
    return true;
  }
  if (/(financial investment|revenue outcomes|qualified demand|recurring economic outcomes)/.test(normalized)) {
    return true;
  }
  return false;
}

function isInvalidAudienceLabel(value: unknown) {
  return isGenericAudienceLabel(value) || isLikelyJobActionLabel(value) || isAbstractSingleTokenAudience(value);
}

function parseSelectedJobMaps(value: unknown): SelectedJobMap[] {
  const rows = Array.isArray(value) ? value : [];
  const byKey = new Map<JourneyKey, SelectedJobMap>();

  for (const row of rows) {
    const item = row as Record<string, unknown>;
    const keyRaw = item?.journey_key ?? item?.key;
    const key = normalizeJourneyKey(keyRaw);
    if (!key) continue;
    const journeyKey = key;
    const sourceRaw = String(item?.source || "").trim().toLowerCase();
    const source: SelectedJobMap["source"] =
      sourceRaw === "custom" ? "custom" : sourceRaw === "selected" ? "selected" : "requested";

    byKey.set(journeyKey, {
      journey_key: journeyKey,
      journey_title: sanitizeJobMapTitle(item?.journey_title ?? item?.title, journeyKey),
      journey_subtitle: sanitizeJobMapSubtitle(item?.journey_subtitle ?? item?.subtitle, journeyKey),
      source,
    });
  }

  return Array.from(byKey.values());
}

function deriveExistingJobMaps(rows: unknown): SelectedJobMap[] {
  const items = Array.isArray(rows) ? rows : [];
  const byKey = new Map<JourneyKey, SelectedJobMap>();

  for (const row of items) {
    const item = row as Record<string, unknown>;
    const key = normalizeJourneyKey(item?.journey_key);
    if (!key) continue;
    const journeyKey = key;
    if (byKey.has(journeyKey)) continue;

    byKey.set(journeyKey, {
      journey_key: journeyKey,
      journey_title: sanitizeJobMapTitle(item?.journey_title, journeyKey),
      journey_subtitle: sanitizeJobMapSubtitle(item?.journey_subtitle, journeyKey),
      source: "existing",
    });
  }

  return Array.from(byKey.values());
}

function inferSuggestedJobMapsFromBaseline(args: {
  companyName: string;
  baselineResultJson: unknown;
}) {
  const baseline = (args.baselineResultJson ?? {}) as {
    lens_card?: {
      primary_buyer?: string;
      chooser?: string;
      user?: string;
      value_chain?: string;
      economic_engine?: string;
      adoption_constraints?: string;
      risk_surface?: string;
    };
    evidence_ledger?: Array<{ bucket?: string; snippet?: string }>;
  };

  const lens = baseline?.lens_card ?? {};
  const ledger = Array.isArray(baseline?.evidence_ledger) ? baseline.evidence_ledger : [];
  const normalizeSignal = (value: unknown) => {
    const normalized = String(value || "")
      .replace(/\s+/g, " ")
      .replace(/^[\s,.;:-]+|[\s,.;:-]+$/g, "")
      .trim();
    if (!normalized) return "";
    if (/^(unknown|n\/a|na|none|unset)$/i.test(normalized)) return "";
    return normalized;
  };
  const publicSignalText = [
    normalizeSignal(lens.value_chain),
    normalizeSignal(lens.economic_engine),
    normalizeSignal(lens.adoption_constraints),
    normalizeSignal(lens.risk_surface),
    ...ledger.slice(0, 14).map((entry) => `${String(entry?.bucket || "")} ${String(entry?.snippet || "")}`),
  ]
    .join(" ")
    .toLowerCase();

  const roleSignals = [
    normalizeSignal(lens.user),
    normalizeSignal(lens.primary_buyer),
    normalizeSignal(lens.chooser),
  ].filter(Boolean);
  const role = roleSignals[0] || "";
  const companyAudienceFallback = normalizeSignal(args.companyName) || "Primary Customer";
  const audienceLabel = !role || isInvalidAudienceLabel(role) ? `${companyAudienceFallback} Customer` : role;
  const hasNonprofitFundingSignal = /\b(nonprofit|charity|foundation|mission|philanthrop|donor|grant|fundraising)\b/.test(publicSignalText);
  const hasCommercialMarketSignal = /\b(saas|software|telecom|enterprise|b2b|subscription|arr|contract|procurement|retail|cafe|restaurant|venue|manufacturing|logistics)\b/.test(publicSignalText);
  const allowDonorGrantRevenueMap = hasNonprofitFundingSignal && !hasCommercialMarketSignal;
  const countMatches = (terms: string[]) =>
    terms.reduce((sum, term) => (publicSignalText.includes(term) ? sum + 1 : sum), 0);
  const revenueSignalScore =
    countMatches([
      "investment",
      "investor",
      "capital",
      "funding",
      "revenue",
      "pricing",
      "contract",
      "renewal",
      "payer",
      "reimbursement",
      "referral",
      "pipeline",
      "conversion",
      "sales",
      "acquisition",
      "procurement",
      "bookings",
    ]) +
    (allowDonorGrantRevenueMap ? countMatches(["donor", "grant", "fundraising", "philanthrop"]) : 0);
  const economicEngine = normalizeSignal(lens.economic_engine);
  const hasEconomicSignal = Boolean(economicEngine);

  const suggestions: Array<{
    journey_key: JourneyKey;
    journey_title: string;
    journey_subtitle: string;
    confidence: number;
    rationale: string;
  }> = [];

  suggestions.push({
    journey_key: "customer",
    journey_title: `Job Map: ${audienceLabel}`,
    journey_subtitle: `How ${audienceLabel.toLowerCase()} define, locate, prepare, execute, monitor, and conclude progress.`,
    confidence: roleSignals.length > 0 ? 95 : 80,
    rationale: roleSignals.length > 0
      ? `Audience signal from baseline lens: ${roleSignals[0]}`
      : `Customer job performer is unresolved; start by framing the core job for ${args.companyName}.`,
  });

  if (revenueSignalScore >= 2 || hasEconomicSignal) {
    let revenueTitle = "Job Map: Securing Revenue Outcomes";
    if (/(investment|investor|capital|funding|raise)/.test(publicSignalText)) {
      revenueTitle = "Job Map: Getting Financial Investment";
    } else if (allowDonorGrantRevenueMap && /(grant|donor|philanthrop|fundraising)/.test(publicSignalText)) {
      revenueTitle = "Job Map: Securing Donor and Grant Support";
    } else if (/(referral|pipeline|conversion|enrollment)/.test(publicSignalText)) {
      revenueTitle = "Job Map: Converting Qualified Demand";
    }

    suggestions.push({
      journey_key: "revenue",
      journey_title: revenueTitle,
      journey_subtitle: "How demand converts into sustained economic outcomes.",
      confidence: Math.min(92, 50 + revenueSignalScore * 6 + (hasEconomicSignal ? 10 : 0)),
      rationale: hasEconomicSignal
        ? `Economic signal from baseline lens: ${economicEngine}`
        : "Public signals suggest meaningful economic, demand, or conversion dynamics.",
    });
  }

  if (/(operations|delivery|capacity|workflow|staffing|compliance|quality|handoff|throughput|support|service continuity|risk|constraint)/.test(publicSignalText)) {
    suggestions.push({
      journey_key: "operations",
      journey_title: "Job Map: Delivering Consistent Service",
      journey_subtitle: "How internal delivery systems prepare, execute, monitor, and improve service quality.",
      confidence: 74,
      rationale: "Public constraints/risk signals suggest operational friction worth mapping.",
    });
  }

  return suggestions;
}

function normalizeSignalStrength(value: unknown) {
  const raw = String(value || "").trim().toLowerCase();
  if (raw === "high") return 1;
  if (raw === "medium") return 0.66;
  if (raw === "low") return 0.33;
  return 0.5;
}

function normalizeConfidence(value: number) {
  if (!Number.isFinite(value) || value <= 0) return 0;
  if (value <= 1) return clamp(value, 0, 1);
  if (value <= 10) return clamp(value / 10, 0, 1);
  return clamp(value / 100, 0, 1);
}

function ratio(count: number, max: number) {
  if (max <= 0) return 0;
  return clamp(count / max, 0, 1);
}

// Must stay in sync with ledgerItemFingerprint() in src/lib/scoring/mojoScore.ts.
function ledgerItemFingerprint(item: { snippet?: unknown; url?: unknown; bucket?: unknown; signal_strength?: unknown }): string {
  return [item.snippet, item.url, item.bucket, item.signal_strength]
    .filter(Boolean)
    .join("|")
    .slice(0, 200);
}

function isJobStepEvidenceColumnError(message: unknown) {
  const lower = String(message || "").toLowerCase();
  return (
    lower.includes("evidence_status") ||
    lower.includes("evidence_basis") ||
    lower.includes("evidence_confidence")
  );
}

function averageCompleteness(items: Array<{ completeness?: unknown }>) {
  const values = items
    .map((item) => Number(item?.completeness))
    .filter((value) => Number.isFinite(value) && value > 0) as number[];

  if (!values.length) return 0;
  return clamp(avg(values), 0, 100) / 100;
}

function journeyHealth(steps: Array<{ designed?: unknown; has_gap?: unknown }>) {
  if (!steps.length) return 0;

  const designedRatio = steps.filter((step) => step?.designed === true).length / steps.length;
  const nonGapRatio = steps.filter((step) => step?.has_gap !== true).length / steps.length;
  return clamp(0.55 * designedRatio + 0.45 * nonGapRatio, 0, 1);
}

function weightedHarmonicMean(entries: Array<{ value: number; weight: number }>) {
  const valid = entries
    .map((entry) => ({
      weight: entry.weight,
      value: clamp(entry.value, 1, 100),
    }))
    .filter((entry) => entry.weight > 0);

  if (!valid.length) return 0;

  const denom = valid.reduce((sum, entry) => sum + entry.weight / entry.value, 0);
  if (denom <= 0) return 0;

  const weightSum = valid.reduce((sum, entry) => sum + entry.weight, 0);
  return weightSum / denom;
}

function tokenizeStrategicText(value: unknown) {
  const raw = String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!raw) return [] as string[];

  return raw
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token.length >= 4 && !STRATEGIC_PROBLEM_STOPWORDS.has(token));
}

function titleFromJourneyKey(key: string) {
  if (!key) return "Core Initiative";
  if (key === "customer") return "Customer Journey";
  if (key === "revenue") return "Revenue Journey";
  if (key === "operations") return "Operations Journey";
  return key
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function deriveInitiativeFocusContext(args: {
  jobSteps: Array<{ journey_key?: unknown; journey_title?: unknown; journey_subtitle?: unknown }>;
  strategicProblems?: StrategicProblemStatement[];
  // Operator-pinned on-strategy journey_key (read from operator_primary_selection). Honored
  // when it matches a generated set; otherwise the in-memory heuristic below decides.
  pinnedJourneyKey?: string;
}) {
  const byJourney = new Map<string, { count: number; title: string; subtitle: string }>();
  const steps = Array.isArray(args.jobSteps) ? args.jobSteps : [];

  for (const step of steps) {
    const key = normalizeJourneyKey(step?.journey_key);
    if (!key) continue;
    const current = byJourney.get(key) ?? { count: 0, title: "", subtitle: "" };
    current.count += 1;
    if (!current.title && String(step?.journey_title || "").trim()) {
      current.title = String(step?.journey_title || "").trim();
    }
    if (!current.subtitle && String(step?.journey_subtitle || "").trim()) {
      current.subtitle = String(step?.journey_subtitle || "").trim();
    }
    byJourney.set(key, current);
  }

  if (!byJourney.size) {
    return {
      primary_journey_key: "customer",
      primary_journey_title: "Customer Journey",
      initiative_keywords: ["customer", "journey"],
    };
  }

  const ranked = Array.from(byJourney.entries())
    .map(([key, value]) => {
      const text = `${value.title} ${value.subtitle}`.toLowerCase();
      const economicSignal = /(revenue|investment|investor|funding|capital|contract|pipeline)/.test(text) ? 2 : 0;
      const customCustomerSignal = key.startsWith("customer-") ? 2 : 0;
      const nonGenericSignal = key !== "customer" ? 3 : 0;
      return {
        key,
        value,
        score: value.count + economicSignal + customCustomerSignal + nonGenericSignal,
      };
    })
    .sort((a, b) => b.score - a.score);

  // Operator pin is authority when it names a generated set; else the heuristic top-rank.
  const pinned = normalizeJourneyKey(args.pinnedJourneyKey);
  const selected = pinned && byJourney.has(pinned)
    ? { key: pinned, value: byJourney.get(pinned)!, score: 0 }
    : ranked[0];
  const title = selected.value.title || titleFromJourneyKey(selected.key);
  const primaryProblem = String(args.strategicProblems?.[0]?.statement || "");
  const keywords = tokenizeStrategicText(`${selected.key} ${title} ${selected.value.subtitle} ${primaryProblem}`).slice(0, 24);

  return {
    primary_journey_key: selected.key,
    primary_journey_title: title,
    initiative_keywords: keywords.length > 0 ? keywords : tokenizeStrategicText(title).slice(0, 12),
  };
}

function keywordOverlap(text: string, keywords: string[]) {
  if (!keywords.length) return 0;
  const tokenSet = new Set(tokenizeStrategicText(text));
  let hits = 0;
  for (const keyword of keywords) {
    if (tokenSet.has(keyword)) hits++;
  }
  return hits;
}

function deriveMarketBaselineCalibration(baselineResultJson: unknown) {
  const baseline = (baselineResultJson ?? null) as Record<string, unknown> | null;
  const market = (baseline?.market_initiative_success ?? null) as Record<string, unknown> | null;
  const evidenceUrls = Array.isArray(market?.evidence_urls)
    ? market?.evidence_urls.filter((item) => String(item || "").trim().length > 0)
    : [];
  const hasProof = market?.proven === true || (evidenceUrls.length > 0 && String(market?.source || "").trim().length > 0);

  let low = 0;
  let high = 20;
  let typical = 12;

  if (hasProof) {
    low =
      numberOrNull(market?.low_pct) ??
      numberOrNull(baseline?.market_success_low_pct) ??
      0;
    high =
      numberOrNull(market?.high_pct) ??
      numberOrNull(baseline?.market_success_high_pct) ??
      20;
    typical =
      numberOrNull(market?.typical_pct) ??
      numberOrNull(baseline?.market_success_rate_pct) ??
      12;
  }

  if (high < low) {
    const swap = low;
    low = high;
    high = swap;
  }

  if (typical < low) low = typical;
  if (typical > high) high = typical;
  typical = clamp(typical, low, high);

  const source = hasProof
    ? String(market?.source || baseline?.market_success_source || "").trim() || "provided_without_source_name"
    : "default_range_0_20_unproven";
  const asOfRaw = hasProof ? String(market?.as_of || baseline?.market_success_as_of || "").trim() : "";

  return {
    low: round1(clamp(low, 0, 100)),
    high: round1(clamp(high, 0, 100)),
    typical: round1(clamp(typical, 0, 100)),
    source,
    as_of: asOfRaw || null,
    proven: hasProof,
  };
}

function computeStrategicProblemAlignment(args: {
  strategicProblems?: StrategicProblemStatement[];
  opportunities?: Array<{ outcome?: unknown; step_label?: unknown }>;
  routes?: Array<{ title?: unknown; short_description?: unknown; category?: unknown }>;
  positioning?: {
    competitive_alternatives?: Array<{ name?: unknown; description?: unknown }>;
    unique_attributes?: Array<{ name?: unknown; description?: unknown }>;
    value_for_customer?: unknown;
    best_fit_customers?: unknown;
    market_category?: unknown;
    category_rationale?: unknown;
    current_tagline?: unknown;
    proposed_tagline?: unknown;
  } | null;
  strategy?: {
    winning_aspiration?: unknown;
    where_to_play?: unknown;
    how_to_win?: unknown;
    capabilities?: Array<{ name?: unknown; note?: unknown }>;
    management_systems?: Array<{ name?: unknown; note?: unknown }>;
    assumptions?: Array<{ assumption?: unknown; note?: unknown }>;
  } | null;
}) {
  const strategicProblems = Array.isArray(args.strategicProblems) ? args.strategicProblems : [];
  const reconciledCount = strategicProblems.filter((item) => item.status === "reconciled").length;

  if (!strategicProblems.length) {
    return {
      score: 50,
      token_coverage: 50,
      statement_coverage: 50,
      matched_keywords: [] as string[],
      missing_keywords: [] as string[],
      status: "no_strategic_problem",
      strategic_problem_count: 0,
      reconciled_count: 0,
    };
  }

  const keywordSet = new Set<string>();
  for (const problem of strategicProblems) {
    for (const token of tokenizeStrategicText(problem.statement)) {
      keywordSet.add(token);
    }
  }
  const keywords = Array.from(keywordSet).slice(0, 28);

  if (!keywords.length) {
    return {
      score: 50,
      token_coverage: 50,
      statement_coverage: 50,
      matched_keywords: [] as string[],
      missing_keywords: [] as string[],
      status: "insufficient_problem_keywords",
      strategic_problem_count: strategicProblems.length,
      reconciled_count: reconciledCount,
    };
  }

  const opportunities = Array.isArray(args.opportunities) ? args.opportunities : [];
  const routes = Array.isArray(args.routes) ? args.routes : [];
  const positioning = args.positioning ?? {};
  const strategy = args.strategy ?? {};

  const corpusParts: string[] = [];
  for (const opp of opportunities) {
    corpusParts.push(String(opp?.outcome || ""));
    corpusParts.push(String(opp?.step_label || ""));
  }
  for (const route of routes) {
    corpusParts.push(String(route?.title || ""));
    corpusParts.push(String(route?.short_description || ""));
    corpusParts.push(String(route?.category || ""));
  }

  const compAlts = Array.isArray(positioning?.competitive_alternatives)
    ? positioning.competitive_alternatives
    : [];
  const uniqueAttrs = Array.isArray(positioning?.unique_attributes)
    ? positioning.unique_attributes
    : [];

  for (const alt of compAlts) {
    corpusParts.push(String(alt?.name || ""));
    corpusParts.push(String(alt?.description || ""));
  }
  for (const attr of uniqueAttrs) {
    corpusParts.push(String(attr?.name || ""));
    corpusParts.push(String(attr?.description || ""));
  }

  corpusParts.push(String(positioning?.value_for_customer || ""));
  corpusParts.push(String(positioning?.best_fit_customers || ""));
  corpusParts.push(String(positioning?.market_category || ""));
  corpusParts.push(String(positioning?.category_rationale || ""));
  corpusParts.push(String(positioning?.current_tagline || ""));
  corpusParts.push(String(positioning?.proposed_tagline || ""));

  corpusParts.push(String(strategy?.winning_aspiration || ""));
  corpusParts.push(String(strategy?.where_to_play || ""));
  corpusParts.push(String(strategy?.how_to_win || ""));

  const caps = Array.isArray(strategy?.capabilities) ? strategy.capabilities : [];
  const systems = Array.isArray(strategy?.management_systems) ? strategy.management_systems : [];
  const assumptions = Array.isArray(strategy?.assumptions) ? strategy.assumptions : [];

  for (const item of caps) {
    corpusParts.push(String(item?.name || ""));
    corpusParts.push(String(item?.note || ""));
  }
  for (const item of systems) {
    corpusParts.push(String(item?.name || ""));
    corpusParts.push(String(item?.note || ""));
  }
  for (const item of assumptions) {
    corpusParts.push(String(item?.assumption || ""));
    corpusParts.push(String(item?.note || ""));
  }

  const corpusTokens = new Set<string>(tokenizeStrategicText(corpusParts.join(" ")));
  const matchedKeywords = keywords.filter((keyword) => corpusTokens.has(keyword));
  const missingKeywords = keywords.filter((keyword) => !corpusTokens.has(keyword));
  const tokenCoverage = keywords.length ? matchedKeywords.length / keywords.length : 0.5;

  const statementCoverage =
    strategicProblems.filter((problem) =>
      tokenizeStrategicText(problem.statement).some((token) => corpusTokens.has(token))
    ).length / strategicProblems.length;

  const alignmentNorm = clamp(0.65 * tokenCoverage + 0.35 * statementCoverage, 0, 1);
  const score = round1(alignmentNorm * 100);

  return {
    score,
    token_coverage: round1(tokenCoverage * 100),
    statement_coverage: round1(statementCoverage * 100),
    matched_keywords: matchedKeywords.slice(0, 16),
    missing_keywords: missingKeywords.slice(0, 16),
    status: score >= 70 ? "aligned" : score >= 45 ? "partial" : "weak",
    strategic_problem_count: strategicProblems.length,
    reconciled_count: reconciledCount,
  };
}

// ── Evidence-layer band derivation (inlined — cannot import from src/lib) ─────
// TODO: Replace isPrimaryNeedsSourcePath with typed evidence_signals in v2 once
//       odi_needs.source_path is superseded by a typed evidence_signals relation.

type EvidenceBand =
  | "hypothesis_only"
  | "directional_not_validated"
  | "customer_evidenced"
  | "market_validated"
  | "proven_path"
  | "sustained_performance";

const BAND_REACHABLE_CAP: Record<EvidenceBand, number> = {
  hypothesis_only: 5,
  directional_not_validated: 12,
  customer_evidenced: 18,
  market_validated: 22,
  proven_path: 22,
  sustained_performance: 22,
};

const BAND_UNLOCKABLE_CAP: Record<EvidenceBand, number> = {
  hypothesis_only: 10,
  directional_not_validated: 22,
  customer_evidenced: 32,
  market_validated: 38,
  proven_path: 42,
  sustained_performance: 42,
};

const NON_PRIMARY_MARKERS = ["public", "baseline", "benchmark", "generated", "research-company", "uploaded_file"];
const PRIMARY_MARKERS = ["interview", "survey", "primary", "qualitative", "focus-group"];

function isPrimaryNeedsSourcePath(sourcePath: string | null | undefined): boolean {
  const s = String(sourcePath ?? "").toLowerCase();
  if (!s) return false;
  if (NON_PRIMARY_MARKERS.some((m) => s.includes(m))) return false;
  return PRIMARY_MARKERS.some((m) => s.includes(m));
}

function computeEvidenceBand(profile: {
  outside: { present: boolean; strength: number };
  org: { present: boolean; strength: number };
  customer: { present: boolean; strength: number };
  measurement: { present: boolean; strength: number };
}): EvidenceBand {
  const { outside, org, customer, measurement } = profile;
  if (outside.present && org.present && customer.present && measurement.present
    && outside.strength >= 0.5 && org.strength >= 0.5 && customer.strength >= 0.5) {
    return "sustained_performance";
  }
  if (customer.present && measurement.present && (org.present || outside.present)) {
    return "proven_path";
  }
  if (customer.present && (outside.present || org.strength >= 0.5)) {
    return "market_validated";
  }
  if (customer.present || org.strength >= 0.5) {
    return "customer_evidenced";
  }
  if (outside.present || org.present) {
    return "directional_not_validated";
  }
  return "hypothesis_only";
}

function computePotentialProjected(mojo_score: number, evidenceBand: EvidenceBand = "directional_not_validated") {
  const current = clamp(mojo_score, 0, 100);
  const headroom = 100 - current;
  const reachableCap = BAND_REACHABLE_CAP[evidenceBand];
  const unlockableCap = BAND_UNLOCKABLE_CAP[evidenceBand];

  const potential_score = Math.round(
    clamp(current + Math.min(reachableCap, headroom * 0.35), 0, 100),
  );
  const projected_score = Math.round(
    clamp(
      Math.max(potential_score + Math.min(5, headroom * 0.1), current + Math.min(unlockableCap, headroom * 0.62)),
      0,
      100,
    ),
  );

  return { potential_score, projected_score };
}

function computeDesiredOutcomeAlignment(args: {
  managedOutcomes?: Array<{
    journey_key?: unknown;
    outcome_statement?: unknown;
    leading_indicator?: unknown;
    metric?: unknown;
    object?: unknown;
    context?: unknown;
    is_primary?: unknown;
  }>;
  opportunities?: Array<{ outcome?: unknown; step_label?: unknown }>;
  routes?: Array<{ title?: unknown; short_description?: unknown }>;
}) {
  const outcomes = Array.isArray(args.managedOutcomes) ? args.managedOutcomes : [];
  const primary =
    outcomes.find((item) => item?.is_primary === true)
    || outcomes.find((item) => normalizeJourneyKey(item?.journey_key) === "customer")
    || outcomes[0]
    || null;

  if (!primary) {
    return {
      available: false,
      score: 50,
      primary_statement: null as string | null,
      coverage_ratio: 50,
      matched_keywords: [] as string[],
      missing_keywords: [] as string[],
      status: "not_available",
    };
  }

  const keywordSource = [
    String(primary?.outcome_statement || ""),
    String(primary?.leading_indicator || ""),
    String(primary?.metric || ""),
    String(primary?.object || ""),
    String(primary?.context || ""),
  ].join(" ");
  const keywords = Array.from(new Set(tokenizeStrategicText(keywordSource))).slice(0, 24);
  if (!keywords.length) {
    return {
      available: true,
      score: 50,
      primary_statement: String(primary?.outcome_statement || "").trim() || null,
      coverage_ratio: 50,
      matched_keywords: [] as string[],
      missing_keywords: [] as string[],
      status: "insufficient_keywords",
    };
  }

  const corpus = [
    ...(Array.isArray(args.opportunities) ? args.opportunities : []).map((item) =>
      `${String(item?.outcome || "")} ${String(item?.step_label || "")}`
    ),
    ...(Array.isArray(args.routes) ? args.routes : []).map((item) =>
      `${String(item?.title || "")} ${String(item?.short_description || "")}`
    ),
  ].join(" ");
  const corpusTokens = new Set(tokenizeStrategicText(corpus));
  const matched = keywords.filter((token) => corpusTokens.has(token));
  const missing = keywords.filter((token) => !corpusTokens.has(token));
  const coverage = keywords.length ? matched.length / keywords.length : 0.5;
  const score = round1(clamp(coverage * 100, 0, 100));

  return {
    available: true,
    score,
    primary_statement: String(primary?.outcome_statement || "").trim() || null,
    coverage_ratio: round1(coverage * 100),
    matched_keywords: matched.slice(0, 16),
    missing_keywords: missing.slice(0, 16),
    status: score >= 70 ? "aligned" : score >= 45 ? "partial" : "weak",
  };
}

function scoreCompanyMojo(args: {
  baselineResultJson: any | null;
  inputs: Array<{ input_key?: unknown; completeness?: unknown }>;
  jobSteps: Array<{
    journey_key?: unknown;
    journey_title?: unknown;
    journey_subtitle?: unknown;
    designed?: unknown;
    has_gap?: unknown;
  }>;
  opportunities: Array<{
    journey_key?: unknown;
    outcome?: unknown;
    step_label?: unknown;
    importance?: unknown;
    satisfaction?: unknown;
    priority_tier?: unknown;
  }>;
  routes?: Array<{ title?: unknown; short_description?: unknown; category?: unknown }>;
  managedOutcomes?: Array<{
    journey_key?: unknown;
    outcome_statement?: unknown;
    leading_indicator?: unknown;
    metric?: unknown;
    object?: unknown;
    context?: unknown;
    is_primary?: unknown;
  }>;
  positioning?: {
    competitive_alternatives?: Array<{ name?: unknown; description?: unknown }>;
    unique_attributes?: Array<{ name?: unknown; description?: unknown }>;
    value_for_customer?: unknown;
    best_fit_customers?: unknown;
    market_category?: unknown;
    category_rationale?: unknown;
    current_tagline?: unknown;
    proposed_tagline?: unknown;
  } | null;
  strategy?: {
    winning_aspiration?: unknown;
    where_to_play?: unknown;
    how_to_win?: unknown;
    capabilities?: Array<{ name?: unknown; note?: unknown }>;
    management_systems?: Array<{ name?: unknown; note?: unknown }>;
    assumptions?: Array<{ assumption?: unknown; note?: unknown }>;
  } | null;
  strategicProblems?: StrategicProblemStatement[];
  gamma?: number;
  excludedFingerprints?: ReadonlySet<string>;
  needsSourcePaths?: string[];
  // Operator-pinned on-strategy journey_key (from operator_primary_selection), threaded to
  // the initiative gate; honored only if it matches a generated set, else the heuristic.
  primaryJourneyKey?: string;
}) {
  const marketBaseline = deriveMarketBaselineCalibration(args.baselineResultJson);
  const safeInputs = Array.isArray(args.inputs) ? args.inputs : [];
  const safeSteps = Array.isArray(args.jobSteps) ? args.jobSteps : [];
  const safeOpps = Array.isArray(args.opportunities) ? args.opportunities : [];
  const rawLedger = Array.isArray(args.baselineResultJson?.evidence_ledger)
    ? args.baselineResultJson.evidence_ledger
    : [];
  const ledger = args.excludedFingerprints?.size
    ? rawLedger.filter((item: any) => !args.excludedFingerprints!.has(ledgerItemFingerprint(item)))
    : rawLedger;

  const ledgerCount = ledger.length;
  const avgConfidence = avg(
    ledger
      .map((item: any) => Number(item?.confidence))
      .filter((value: number) => Number.isFinite(value)),
  );
  const confNorm = normalizeConfidence(avgConfidence);
  const strengthNorm = avg(ledger.map((item: any) => normalizeSignalStrength(item?.signal_strength)));
  const baselineSupport = clamp(0.6 * confNorm + 0.4 * strengthNorm, 0, 1);

  const customerJourneySteps = safeSteps.filter((step) => isCustomerJourneyKey(step?.journey_key));
  const revenueSteps = safeSteps.filter((step) => normalizeJourneyKey(step?.journey_key) === "revenue");
  const opsSteps = safeSteps.filter((step) => normalizeJourneyKey(step?.journey_key) === "operations");

  const customerOpps = safeOpps.filter((opp) => isCustomerJourneyKey(opp?.journey_key));
  const revenueOpps = safeOpps.filter((opp) => normalizeJourneyKey(opp?.journey_key) === "revenue");
  const opsOpps = safeOpps.filter((opp) => normalizeJourneyKey(opp?.journey_key) === "operations");

  const underservedNorm = clamp(
    avg(
      safeOpps.map((opp) =>
        clamp((Number(opp?.importance) - Number(opp?.satisfaction)) / 9, 0, 1),
      ),
    ),
    0,
    1,
  );
  const oppCoverageNorm = ratio(safeOpps.length, 20);
  const focusNorm = safeOpps.length
    ? safeOpps.filter((opp) => String(opp?.priority_tier || "").toLowerCase() === "focus").length / safeOpps.length
    : 0;

  const positioningInputs = safeInputs.filter((input) => POSITIONING_KEYS.has(String(input?.input_key || "").trim()));
  const customerInputs = safeInputs.filter((input) => CUSTOMER_KEYS.has(String(input?.input_key || "").trim()));
  const strategyInputs = safeInputs.filter((input) => STRATEGY_KEYS.has(String(input?.input_key || "").trim()));
  const gtmInputs = safeInputs.filter((input) => GTM_KEYS.has(String(input?.input_key || "").trim()));

  const positioningCoverage = ratio(positioningInputs.length, POSITIONING_KEYS.size);
  const customerCoverage = ratio(customerInputs.length, CUSTOMER_KEYS.size);
  const strategyCoverage = ratio(strategyInputs.length, STRATEGY_KEYS.size);
  const gtmCoverage = ratio(gtmInputs.length, GTM_KEYS.size);
  const strategicAlignment = computeStrategicProblemAlignment({
    strategicProblems: args.strategicProblems,
    opportunities: safeOpps,
    routes: args.routes,
    positioning: args.positioning ?? null,
    strategy: args.strategy ?? null,
  });
  const desiredOutcomeAlignment = computeDesiredOutcomeAlignment({
    managedOutcomes: args.managedOutcomes,
    opportunities: safeOpps,
    routes: args.routes,
  });
  const initiativeBase = deriveInitiativeFocusContext({
    jobSteps: safeSteps,
    strategicProblems: args.strategicProblems,
    pinnedJourneyKey: args.primaryJourneyKey,
  });
  const initiativeSteps = safeSteps.filter((step) => {
    const key = normalizeJourneyKey(step?.journey_key);
    if (key === initiativeBase.primary_journey_key) return true;
    return initiativeBase.primary_journey_key === "customer" && isCustomerJourneyKey(key);
  });
  const opportunityFocus = safeOpps.map((opp) => {
    const journeyKey = normalizeJourneyKey(opp?.journey_key);
    const overlap = keywordOverlap(
      `${String(opp?.outcome || "")} ${String(opp?.step_label || "")}`,
      initiativeBase.initiative_keywords,
    );
    const directJourneyMatch =
      journeyKey === initiativeBase.primary_journey_key ||
      (initiativeBase.primary_journey_key === "customer" && isCustomerJourneyKey(journeyKey));
    if (directJourneyMatch || overlap >= 2) return "initiative" as const;
    if (overlap >= 1) return "related" as const;
    return "other" as const;
  });
  const routeFocus = (Array.isArray(args.routes) ? args.routes : []).map((route) => {
    const overlap = keywordOverlap(
      `${String(route?.title || "")} ${String(route?.short_description || "")}`,
      initiativeBase.initiative_keywords,
    );
    if (overlap >= 2) return "initiative" as const;
    if (overlap >= 1) return "related" as const;
    return "other" as const;
  });
  const opportunityFocusCounts = {
    initiative: opportunityFocus.filter((level) => level === "initiative").length,
    related: opportunityFocus.filter((level) => level === "related").length,
    other: opportunityFocus.filter((level) => level === "other").length,
  };
  const routeFocusCounts = {
    initiative: routeFocus.filter((level) => level === "initiative").length,
    related: routeFocus.filter((level) => level === "related").length,
    other: routeFocus.filter((level) => level === "other").length,
  };
  const initiativeOppRatio = safeOpps.length ? opportunityFocusCounts.initiative / safeOpps.length : 0;
  const relatedOppRatio = safeOpps.length ? opportunityFocusCounts.related / safeOpps.length : 0;
  const routeCount = routeFocus.length;
  const initiativeRouteRatio = routeCount ? routeFocusCounts.initiative / routeCount : 0;
  const relatedRouteRatio = routeCount ? routeFocusCounts.related / routeCount : 0;
  const initiativeJourneyHealth = journeyHealth(initiativeSteps);
  const initiativeFocusNorm = clamp(
    0.5 * initiativeOppRatio + 0.25 * initiativeRouteRatio + 0.25 * initiativeJourneyHealth,
    0,
    1,
  );
  const initiativeFocusMultiplier = round1(clamp(0.7 + 0.3 * initiativeFocusNorm, 0.7, 1));
  const strategicAlignmentNorm = clamp(strategicAlignment.score / 100, 0, 1);
  const desiredOutcomeAlignmentNorm = desiredOutcomeAlignment.available
    ? clamp(desiredOutcomeAlignment.score / 100, 0, 1)
    : strategicAlignmentNorm;

  const positioning = round1(
    100 * (
      0.5 * positioningCoverage +
      0.25 * baselineSupport +
      0.15 * ratio(ledgerCount, 8) +
      0.1 * averageCompleteness(positioningInputs)
    ),
  );
  const customer_insight = round1(
    100 * (
      0.2 * customerCoverage +
      0.25 * oppCoverageNorm +
      0.2 * underservedNorm +
      0.2 * journeyHealth(customerJourneySteps) +
      0.15 * ratio(customerOpps.length, 8)
    ),
  );
  const strategy_cascade = round1(
    100 * (
      0.2 * strategyCoverage +
      0.15 * journeyHealth(revenueSteps) +
      0.15 * journeyHealth(opsSteps) +
      0.15 * baselineSupport +
      0.1 * ratio(revenueOpps.length + opsOpps.length, 12) +
      0.1 * averageCompleteness(strategyInputs) +
      0.12 * strategicAlignmentNorm +
      0.03 * desiredOutcomeAlignmentNorm
    ),
  );
  const gtm_execution = round1(
    100 * (
      0.3 * gtmCoverage +
      0.2 * journeyHealth(revenueSteps) +
      0.15 * ratio(revenueOpps.length, 8) +
      0.15 * ratio(opsOpps.length, 8) +
      0.1 * focusNorm +
      0.1 * averageCompleteness(gtmInputs)
    ),
  );

  const perGateScores = {
    positioning: clamp(positioning, 0, 100),
    customer_insight: clamp(customer_insight, 0, 100),
    strategy_cascade: clamp(strategy_cascade, 0, 100),
    gtm_execution: clamp(gtm_execution, 0, 100),
  };

  const inputsCount = safeInputs.length;
  const stepsCount = safeSteps.length;
  const oppsCount = safeOpps.length;

  const baselineStrength = clamp(
    0.55 * ratio(ledgerCount, 12) + 0.45 * confNorm,
    0,
    1,
  );
  const artifactCoverage = clamp(
    0.35 * ratio(inputsCount, 14) +
      0.3 * ratio(stepsCount, 18) +
      0.35 * ratio(oppsCount, 20),
    0,
    1,
  );
  const evidenceMultiplier = round1(
    clamp(0.6 + 0.18 * baselineStrength + 0.22 * artifactCoverage, 0.6, 1.0),
  );

  let evidence_status =
    ledgerCount === 0 && artifactCoverage === 0
      ? "no_public_evidence"
      : ledgerCount === 0
        ? "generated_no_baseline"
        : baselineStrength < 0.35
          ? "public_evidence_thin"
          : baselineStrength < 0.65
            ? "public_evidence_partial"
            : artifactCoverage >= 0.45
              ? "baseline_plus_artifacts"
              : "public_evidence_strong";

  const gateScore = round1(weightedHarmonicMean([
    { value: perGateScores.positioning, weight: 0.3 },
    { value: perGateScores.customer_insight, weight: 0.25 },
    { value: perGateScores.strategy_cascade, weight: 0.25 },
    { value: perGateScores.gtm_execution, weight: 0.2 },
  ]));

  const gamma = Number.isFinite(args.gamma) ? Number(args.gamma) : 2.2;
  const clarityNorm = clamp((perGateScores.positioning + perGateScores.strategy_cascade) / 200, 0, 1);
  const marketDefinitionNorm = clamp(perGateScores.positioning / 100, 0, 1);
  const customerInsightNorm = clamp(perGateScores.customer_insight / 100, 0, 1);
  const failureCorrectionNorm = clamp(
    0.4 * clarityNorm + 0.3 * marketDefinitionNorm + 0.3 * customerInsightNorm,
    0,
    1,
  );
  const failureCorrectionMultiplier = round1(clamp(0.6 + 0.4 * failureCorrectionNorm, 0.6, 1));
  const p_raw = clamp(
    (gateScore / 100) * evidenceMultiplier * initiativeFocusMultiplier * failureCorrectionMultiplier,
    0,
    1,
  );
  const p_curve = clamp(Math.pow(p_raw, gamma), 0, 1);
  const benchmarkPRaw = marketBaseline.typical / 100;
  const advantagePoints = Math.max(0, (p_raw - benchmarkPRaw) * 35);
  const curvePoints = Math.max(0, p_curve * 45);
  const mojo_score = Math.round(
    clamp(
      marketBaseline.typical + advantagePoints + curvePoints,
      marketBaseline.typical,
      100,
    ),
  );
  const safeNeedsPaths = Array.isArray(args.needsSourcePaths) ? args.needsSourcePaths : [];
  const hasPrimaryCustomer = safeNeedsPaths.some(isPrimaryNeedsSourcePath);
  const primaryRatio = safeNeedsPaths.length > 0
    ? safeNeedsPaths.filter(isPrimaryNeedsSourcePath).length / safeNeedsPaths.length
    : 0;
  const evidenceBand = computeEvidenceBand({
    outside: { present: baselineStrength > 0, strength: baselineStrength },
    org: { present: artifactCoverage > 0, strength: artifactCoverage },
    customer: { present: hasPrimaryCustomer, strength: primaryRatio },
    measurement: { present: ledgerCount >= 20, strength: Math.min(ledgerCount / 40, 1) },
  });
  const { potential_score, projected_score } = computePotentialProjected(mojo_score, evidenceBand);

  const evidence_note =
    ledgerCount > 0
      ? `ledger=${ledgerCount}, avg_conf=${avgConfidence.toFixed(1)}, artifacts=${Math.round(artifactCoverage * 100)}%`
      : `no baseline ledger, artifacts=${Math.round(artifactCoverage * 100)}%`;

  const area_scores_json = {
    scoring_version: "mojo_v3",
    gate_weights: {
      positioning: 0.3,
      customer_insight: 0.25,
      strategy_cascade: 0.25,
      gtm_execution: 0.2,
    },
    gate_score: gateScore,
    per_gate_scores: {
      positioning: {
        label: "Positioning",
        score: perGateScores.positioning,
      },
      customer_insight: {
        label: "Customer Insight",
        score: perGateScores.customer_insight,
      },
      strategy_cascade: {
        label: "Strategy Cascade",
        score: perGateScores.strategy_cascade,
        strategic_problem_alignment: strategicAlignment.score,
        desired_outcome_alignment: desiredOutcomeAlignment.score,
      },
      gtm_execution: {
        label: "GTM Execution",
        score: perGateScores.gtm_execution,
      },
    },
    evidence: {
      multiplier: evidenceMultiplier,
      status: evidence_status,
      note: evidence_note,
      baseline_strength: round1(baselineStrength * 100),
      artifact_coverage: round1(artifactCoverage * 100),
      ledger_count: ledgerCount,
      avg_confidence: round1(avgConfidence),
    },
    counts: {
      inputs: inputsCount,
      job_steps: stepsCount,
      opportunities: oppsCount,
      evidence_ledger: ledgerCount,
      strategic_problems: strategicAlignment.strategic_problem_count,
      desired_outcomes: Array.isArray(args.managedOutcomes) ? args.managedOutcomes.length : 0,
    },
    desired_outcome_context: desiredOutcomeAlignment,
    strategic_problem_context: strategicAlignment,
    initiative_context: {
      ...initiativeBase,
      opportunity_focus: {
        ...opportunityFocusCounts,
        initiative_ratio: round1(initiativeOppRatio * 100),
        related_ratio: round1(relatedOppRatio * 100),
      },
      route_focus: {
        ...routeFocusCounts,
        initiative_ratio: round1(initiativeRouteRatio * 100),
        related_ratio: round1(relatedRouteRatio * 100),
      },
      step_focus: {
        initiative_steps: initiativeSteps.length,
        initiative_journey_health: round1(initiativeJourneyHealth * 100),
      },
      initiative_focus_norm: round1(initiativeFocusNorm * 100),
      initiative_focus_multiplier: initiativeFocusMultiplier,
    },
    calibration: {
      gamma,
      p_raw: round1(p_raw * 100) / 100,
      p_curve: round1(p_curve * 100) / 100,
      market_baseline_points: marketBaseline.typical,
      benchmark_p_raw: round1(benchmarkPRaw * 100) / 100,
      advantage_points: round1(advantagePoints),
      curve_points: round1(curvePoints),
      failure_correction_norm: round1(failureCorrectionNorm * 100) / 100,
      failure_correction_multiplier: round1(failureCorrectionMultiplier * 100) / 100,
      initiative_focus_multiplier: initiativeFocusMultiplier,
      market_statistics: {
        typical_success_low_pct: marketBaseline.low,
        typical_success_pct: marketBaseline.typical,
        typical_success_high_pct: marketBaseline.high,
        source: marketBaseline.source,
        as_of: marketBaseline.as_of,
        proven: marketBaseline.proven,
        interpretation: "Current reality starts from a market baseline and rises as validated readiness improves.",
      },
    },
    outputs: {
      mojo_score,
      potential_score,
      projected_score,
      evidence_band: evidenceBand,
    },
  };

  return {
    mojo_score,
    potential_score,
    projected_score,
    evidence_status,
    evidence_note,
    area_scores_json,
  };
}

type InputGroupKey = "foundation" | "execution" | "market_evidence";

/**
 * Fallback grouping by key when model output is missing/invalid.
 */
const INPUT_GROUP_BY_KEY: Record<string, InputGroupKey> = {
  // foundation (7)
  "comp-alt": "foundation",
  "unique-attr": "foundation",
  "val-prop": "foundation",
  "target-aud": "foundation",
  "market-cat": "foundation",
  "operating-model": "foundation",
  "customer-research": "foundation",

  // execution (3)
  "acquisition-map": "execution",
  "brand-narrative": "execution",
  "channel-strat": "execution",

  // market evidence (4)
  "outcome-evidence": "market_evidence",
  "retention-signals": "market_evidence",
  "demand-pipeline": "market_evidence",
  "customer-signals": "market_evidence",
};

function groupLabelForKey(groupKey: InputGroupKey) {
  if (groupKey === "execution") return "Execution";
  if (groupKey === "market_evidence") return "Market Evidence";
  return "Foundation";
}

function normalizeInputGroupKey(args: {
  inputKey: string;
  inputGroupKey?: string;
  subGroup?: string;
}): InputGroupKey {
  const key = String(args.inputKey || "").trim();
  const rawGroup = String(args.inputGroupKey || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  if (rawGroup === "foundation" || rawGroup === "execution" || rawGroup === "market_evidence") {
    return rawGroup;
  }

  if (key === "customer-research") return "foundation";
  if (key === "outcome-evidence") return "market_evidence";

  const sub = String(args.subGroup || "").toLowerCase();
  if (/\bmarket evidence\b|\bevidence\b|\bvalidation\b|\bretention\b|\bpipeline\b|\bexperience\b/.test(sub)) {
    return "market_evidence";
  }
  if (/\bgtm\b|\bchannel\b|\bmessaging\b|\bnarrative\b|\breferral\b|\bacquisition\b/.test(sub)) {
    return "execution";
  }

  return INPUT_GROUP_BY_KEY[key] ?? "foundation";
}

/**
 * Fixed input key order (always 14)
 */
const INPUT_KEYS: string[] = [
  "comp-alt",
  "unique-attr",
  "val-prop",
  "target-aud",
  "market-cat",
  "operating-model",
  "customer-research",
  "outcome-evidence",
  "acquisition-map",
  "brand-narrative",
  "channel-strat",
  "retention-signals",
  "demand-pipeline",
  "customer-signals",
];

const repairBundleSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    inputs: {
      type: "array",
      minItems: 14,
      maxItems: 14,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          input_key: { type: "string", enum: INPUT_KEYS },
          group_key: { type: "string", enum: ["foundation", "execution", "market_evidence"] },
          input_label: { type: "string" },
          sub_group: { type: "string" },
          description: { type: "string" },
          why_it_matters: { type: "string" },
        },
        required: ["input_key", "group_key", "input_label", "sub_group", "description", "why_it_matters"],
      },
    },
    journeys: {
      type: "array",
      minItems: 1,
      maxItems: 3,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          journey_key: { type: "string" },
          journey_title: { type: "string" },
          journey_subtitle: { type: "string" },
          steps: {
            type: "array",
            minItems: 5,
            maxItems: 8,
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                step_number: { type: "integer" },
                step_label: { type: "string" },
                description: { type: "string" },
                designed: { type: "boolean" },
                has_gap: { type: "boolean" },
                evidence_status: { type: "string", enum: ["evidenced", "implied", "unclear"] },
                evidence_basis: { type: "string" },
                evidence_confidence: { type: "integer" },
                gap_note: { type: "string" },
              },
              required: ["step_number", "step_label", "description", "designed", "has_gap", "evidence_status", "evidence_basis", "evidence_confidence", "gap_note"],
            },
          },
        },
        required: ["journey_key", "journey_title", "journey_subtitle", "steps"],
      },
    },
    opportunities: {
      type: "array",
      minItems: 8,
      maxItems: 20,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          outcome: { type: "string" },
          step_number: { type: "integer" },
          step_label: { type: "string" },
          journey_key: { type: "string", enum: ["customer"] },
          importance: { type: "integer" },
          satisfaction: { type: "integer" },
          opportunity_score: { type: "integer" },
          priority_tier: { type: "string", enum: ["focus", "monitor", "defer"] },
        },
        required: ["outcome", "step_number", "step_label", "journey_key", "importance", "satisfaction", "opportunity_score", "priority_tier"],
      },
    },
    routes: {
      type: "array",
      minItems: 4,
      maxItems: 12,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          category: { type: "string", enum: ["fix", "improve", "create"] },
          title: { type: "string" },
          short_description: { type: "string" },
          pts_value: { type: "integer" },
          effort: { type: "string", enum: ["low", "medium", "high"] },
          type: { type: "string", enum: ["Fix", "Improve", "Create"] },
          sort_order: { type: "integer" },
        },
        required: ["category", "title", "short_description", "pts_value", "effort", "type", "sort_order"],
      },
    },
    positioning: {
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
            },
            required: ["id", "name", "description", "highlighted"],
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
    },
    strategy: {
      type: "object",
      additionalProperties: false,
      properties: {
        winning_aspiration: { type: "string" },
        where_to_play: { type: "string" },
        how_to_win: { type: "string" },
        capabilities: {
          type: "array",
          minItems: 4,
          maxItems: 8,
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              name: { type: "string" },
              status: { type: "string", enum: ["strong", "developing", "gap"] },
              note: { type: "string" },
            },
            required: ["name", "status", "note"],
          },
        },
        management_systems: {
          type: "array",
          minItems: 4,
          maxItems: 8,
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              name: { type: "string" },
              status: { type: "string", enum: ["strong", "developing", "gap"] },
              note: { type: "string" },
            },
            required: ["name", "status", "note"],
          },
        },
        assumptions: {
          type: "array",
          minItems: 4,
          maxItems: 8,
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              assumption: { type: "string" },
              tested: { type: "boolean" },
              note: { type: "string" },
            },
            required: ["assumption", "tested", "note"],
          },
        },
      },
      required: [
        "winning_aspiration",
        "where_to_play",
        "how_to_win",
        "capabilities",
        "management_systems",
        "assumptions",
      ],
    },
  },
  required: ["inputs", "journeys", "opportunities", "routes", "positioning", "strategy"],
};

const managedOutcomesSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    outcomes: {
      type: "array",
      minItems: 1,
      maxItems: 5,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          journey_key:    { type: "string", enum: ["customer"] },
          outcome_title:  { type: "string" },
          outcome_statement: { type: "string" },
          leading_indicator: { type: "string" },
          target_direction:  { type: "string" },
          direction:  { type: "string" },
          metric:     { type: "string" },
          actor:      { type: "string" },
          action:     { type: "string" },
          object:     { type: "string" },
          context:    { type: "string" },
          constraint: { type: "string" },
          is_primary: { type: "boolean" },
          level: { type: "string", enum: ["primary", "secondary", "tertiary"] },
          stage: { type: "string", enum: ["outside", "diagnose", "focus", "flow"] },
          evidence_level: {
            type: "string",
            enum: ["external_only", "internal_partial", "validated", "strong_validated"],
          },
          why_this_level:  { type: "string" },
          why_behavioral:  { type: "string" },
          leading_indicators:  { type: "array", items: { type: "string" } },
          lagging_indicators:  { type: "array", items: { type: "string" } },
          related_opportunity_areas: { type: "array", items: { type: "string" } },
          evidence_basis: { type: "string" },
          confidence:     { type: "integer" },
        },
        required: [
          "journey_key",
          "outcome_title",
          "outcome_statement",
          "leading_indicator",
          "target_direction",
          "direction",
          "metric",
          "actor",
          "action",
          "object",
          "context",
          "constraint",
          "is_primary",
          "level",
          "stage",
          "evidence_level",
          "why_this_level",
          "why_behavioral",
          "leading_indicators",
          "lagging_indicators",
          "related_opportunity_areas",
          "evidence_basis",
          "confidence",
        ],
      },
    },
  },
  required: ["outcomes"],
};

async function runFinalizer(opts: {
  apiKey: string;
  model: string;
  companyName: string;
  website: string;
  baselineBrief: string;
  strategicProblemBrief?: string;
  odiBrief: string;
  inputs: unknown;
  journeys: unknown;
  opportunities: unknown;
  routes: unknown;
  positioning: unknown;
  strategy: unknown;
  reviews: unknown;
}) {
  const userText =
    `Company: ${opts.companyName}\nWebsite: ${opts.website || "unknown"}\n\n` +
    `Evidence context:\n${opts.baselineBrief}\n\n` +
    `Client-stated strategic problems:\n${opts.strategicProblemBrief || "None provided"}\n\n` +
    `Derived ODI context:\n${opts.odiBrief}\n\n` +
    `Current inputs:\n${buildInputBrief(opts.inputs)}\n\n` +
    `Current journeys:\n${buildJourneyBrief(opts.journeys)}\n\n` +
    `Current opportunities:\n${buildOpportunityBrief(opts.opportunities)}\n\n` +
    `Current routes:\n${buildRouteBrief(opts.routes)}\n\n` +
    `Current positioning:\n${buildPositioningBrief(opts.positioning)}\n\n` +
    `Current strategy:\n${buildStrategyBrief(opts.strategy)}\n\n` +
    `Reviewer findings:\n${JSON.stringify(opts.reviews)}\n\n` +
    `Revise only the flagged areas and return the full repaired bundle.`;

  const systemText =
    `You are a careful strategy finalizer.\n` +
    `Return ONLY valid JSON matching the schema. No prose.\n` +
    `Revise only the areas identified by reviewer findings.\n` +
    `Do not rewrite unaffected areas for style alone.\n` +
    `Stay strictly consistent with the provided evidence context and ODI context.\n` +
    `Ensure revisions remain aligned to client-stated strategic problems.\n` +
    `If a reviewer flags unsupported certainty, reduce precision instead of inventing facts.\n` +
    `Keep market category and where-to-play phrasing aligned to a standard category frame of reference and ODI job context.\n`;

  return await callOpenAIJSON({
    apiKey: opts.apiKey,
    model: opts.model,
    schemaName: "mojo_repair_bundle_v1",
    schema: repairBundleSchema,
    systemText,
    userText,
    maxOutputTokens: 2800,
    temperature: 0.15,
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    console.log("[research-company] method", req.method);

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const openaiKey = Deno.env.get("OPENAI_API_KEY");
    const openaiModel = Deno.env.get("OPENAI_MODEL") || "gpt-4.1-mini";

    if (!supabaseUrl || !serviceRoleKey || !anonKey) return jsonResponse({ error: "Missing Supabase env vars" }, 500);
    if (!openaiKey) return jsonResponse({ error: "Missing OPENAI_API_KEY" }, 500);

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Validate user session (even if served with --no-verify-jwt)
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return jsonResponse({ error: "No auth header" }, 401);
    const bearerToken = authHeader.replace(/^Bearer\s+/i, "").trim();

    // Accept service role key directly (internal/orchestrator calls) or user JWT.
    // Dedicated service-role identity in auth.users — email: system@mojomap.internal (A55).
    // Satisfies inputs.user_id FK to auth.users(id). Migration: 20260518000002_create_service_role_user.sql
    const SERVICE_ROLE_UUID = "1a27cf29-554a-46e9-bab8-0e238f9dc088";
    let user: { id: string } | null = null;
    if (bearerToken === serviceRoleKey) {
      user = { id: SERVICE_ROLE_UUID };
    } else {
      const anonClient = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: userRes, error: authError } = await anonClient.auth.getUser();
      if (authError || !userRes?.user) return jsonResponse({ error: "Unauthorized" }, 401);
      user = userRes.user;
    }

    const body = await req.json().catch(() => ({}));
    const bodyRecord = asRecord(body) || {};
    const requestedJourneyKey = normalizeJourneyKey(bodyRecord?.journey_key ?? bodyRecord?.journey_id);
    const runtimeContract = parseRuntimeContract(bodyRecord);
    if (runtimeContract.errors.length > 0) {
      return jsonResponse({
        error: "invalid_runtime_contract",
        details: runtimeContract.errors,
        request_id: runtimeContract.request_id,
        run_id: runtimeContract.run_id,
      }, 422);
    }

    const company_id = bodyRecord?.company_id;
    const company_name = bodyRecord?.company_name;
    const website = typeof bodyRecord?.website === "string" ? bodyRecord.website : "";
    const reviewMode = String(bodyRecord?.review_mode || "").trim().toLowerCase();
    const allowHighSeverityReviewSave = reviewMode === "advisory" || bodyRecord?.allow_review_block_save === true;
    const dry_run = bodyRecord?.dry_run === true;
    const contextMode = String(bodyRecord?.context_mode || "").trim().toLowerCase();
    const forceUploadedOnlyContext = contextMode === "uploaded_only" || bodyRecord?.prefer_uploaded_context === true;
    let requestedJourneyKeys = parseRequestedJourneyKeys(bodyRecord?.journeys_to_generate);
    let submittedJobMaps = parseSelectedJobMaps(bodyRecord?.job_maps);
    const strictSingleJourneyMode = runtimeContract.strict && runtimeContract.orchestrator_mode === "off";

    if (strictSingleJourneyMode) {
      const strictJourneyKey = runtimeContract.journey_key as JourneyKey;
      if (!isCustomerJourneyKey(strictJourneyKey)) {
        return jsonResponse({
          error: "unsupported_journey_key_for_research_pipeline",
          status: "unsupported_journey_key_for_research_pipeline",
          message: "Current research pipeline requires a customer journey_key when strict framework mode is enabled.",
          journey_key: strictJourneyKey,
          request_id: runtimeContract.request_id,
          run_id: runtimeContract.run_id,
        }, 422);
      }
      requestedJourneyKeys = [strictJourneyKey];
      const submittedByKey = new Map(submittedJobMaps.map((map) => [map.journey_key, map]));
      submittedJobMaps = [
        submittedByKey.get(strictJourneyKey) || {
          journey_key: strictJourneyKey,
          journey_title: sanitizeJobMapTitle(bodyRecord?.journey_title, strictJourneyKey),
          journey_subtitle: sanitizeJobMapSubtitle(bodyRecord?.journey_subtitle, strictJourneyKey),
          source: "selected" as const,
        },
      ];
    } else if (requestedJourneyKey) {
      requestedJourneyKeys = [requestedJourneyKey];
      const submittedByKey = new Map(submittedJobMaps.map((map) => [map.journey_key, map]));
      submittedJobMaps = [
        submittedByKey.get(requestedJourneyKey) || {
          journey_key: requestedJourneyKey,
          journey_title: sanitizeJobMapTitle(bodyRecord?.journey_title, requestedJourneyKey),
          journey_subtitle: sanitizeJobMapSubtitle(bodyRecord?.journey_subtitle, requestedJourneyKey),
          source: "selected" as const,
        },
      ];
    }

    if (!company_id || !company_name) {
      return jsonResponse({ error: "company_id and company_name required" }, 400);
    }

    const { data: companyRow, error: companySourceFilterErr } = await supabase
      .from("companies")
      .select("public_source_filters_json, excluded_signals_json, manual_industry_vocab")
      .eq("id", company_id)
      .maybeSingle();
    if (companySourceFilterErr) {
      console.log("[research-company] company row fetch error:", companySourceFilterErr.message);
    }
    const baselineSourceFilters = normalizeBaselineSourceFilters(
      bodyRecord?.public_source_filters_json ??
        companyRow?.public_source_filters_json ??
        null,
    );

    // Build excluded ledger fingerprint set from DB-persisted exclusions.
    // Only evidence_ledger fingerprints are applied to scoring; voice signal
    // fingerprints stored in excluded_signals_json are ignored here (display-only).
    const rawExcluded = Array.isArray((companyRow as any)?.excluded_signals_json)
      ? (companyRow as any).excluded_signals_json as Array<{ fingerprint?: string }>
      : [];
    const excludedLedgerFingerprints: ReadonlySet<string> = new Set(
      rawExcluded.map((e) => e?.fingerprint ?? "").filter(Boolean),
    );

    const lockTtlMinutes = 15;
    let stopLockHeartbeat: (() => void) | null = null;

    if (!dry_run && user.id !== SERVICE_ROLE_UUID) {
      const lockResult = await acquireCompanyRunLock({
        supabase,
        companyId: company_id,
        userId: user.id,
        operation: "research",
        ttlMinutes: lockTtlMinutes,
      });

      if (lockResult) {
        return jsonResponse({
          error: "Research is already running for this company",
          status: "company_locked",
          operation: lockResult.existing?.operation ?? "unknown",
          started_at: lockResult.existing?.started_at ?? null,
          expires_at: lockResult.existing?.expires_at ?? null,
        }, 409);
      }

      stopLockHeartbeat = startCompanyRunLockHeartbeat({
        supabase,
        companyId: company_id,
        ttlMinutes: lockTtlMinutes,
      });
    }

    try {
    // ✅ Fetch recent public baselines and prefer the latest strong run.
    const { data: baselineRuns, error: baselineErr } = await supabase
      .from("public_baseline_runs")
      .select("id, created_at, result_json")
      .eq("company_id", company_id)
      .order("created_at", { ascending: false })
      .limit(12);

    if (baselineErr) console.log("[research-company] baseline fetch error:", baselineErr.message);

    type BaselineRunRow = { id?: number | string; created_at?: string; result_json?: unknown };
    const recentBaselineRuns = (Array.isArray(baselineRuns) ? baselineRuns : []) as BaselineRunRow[];
    const latestBaselineRun = recentBaselineRuns[0] ?? null;
    const isWeakBaselineStatus = (status: string) =>
      status === "ambiguous_public_evidence" || status === "insufficient_public_evidence";
    const baselineStatusFor = (run: BaselineRunRow | null) =>
      String((run?.result_json as { status?: string } | null)?.status || "ok");
    const baselineReasonFor = (run: BaselineRunRow | null) =>
      String((run?.result_json as { reason?: string } | null)?.reason || "");

    const fallbackStrongBaseline =
      recentBaselineRuns.find((run) => !isWeakBaselineStatus(baselineStatusFor(run))) ?? null;
    const baselineRun = fallbackStrongBaseline ?? latestBaselineRun;

    if (
      latestBaselineRun &&
      baselineRun &&
      String(latestBaselineRun?.id ?? "") !== String(baselineRun?.id ?? "")
    ) {
      console.log("[research-company] latest baseline weak; falling back to prior strong baseline", {
        company_id,
        latest_baseline_run_id: latestBaselineRun?.id ?? null,
        latest_status: baselineStatusFor(latestBaselineRun),
        fallback_baseline_run_id: baselineRun?.id ?? null,
        fallback_status: baselineStatusFor(baselineRun),
      });
    }

    const baselineStatus = baselineStatusFor(baselineRun);
    const baselineReason = baselineReasonFor(baselineRun);
    const uploadedEvidenceContext = await buildUploadedEvidenceContext({
      supabase,
      companyId: company_id,
    });
    const hasWeakBaselineStatus =
      baselineStatus === "ambiguous_public_evidence" || baselineStatus === "insufficient_public_evidence";
    const hasUploadedEvidence = uploadedEvidenceContext.fileCount > 0;
    let researchContextMode: "public_baseline" | "uploaded_evidence_fallback" = "public_baseline";
    let effectiveBaselineResultJson: unknown = baselineRun?.result_json ?? null;
    if (baselineSourceFilters.exclude_domains.length > 0 && effectiveBaselineResultJson) {
      effectiveBaselineResultJson = pruneBlockedReferencesFromBaseline(
        effectiveBaselineResultJson,
        baselineSourceFilters,
      );
    }

    if (forceUploadedOnlyContext && !hasUploadedEvidence) {
      return jsonResponse({
        error: "Uploaded-only context was requested, but no uploaded files were found.",
        status: "uploaded_context_requires_files",
      }, 422);
    }

    if (forceUploadedOnlyContext && hasUploadedEvidence) {
      researchContextMode = "uploaded_evidence_fallback";
      effectiveBaselineResultJson = null;
      console.log("[research-company] forcing uploaded-only context", {
        company_id,
        baseline_run_id: baselineRun?.id ?? null,
        uploaded_file_count: uploadedEvidenceContext.fileCount,
      });
    }

    if (!forceUploadedOnlyContext && hasWeakBaselineStatus && !hasUploadedEvidence) {
      console.log("[research-company] blocked by baseline status", {
        company_id,
        baseline_run_id: baselineRun?.id ?? null,
        baselineStatus,
        baselineReason,
      });

      await persistResearchReviewRun({
        supabase,
        companyId: company_id,
        userId: user.id,
        baselineRunId: baselineRun?.id ?? null,
        status: baselineStatus,
        reviewSummary: baselineReason || "Latest public baseline does not have enough trustworthy evidence.",
        reviews: [],
        finalizerApplied: false,
      });

      return jsonResponse({
        error: "Public baseline is not strong enough to generate company research",
        status: baselineStatus,
        reason: baselineReason || "Latest public baseline does not have enough trustworthy evidence.",
        baseline_run_id: baselineRun?.id ?? null,
      }, 422);
    }

    if (!forceUploadedOnlyContext && hasWeakBaselineStatus && hasUploadedEvidence) {
      researchContextMode = "uploaded_evidence_fallback";
      effectiveBaselineResultJson = null;
      console.log("[research-company] weak public baseline; continuing with uploaded evidence fallback", {
        company_id,
        baseline_run_id: baselineRun?.id ?? null,
        baselineStatus,
        uploaded_file_count: uploadedEvidenceContext.fileCount,
      });

      await persistResearchReviewRun({
        supabase,
        companyId: company_id,
        userId: user.id,
        baselineRunId: baselineRun?.id ?? null,
        status: "uploaded_evidence_fallback",
        reviewSummary:
          (baselineReason || "Public evidence was weak or ambiguous.") +
          ` Proceeding with uploaded company evidence (${uploadedEvidenceContext.fileCount} file(s)).`,
        reviews: [],
        finalizerApplied: false,
      });
    }

    const { data: strategicProblemRows, error: strategicProblemErr } = await supabase
      .from("strategy_problem_statements")
      .select("id, statement, source, status, reconciliation_note")
      .eq("company_id", company_id)
      .order("created_at", { ascending: true })
      .limit(80);

    if (strategicProblemErr) {
      console.log("[research-company] strategic problem fetch error:", strategicProblemErr.message);
    }

    const strategicProblems = normalizeStrategicProblems(strategicProblemRows ?? []);
    const { data: strategicAssumptionRows, error: strategicAssumptionErr } = await supabase
      .from("strategy_assumptions")
      .select("id, assumption, source, status, note")
      .eq("company_id", company_id)
      .order("created_at", { ascending: true })
      .limit(120);

    if (strategicAssumptionErr) {
      console.log("[research-company] strategic assumption fetch error:", strategicAssumptionErr.message);
    }

    const strategicAssumptions = normalizeStrategicAssumptions(strategicAssumptionRows ?? []);
    // OPTION B (Phase 1): client-stated strategic problems + assumptions are INTERNAL —
    // they must not reach research-company's OpenAI calls (gen + reviewers). Held out of the
    // OpenAI pool here; they remain available to the local pipeline. (strategicProblems is
    // still used downstream for the local §9 score's initiative-focus keywords.)
    void buildStrategicProblemBrief; void buildStrategicAssumptionBrief; void strategicAssumptions;
    const strategicProblemBrief = "";
    const suggestedJobMaps = inferSuggestedJobMapsFromBaseline({
      companyName: String(company_name),
      baselineResultJson: effectiveBaselineResultJson,
    });
    const suggestedJobMapByKey = new Map<JourneyKey, (typeof suggestedJobMaps)[number]>(
      suggestedJobMaps.map((item) => [item.journey_key, item]),
    );

    const requestedJobMaps: SelectedJobMap[] = requestedJourneyKeys.map((key) => {
      const suggested = suggestedJobMapByKey.get(key);
      return {
        journey_key: key,
        journey_title: sanitizeJobMapTitle(suggested?.journey_title, key),
        journey_subtitle: sanitizeJobMapSubtitle(suggested?.journey_subtitle, key),
        source: "requested",
      };
    });

    const { data: existingJobStepRows, error: existingJobStepsErr } = await supabase
      .from("job_steps")
      .select("journey_key, journey_title, journey_subtitle, created_at")
      .eq("company_id", company_id)
      .order("created_at", { ascending: false })
      .limit(240);

    if (existingJobStepsErr) {
      console.log("[research-company] existing job map fetch error:", existingJobStepsErr.message);
    }
    const existingJobMaps = deriveExistingJobMaps(existingJobStepRows ?? []);

    const selectedBase: SelectedJobMap[] =
      submittedJobMaps.length > 0
        ? submittedJobMaps
        : requestedJobMaps.length > 0
          ? requestedJobMaps
          : existingJobMaps;
    const hasExplicitJobMapRequest = submittedJobMaps.length > 0 || requestedJobMaps.length > 0;

    const selectedMapByKey = new Map<JourneyKey, SelectedJobMap>();
    for (const map of selectedBase) {
      if (!selectedMapByKey.has(map.journey_key)) {
        selectedMapByKey.set(map.journey_key, map);
      }
    }

    let autoInjectedCustomerMap = false;
    if (!strictSingleJourneyMode && !selectedMapByKey.has("customer")) {
      const existingCustomer = existingJobMaps.find((map) => map.journey_key === "customer");
      if (existingCustomer) {
        selectedMapByKey.set("customer", existingCustomer);
      }
    }
    if (!strictSingleJourneyMode && !selectedMapByKey.has("customer") && !hasExplicitJobMapRequest && selectedMapByKey.size > 0) {
      const primaryMap = selectedBase[0] ?? existingJobMaps[0];
      const suggestedCustomer = suggestedJobMapByKey.get("customer");
      selectedMapByKey.set("customer", {
        journey_key: "customer",
        journey_title: sanitizeJobMapTitle(
          suggestedCustomer?.journey_title || primaryMap?.journey_title,
          "customer",
        ),
        journey_subtitle: sanitizeJobMapSubtitle(
          suggestedCustomer?.journey_subtitle || primaryMap?.journey_subtitle,
          "customer",
        ),
        source: "existing",
      });
      autoInjectedCustomerMap = true;
      console.log("[research-company] auto-injected customer map from existing non-customer maps", {
        company_id,
        selected_keys: Array.from(selectedMapByKey.keys()),
      });
    }

    if (selectedMapByKey.size === 0) {
      const suggestedCustomer = suggestedJobMapByKey.get("customer");
      selectedMapByKey.set("customer", {
        journey_key: "customer",
        journey_title: sanitizeJobMapTitle(suggestedCustomer?.journey_title, "customer"),
        journey_subtitle: sanitizeJobMapSubtitle(suggestedCustomer?.journey_subtitle, "customer"),
        source: "selected",
      });
      autoInjectedCustomerMap = true;
      console.log("[research-company] auto-seeded default customer map for empty selection", {
        company_id,
      });
    }

    const selectedCustomerMap = selectedMapByKey.get("customer");
    if (selectedCustomerMap) {
      const customerAudience = audienceFromJourneyTitle(selectedCustomerMap.journey_title);
      if (!customerAudience || isInvalidAudienceLabel(customerAudience)) {
        const suggestedCustomer = suggestedJobMapByKey.get("customer");
        const normalizedCompanyName = normalizeAudienceSignal(company_name);
        const companyCustomerLabel = normalizedCompanyName ? `${normalizedCompanyName} customer` : "Primary job performer";
        selectedMapByKey.set("customer", {
          ...selectedCustomerMap,
          journey_title: sanitizeJobMapTitle(
            suggestedCustomer?.journey_title || `Job Map: ${companyCustomerLabel}`,
            "customer",
          ),
          journey_subtitle: sanitizeJobMapSubtitle(
            suggestedCustomer?.journey_subtitle ||
              `How ${companyCustomerLabel.toLowerCase()} define, locate, prepare, execute, monitor, and conclude progress.`,
            "customer",
          ),
        });
        console.log("[research-company] normalized generic customer job map title", {
          company_id,
          previous_title: selectedCustomerMap.journey_title,
          updated_title: selectedMapByKey.get("customer")?.journey_title,
        });
      }
    }

    const selectedJobMaps: SelectedJobMap[] = Array.from(selectedMapByKey.values());
    const explicitSelectedJourneyKeys: JourneyKey[] = [
      ...new Set(selectedBase.map((map) => map.journey_key)),
    ];
    if (autoInjectedCustomerMap && !explicitSelectedJourneyKeys.includes("customer")) {
      explicitSelectedJourneyKeys.push("customer");
    }

    if (selectedJobMaps.length === 0) {
      return jsonResponse({
        error: "job_map_selection_required",
        status: "job_map_selection_required",
        message: "Choose at least one job map before running research.",
        suggested_job_maps: suggestedJobMaps,
      }, 422);
    }

    if (!selectedJobMaps.some((map) => isCustomerJourneyKey(map.journey_key))) {
      return jsonResponse({
        error: "customer_job_map_required",
        status: "customer_job_map_required",
        message: "Include a customer job map so ODI opportunities can anchor to a primary job performer.",
        suggested_job_maps: suggestedJobMaps,
      }, 422);
    }

    // OPTION B (Phase 1): research-company generates the PUBLIC/CUSTOMER-FACING spine only.
    // The internal/operational journey is the local pipeline's domain (run-mojo-analysis) —
    // generating it from public-only context would produce ungrounded internal claims the
    // reviewer rightly flags. Excluded from both generation (here) and the regen delete list.
    const isInternalJourneyKey = (k: unknown): boolean => {
      const n = normalizeJourneyKey(k);
      return n === "internal" || n.startsWith("internal");
    };
    let targetJourneyKeys: JourneyKey[] = [
      ...new Set(selectedJobMaps.map((map) => map.journey_key)),
    ].filter((k) => !isInternalJourneyKey(k));
    if (strictSingleJourneyMode) {
      const strictJourneyKey = runtimeContract.journey_key as JourneyKey;
      if (targetJourneyKeys.length !== 1 || targetJourneyKeys[0] !== strictJourneyKey) {
        return jsonResponse({
          error: "strict_journey_selection_mismatch",
          status: "strict_journey_selection_mismatch",
          message: "Strict framework mode requires exactly one selected journey_key.",
          expected_journey_key: strictJourneyKey,
          selected_journey_keys: targetJourneyKeys,
          request_id: runtimeContract.request_id,
          run_id: runtimeContract.run_id,
        }, 422);
      }
    }
    let jobMapUpdateJourneyKeys: JourneyKey[] =
      explicitSelectedJourneyKeys.length > 0 ? explicitSelectedJourneyKeys : targetJourneyKeys;
    // ADDITIVE-PRESERVE (mechanic 1): never wipe the operator's pinned on-strategy set, and
    // additively add genuinely-new discovered sets. We protect ONLY a deliberate operator
    // pin (operator_primary_selection) — not the heuristic-resolved default — so unpinned
    // companies keep prior regen behavior. Scopes to job_steps only; the rest of the spine
    // is still wiped below (out of scope for this mechanic).
    const existingJourneyKeySet = new Set(
      (existingJobStepRows ?? [])
        .map((r) => normalizeJourneyKey((r as { journey_key?: unknown })?.journey_key))
        .filter((k): k is string => Boolean(k)),
    );
    const { data: pinRowForPreserve } = await supabase
      .from("operator_primary_selection")
      .select("item_key")
      .eq("company_id", company_id)
      .eq("domain", "job_step_set")
      .maybeSingle();
    const pinnedPreserveKeyRaw = normalizeJourneyKey((pinRowForPreserve as { item_key?: unknown } | null)?.item_key);
    // Preserve only when the pinned set actually has existing steps to protect.
    const pinnedPreserveKey = pinnedPreserveKeyRaw && existingJourneyKeySet.has(pinnedPreserveKeyRaw)
      ? pinnedPreserveKeyRaw
      : null;
    if (pinnedPreserveKey) {
      jobMapUpdateJourneyKeys = jobMapUpdateJourneyKeys.filter(
        (k) => normalizeJourneyKey(k) !== pinnedPreserveKey,
      );
      console.log(`[research-company] additive-preserve: pinned set '${pinnedPreserveKey}' excluded from regen — its job_steps are preserved`);
    }
    // OPTION B (Phase 1): the internal journey isn't generated here (filtered above), so keep
    // its job_steps out of the delete/insert too — otherwise an explicit internal target would
    // delete rows gen no longer reproduces. The internal journey stays owned by run-mojo-analysis.
    jobMapUpdateJourneyKeys = jobMapUpdateJourneyKeys.filter((k) => !isInternalJourneyKey(k));
    const jobMapUpdateJourneyKeySet = new Set(jobMapUpdateJourneyKeys);
    const targetJourneyKeySet = new Set(targetJourneyKeys);
    const selectedJobMapByKey = new Map<JourneyKey, SelectedJobMap>(
      selectedJobMaps.map((map) => [map.journey_key, map]),
    );
    const selectedJobMapBrief = selectedJobMaps
      .map((map, index) => `${index + 1}. ${map.journey_key} | ${map.journey_title} | ${map.journey_subtitle}`)
      .join("\n");

    // -------------------------
    // 1) Generate INPUTS (14) — schema does NOT include group fields
    // -------------------------
    const inputsSchema = {
      type: "object",
      additionalProperties: false,
      properties: {
        inputs: {
          type: "array",
          minItems: 14,
          maxItems: 14,
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              input_key: { type: "string", enum: INPUT_KEYS },
              group_key: { type: "string", enum: ["foundation", "execution", "market_evidence"] },
              input_label: { type: "string" },
              sub_group: { type: "string" },
              description: { type: "string" },
              why_it_matters: { type: "string" },
            },
            required: ["input_key", "group_key", "input_label", "sub_group", "description", "why_it_matters"],
          },
        },
      },
      required: ["inputs"],
    };

    // OPTION B (Phase 1): research-company is PUBLIC-ONLY. The uploaded/internal evidence
    // (uploadedEvidenceContext.brief) NEVER enters the OpenAI pool — the internal layer and
    // the public-vs-internal reconciliation are the local pipeline's domain. Public baseline
    // is the sole evidence context here, regardless of researchContextMode.
    const baselineContextIntro = "Public baseline context:";
    const baselineBrief = [
      baselineContextIntro,
      buildBaselineBrief(effectiveBaselineResultJson),
    ]
      .filter(Boolean)
      .join("\n\n");
    const evidenceConsistencyConstraint =
      researchContextMode === "uploaded_evidence_fallback"
        ? "- Stay strictly consistent with uploaded company evidence, website, buyer context, and selected job maps\n"
        : "- Stay strictly consistent with the public baseline, website, buyer context, and company category\n";
    const noIndustrySwitchConstraint =
      researchContextMode === "uploaded_evidence_fallback"
        ? "- Never switch industries, populations, service models, or buyer types from uploaded evidence context\n"
        : "- Never switch industries, populations, service models, or buyer types from the baseline evidence\n";
    const evidencedDefinitionConstraint =
      researchContextMode === "uploaded_evidence_fallback"
        ? "- evidenced = directly supported by uploaded company evidence or explicit company context\n"
        : "- evidenced = directly supported by public evidence\n";
    const evidenceConfidenceConstraint =
      researchContextMode === "uploaded_evidence_fallback"
        ? "- evidence_confidence 0..100 based on how grounded the step is in uploaded/company evidence\n"
        : "- evidence_confidence 0..100 based on how grounded the step is in public evidence\n";
    const evidenceContextHeading =
      researchContextMode === "uploaded_evidence_fallback" ? "Uploaded evidence context" : "Public baseline context";
    const evidenceAlignmentConstraint =
      researchContextMode === "uploaded_evidence_fallback"
        ? "- market_category and best_fit_customers must align with uploaded/company evidence and website evidence\n"
        : "- market_category and best_fit_customers must align with the public baseline and website evidence\n";

    const inputsUserText =
      `Company: ${company_name}\nWebsite: ${website || "unknown"}\n\n` +
      `${evidenceContextHeading}:\n${baselineBrief}\n\n` +
      `Client-stated strategic problems:\n${strategicProblemBrief}\n\n` +
      `Return EXACTLY 14 input objects, one per input_key in this list.\n` +
      `Do not omit any.\n\n` +
      `Keys:\n` +
      INPUT_KEYS.map((k) => `- ${k}`).join("\n") +
      `\n\nEach input must include group_key using one of: foundation, execution, market_evidence.\n` +
      `Group counts are flexible by company context and do not need to follow a fixed 7/4/3 split.`;

    const inputsSystemText =
      `You are a strategy analyst using the Mojo Strategy Map.\n` +
      `Return ONLY valid JSON that matches the schema. No prose.\n` +
      `Apply the framework guidance below as decision rules, not as output headings.\n\n` +
      `Framework guidance:\n${buildFrameworkBrief("inputs", getFrameworkRoutingPlan("inputs"))}\n\n` +
      `Constraints:\n` +
      evidenceConsistencyConstraint +
      noIndustrySwitchConstraint +
      `- For commercial businesses, translate nonprofit-style placeholders into category-relevant equivalents (customer retention, growth pipeline, customer satisfaction)\n` +
      `- Never output "not applicable", "N/A", or "not relevant" for required inputs; provide the closest category-specific signal instead\n` +
      `- Embed ODI framing in at least customer-research, outcome-evidence, and acquisition-map by referencing job/outcome context and importance/satisfaction evidence\n` +
      `- Input descriptions should highlight what must be clarified to resolve strategic problems\n` +
      `- When evidence is weak, use cautious wording instead of inventing specifics\n` +
      `- Set group_key per input based on context; do not force equal counts across groups\n` +
      `- input_label max 5 words\n` +
      `- sub_group max 4 words\n` +
      `- description max 10 words\n` +
      `- why_it_matters max 10 words\n`;

    const inputsResult = await callOpenAIJSON({
      apiKey: openaiKey,
      model: openaiModel,
      schemaName: "mojo_inputs_v2",
      schema: inputsSchema,
      systemText: inputsSystemText,
      userText: inputsUserText,
      maxOutputTokens: 1400,
      temperature: 0.2,
    });

    const inputsRaw: any[] = Array.isArray(inputsResult?.inputs) ? inputsResult.inputs : [];
    if (inputsRaw.length !== 14) return jsonResponse({ error: `Expected 14 inputs, got ${inputsRaw.length}` }, 500);

    // Ensure: exactly one per key, and order them
    const byKey: Record<string, any> = {};
    for (const it of inputsRaw) {
      const k = String(it?.input_key || "").trim();
      if (!k) continue;
      byKey[k] = it;
    }
    let inputs: any[] = INPUT_KEYS.map((k) => byKey[k]).filter(Boolean);
    if (inputs.length !== 14) return jsonResponse({ error: "Inputs missing one or more required keys" }, 500);

    const inputContextMode = inferInputContextMode({
      companyName: company_name,
      website,
      baselineResultJson: effectiveBaselineResultJson,
    });
    const inputBusinessProfile = inferInputBusinessProfile({
      companyName: company_name,
      website,
      baselineResultJson: effectiveBaselineResultJson,
      mode: inputContextMode,
    });
    inputs = inputs.map((input) =>
      contextualizeInputForCompany({
        input,
        mode: inputContextMode,
        profile: inputBusinessProfile,
        companyName: company_name,
      }),
    );
    const inputFrameworkKeys = frameworkKeysFor("inputs");

    // -------------------------
    // 2) Generate JOURNEYS (customer required, others optional by request)
    // -------------------------
    const journeyTypeDefinition = (key: JourneyKey) => {
      if (key.startsWith("customer")) return "external user/buyer experience from discovery to post-use";
      if (key.includes("revenue") || key.includes("investment") || key.includes("funding")) {
        return "how demand converts to recurring revenue or funding outcomes";
      }
      if (key === "customer") return "external user/buyer experience from discovery to post-use";
      if (key === "revenue") return "how demand converts to recurring revenue or funding outcomes";
      return "internal delivery and operating system from intake through fulfillment";
    };
    const journeyTypeGuidance = targetJourneyKeys
      .map((key) => `- ${key} journey = ${journeyTypeDefinition(key)}`)
      .join("\n");

    const journeysSchema = {
      type: "object",
      additionalProperties: false,
      properties: {
        journeys: {
          type: "array",
          minItems: targetJourneyKeys.length,
          maxItems: targetJourneyKeys.length,
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              journey_key: { type: "string", enum: [...targetJourneyKeys] },
              journey_title: { type: "string" },
              journey_subtitle: { type: "string" },
              steps: {
                type: "array",
                minItems: 5,
                maxItems: 8,
                items: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    step_number: { type: "integer" },
                    step_label: { type: "string" },
                    description: { type: "string" },
                    designed: { type: "boolean" },
                    has_gap: { type: "boolean" },
                    evidence_status: { type: "string", enum: ["evidenced", "implied", "unclear"] },
                    evidence_basis: { type: "string" },
                    evidence_confidence: { type: "integer" },
                    gap_note: { type: "string" },
                  },
                  required: ["step_number", "step_label", "description", "designed", "has_gap", "evidence_status", "evidence_basis", "evidence_confidence", "gap_note"],
                },
              },
            },
            required: ["journey_key", "journey_title", "journey_subtitle", "steps"],
          },
        },
      },
      required: ["journeys"],
    };

    const journeyFrameworks = getFrameworkRoutingPlan("journeys");
    const journeyFrameworkBrief = buildFrameworkBrief("journeys", journeyFrameworks);
    const journeyFrameworkKeys = journeyFrameworks.map((framework) => framework.key);

    // ── ONB-3: thin-evidence cold-start industry-standard ODI anchoring ──
    // With no uploaded internal evidence (external_only tier) the customer job
    // map cannot be honestly evidenced, which previously left all 8 steps
    // designed=no/gap and blocked the consistency gate. Instead, anchor the
    // customer checkpoints to the industry-standard universal ODI job map
    // (flagged implied / to-validate) so the bootstrap yields a usable map.
    // Evidence-present companies keep honest-gap behavior unchanged.
    const thinEvidenceColdStart = researchContextMode === "public_baseline";
    const anchorCategory = thinEvidenceColdStart
      ? inferAnchorCategory(
          company_name,
          website,
          (effectiveBaselineResultJson as { category_archetype?: unknown } | null)?.category_archetype,
        )
      : "";
    const industryAnchors = anchorCategory ? getIndustryStepAnchors(anchorCategory) : null;
    const BARE_UNIVERSAL_JOB_MAP =
      `1 (define): Determine what a successful outcome looks like and which criteria matter most.\n` +
      `2 (locate): Find and gather the options, information, and inputs needed to proceed.\n` +
      `3 (prepare): Set up and organize what is needed before the core work begins.\n` +
      `4 (confirm): Verify readiness and that the right inputs and conditions are in place.\n` +
      `5 (execute): Carry out the core task that produces the intended outcome.\n` +
      `6 (monitor): Track live progress and detect whether the job is on track.\n` +
      `7 (modify): Adjust or correct course when results deviate from the goal.\n` +
      `8 (conclude): Finish, confirm the outcome was achieved, and decide what comes next.`;
    const anchorBlock = industryAnchors ? anchorsToPromptBlock(industryAnchors) : BARE_UNIVERSAL_JOB_MAP;
    const anchorSourceNote = industryAnchors
      ? `industry-standard ODI job map for ${anchorCategory}`
      : `industry-standard universal ODI job map`;

    // Step-grounding rules: anchored (thin cold start) vs honest-gap (default).
    const jobStepGroundingRules = thinEvidenceColdStart
      ? `Evidence is thin for this company (no uploaded internal evidence). For CUSTOMER journeys, anchor each of the ${JTBD_CHECKPOINT_COUNT} checkpoints to the ${anchorSourceNote} hypotheses below — adapt the wording to this company's job executor and category, but keep the job-progression intent of each checkpoint:\n` +
        `${anchorBlock}\n` +
        `- Customer journey steps: set designed=true, has_gap=false, gap_note="", evidence_status=implied, evidence_confidence at most 50, and evidence_basis="${anchorSourceNote}; to validate with customer evidence"\n` +
        `- These customer steps are industry-standard hypotheses TO VALIDATE — realistic for the category, not asserted as company-proven facts\n` +
        `- For non-customer journeys, keep honest evidence marking: designed=false and has_gap=true when evidence is unclear\n`
      : `- designed=true only when the step appears intentionally supported and evidence_status is evidenced or implied\n` +
        `- designed=false when evidence_status is unclear\n` +
        `- has_gap=true when there is a visible weakness, missing capability, or unclear handoff\n` +
        `- if has_gap=false, set gap_note to an empty string\n`;

    const jobStepUserClosing = thinEvidenceColdStart
      ? `For customer journeys, anchor each checkpoint to the industry-standard hypothesis above; set designed=true, has_gap=false, evidence_status=implied, and treat them as industry-standard steps to validate.\n`
      : `Mark designed=false and has_gap=true when evidence remains unclear.\n`;

    const journeysSystemText =
      `You are generating an executive-quality journey map for a strategy platform.\n` +
      `Return ONLY valid JSON that matches the schema. No prose.\n` +
      `Write an ODI/JTBD style job map, not a generic funnel journey.\n` +
      `Apply the framework guidance below as decision rules, not as output headings.\n\n` +
      `Framework guidance:\n${journeyFrameworkBrief}\n\n` +
      `Constraints:\n` +
      `- Keep journey_title and journey_subtitle aligned with selected job maps\n` +
      `- Generate exactly these journey keys: ${targetJourneyKeys.join(", ")}\n` +
      `${journeyTypeGuidance}\n` +
      noIndustrySwitchConstraint +
      `- Journey bottlenecks should connect to the client-stated strategic problems when provided\n` +
      `- For customer journey keys, generate exactly ${JTBD_CHECKPOINT_COUNT} stable job-progression checkpoints numbered 1–8. Each step label must answer: what is the actor trying to accomplish at this point in the job? Use verbs like: determine, identify, evaluate, validate, confirm, detect, adjust. Do NOT use operational lifecycle labels like Define, Locate, Prepare, Execute, Monitor, Modify, Conclude as bare step names.\n` +
      `- Non-customer journeys may use 6-8 steps, but must remain action-based and ODI/JTBD compatible\n` +
      `- step_label 2–5 words, action-oriented, no generic funnel labels\n` +
      `- description 18–40 words, concrete, sequential, and tied to the selected job performer context\n` +
      `- evidence_status must be one of evidenced, implied, or unclear\n` +
      evidencedDefinitionConstraint +
      `- implied = strongly suggested by the business model or multiple signals, but not directly proven\n` +
      `- unclear = weak, missing, or ambiguous evidence\n` +
      `- evidence_basis 8–24 words explaining the evidence or inference behind the step status\n` +
      evidenceConfidenceConstraint +
      `- gap_note 6–18 words and specific when there is a gap\n` +
      jobStepGroundingRules;

    const journeysUserText =
      `Company: ${company_name}\nWebsite: ${website || "unknown"}\n\n` +
      `${evidenceContextHeading}:\n${baselineBrief}\n\n` +
      `Client-stated strategic problems:\n${strategicProblemBrief}\n\n` +
      `Selected job maps:\n${selectedJobMapBrief}\n\n` +
      `Create these journeys: ${targetJourneyKeys.join(", ")}.\n` +
      `Customer journeys must include exactly ${JTBD_CHECKPOINT_COUNT} checkpoints, numbered 1..${JTBD_CHECKPOINT_COUNT}.\n` +
      `Non-customer journeys can include 6-8 ODI-style steps, numbered 1..N.\n` +
      `Make the sequence realistic for this exact company category and audience.\n` +
      `Do not use generic labels like "Engagement" or "Operations" unless they are qualified.\n` +
      jobStepUserClosing;

    const journeysResult = await callOpenAIJSON({
      apiKey: openaiKey,
      model: openaiModel,
      schemaName: "mojo_journeys_v1",
      schema: journeysSchema,
      systemText: journeysSystemText,
      userText: journeysUserText,
      maxOutputTokens: 2400,
      temperature: 0.2,
    });

    let journeys: any[] = Array.isArray(journeysResult?.journeys) ? journeysResult.journeys : [];
    journeys = journeys.filter((journey) => targetJourneyKeySet.has(normalizeJourneyKey(journey?.journey_key)));

    const alignedJourneys: any[] = [];
    for (const key of targetJourneyKeys) {
      const match = journeys.find((journey) => normalizeJourneyKey(journey?.journey_key) === key);
      const selectedMap = selectedJobMapByKey.get(key);
      if (match) {
        alignedJourneys.push({
          ...match,
          journey_key: key,
          journey_title: selectedMap?.journey_title || String(match?.journey_title || defaultJourneyTitle(key)),
          journey_subtitle: selectedMap?.journey_subtitle || String(match?.journey_subtitle || defaultJourneySubtitle(key)),
        });
      }
    }
    const industryExclusions = buildCompanyVocabExclusions([String(company_name || "")]);
    const manualVocab = (companyRow as Record<string, unknown> | null)?.manual_industry_vocab;
    if (Array.isArray(manualVocab)) {
      for (const term of manualVocab) {
        const normalized = String(term).toLowerCase().trim();
        if (normalized) industryExclusions.add(normalized);
      }
    }
    journeys = enforceCustomerJourneySpine(alignedJourneys as Array<Record<string, unknown>>, industryExclusions);

    if (journeys.length !== targetJourneyKeys.length) {
      const found = new Set(journeys.map((journey) => normalizeJourneyKey(journey?.journey_key)));
      const missing = targetJourneyKeys.filter((key) => !found.has(key));
      return jsonResponse({
        error: `Expected journeys for keys: ${targetJourneyKeys.join(", ")}. Missing: ${missing.join(", ")}`,
      }, 500);
    }

    const opportunityFrameworkKeys = ensureRequiredFrameworkKeys(frameworkKeysFor("opportunities"));
    const routeFrameworkKeys = ensureRequiredFrameworkKeys(frameworkKeysFor("routes"));

    // -------------------------
    // 3) Generate MANAGED OUTCOMES (strict, before opportunities)
    // -------------------------

    // Derive the three context inputs that drive stage-aware generation
    const programPhase: string = String(bodyRecord?.program_phase || runtimeContract.stage || "outside").trim().toLowerCase();
    const evidenceLevelDerived: EvidenceLevel = deriveEvidenceLevel(
      researchContextMode,
      uploadedEvidenceContext.fileCount,
    );
    const problemStatementTexts = (strategicProblems as Array<{ statement?: string }>)
      .map((p) => String(p?.statement || "")).filter(Boolean);
    const problemTypeDerived: ProblemType = classifyProblemType(problemStatementTexts);

    const managedOutcomeContextTokensFromJourneys = collectOutcomeContextTokensFromJourneys(journeys);
    const managedOutcomesResult = await generateManagedOutcomes({
      apiKey: openaiKey,
      model: openaiModel,
      companyName: company_name,
      website,
      baselineBrief,
      strategicProblemBrief,
      journeys,
      programPhase,
      problemType: problemTypeDerived,
      evidenceLevel: evidenceLevelDerived,
    });

    let managedOutcomes = Array.isArray(managedOutcomesResult?.outcomes)
      ? managedOutcomesResult.outcomes
      : [];

    const weakManagedOutcomeCount = managedOutcomes.filter((outcome) =>
      analyzeManagedOutcomeSpecificity({
        outcome_title: String(outcome?.outcome_title || ""),
        outcome_statement: String(outcome?.outcome_statement || ""),
        leading_indicator: String(outcome?.leading_indicator || ""),
      }, managedOutcomeContextTokensFromJourneys).weak
    ).length;

    if (weakManagedOutcomeCount > 0) {
      const repairedManagedOutcomesResult = await repairManagedOutcomes({
        apiKey: openaiKey,
        model: openaiModel,
        companyName: company_name,
        website,
        baselineBrief,
        strategicProblemBrief,
        journeys,
        outcomes: managedOutcomes,
        programPhase,
        problemType: problemTypeDerived,
        evidenceLevel: evidenceLevelDerived,
      });

      managedOutcomes = Array.isArray(repairedManagedOutcomesResult?.outcomes)
        ? repairedManagedOutcomesResult.outcomes
        : [];
    }

    managedOutcomes = managedOutcomes
      .filter((outcome) => String(outcome?.journey_key || "") === "customer")
      .map((outcome) => normalizeManagedOutcome(outcome, evidenceLevelDerived))
      .filter((outcome) =>
        validateDesiredOutcome({
          statement: outcome.outcome_statement,
          leadingIndicator: outcome.leading_indicator,
          targetDirection: outcome.target_direction,
          direction: outcome.direction,
          metric: outcome.metric,
          actor: outcome.actor,
          action: outcome.action,
          object: outcome.object,
          context: outcome.context,
          constraint: outcome.constraint || null,
          level: outcome.level,
          stage: programPhase as "outside" | "diagnose" | "focus" | "flow",
          problemType: problemTypeDerived,
          frameworksUsed: opportunityFrameworkKeys,
        }).valid,
      );

    if (managedOutcomes.length === 0) {
      managedOutcomes = [buildDeterministicManagedOutcomeFallback({ journeys })];
    }

    // Filter to usable outcomes; if none pass, keep all available outcomes rather than
    // aborting — low-information contexts (outside phase, no uploads, sparse public data)
    // legitimately produce outcomes with limited specificity and must not block the run.
    const usableManagedOutcomes = managedOutcomes.filter((outcome) =>
      isUsableManagedOutcome(outcome, managedOutcomeContextTokensFromJourneys)
    );
    if (usableManagedOutcomes.length > 0) {
      managedOutcomes = usableManagedOutcomes;
    }
    // If zero outcomes passed the strict check, managedOutcomes is unchanged (fallback or
    // LLM-generated). The run continues; the outcome is flagged as low-confidence via its
    // evidence_level and confidence ceiling, not by aborting the entire research run.
    const primaryManagedOutcome =
      managedOutcomes.find((o) => o.is_primary || String((o as any)?.level || "") === "primary") ??
      managedOutcomes[0];
    const primaryManagedOutcomeStatement = String(primaryManagedOutcome?.outcome_statement || "").trim();

    // -------------------------
    // 4) Generate OPPORTUNITIES (customer journey)
    // -------------------------
    const oppsSchema = {
      type: "object",
      additionalProperties: false,
      properties: {
        opportunities: {
          type: "array",
          minItems: 8,
          maxItems: 20,
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              outcome: { type: "string" },
              odi_canonical_statement: { type: "string" },
              step_number: { type: "integer" },
              step_label: { type: "string" },
              journey_key: { type: "string", enum: ["customer"] },
              importance: { type: "integer" },
              satisfaction: { type: "integer" },
              opportunity_score: { type: "integer" },
              priority_tier: { type: "string", enum: ["focus", "monitor", "defer"] },
            },
            required: ["outcome", "odi_canonical_statement", "step_number", "step_label", "journey_key", "importance", "satisfaction", "opportunity_score", "priority_tier"],
          },
        },
      },
      required: ["opportunities"],
    };

    const oppsSystemText =
      `You are generating opportunity records for a strategy platform.\n` +
      `Return ONLY valid JSON that matches the schema. No prose.\n` +
      `Apply the framework guidance below as decision rules, not as output headings.\n\n` +
      `Framework guidance:\n${buildFrameworkBrief("opportunities", getFrameworkRoutingPlan("opportunities"))}\n\n` +
      `Rules:\n` +
      `- Use the provided journeys and steps exactly; do not invent unrelated step labels or step numbers\n` +
      `- Opportunities should target bottlenecks, missing capabilities, weak transitions, or unclear handoffs in those journeys\n` +
      `- Every opportunity must be narrower and more specific than the managed desired outcome it supports\n` +
      `- Opportunities should directly address the client-stated strategic problems when provided\n` +
      `- Each opportunity requires TWO forms of the outcome:\n` +
      `  - outcome: plain human language (10-18 words, everyday phrasing, no formula verbs required)\n` +
      `  - odi_canonical_statement: strict ODI formula using "Minimize/Reduce/Increase/Maximize the [dimension] [to|of|in] [object] when [context]" — must use formula verbs and structured syntax\n` +
      `  Both fields describe the same underlying opportunity from different angles. They must not be identical.\n` +
      `- outcome must read like a strong product discovery outcome or ODI desired outcome, not a feature idea, deliverable, or recommendation\n` +
      `- Use a structured formula close to: direction + measurable dimension + object + context\n` +
      `- Start with verbs like minimize, reduce, increase, improve, maximize, or avoid when appropriate\n` +
      `- When generating multiple opportunities for the same step_number, ensure each uses a distinct primary measurable dimension (e.g., one targets time, another targets confidence, another targets completion rate) — do not repeat the same core noun phrase across outcomes in the same step\n` +
      `- Keep outcomes solution-free, stable over time, and measurable in spirit\n` +
      `- Good outcomes describe a change in customer behavior, progress, clarity, effort, risk, confidence, continuity, completion, conversion, or retention\n` +
      `- Good outcomes stay within the company's span of influence, rather than naming broad business goals with no customer mechanism\n` +
      `- Do not output initiatives, launches, campaigns, dashboards, websites, forms, workflows, programs, portals, tools, or features as outcomes\n` +
      `- Do not use vague outcome text like "Improve engagement" or "Increase awareness" without a concrete object and context\n` +
      noIndustrySwitchConstraint +
      `- Bad example style: "Build a better intake form", "Add referral dashboard", or "Launch a campaign"\n` +
      `- Avoid jargon phrases like "monitored decision outcomes", "strategic alignment", and "core audience"\n` +
      `- Prefer plain alternatives like "tracked decision results", "fit with strategy", and "main audience"\n` +
      `- importance/satisfaction 1..10\n` +
      `- opportunity_score = importance + (10 - satisfaction)\n` +
      `- priority_tier: focus if >= 12, monitor if >= 7, defer if < 7\n` +
      `- Bias toward higher importance / lower satisfaction when a referenced step has has_gap=true or designed=false\n` +
      `- Treat high-importance, low-satisfaction outcomes as underserved opportunities\n` +
      `${ODI_PLAIN_LANGUAGE_RULES}\n`;

    const oppsUserText =
      `Company: ${company_name}\nWebsite: ${website || "unknown"}\n\n` +
      `${evidenceContextHeading}:\n${baselineBrief}\n\n` +
      `Client-stated strategic problems:\n${strategicProblemBrief}\n\n` +
      `Managed outcomes:\n${buildManagedOutcomeBrief(managedOutcomes)}\n\n` +
      `Selected job maps:\n${selectedJobMapBrief}\n\n` +
      `Generated journeys and steps:\n${buildJourneyBrief(journeys)}\n\n` +
      `Generate 8–20 opportunities for the customer journey only.\n` +
      `Tie each opportunity to an existing step_number + step_label from the generated journeys above.\n` +
      `Every opportunity must use journey_key=customer.\n`;

    const oppsResult = await callOpenAIJSON({
      apiKey: openaiKey,
      model: openaiModel,
      schemaName: "mojo_opps_v1",
      schema: oppsSchema,
      systemText: oppsSystemText,
      userText: oppsUserText,
      maxOutputTokens: 2200,
      temperature: 0.2,
    });

    let opportunities: any[] = Array.isArray(oppsResult?.opportunities) ? oppsResult.opportunities : [];
    opportunities = opportunities.filter((opp) => isCustomerJourneyKey(opp?.journey_key));
    if (opportunities.length < 8) {
      return jsonResponse({ error: `Expected >=8 customer opportunities, got ${opportunities.length}` }, 500);
    }
    const invalidOpportunityCount = opportunities.filter((opp) => {
      const outcome = normalizeOutcomeLanguage(String(opp?.outcome || ""));
      const quality = analyzeOutcomeQuality(outcome);
      const semantic = validateOpportunity({
        outcome,
        importance: Number(opp?.importance),
        satisfaction: Number(opp?.satisfaction),
        frameworksUsed: opportunityFrameworkKeys,
      });
      const distinctness = primaryManagedOutcomeStatement
        ? validateOutcomeOpportunityDistinctness(primaryManagedOutcomeStatement, outcome)
        : { valid: true };
      return quality.weak || !semantic.valid || !distinctness.valid;
    }).length;

    if (invalidOpportunityCount > 0) {
      const repairedOppsResult = await repairWeakOpportunities({
        apiKey: openaiKey,
        model: openaiModel,
        companyName: company_name,
        website,
        baselineBrief,
        strategicProblemBrief,
        managedOutcomes,
        journeys,
        opportunities,
        schema: oppsSchema,
      });

      const repairedOpportunities = Array.isArray(repairedOppsResult?.opportunities)
        ? repairedOppsResult.opportunities
        : [];

      const repairedCustomerOnly = repairedOpportunities.filter(
        (opp) => isCustomerJourneyKey(opp?.journey_key)
      );
      if (repairedCustomerOnly.length > 0) {
        opportunities = repairedCustomerOnly;
      }
    }

    const customerJourneySteps = journeys
      .filter((journey) => isCustomerJourneyKey(journey?.journey_key))
      .flatMap((journey) => Array.isArray(journey?.steps) ? journey.steps : []);
    const customerStepIndex = new Set(
      customerJourneySteps.map((step: any) => {
        const stepNumber = Number(step?.step_number) || 0;
        const stepLabel = String(step?.step_label || "").trim().toLowerCase();
        return `${stepNumber}::${stepLabel}`;
      }),
    );

    opportunities = opportunities.filter((opp) => {
      const key = `${Number(opp?.step_number) || 0}::${String(opp?.step_label || "").trim().toLowerCase()}`;
      return customerStepIndex.has(key);
    });
    opportunities = opportunities.map((opp) => ({
      ...opp,
      outcome: normalizeOutcomeLanguage(String(opp?.outcome || "")),
      odi_canonical_statement: String(opp?.odi_canonical_statement || "").trim() || null,
    }));

    if (opportunities.length === 0) {
      return jsonResponse({
        error: "Generated opportunities did not align to existing customer job-map steps.",
      }, 500);
    }
    const strictValidatedOpportunities = opportunities.filter((opp) => {
      const semantic = validateOpportunity({
        outcome: String(opp?.outcome || ""),
        importance: Number(opp?.importance),
        satisfaction: Number(opp?.satisfaction),
        frameworksUsed: opportunityFrameworkKeys,
      });
      const distinctness = primaryManagedOutcomeStatement
        ? validateOutcomeOpportunityDistinctness(primaryManagedOutcomeStatement, String(opp?.outcome || ""))
        : { valid: true };
      return semantic.valid && distinctness.valid;
    });

    if (strictValidatedOpportunities.length >= 8) {
      opportunities = strictValidatedOpportunities;
    } else {
      const recoveredOpportunities = recoverValidOpportunities({
        opportunities,
        journeys,
        primaryManagedOutcomeStatement,
        frameworkKeys: opportunityFrameworkKeys,
      });
      opportunities = recoveredOpportunities.length > 0 ? recoveredOpportunities : strictValidatedOpportunities;
    }

    if (opportunities.length === 0) {
      return jsonResponse({
        error: "Opportunities failed strict ODI/Teresa Torres validation after repair.",
        status: "validation_failed",
      }, 422);
    }
    if (opportunities.length < 8) {
      console.log("[research-company] continuing with reduced strict-valid opportunity set", {
        company_id,
        strict_valid_count: opportunities.length,
      });
    }

    let hierarchicalOpportunities = buildHierarchicalOpportunities(
      opportunities.map((opp) => ({ ...(opp as Record<string, unknown>) })),
    );
    let parentChildDistinctnessFailures = validateParentChildDistinctnessRows(hierarchicalOpportunities);
    if (parentChildDistinctnessFailures.length > 0) {
      hierarchicalOpportunities = repairParentChildDistinctnessRows(hierarchicalOpportunities);
      parentChildDistinctnessFailures = validateParentChildDistinctnessRows(hierarchicalOpportunities);
    }
    if (parentChildDistinctnessFailures.length > 0) {
      return jsonResponse({
        error: "Opportunities failed parent-child distinctness validation after repair.",
        status: "validation_failed",
        details: parentChildDistinctnessFailures,
      }, 422);
    }

    const odiFrameworkKeys = Array.from(new Set([
      ...getFrameworkRoutingPlan("journeys").map((framework) => framework.key),
      ...getFrameworkRoutingPlan("opportunities").map((framework) => framework.key),
    ]));

    // -------------------------
    // 4) Generate ROUTES (customer-focused)
    // -------------------------
    const routesSchema = {
      type: "object",
      additionalProperties: false,
      properties: {
        routes: {
          type: "array",
          minItems: 4,
          maxItems: 12,
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              category: { type: "string", enum: ["fix", "improve", "create"] },
              title: { type: "string" },
              short_description: { type: "string" },
              pts_value: { type: "integer" },
              effort: { type: "string", enum: ["low", "medium", "high"] },
              type: { type: "string", enum: ["Fix", "Improve", "Create"] },
              sort_order: { type: "integer" },
              rejected_alternatives: {
                type: "array",
                minItems: 2,
                maxItems: 3,
                items: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    alternative_title: { type: "string" },
                    rejection_reason: { type: "string" },
                  },
                  required: ["alternative_title", "rejection_reason"],
                },
              },
              what_would_have_to_be_true: {
                type: "array",
                minItems: 2,
                maxItems: 3,
                items: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    condition: { type: "string" },
                    satisfied_flag: { type: "boolean" },
                  },
                  required: ["condition", "satisfied_flag"],
                },
              },
            },
            required: ["category", "title", "short_description", "pts_value", "effort", "type", "sort_order", "rejected_alternatives", "what_would_have_to_be_true"],
          },
        },
      },
      required: ["routes"],
    };

    const routesSystemText =
      `You are generating strategy routes for a consulting platform.\n` +
      `Return ONLY valid JSON that matches the schema. No prose.\n` +
      `Apply the framework guidance below as decision rules, not as output headings.\n\n` +
      `Framework guidance:\n${buildFrameworkBrief("routes", getFrameworkRoutingPlan("routes"))}\n\n` +
      `Rules:\n` +
      `- Create 4-12 routes total across fix, improve, create\n` +
      `- Use the journey and opportunity context provided; routes should feel like possible paths through a strategic tension, not capability buckets or project names\n` +
      `- Prioritize routes that directly reduce the client-stated strategic problems when provided\n` +
      `- title should be 5-10 words, verb-led, and specific enough to imply a tradeoff, tension, or visible outcome\n` +
      `- short_description should be 14-28 words and explain what tension the route is trying to change without turning into an implementation task\n` +
      `- Favor titles like 'Reduce trust loss before operational value is experienced' or 'Make proof of reliability visible earlier in the buyer journey'\n` +
      `- Avoid generic consulting language such as improve, enhance, strengthen, optimize, alignment, communication flow, capability building, or transformation unless the route also names a concrete business tension\n` +
      `- Routes should not sound like roadmap tasks, feature lists, or internal project code names\n` +
      `- pts_value should be 1..10 and reflect likely score impact\n` +
      `- sort_order should rank strongest routes first within the whole set\n` +
      noIndustrySwitchConstraint +
      `- Fix = remove blockers/gaps, Improve = strengthen existing systems, Create = build net-new strategic assets\n` +
      `- type must match category in title case\n` +
      `- For each route, generate 2–3 rejected_alternatives: real candidate directions that were plausible but not chosen. Each needs alternative_title (5–10 words, specific) and rejection_reason (one sentence naming the concrete tension that made this route less compelling than the chosen one). Do not use strawmen — name genuine alternatives.\n` +
      `- For each route, generate 2–3 what_would_have_to_be_true items: testable conditions that must hold for this route to succeed. Phrase each condition as a falsifiable claim ("Customer X values Y enough to Z"; "Operational capability W can be built within timeframe V"). Set satisfied_flag=false for all — these are unvalidated assumptions at research time.\n`;

    const routesUserText =
      `Company: ${company_name}\nWebsite: ${website || "unknown"}\n\n` +
      `${evidenceContextHeading}:\n${baselineBrief}\n\n` +
      `Client-stated strategic problems:\n${strategicProblemBrief}\n\n` +
      `Selected job maps:\n${selectedJobMapBrief}\n\n` +
      `Generated journeys:\n${buildJourneyBrief(journeys)}\n\n` +
      `Generated opportunities:\n${buildOpportunityBrief(opportunities)}\n\n` +
      `Generate routes that synthesize these into coherent strategic workstreams.\n`;

    const routesResult = await callOpenAIJSON({
      apiKey: openaiKey,
      model: openaiModel,
      schemaName: "mojo_routes_v1",
      schema: routesSchema,
      systemText: routesSystemText,
      userText: routesUserText,
      maxOutputTokens: 2200,
      temperature: 0.2,
    });

    let routes: any[] = Array.isArray(routesResult?.routes) ? routesResult.routes : [];
    if (routes.length < 4) return jsonResponse({ error: `Expected >=4 routes, got ${routes.length}` }, 500);

    // -------------------------
    // 5) Positioning canvas + strategy cascade delegated to leaf functions
    //    (refresh-positioning, refresh-cascade) — invoked in §8b below.
    // -------------------------

    // placeholder so downstream references compile until §8b read-back
    const customerJourneyDraft = journeys.find((journey) => isCustomerJourneyKey(journey?.journey_key));
    const odiBrief = buildODIBrief({
      baselineResultJson: effectiveBaselineResultJson,
      customerJourneyTitle: String(customerJourneyDraft?.journey_title || ""),
      opportunities,
    });

    let {
      consistencyReview,
      positioningReview,
      evidenceReview,
      strategyReview,
    } = await runAllDraftReviews({
      apiKey: openaiKey,
      model: openaiModel,
      companyName: company_name,
      website,
      baselineBrief,
      strategicProblemBrief,
      odiBrief,
      inputs,
      journeys,
      opportunities,
      routes,
    });

    let reviewResults = [
      { key: "consistency", review: consistencyReview },
      { key: "positioning", review: positioningReview },
      { key: "evidence", review: evidenceReview },
      { key: "strategy", review: strategyReview },
    ];
    let actionableReviews = reviewResults.filter(
      (entry) =>
        String(entry.review?.severity || "low").toLowerCase() !== "low" ||
        entry.review?.pass === false,
    );
    let highSeverityReviews = reviewResults.filter(
      (entry) => String(entry.review?.severity || "low").toLowerCase() === "high",
    );

    let finalizerApplied = false;

    if (highSeverityReviews.length > 0) {
      try {
        const repairedBundle = await runFinalizer({
          apiKey: openaiKey,
          model: openaiModel,
          companyName: company_name,
          website,
          baselineBrief,
          strategicProblemBrief,
          odiBrief,
          inputs,
          journeys,
          opportunities,
          routes,
          reviews: reviewResults,
        });

        finalizerApplied = true;
        inputs = Array.isArray(repairedBundle?.inputs) ? repairedBundle.inputs : inputs;
        journeys = Array.isArray(repairedBundle?.journeys) ? repairedBundle.journeys : journeys;
        if (Array.isArray(repairedBundle?.opportunities) && repairedBundle.opportunities.length > 0) {
          opportunities = repairedBundle.opportunities;
        }
        if (Array.isArray(repairedBundle?.routes) && repairedBundle.routes.length > 0) {
          routes = repairedBundle.routes;
        }
        const repairedJourneyByKey = new Map<string, any>();
        for (const journey of journeys) {
          const key = normalizeJourneyKey(journey?.journey_key);
          if (!targetJourneyKeySet.has(key)) continue;
          if (!repairedJourneyByKey.has(key)) {
            repairedJourneyByKey.set(key, { ...journey, journey_key: key });
          }
        }
        journeys = targetJourneyKeys
          .map((key) => repairedJourneyByKey.get(key))
          .filter(Boolean);

        ({
          consistencyReview,
          positioningReview,
          evidenceReview,
          strategyReview,
        } = await runAllDraftReviews({
          apiKey: openaiKey,
          model: openaiModel,
          companyName: company_name,
          website,
          baselineBrief,
          strategicProblemBrief,
          odiBrief,
          inputs,
          journeys,
          opportunities,
          routes,
        }));

        reviewResults = [
          { key: "consistency", review: consistencyReview },
          { key: "positioning", review: positioningReview },
          { key: "evidence", review: evidenceReview },
          { key: "strategy", review: strategyReview },
        ];
        actionableReviews = reviewResults.filter(
          (entry) =>
            String(entry.review?.severity || "low").toLowerCase() !== "low" ||
            entry.review?.pass === false,
        );
        highSeverityReviews = reviewResults.filter(
          (entry) => String(entry.review?.severity || "low").toLowerCase() === "high",
        );
      } catch (error) {
        console.log("[research-company] finalizer failed; preserving pre-finalizer artifacts", {
          message: String(error instanceof Error ? error.message : error),
        });
      }
    }

    if (highSeverityReviews.length > 0 && !allowHighSeverityReviewSave) {
      if (dry_run) {
        console.log("[research-company] dry_run: review would block; continuing without save", {
          reviews: highSeverityReviews.map((entry) => ({ key: entry.key, severity: entry.review?.severity })),
        });
      } else {
      console.log("[research-company] blocked by reviewer findings", {
        company_id,
        baseline_run_id: baselineRun?.id ?? null,
        reviews: highSeverityReviews.map((entry) => ({
          key: entry.key,
          severity: entry.review?.severity,
          summary: entry.review?.summary,
          findings: Array.isArray(entry.review?.findings) ? entry.review.findings.length : 0,
        })),
      });

      await persistResearchReviewRun({
        supabase,
        companyId: company_id,
        userId: user.id,
        baselineRunId: baselineRun?.id ?? null,
        status: "review_blocked",
        reviewSummary:
          summarizeReviews(
            highSeverityReviews as Array<{ key?: string; review?: { severity?: string; summary?: string } }>
          ) || "Generated draft needs review before it can be saved.",
        reviews: reviewResults,
        finalizerApplied,
      });

      return jsonResponse({
        error: "Generated draft needs review before it can be saved",
        status: "review_blocked",
        baseline_run_id: baselineRun?.id ?? null,
        reviews: reviewResults,
      }, 422);
      } // end !dry_run block
    }

    if (highSeverityReviews.length > 0 && allowHighSeverityReviewSave) {
      console.log("[research-company] advisory review mode: saving despite high-severity findings", {
        company_id,
        baseline_run_id: baselineRun?.id ?? null,
        review_mode: reviewMode || "advisory",
        reviews: highSeverityReviews.map((entry) => ({
          key: entry.key,
          severity: entry.review?.severity,
          summary: entry.review?.summary,
        })),
      });
    }

    const savedReviewStatus =
      highSeverityReviews.length > 0 && allowHighSeverityReviewSave
        ? "saved_with_high_risk_review"
        : actionableReviews.length > 0
          ? "saved_after_review"
          : "saved";

    if (!dry_run) {
    await persistResearchReviewRun({
      supabase,
      companyId: company_id,
      userId: user.id,
      baselineRunId: baselineRun?.id ?? null,
      status: savedReviewStatus,
      reviewSummary:
        actionableReviews.length > 0
          ? summarizeReviews(
              actionableReviews as Array<{ key?: string; review?: { severity?: string; summary?: string } }>
            ) || "Research saved after reviewer-guided repair."
          : "All reviewers passed. Research saved successfully.",
      reviews: reviewResults,
      finalizerApplied,
    });
    } // end !dry_run persistResearchReviewRun

    // Filter to structurally valid outcomes before persistence.
    // For low-information contexts (outside phase, sparse public data) some outcomes
    // may have minor gaps — skip those rather than aborting the entire run.
    const managedOutcomesValid = managedOutcomes.filter((managed) => {
      const validation = validateDesiredOutcome({
        statement: String((managed as Record<string, unknown>)?.outcome_statement || (managed as Record<string, unknown>)?.outcome_title || ""),
        leadingIndicator: String((managed as Record<string, unknown>)?.leading_indicator || ""),
        targetDirection: String((managed as Record<string, unknown>)?.target_direction || ""),
        direction: String((managed as Record<string, unknown>)?.direction || (managed as Record<string, unknown>)?.target_direction || ""),
        metric: String((managed as Record<string, unknown>)?.metric || (managed as Record<string, unknown>)?.leading_indicator || ""),
        actor: String((managed as Record<string, unknown>)?.actor || ""),
        action: String((managed as Record<string, unknown>)?.action || ""),
        object: String((managed as Record<string, unknown>)?.object || ""),
        context: String((managed as Record<string, unknown>)?.context || ""),
        constraint: String((managed as Record<string, unknown>)?.constraint || ""),
        frameworksUsed: ensureRequiredFrameworkKeys(opportunityFrameworkKeys),
      });
      return validation.valid;
    });
    // If all outcomes fail strict validation, proceed with whatever we have
    // rather than aborting — the run must not fail purely because evidence is thin.
    if (managedOutcomesValid.length > 0) {
      managedOutcomes = managedOutcomesValid;
    }

    const primaryOutcomeStatement = String(
      (managedOutcomes[0] as Record<string, unknown> | undefined)?.outcome_statement ||
      (managedOutcomes[0] as Record<string, unknown> | undefined)?.outcome_title ||
      "",
    ).trim();
    opportunities = opportunities.filter((opp) =>
      isCustomerJourneyKey((opp as Record<string, unknown> | undefined)?.journey_key),
    );
    if (opportunities.length === 0) {
      return jsonResponse({
        error: "No customer opportunities available after strict scope enforcement.",
        status: "validation_failed",
      }, 422);
    }
    // Filter out invalid opportunities before persistence rather than hard-failing.
    // Keeps valid ones and proceeds as long as at least one remains.
    opportunities = opportunities.filter((opp) => {
      const oppRecord = opp as Record<string, unknown>;
      const validation = validateOpportunity({
        outcome: String(oppRecord?.outcome || ""),
        importance: Number(oppRecord?.importance),
        satisfaction: Number(oppRecord?.satisfaction),
        frameworksUsed: ensureRequiredFrameworkKeys(opportunityFrameworkKeys),
      });
      if (!validation.valid) return false;
      if (primaryOutcomeStatement) {
        const distinctness = validateOutcomeOpportunityDistinctness(primaryOutcomeStatement, String(oppRecord?.outcome || ""));
        if (!distinctness.valid) return false;
      }
      return true;
    });
    if (opportunities.length === 0) {
      return jsonResponse({
        error: "Opportunities failed strict ODI/Teresa Torres validation before persistence.",
        status: "validation_failed",
      }, 422);
    }

    // -------------------------
    // 7) Clear old rows for company (skipped in dry_run)
    // -------------------------
    // Declared here so §8 INSERT block can reference preserved files regardless of dry_run scope
    const preservedInputFilesByKey = new Map<
      string,
      Array<{
        file_name: string;
        file_path: string;
        file_type: string;
        tags: string[];
        uploaded_at?: string | null;
      }>
    >();
    if (!dry_run) {
    const { data: existingInputs } = await supabase
      .from("inputs")
      .select("id, input_key")
      .eq("company_id", company_id);
    const existingIds = (existingInputs || []).map((r: any) => r.id);
    const inputKeyById = new Map<string, string>(
      ((existingInputs || []) as Array<{ id?: string; input_key?: string }>)
        .filter((row) => typeof row?.id === "string" && typeof row?.input_key === "string")
        .map((row) => [String(row.id), String(row.input_key)]),
    );

    if (existingIds.length > 0) {
      const { data: existingInputFiles, error: existingInputFilesErr } = await supabase
        .from("input_files")
        .select("input_id, file_name, file_path, file_type, tags, uploaded_at")
        .in("input_id", existingIds);

      if (existingInputFilesErr) {
        console.error("[research-company] existing input_files fetch error:", existingInputFilesErr);
      } else {
        for (const file of (existingInputFiles || []) as Array<any>) {
          const key = inputKeyById.get(String(file?.input_id || ""));
          if (!key) continue;
          const bucket = preservedInputFilesByKey.get(key) || [];
          bucket.push({
            file_name: String(file?.file_name || ""),
            file_path: String(file?.file_path || ""),
            file_type: String(file?.file_type || "application/octet-stream"),
            tags: Array.isArray(file?.tags) ? file.tags.map((tag: unknown) => String(tag)) : [],
            uploaded_at: typeof file?.uploaded_at === "string" ? file.uploaded_at : null,
          });
          preservedInputFilesByKey.set(key, bucket);
        }
      }

      await supabase.from("input_subitems").delete().in("input_id", existingIds);
      await supabase.from("input_files").delete().in("input_id", existingIds);
      await supabase.from("inputs").delete().in("id", existingIds);
    }

    if (jobMapUpdateJourneyKeys.length > 0) {
      await supabase
        .from("job_steps")
        .delete()
        .eq("company_id", company_id)
        .in("journey_key", jobMapUpdateJourneyKeys);
    }
    await supabase.from("solution_tests").delete().eq("company_id", company_id);
    await supabase.from("solution_ideas").delete().eq("company_id", company_id);
    await supabase.from("opportunities").delete().eq("company_id", company_id);
    // LIKE 'manual_%' preserves all manual-origin routes/legs (manual_inline, manual_a5_recovery, etc.)
    await supabase.from("routes").delete().eq("company_id", company_id).not("source", "like", "manual_%");
    await supabase.from("managed_outcomes").delete().eq("company_id", company_id);
    await supabase.from("odi_needs").delete().eq("company_id", company_id);
    await supabase.from("odi_market_definitions").delete().eq("company_id", company_id);
    // positioning_canvases and strategy_cascades are owned by leaf functions (A37)

    } // end !dry_run §7 clears

    // -------------------------
    // 8) Insert inputs / steps / opps / routes (skipped in dry_run)
    // -------------------------
    let inputsInserted = 0;
    let stepsInserted = 0;
    let oppsInserted = 0;
    let routesInserted = 0;
    let managedOutcomesInserted = 0;
    let solutionIdeasInserted = 0;
    let solutionTestsInserted = 0;
    let odiNeedsInserted = 0;
    let odiMarketDefinitionsInserted = 0;
    // Hoisted: referenced by scoreCompanyMojo (§9) outside the dry_run gate
    const artifactSourcePath =
      researchContextMode === "uploaded_evidence_fallback" ? "uploaded_file_research" : "public_research";
    if (!dry_run) {
    const insertedOpportunities: Array<{
      id: string;
      outcome: string;
      step_label: string;
      step_number: number;
      journey_key: string;
      priority_tier: string;
      opportunity_score: number;
    }> = [];
    const insertedRoutes: Array<{
      id: string;
      category: string;
      title: string;
      short_description: string;
      effort: string;
      frameworks_used: string[];
      sort_order: number;
      rejected_alternatives: Array<{ alternative_title: string; rejection_reason: string }>;
      what_would_have_to_be_true: Array<{ condition: string; satisfied_flag: boolean }>;
    }> = [];
    const restoredFileKeys = new Set<string>();

    // Inputs: accept model grouping with safe normalization/fallback
    for (const input of inputs) {
      const key = String(input?.input_key || "").trim();
      if (!key) continue;

      const derivedGroupKey = normalizeInputGroupKey({
        inputKey: key,
        inputGroupKey: String(input?.group_key || ""),
        subGroup: String(input?.sub_group || ""),
      });
      const derivedGroupLabel = groupLabelForKey(derivedGroupKey);
      const seededProgress = seedInputProgress({
        inputKey: key,
        description: String(input?.description || ""),
        whyItMatters: String(input?.why_it_matters || ""),
        baselineResultJson: effectiveBaselineResultJson,
      });
      const derivedImpact = deriveInputScoreImpact({
        inputKey: key,
        completeness: seededProgress.completeness,
        status: seededProgress.status,
      });

      const { data: row, error: insertErr } = await supabase
        .from("inputs")
        .insert({
          input_key: key,
          input_label: String(input?.input_label || "Unnamed Input"),
          frameworks_used: inputFrameworkKeys,
          group_key: derivedGroupKey,
          group_label: derivedGroupLabel,
          sub_group: String(input?.sub_group || ""),
          description: String(input?.description || ""),
          why_it_matters: String(input?.why_it_matters || ""),
          score_impact: derivedImpact.scoreImpact,
          impact_tier: derivedImpact.impactTier,
          completeness: seededProgress.completeness,
          status: seededProgress.status,
          user_id: user.id,
          company_id,
        })
        .select("id")
        .single();

      if (insertErr) {
        console.error("[research-company] insert input error:", insertErr);
        continue;
      }

      if (row?.id) {
        let restoredFileCount = 0;
        if (!restoredFileKeys.has(key)) {
          const preservedFiles = preservedInputFilesByKey.get(key) || [];
          if (preservedFiles.length > 0) {
            const restorePayload = preservedFiles
              .filter((file) => file.file_name && file.file_path)
              .map((file) => ({
                input_id: row.id,
                file_name: file.file_name,
                file_path: file.file_path,
                file_type: file.file_type || "application/octet-stream",
                tags: Array.isArray(file.tags) ? file.tags : [],
                uploaded_at: file.uploaded_at || new Date().toISOString(),
              }));

            if (restorePayload.length > 0) {
              const { error: restoreErr } = await supabase.from("input_files").insert(restorePayload);
              if (restoreErr) {
                console.error("[research-company] restore input_files error:", restoreErr);
              } else {
                restoredFileCount = restorePayload.length;
              }
            }
          }
          restoredFileKeys.add(key);
        }

        const { error: subitemErr } = await supabase.from("input_subitems").insert({
          input_id: row.id,
          name: String(input?.input_label || "Checklist item"),
          done: false,
          sort_order: 0,
        });

        if (subitemErr) {
          console.error("[research-company] insert input_subitem error:", subitemErr);
        }

        if (restoredFileCount <= 0) {
          // Re-apply seeded progress only when no files were restored.
          // If files exist, the input_files trigger already computes completeness/status from uploaded evidence.
          const { error: reseedErr } = await supabase
            .from("inputs")
            .update({
              completeness: seededProgress.completeness,
              status: seededProgress.status,
              score_impact: derivedImpact.scoreImpact,
              impact_tier: derivedImpact.impactTier,
            })
            .eq("id", row.id);

          if (reseedErr) {
            console.error("[research-company] reseed input completeness error:", reseedErr);
          }
        }
      }

      inputsInserted++;
    }

    // Job steps
    for (const journey of journeys) {
      const journeyKey = normalizeJourneyKey(journey?.journey_key);
      if (!journeyKey) continue;
      if (!jobMapUpdateJourneyKeySet.has(journeyKey)) {
        // GAP-MARK SEAM (mechanic 2, not yet built): when this is the preserved pinned set,
        // `journey.steps` holds the freshly-discovered steps we intentionally do NOT write —
        // mechanic 2 will diff these against the preserved rows and route gaps to drift.
        if (journeyKey === pinnedPreserveKey) continue;
        // ADDITIVE: insert a genuinely-new discovered set (not previously stored). The delete
        // above never touched it (nothing to delete), so there is no duplicate. An existing,
        // non-targeted set is left untouched (skip).
        if (existingJourneyKeySet.has(journeyKey)) continue;
        console.log(`[research-company] additive-add: inserting newly-discovered set '${journeyKey}'`);
      }

      const steps = Array.isArray(journey?.steps) ? journey.steps : [];
      for (const step of steps) {
        const stepPayload = {
          company_id,
          user_id: user.id,
          frameworks_used: journeyFrameworkKeys,
          journey_key: journeyKey,
          journey_title: String(journey?.journey_title || ""),
          journey_subtitle: String(journey?.journey_subtitle || ""),
          step_number: Number(step?.step_number) || 1,
          step_label: String(step?.step_label || ""),
          description: String(step?.description || ""),
          designed: !!step?.designed,
          has_gap: !!step?.has_gap,
          evidence_status: ["evidenced", "implied", "unclear"].includes(String(step?.evidence_status))
            ? String(step?.evidence_status)
            : "unclear",
          evidence_basis: String(step?.evidence_basis || ""),
          evidence_confidence: clamp(Number(step?.evidence_confidence) || 0, 0, 100),
          gap_note: String(step?.gap_note || ""),
        };

        let { error: stepErr } = await supabase.from("job_steps").insert(stepPayload);

        if (stepErr && isJobStepEvidenceColumnError(stepErr.message || "")) {
          const fallback = await supabase.from("job_steps").insert({
            company_id,
            user_id: user.id,
            frameworks_used: journeyFrameworkKeys,
            journey_key: journeyKey,
            journey_title: String(journey?.journey_title || ""),
            journey_subtitle: String(journey?.journey_subtitle || ""),
            step_number: Number(step?.step_number) || 1,
            step_label: String(step?.step_label || ""),
            description: String(step?.description || ""),
            designed: !!step?.designed,
            has_gap: !!step?.has_gap,
            gap_note: String(step?.gap_note || ""),
          });
          stepErr = fallback.error;
        }

        if (stepErr) console.error("[research-company] job step insert error:", stepErr);
        else stepsInserted++;
      }
    }

    const customerStepLabelByNumber = new Map<number, string>();
    const normalizedCustomerJourney = journeys.find((journey) => isCustomerJourneyKey(journey?.journey_key));
    const normalizedCustomerSteps = Array.isArray(normalizedCustomerJourney?.steps)
      ? normalizedCustomerJourney.steps
      : [];
    for (const step of normalizedCustomerSteps) {
      const stepNumber = clamp(Number((step as Record<string, unknown>)?.step_number) || 0, 1, JTBD_CHECKPOINT_COUNT);
      const stepLabel = String((step as Record<string, unknown>)?.step_label || "").trim();
      if (!stepLabel) continue;
      if (!customerStepLabelByNumber.has(stepNumber)) {
        customerStepLabelByNumber.set(stepNumber, stepLabel);
      }
    }

    const managedOutcomeIdByJourney = new Map<string, string>();
    for (const outcome of managedOutcomes) {
      const journeyKey = "customer";
      const structured = composeDesiredOutcomeFromParts(
        deriveDesiredOutcomeParts({
          journey_key: journeyKey,
          outcome_statement: normalizeOutcomeLanguage(String(outcome?.outcome_statement || "")),
          leading_indicator: normalizeOutcomeLanguage(String(outcome?.leading_indicator || "")),
          target_direction: normalizeDirection(String(outcome?.target_direction || "")),
          direction: String(outcome?.direction || ""),
          metric: String(outcome?.metric || ""),
          object: String(outcome?.object || ""),
          context: String(outcome?.context || ""),
          constraint: String(outcome?.constraint || ""),
          is_primary: Boolean(outcome?.is_primary),
        }),
      );
      const isPrimaryOutcome = Boolean(outcome?.is_primary) || managedOutcomesInserted === 0;
      const payload = {
        company_id,
        user_id: user.id,
        journey_key: journeyKey,
        outcome_title: normalizeOutcomeLanguage(String(outcome?.outcome_title || structured.outcome_statement)),
        outcome_statement: normalizeOutcomeLanguage(String(outcome?.outcome_statement || structured.outcome_statement)),
        leading_indicator: normalizeOutcomeLanguage(String(outcome?.leading_indicator || structured.leading_indicator)),
        target_direction: normalizeDirection(String(outcome?.target_direction || structured.target_direction)),
        direction: structured.direction,
        metric: structured.metric,
        actor: String((outcome as any)?.actor || structured.actor || ""),
        action: String((outcome as any)?.action || structured.action || ""),
        object: structured.object,
        context: structured.context,
        constraint: structured.constraint || null,
        is_primary: isPrimaryOutcome,
        level: String((outcome as any)?.level || "primary"),
        stage: String((outcome as any)?.stage || "outside"),
        evidence_level: String((outcome as any)?.evidence_level || "external_only"),
        why_this_level: String((outcome as any)?.why_this_level || ""),
        why_behavioral: String((outcome as any)?.why_behavioral || ""),
        leading_indicators: Array.isArray((outcome as any)?.leading_indicators)
          ? (outcome as any).leading_indicators
          : [],
        lagging_indicators: Array.isArray((outcome as any)?.lagging_indicators)
          ? (outcome as any).lagging_indicators
          : [],
        related_opportunity_areas: Array.isArray((outcome as any)?.related_opportunity_areas)
          ? (outcome as any).related_opportunity_areas
          : [],
        evidence_basis: String(outcome?.evidence_basis || "").trim(),
        confidence: clamp(Number(outcome?.confidence) || 58, 0, 100),
        frameworks_used: ensureRequiredFrameworkKeys(opportunityFrameworkKeys),
      };

      let insert = await supabase
        .from("managed_outcomes")
        .insert(payload)
        .select("id")
        .single();

      const insertErrorMessage = String(insert.error?.message || "").toLowerCase();
      if (insert.error && (
        insertErrorMessage.includes("frameworks_used") ||
        insertErrorMessage.includes("direction") ||
        insertErrorMessage.includes("metric") ||
        insertErrorMessage.includes("actor") ||
        insertErrorMessage.includes("action") ||
        insertErrorMessage.includes("object") ||
        insertErrorMessage.includes("context") ||
        insertErrorMessage.includes("constraint") ||
        insertErrorMessage.includes("is_primary") ||
        insertErrorMessage.includes("level") ||
        insertErrorMessage.includes("stage") ||
        insertErrorMessage.includes("evidence_level") ||
        insertErrorMessage.includes("why_this_level") ||
        insertErrorMessage.includes("why_behavioral") ||
        insertErrorMessage.includes("leading_indicators") ||
        insertErrorMessage.includes("lagging_indicators") ||
        insertErrorMessage.includes("related_opportunity_areas")
      )) {
        insert = await supabase
          .from("managed_outcomes")
          .insert({
            company_id,
            user_id: user.id,
            journey_key: journeyKey,
            outcome_title: payload.outcome_title,
            outcome_statement: payload.outcome_statement,
            leading_indicator: payload.leading_indicator,
            target_direction: payload.target_direction,
            evidence_basis: payload.evidence_basis,
            confidence: payload.confidence,
          })
          .select("id")
          .single();
      }

      if (insert.error) {
        console.error("[research-company] managed outcome insert error:", insert.error);
      } else {
        const managedId = String((insert.data as { id?: string } | null)?.id || "");
        if (managedId) {
          managedOutcomeIdByJourney.set(journeyKey, managedId);
          managedOutcomesInserted++;
        }
      }
    }
    if (!managedOutcomeIdByJourney.get("customer")) {
      return jsonResponse({
        error: "Managed outcomes could not be persisted; aborting strict opportunity tree generation.",
        status: "persistence_failed",
      }, 422);
    }

    // Opportunities: recompute tier from score to keep consistent
    const persistedOpportunityIdByTempKey = new Map<string, string>();
    let parentOpportunityColumnAvailable = true;
    for (const opp of hierarchicalOpportunities) {
      const normalizedJourneyKey = normalizeJourneyKey(opp?.journey_key);
      const journeyKey = normalizedJourneyKey || "customer";
      const rawStepNumber = Number(opp?.step_number) || 0;
      const stepNumber = isCustomerJourneyKey(journeyKey)
        ? clamp(rawStepNumber || 1, 1, JTBD_CHECKPOINT_COUNT)
        : Math.max(1, rawStepNumber || 1);
      const stepLabel = isCustomerJourneyKey(journeyKey)
        ? customerStepLabelByNumber.get(stepNumber) || String(opp?.step_label || "").trim()
        : String(opp?.step_label || "").trim();

      const importance = clamp(Number(opp?.importance) || 5, 1, 10);
      const satisfaction = clamp(Number(opp?.satisfaction) || 5, 1, 10);
      const opportunity_score = clamp(
        Number(opp?.opportunity_score) || (importance + (10 - satisfaction)),
        0,
        20,
      );

      const priority_tier =
        opportunity_score >= 12 ? "focus" : opportunity_score >= 7 ? "monitor" : "defer";

      const managedOutcomeId = managedOutcomeIdByJourney.get(journeyKey) || null;
      const parentOpportunityId = parentOpportunityColumnAvailable
        ? persistedOpportunityIdByTempKey.get(String(opp.__parent_key || "")) || null
        : null;

      let insert = await supabase
        .from("opportunities")
        .insert({
          company_id,
          user_id: user.id,
          provenance_type: "public_research",
          frameworks_used: ensureRequiredFrameworkKeys(opportunityFrameworkKeys),
          managed_outcome_id: managedOutcomeId,
          ...(parentOpportunityColumnAvailable ? { parent_opportunity_id: parentOpportunityId } : {}),
          outcome: String(opp?.outcome || ""),
          step_number: stepNumber,
          step_label: stepLabel,
          journey_key: journeyKey,
          importance,
          satisfaction,
          opportunity_score,
          priority_tier,
        })
        .select("id, outcome, step_label, step_number, journey_key, priority_tier, opportunity_score")
        .single();

      let insertMessage = String(insert.error?.message || "").toLowerCase();
      if (insert.error && insertMessage.includes("parent_opportunity_id") && parentOpportunityColumnAvailable) {
        parentOpportunityColumnAvailable = false;
        insert = await supabase
          .from("opportunities")
          .insert({
            company_id,
            user_id: user.id,
            provenance_type: "public_research",
            frameworks_used: ensureRequiredFrameworkKeys(opportunityFrameworkKeys),
            managed_outcome_id: managedOutcomeId,
            outcome: String(opp?.outcome || ""),
            step_number: stepNumber,
            step_label: stepLabel,
            journey_key: journeyKey,
            importance,
            satisfaction,
            opportunity_score,
            priority_tier,
          })
          .select("id, outcome, step_label, step_number, journey_key, priority_tier, opportunity_score")
          .single();
        insertMessage = String(insert.error?.message || "").toLowerCase();
      }

      if (insert.error && insertMessage.includes("frameworks_used")) {
        insert = await supabase
          .from("opportunities")
          .insert({
            company_id,
            user_id: user.id,
            provenance_type: "public_research",
            managed_outcome_id: managedOutcomeId,
            ...(parentOpportunityColumnAvailable ? { parent_opportunity_id: parentOpportunityId } : {}),
            outcome: String(opp?.outcome || ""),
            step_number: stepNumber,
            step_label: stepLabel,
            journey_key: journeyKey,
            importance,
            satisfaction,
            opportunity_score,
            priority_tier,
          })
          .select("id, outcome, step_label, step_number, journey_key, priority_tier, opportunity_score")
          .single();
      }

      if (insert.error) {
        console.error("[research-company] opportunity insert error:", insert.error);
      } else {
        const row = (insert.data || {}) as Record<string, unknown>;
        const insertedId = String(row.id || "");
        if (insertedId) {
          const tempKey = String(opp.__temp_key || "").trim();
          if (tempKey) {
            persistedOpportunityIdByTempKey.set(tempKey, insertedId);
          }
          insertedOpportunities.push({
            id: insertedId,
            outcome: String(row.outcome || ""),
            step_label: String(row.step_label || ""),
            step_number: Number(row.step_number) || stepNumber,
            journey_key: String(row.journey_key || journeyKey),
            priority_tier: String(row.priority_tier || priority_tier),
            opportunity_score: Number(row.opportunity_score) || opportunity_score,
          });
        }
        oppsInserted++;
      }
    }

    const customerJourney = journeys.find((journey) => isCustomerJourneyKey(journey?.journey_key));
    const baselineLens = (effectiveBaselineResultJson as {
      lens_card?: {
        primary_buyer?: string;
        chooser?: string;
        user?: string;
      };
    } | null)?.lens_card ?? {};
    const fallbackUnknownLabel =
      researchContextMode === "uploaded_evidence_fallback"
        ? "Unknown from uploaded evidence"
        : "Unknown from public evidence";
    const journeyDerivedExecutor = audienceFromJourneyTitle(customerJourney?.journey_title);
    const journeyDerivedJtbd = jtbdFromJourneyTitle(customerJourney?.journey_title);
    const normalizedCompanyName = normalizeAudienceSignal(company_name);
    const companyExecutorFallback = normalizedCompanyName ? `${normalizedCompanyName} decision owner` : "Primary decision owner";
    const lensUser = normalizeAudienceSignal(baselineLens.user);
    const lensPrimaryBuyer = normalizeAudienceSignal(baselineLens.primary_buyer);
    const lensChooser = normalizeAudienceSignal(baselineLens.chooser);
    const normalizedJourneyExecutor = isInvalidAudienceLabel(journeyDerivedExecutor)
      ? ""
      : journeyDerivedExecutor;
    const baselineExecutor = !isInvalidAudienceLabel(lensUser)
      ? lensUser
      : !isInvalidAudienceLabel(lensPrimaryBuyer)
        ? lensPrimaryBuyer
        : !isInvalidAudienceLabel(lensChooser)
          ? lensChooser
        : "";
    const job_executor =
      String(
        normalizedJourneyExecutor ||
        baselineExecutor ||
        (researchContextMode === "uploaded_evidence_fallback" ? companyExecutorFallback : fallbackUnknownLabel)
      );
    const chooserCandidate = !isInvalidAudienceLabel(lensChooser)
      ? lensChooser
      : !isInvalidAudienceLabel(lensPrimaryBuyer)
        ? lensPrimaryBuyer
        : !isInvalidAudienceLabel(normalizedJourneyExecutor)
          ? normalizedJourneyExecutor
          : "";
    const chooser =
      String(chooserCandidate || (researchContextMode === "uploaded_evidence_fallback" ? "Business decision owner" : fallbackUnknownLabel));
    const jtbdFallbackSubject = isInvalidAudienceLabel(job_executor)
      ? "the primary job performer"
      : job_executor.toLowerCase();
    const jtbd =
      journeyDerivedJtbd ||
      `When ${jtbdFallbackSubject} are trying to make progress, they need to define, execute, and validate outcomes with less risk and rework.`;

    const { error: odiMarketErr } = await supabase.from("odi_market_definitions").insert({
      company_id,
      user_id: user.id,
      provenance_type: "public_research",
      job_executor,
      chooser,
      jtbd,
      source_path: artifactSourcePath,
      frameworks_used: odiFrameworkKeys,
    });
    if (odiMarketErr) {
      console.error("[research-company] odi market definition insert error:", odiMarketErr);
    } else {
      odiMarketDefinitionsInserted++;
    }

    for (let needIndex = 0; needIndex < opportunities.length; needIndex += 1) {
      const opp = opportunities[needIndex];
      const rawStepNumber = Number(opp?.step_number) || 0;
      const stepNumber = clamp(rawStepNumber || 1, 1, JTBD_CHECKPOINT_COUNT);
      const stepLabel = customerStepLabelByNumber.get(stepNumber) || String(opp?.step_label || "").trim();
      const importance = clamp(Number(opp?.importance) || 5, 1, 10);
      const satisfaction = clamp(Number(opp?.satisfaction) || 5, 1, 10);
      const opportunity_score = clamp(
        Number(opp?.opportunity_score) || (importance + (10 - satisfaction)),
        0,
        20,
      );
      const priority_tier =
        opportunity_score >= 12 ? "focus" : opportunity_score >= 7 ? "monitor" : "defer";
      const desiredOutcome = normalizeOutcomeLanguage(String(opp?.outcome || ""));

      const { error: odiNeedErr } = await supabase.from("odi_needs").insert({
        company_id,
        user_id: user.id,
        provenance_type: "public_research",
        tier: "need",
        desired_outcome: desiredOutcome,
        odi_canonical_statement: opp?.odi_canonical_statement || null,
        journey_key: "customer",
        step_number: stepNumber,
        step_label: stepLabel,
        importance,
        satisfaction,
        opportunity_score,
        sort_order: needIndex + 1,
        service_state: odiServiceState(importance, satisfaction),
        source_path: artifactSourcePath,
        frameworks_used: odiFrameworkKeys,
      });

      if (odiNeedErr) console.error("[research-company] odi need insert error:", odiNeedErr);
      else odiNeedsInserted++;
    }

    // Build a flat step list for route detail generation
    const allFlatSteps: FlatStep[] = [];
    for (const journey of journeys) {
      const jKey = normalizeJourneyKey(journey?.journey_key);
      if (!jKey) continue;
      const jSteps = Array.isArray(journey?.steps) ? journey.steps : [];
      for (const step of jSteps) {
        allFlatSteps.push({
          journey_key: jKey,
          step_number: Number((step as Record<string, unknown>)?.step_number) || 1,
          step_label: String((step as Record<string, unknown>)?.step_label || ""),
          designed: !!(step as Record<string, unknown>)?.designed,
          has_gap: !!(step as Record<string, unknown>)?.has_gap,
          gap_note: String((step as Record<string, unknown>)?.gap_note || ""),
        });
      }
    }

    // Routes
    for (const route of routes) {
      const category = ["fix", "improve", "create"].includes(String(route?.category))
        ? String(route.category)
        : "improve";

      const routeType = category === "fix" ? "Fix" : category === "create" ? "Create" : "Improve";
      const effort = ["low", "medium", "high"].includes(String(route?.effort))
        ? String(route.effort)
        : "medium";
      const rewrittenRoute = rewriteRouteLanguage({
        category,
        title: String(route?.title || ""),
        shortDescription: String(route?.short_description || ""),
        whyThisMatters: [],
      });

      const routePayload = {
        company_id,
        user_id: user.id,
        provenance_type: "public_research",
        frameworks_used: ensureRequiredFrameworkKeys(routeFrameworkKeys),
        category,
        title: rewrittenRoute.title,
        short_description: rewrittenRoute.shortDescription,
        pts_value: clamp(Number(route?.pts_value) || 1, 1, 10),
        effort,
        type: String(route?.type || routeType),
        sort_order: Math.max(1, Number(route?.sort_order) || routesInserted + 1),
        level: "route",
        rejected_alternatives: Array.isArray(route?.rejected_alternatives) ? route.rejected_alternatives : [],
        what_would_have_to_be_true: Array.isArray(route?.what_would_have_to_be_true) ? route.what_would_have_to_be_true : [],
      };

      let insert = await supabase
        .from("routes")
        .insert(routePayload)
        .select("id, category, title, short_description, effort, frameworks_used, sort_order")
        .single();

      if (insert.error && String(insert.error.message || "").toLowerCase().includes("frameworks_used")) {
        insert = await supabase.from("routes").insert({
          company_id,
          user_id: user.id,
          provenance_type: "public_research",
          category,
          title: rewrittenRoute.title,
          short_description: rewrittenRoute.shortDescription,
          pts_value: clamp(Number(route?.pts_value) || 1, 1, 10),
          effort,
          type: String(route?.type || routeType),
          sort_order: Math.max(1, Number(route?.sort_order) || routesInserted + 1),
          level: "route",
          rejected_alternatives: Array.isArray(route?.rejected_alternatives) ? route.rejected_alternatives : [],
          what_would_have_to_be_true: Array.isArray(route?.what_would_have_to_be_true) ? route.what_would_have_to_be_true : [],
        })
          .select("id, category, title, short_description, effort, frameworks_used, sort_order")
          .single();
      }

      if (insert.error) {
        console.error("[research-company] route insert error:", insert.error);
      } else {
        const row = (insert.data || {}) as Record<string, unknown>;
        const insertedId = String(row.id || "");
        insertedRoutes.push({
          id: insertedId,
          category: String(row.category || category),
          title: String(row.title || ""),
          short_description: String(row.short_description || rewrittenRoute.shortDescription),
          effort: String(row.effort || effort),
          frameworks_used: ensureRequiredFrameworkKeys(Array.isArray(row.frameworks_used) ? row.frameworks_used as string[] : routeFrameworkKeys),
          sort_order: Math.max(1, Number(row.sort_order) || routesInserted + 1),
          rejected_alternatives: Array.isArray(route?.rejected_alternatives) ? route.rejected_alternatives : [],
          what_would_have_to_be_true: Array.isArray(route?.what_would_have_to_be_true) ? route.what_would_have_to_be_true : [],
        });

        if (insertedId) {
          const details = buildRouteDetailPayload({
            routeId: insertedId,
            routeTitle: rewrittenRoute.title,
            routeShortDescription: rewrittenRoute.shortDescription,
            category,
            opportunities: insertedOpportunities,
            allSteps: allFlatSteps,
          });
          const { error: detailErr } = await supabase
            .from("routes")
            .update({
              steps_json: details.steps,
              evidence_json: details.evidence,
              why_this_matters_json: details.why_this_matters,
            })
            .eq("id", insertedId);
          if (detailErr) console.error("[research-company] route detail update error:", detailErr);
        }

        routesInserted++;
      }
    }

    for (const opportunity of insertedOpportunities) {
      const rankedRoutes = insertedRoutes
        .map((route) => ({
          route,
          score: routeOpportunityFitScore(route, opportunity),
        }))
        .filter((entry) => entry.score >= 1.2)
        .sort((a, b) => b.score - a.score)
        .slice(0, 2);

      for (let index = 0; index < rankedRoutes.length; index += 1) {
        const candidate = rankedRoutes[index];
        const ideaPayload = {
          company_id,
          user_id: user.id,
          opportunity_id: opportunity.id,
          route_id: candidate.route.id || null,
          title: String(candidate.route.title || "Untitled solution idea"),
          description: String(candidate.route.short_description || "Candidate intervention for this opportunity branch."),
          category: String(candidate.route.category || "improve"),
          effort: String(candidate.route.effort || "medium"),
          confidence: clamp(Math.round(candidate.score * 22), 15, 90),
          frameworks_used: ensureRequiredFrameworkKeys([
            ...opportunityFrameworkKeys,
            ...candidate.route.frameworks_used,
          ]),
          sort_order: index + 1,
        };

        // Solution ideas auto-generated from AI routes — skip strict signal validation.
        // validateSolutionIdea is still used for human-entered ideas elsewhere.

        const ideaInsert = await supabase
          .from("solution_ideas")
          .insert(ideaPayload)
          .select("id")
          .single();

        if (ideaInsert.error) {
          console.error("[research-company] solution idea insert error:", ideaInsert.error);
          return jsonResponse({
            error: "Solution ideas could not be persisted.",
            status: "persistence_failed",
          }, 422);
        }

        const solutionIdeaId = String((ideaInsert.data as { id?: string } | null)?.id || "");
        if (!solutionIdeaId) continue;
        solutionIdeasInserted++;

        const generatedTests = buildSolutionTestsForIdea({
          opportunity,
          solutionIdea: { title: ideaPayload.title },
        });

        for (let testIndex = 0; testIndex < generatedTests.length; testIndex += 1) {
          const test = generatedTests[testIndex];
          const testPayload = {
            company_id,
            user_id: user.id,
            solution_idea_id: solutionIdeaId,
            title: String(test.title || `Test ${testIndex + 1}`),
            method: String(test.method || ""),
            metric: String(test.metric || ""),
            success_threshold: String(test.success_threshold || ""),
            timebox: String(test.timebox || ""),
            frameworks_used: ensureRequiredFrameworkKeys(ideaPayload.frameworks_used),
            sort_order: testIndex + 1,
          };

          const testValidation = validateSolutionTest({
            title: testPayload.title,
            method: testPayload.method,
            metric: testPayload.metric,
            successThreshold: testPayload.success_threshold,
            timebox: testPayload.timebox,
            frameworksUsed: testPayload.frameworks_used,
          });
          if (!testValidation.valid) {
            return jsonResponse({
              error: "Solution tests failed strict ODI/Teresa Torres validation.",
              status: "validation_failed",
              details: testValidation.reasons,
            }, 422);
          }

          const testInsert = await supabase.from("solution_tests").insert(testPayload);
          if (testInsert.error) {
            console.error("[research-company] solution test insert error:", testInsert.error);
            return jsonResponse({
              error: "Solution tests could not be persisted.",
              status: "persistence_failed",
            }, 422);
          }
          solutionTestsInserted++;
        }
      }
    }

    } // end !dry_run §8 upstream INSERTs

    // -------------------------
    // 8b) Invoke leaf functions (cascade + positioning) — always runs; dry_run forwarded
    // -------------------------
    const authorizationHeader = req.headers.get("Authorization") ?? "";
    const [cascadeInvokeResult, positioningInvokeResult] = await Promise.all([
      supabase.functions.invoke("refresh-cascade", {
        body: { company_id, skip_lock: true, dry_run },
        headers: { Authorization: authorizationHeader },
      }).catch((err: unknown) => {
        console.error("[research-company] refresh-cascade invoke error:", err);
        return { data: null, error: err };
      }),
      supabase.functions.invoke("refresh-positioning", {
        body: { company_id, skip_lock: true, dry_run },
        headers: { Authorization: authorizationHeader },
      }).catch((err: unknown) => {
        console.error("[research-company] refresh-positioning invoke error:", err);
        return { data: null, error: err };
      }),
    ]);

    if ((cascadeInvokeResult as any)?.data?.status === "skipped_manual_preserved") {
      console.log("[research-company] refresh-cascade: manual cascade preserved", { company_id });
    }
    if ((positioningInvokeResult as any)?.data?.status === "skipped_manual_preserved") {
      console.log("[research-company] refresh-positioning: manual positioning preserved", { company_id });
    }

    if (dry_run) {
      return jsonResponse({
        status: "dry_run",
        company_id,
        upstream_generated: {
          inputs: inputs.length,
          journeys: journeys.length,
          opportunities: opportunities.length,
          routes,
        },
        cascade_result: (cascadeInvokeResult as any)?.data ?? null,
        positioning_result: (positioningInvokeResult as any)?.data ?? null,
      });
    }

    // -------------------------
    // 8c) Read fresh cascade + positioning from DB (leaves have committed by this point)
    // -------------------------
    const { data: freshCascadeRow } = await supabase
      .from("strategy_cascades")
      .select("winning_aspiration, where_to_play, how_to_win, capabilities_json, management_systems_json, assumptions_json")
      .eq("company_id", company_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data: freshPositioningRow } = await supabase
      .from("positioning_canvases")
      .select("competitive_alternatives_json, unique_attributes_json, value_for_customer, best_fit_customers, market_category, category_rationale, current_tagline, proposed_tagline")
      .eq("company_id", company_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    // -------------------------
    // 9) Use baselineRun (fetched once) + update company scores
    // -------------------------
    const run = baselineRun ?? null;

    // On-strategy: honor the operator's pinned set if one exists (the derive gate validates
    // it against the generated sets; non-matching pins fall back to the in-memory heuristic).
    const { data: onStrategyPin } = await supabase
      .from("operator_primary_selection")
      .select("item_key")
      .eq("company_id", company_id)
      .eq("domain", "job_step_set")
      .maybeSingle();
    const pinnedJourneyKey = (onStrategyPin as { item_key?: unknown } | null)?.item_key;

    const scored = scoreCompanyMojo({
      baselineResultJson: effectiveBaselineResultJson,
      primaryJourneyKey: typeof pinnedJourneyKey === "string" ? pinnedJourneyKey : undefined,
      inputs,
      jobSteps: journeys.flatMap((journey) => Array.isArray(journey?.steps) ? journey.steps.map((step: any) => ({
        journey_key: journey?.journey_key,
        journey_title: journey?.journey_title,
        journey_subtitle: journey?.journey_subtitle,
        designed: step?.designed,
        has_gap: step?.has_gap,
      })) : []),
      opportunities: opportunities.map((opp) => ({
        journey_key: opp?.journey_key,
        outcome: opp?.outcome,
        step_label: opp?.step_label,
        importance: opp?.importance,
        satisfaction: opp?.satisfaction,
        priority_tier: opp?.priority_tier,
      })),
      managedOutcomes: managedOutcomes.map((outcome: any) => ({
        journey_key: outcome?.journey_key,
        outcome_statement: outcome?.outcome_statement,
        leading_indicator: outcome?.leading_indicator,
        metric: outcome?.metric,
        object: outcome?.object,
        context: outcome?.context,
        is_primary: outcome?.is_primary,
      })),
      routes: routes.map((route) => ({
        title: route?.title,
        short_description: route?.short_description,
        category: route?.category,
      })),
      positioning: {
        competitive_alternatives: Array.isArray((freshPositioningRow as any)?.competitive_alternatives_json)
          ? (freshPositioningRow as any).competitive_alternatives_json
          : [],
        unique_attributes: Array.isArray((freshPositioningRow as any)?.unique_attributes_json)
          ? (freshPositioningRow as any).unique_attributes_json
          : [],
        value_for_customer: (freshPositioningRow as any)?.value_for_customer,
        best_fit_customers: (freshPositioningRow as any)?.best_fit_customers,
        market_category: (freshPositioningRow as any)?.market_category,
        category_rationale: (freshPositioningRow as any)?.category_rationale,
        current_tagline: (freshPositioningRow as any)?.current_tagline,
        proposed_tagline: (freshPositioningRow as any)?.proposed_tagline,
      },
      strategy: {
        winning_aspiration: (freshCascadeRow as any)?.winning_aspiration,
        where_to_play: (freshCascadeRow as any)?.where_to_play,
        how_to_win: (freshCascadeRow as any)?.how_to_win,
        capabilities: Array.isArray((freshCascadeRow as any)?.capabilities_json) ? (freshCascadeRow as any).capabilities_json : [],
        management_systems: Array.isArray((freshCascadeRow as any)?.management_systems_json) ? (freshCascadeRow as any).management_systems_json : [],
        assumptions: Array.isArray((freshCascadeRow as any)?.assumptions_json) ? (freshCascadeRow as any).assumptions_json : [],
      },
      strategicProblems,
      gamma: 2.2,
      excludedFingerprints: excludedLedgerFingerprints,
      needsSourcePaths: odiNeedsInserted > 0 ? Array(odiNeedsInserted).fill(artifactSourcePath) : [],
    });

    const { error: updErr } = await supabase
      .from("companies")
      .update({
        ...scored,
        last_scored_at: new Date().toISOString(),
      })
      .eq("id", company_id);

    if (updErr) {
      console.log("[research-company] company score update failed:", updErr.message);
    } else {
      console.log("[research-company] scored company", {
        company_id,
        mojo_score: scored.mojo_score,
        evidence_status: scored.evidence_status,
        baseline_run_id: run?.id ?? null,
      });
    }

    await persistResearchArtifactRun({
      supabase,
      companyId: company_id,
      userId: user.id,
      baselineRunId: run?.id ?? null,
      status: savedReviewStatus,
      mojoScore: scored.mojo_score,
      evidenceStatus: scored.evidence_status,
      summaryJson: {
        positioning: {
          market_category: String((freshPositioningRow as any)?.market_category || ""),
          proposed_tagline: String((freshPositioningRow as any)?.proposed_tagline || ""),
        },
        strategy: {
          winning_aspiration: String((freshCascadeRow as any)?.winning_aspiration || ""),
          where_to_play: String((freshCascadeRow as any)?.where_to_play || ""),
        },
        strategic_problem_context: {
          count: strategicProblems.length,
          reconciled_count: strategicProblems.filter((item) => item.status === "reconciled").length,
          primary_statement: strategicProblems[0]?.statement || null,
          alignment_score: Number((scored as any)?.area_scores_json?.strategic_problem_context?.score || 0),
        },
        job_maps: selectedJobMaps.map((map) => ({
          journey_key: map.journey_key,
          journey_title: map.journey_title,
          source: map.source,
        })),
        counts: {
          inputs: inputs.length,
          journeys: journeys.length,
          opportunities: opportunities.length,
          routes: routes.length,
          managed_outcomes: managedOutcomesInserted,
          solution_ideas: solutionIdeasInserted,
          solution_tests: solutionTestsInserted,
        },
      },
      artifactsJson: {
        inputs: inputs.map((input: any) => ({
          input_key: String(input?.input_key || ""),
          input_label: String(input?.input_label || ""),
          sub_group: String(input?.sub_group || ""),
        })),
        journeys: journeys.map((journey: any) => ({
          journey_key: String(journey?.journey_key || ""),
          journey_title: String(journey?.journey_title || ""),
          steps: Array.isArray(journey?.steps)
            ? journey.steps.map((step: any) => ({
                step_number: Number(step?.step_number) || 0,
                step_label: String(step?.step_label || ""),
                has_gap: Boolean(step?.has_gap),
              }))
            : [],
        })),
        opportunities: opportunities.slice(0, 8).map((opp: any) => ({
          outcome: String(opp?.outcome || ""),
          journey_key: String(opp?.journey_key || ""),
          priority_tier: String(opp?.priority_tier || ""),
          opportunity_score: Number(opp?.opportunity_score) || 0,
        })),
        routes: routes.slice(0, 8).map((route: any) => ({
          category: String(route?.category || ""),
          title: String(route?.title || ""),
          pts_value: Number(route?.pts_value) || 0,
        })),
        managed_outcomes: managedOutcomes.map((outcome: any) => ({
          journey_key: String(outcome?.journey_key || ""),
          outcome_title: String(outcome?.outcome_title || ""),
          outcome_statement: String(outcome?.outcome_statement || ""),
          leading_indicator: String(outcome?.leading_indicator || ""),
          direction: String(outcome?.direction || outcome?.target_direction || ""),
          metric: String(outcome?.metric || ""),
          object: String(outcome?.object || ""),
          context: String(outcome?.context || ""),
          constraint: String(outcome?.constraint || ""),
          is_primary: Boolean(outcome?.is_primary),
          confidence: Number(outcome?.confidence) || 0,
        })),
        strategic_problems: strategicProblems.map((item) => ({
          statement: item.statement,
          source: item.source,
          status: item.status,
        })),
        positioning: freshPositioningRow ?? null,
        strategy: freshCascadeRow ?? null,
      },
    });

    return jsonResponse({
      message: "Research complete",
      request_id: runtimeContract.request_id,
      run_id: runtimeContract.run_id,
      runtime_contract: runtimeContract.strict
        ? {
            framework_mode: runtimeContract.framework_mode,
            framework_modes: runtimeContract.framework_modes,
            orchestrator_mode: runtimeContract.orchestrator_mode,
            framework_schema_version: runtimeContract.framework_schema_version,
            stage: runtimeContract.stage,
            journey_key: runtimeContract.journey_key,
          }
        : null,
      review_status: savedReviewStatus,
      review_warnings: highSeverityReviews.map((entry) => ({
        key: entry.key,
        severity: String(entry.review?.severity || "high"),
        summary: String(entry.review?.summary || ""),
      })),
      inputs_inserted: inputsInserted,
      steps_inserted: stepsInserted,
      opportunities_inserted: oppsInserted,
      routes_inserted: routesInserted,
      managed_outcomes_inserted: managedOutcomesInserted,
      solution_ideas_inserted: solutionIdeasInserted,
      solution_tests_inserted: solutionTestsInserted,
      odi_market_definitions_inserted: odiMarketDefinitionsInserted,
      odi_needs_inserted: odiNeedsInserted,
      cascade_status: String((cascadeInvokeResult as any)?.data?.status ?? "invoked"),
      positioning_status: String((positioningInvokeResult as any)?.data?.status ?? "invoked"),
      mojo_score: scored.mojo_score,
      evidence_status: scored.evidence_status,
      primary_desired_outcome: managedOutcomes.find((outcome: any) => outcome?.is_primary === true) || managedOutcomes[0] || null,
    });
    } finally {
      if (stopLockHeartbeat) stopLockHeartbeat();
      if (!dry_run && user.id !== SERVICE_ROLE_UUID) await releaseCompanyRunLock(supabase, company_id);
    }
  } catch (err) {
    console.error("[research-company] error:", err);
    return jsonResponse({ error: String((err as any)?.message || err) }, 500);
  }
});
