// supabase/functions/research-company/index.ts
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

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
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
  "program-model": 0.72,
  "needs-assessment": 0.55,
  "outcome-data": 0.4,
  "referral-map": 0.38,
  "brand-narrative": 0.45,
  "channel-strat": 0.3,
  "donor-retention": 0.22,
  "grant-pipeline": 0.24,
  "family-satisfaction": 0.22,
};

const INPUT_BASE_IMPACT_BY_KEY: Record<string, number> = {
  "comp-alt": 9.0,
  "unique-attr": 8.0,
  "val-prop": 7.0,
  "target-aud": 6.0,
  "market-cat": 7.0,
  "program-model": 6.0,
  "needs-assessment": 5.0,
  "outcome-data": 6.0,
  "referral-map": 5.5,
  "brand-narrative": 5.0,
  "channel-strat": 5.5,
  "donor-retention": 4.5,
  "grant-pipeline": 4.5,
  "family-satisfaction": 4.0,
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
    else if (key === "program-model") inputLabel = "Collections Operating Model";
    else if (key === "needs-assessment") { inputLabel = "Creditor & Debtor Jobs"; subGroup = "ODI"; }
    else if (key === "outcome-data") { inputLabel = "Recovery Outcome Evidence"; subGroup = "ODI"; }
    else if (key === "referral-map") { inputLabel = "Acquisition & Partner Channels"; subGroup = "GTM"; }
    else if (key === "brand-narrative") { inputLabel = "Trust & Compliance Story"; subGroup = "Messaging"; }
    else if (key === "channel-strat") { inputLabel = "Enterprise GTM Channels"; subGroup = "GTM"; }
    else if (key === "donor-retention") setRetentionFields("Client Retention", "Retention", "Client renewal and account expansion behavior", "Protects recurring enterprise revenue");
    else if (key === "grant-pipeline") setRetentionFields("Enterprise Pipeline", "Demand Pipeline", "Qualified creditor opportunities and procurement stages", "Predicts near-term contracted revenue");
    else if (key === "family-satisfaction") setRetentionFields("Debtor Experience Signals", "Customer Experience", "Complaint trends, resolution quality, and fairness sentiment", "Reduces compliance and reputational risk");
  } else if (profile === "hospitality_coffee") {
    if (key === "val-prop") inputLabel = "Roaster Value Themes";
    else if (key === "target-aud") inputLabel = "Best-Fit Buyers";
    else if (key === "program-model") inputLabel = "Roaster Operating Model";
    else if (key === "needs-assessment") { inputLabel = "Buyer & Partner Jobs"; subGroup = "ODI"; }
    else if (key === "outcome-data") { inputLabel = "Cup Quality Evidence"; subGroup = "ODI"; }
    else if (key === "referral-map") { inputLabel = "Wholesale Acquisition Sources"; subGroup = "GTM"; }
    else if (key === "brand-narrative") { inputLabel = "Origin & Craft Story"; subGroup = "Messaging"; }
    else if (key === "channel-strat") { inputLabel = "Wholesale + DTC Channels"; subGroup = "GTM"; }
    else if (key === "donor-retention") setRetentionFields("Repeat Purchase Retention", "Retention", "Reorder frequency and wholesale account retention", "Protects recurring coffee revenue");
    else if (key === "grant-pipeline") setRetentionFields("Wholesale Pipeline", "Demand Pipeline", "Qualified cafe and restaurant partnership opportunities", "Predicts future wholesale volume");
    else if (key === "family-satisfaction") setRetentionFields("Customer Experience Signals", "Customer Experience", "Ratings, tasting feedback, and partner NPS", "Guides product quality and service improvements");
  } else if (profile === "telecom_saas") {
    if (key === "val-prop") inputLabel = "Platform Value Themes";
    else if (key === "target-aud") inputLabel = "Best-Fit Carrier Segments";
    else if (key === "program-model") inputLabel = "Platform Operating Model";
    else if (key === "needs-assessment") { inputLabel = "Operator Jobs"; subGroup = "ODI"; }
    else if (key === "outcome-data") { inputLabel = "Adoption Evidence"; subGroup = "ODI"; }
    else if (key === "referral-map") { inputLabel = "Partner Acquisition Sources"; subGroup = "GTM"; }
    else if (key === "brand-narrative") { inputLabel = "Platform Positioning Story"; subGroup = "Messaging"; }
    else if (key === "channel-strat") { inputLabel = "Carrier GTM Channels"; subGroup = "GTM"; }
  } else if (profile === "legal_services") {
    if (key === "val-prop") inputLabel = "Case Value Themes";
    else if (key === "target-aud") inputLabel = "Best-Fit Claimants";
    else if (key === "program-model") inputLabel = "Litigation Operating Model";
    else if (key === "needs-assessment") { inputLabel = "Claimant Decision Jobs"; subGroup = "ODI"; }
    else if (key === "outcome-data") { inputLabel = "Case Outcome Evidence"; subGroup = "ODI"; }
    else if (key === "referral-map") { inputLabel = "Case Referral Sources"; subGroup = "GTM"; }
    else if (key === "brand-narrative") { inputLabel = "Advocacy Story"; subGroup = "Messaging"; }
    else if (key === "channel-strat") { inputLabel = "Claim Intake Channels"; subGroup = "GTM"; }
  } else if (profile === "mobility_aviation") {
    if (key === "val-prop") inputLabel = "Mobility Value Themes";
    else if (key === "target-aud") inputLabel = "Best-Fit Riders & Partners";
    else if (key === "program-model") inputLabel = "Flight Operating Model";
    else if (key === "needs-assessment") { inputLabel = "Rider & Partner Jobs"; subGroup = "ODI"; }
    else if (key === "outcome-data") { inputLabel = "Flight Readiness Evidence"; subGroup = "ODI"; }
    else if (key === "referral-map") { inputLabel = "Partnership Acquisition Sources"; subGroup = "GTM"; }
    else if (key === "brand-narrative") { inputLabel = "Mobility Story"; subGroup = "Messaging"; }
    else if (key === "channel-strat") { inputLabel = "Route Launch Channels"; subGroup = "GTM"; }
  } else if (profile === "generic_commercial") {
    if (key === "val-prop") inputLabel = "Value Themes";
    else if (key === "target-aud") inputLabel = "Best-Fit Customers";
    else if (key === "program-model") inputLabel = "Operating Model";
    else if (key === "needs-assessment") { inputLabel = "Customer Jobs"; subGroup = "ODI"; }
    else if (key === "outcome-data") { inputLabel = "Outcome Evidence"; subGroup = "ODI"; }
    else if (key === "referral-map") { inputLabel = "Acquisition Sources"; subGroup = "GTM"; }
    else if (key === "brand-narrative") { inputLabel = "Positioning Story"; subGroup = "Messaging"; }
    else if (key === "channel-strat") { inputLabel = "GTM Channels"; subGroup = "GTM"; }
    else if (key === "donor-retention") setRetentionFields("Customer Retention", "Retention", "Repeat purchase and reorder behavior", "Protects recurring revenue and loyalty");
    else if (key === "grant-pipeline") setRetentionFields("Growth Pipeline", "Demand Pipeline", "Qualified leads and wholesale opportunities", "Predicts near-term revenue growth");
    else if (key === "family-satisfaction") setRetentionFields("Customer Satisfaction", "Customer Experience", "Ratings, reviews, and repeat sentiment", "Signals fit, quality, and retention risk");
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
  if (key === "needs-assessment") {
    if (needsOdiSignal(description)) {
      description = "Customer job map and desired outcomes by segment";
    }
    if (needsOdiSignal(whyItMatters)) {
      whyItMatters = "Shows what matters most and where current results are falling short";
    }
  }
  if (key === "outcome-data") {
    if (needsOdiSignal(description)) {
      description = "Track desired outcome satisfaction and completion signals";
    }
    if (needsOdiSignal(whyItMatters)) {
      whyItMatters = "Confirms progress on high-importance outcomes that are still underserved";
    }
  }
  if (key === "referral-map") {
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

async function repairWeakOpportunities(args: {
  apiKey: string;
  model: string;
  companyName: string;
  website: string;
  baselineBrief: string;
  strategicProblemBrief?: string;
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
    `${ODI_PLAIN_LANGUAGE_RULES}\n`;

  const userText =
    `Company: ${args.companyName}\nWebsite: ${args.website || "unknown"}\n\n` +
    `Evidence context:\n${args.baselineBrief}\n\n` +
    `Client-stated strategic problems:\n${args.strategicProblemBrief || "None provided"}\n\n` +
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

async function generateManagedOutcomes(args: {
  apiKey: string;
  model: string;
  companyName: string;
  website: string;
  baselineBrief: string;
  strategicProblemBrief?: string;
  journeys: unknown;
  opportunities: unknown;
}) {
  const systemText =
    `You are defining managed product outcomes for a Teresa Torres style opportunity solution tree.\n` +
    `Return ONLY valid JSON matching the schema. No prose.\n` +
    `Create exactly one managed outcome for journey_key=customer.\n` +
    `A managed outcome is the result the team should manage toward, not an opportunity branch, feature, initiative, or broad vanity KPI.\n` +
    `Each managed outcome should:\n` +
    `- be a leading-indicator style result within the company's influence\n` +
    `- be broad enough to span multiple opportunities and solutions\n` +
    `- stay specific to the company, audience, and journey context\n` +
    `- have a clear target_direction like increase, reduce, improve, maximize, or minimize\n` +
    `- include a plausible leading indicator that could eventually be measured\n` +
    `- note evidence_basis honestly from public evidence only\n` +
    `- keep confidence lower when evidence is inferential rather than directly measured\n` +
    `- reuse concrete nouns and contexts from the top opportunities and steps for that journey\n` +
    `- do not use generic roots like "Improve customer progress", "Improve operations", or "Increase conversion" without a concrete object and context\n` +
    `- outcome_title should be specific enough to distinguish this company from another company in a different sector\n` +
    `- leading_indicator should mention what specifically changes, not just "progress" or "performance"\n`;

  const userText =
    `Company: ${args.companyName}\nWebsite: ${args.website || "unknown"}\n\n` +
    `Evidence context:\n${args.baselineBrief}\n\n` +
    `Client-stated strategic problems:\n${args.strategicProblemBrief || "None provided"}\n\n` +
    `Journeys:\n${buildJourneyBrief(args.journeys)}\n\n` +
    `Opportunities:\n${buildOpportunityBrief(args.opportunities)}\n\n` +
    `Generate one customer managed outcome that the team should manage toward.\n` +
    `Anchor it in the actual top customer opportunities instead of using generic template wording.\n`;

  return callOpenAIJSON({
    apiKey: args.apiKey,
    model: args.model,
    schemaName: "mojo_managed_outcomes_v1",
    schema: managedOutcomesSchema,
    systemText,
    userText,
    maxOutputTokens: 1200,
    temperature: 0.15,
  });
}

function analyzeManagedOutcomeSpecificity(outcome: {
  outcome_title?: string;
  outcome_statement?: string;
  leading_indicator?: string;
}) {
  const text = [
    String(outcome?.outcome_title || ""),
    String(outcome?.outcome_statement || ""),
    String(outcome?.leading_indicator || ""),
  ]
    .join(" ")
    .toLowerCase()
    .trim();

  const issues: string[] = [];
  if (!text) issues.push("missing_text");
  if (GENERIC_MANAGED_OUTCOME_PHRASES.some((phrase) => text.includes(phrase))) issues.push("generic_phrase");
  if (!/\b(family|families|patient|patients|referral|intake|enrollment|program|care|handoff|service|donor|grant|contract|renewal|screening|transition|follow-up|delivery|crisis|community)\b/.test(text)) {
    issues.push("missing_concrete_context");
  }
  if (!/\b(time|rate|share|likelihood|percentage|retention|completion|conversion|continuity|delay|drop-off|handoff|follow-through|readiness|access|consistency)\b/.test(text)) {
    issues.push("missing_indicator_language");
  }

  return {
    weak: issues.length >= 2,
    issues,
  };
}

async function repairManagedOutcomes(args: {
  apiKey: string;
  model: string;
  companyName: string;
  website: string;
  baselineBrief: string;
  strategicProblemBrief?: string;
  journeys: unknown;
  opportunities: unknown;
  outcomes: unknown;
}) {
  const systemText =
    `You are improving managed product outcomes so they stop collapsing into generic template language.\n` +
    `Return ONLY valid JSON matching the schema. No prose.\n` +
    `Keep exactly one outcome for journey_key=customer.\n` +
    `Rewrite only outcomes that are too generic.\n` +
    `Make each managed outcome clearly company-specific by using the audience, step context, and concrete nouns already present in the opportunities.\n` +
    `Do not output generic wording like "Improve customer progress", "Improve operations", or "Increase conversion" unless a specific object and context are attached.\n`;

  const userText =
    `Company: ${args.companyName}\nWebsite: ${args.website || "unknown"}\n\n` +
    `Evidence context:\n${args.baselineBrief}\n\n` +
    `Client-stated strategic problems:\n${args.strategicProblemBrief || "None provided"}\n\n` +
    `Journeys:\n${buildJourneyBrief(args.journeys)}\n\n` +
    `Opportunities:\n${buildOpportunityBrief(args.opportunities)}\n\n` +
    `Current managed outcomes:\n${buildManagedOutcomeBrief(args.outcomes)}\n\n` +
    `Rewrite weak managed outcomes so each one is materially distinct and clearly tied to the company's actual journey context.\n`;

  return callOpenAIJSON({
    apiKey: args.apiKey,
    model: args.model,
    schemaName: "mojo_managed_outcomes_repair_v1",
    schema: managedOutcomesSchema,
    systemText,
    userText,
    maxOutputTokens: 1200,
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
    `Positioning:\n${buildPositioningBrief(opts.positioning)}\n\n` +
    `Strategy:\n${JSON.stringify(opts.strategy)}\n\n` +
    `Review the full draft bundle for cross-artifact consistency.`;

  const systemText =
    `You are a strict strategy QA reviewer.\n` +
    `Return ONLY valid JSON matching the schema. No prose.\n` +
    `Your job is to review, not rewrite.\n` +
    `Check for:\n` +
    `- strategic problem alignment: drafts should clearly connect to client-stated problems\n` +
    `- buyer / chooser / user consistency across baseline, journeys, ODI, positioning, and strategy\n` +
    `- market category consistency across baseline, positioning, and strategy\n` +
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
    `Positioning:\n${buildPositioningBrief(opts.positioning)}\n\n` +
    `Strategy:\n${JSON.stringify(opts.strategy)}\n\n` +
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
  positioning: unknown;
  strategy: unknown;
}) {
  const [consistencyReview, positioningReview, evidenceReview, strategyReview] = await Promise.all([
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
      positioning: opts.positioning,
      strategy: opts.strategy,
    }),
    runPositioningReview({
      apiKey: opts.apiKey,
      model: opts.model,
      companyName: opts.companyName,
      website: opts.website,
      baselineBrief: opts.baselineBrief,
      strategicProblemBrief: opts.strategicProblemBrief,
      positioning: opts.positioning,
      opportunities: opts.opportunities,
      routes: opts.routes,
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
      positioning: opts.positioning,
      strategy: opts.strategy,
    }),
    runStrategyReview({
      apiKey: opts.apiKey,
      model: opts.model,
      companyName: opts.companyName,
      website: opts.website,
      baselineBrief: opts.baselineBrief,
      strategicProblemBrief: opts.strategicProblemBrief,
      strategy: opts.strategy,
      routes: opts.routes,
      opportunities: opts.opportunities,
    }),
  ]);

  return { consistencyReview, positioningReview, evidenceReview, strategyReview };
}

function frameworkKeysFor(artifact: "inputs" | "journeys" | "opportunities" | "routes") {
  return getFrameworkRoutingPlan(artifact).map((framework) => framework.key);
}

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
const CUSTOMER_KEYS = new Set(["needs-assessment", "family-satisfaction"]);
const STRATEGY_KEYS = new Set(["program-model", "outcome-data"]);
const GTM_KEYS = new Set([
  "referral-map",
  "brand-narrative",
  "channel-strat",
  "donor-retention",
  "grant-pipeline",
]);
type JourneyKey = string;
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
    normalized === "unknown from public evidence" ||
    normalized === "unknown from uploaded evidence"
  );
}

function isLikelyJobActionLabel(value: unknown) {
  const normalized = normalizeAudienceSignal(value).toLowerCase();
  if (!normalized) return false;
  const hasRoleNoun = /\b(owner|manager|director|lead|officer|team|department|specialist|buyer|user|customer|consumer|operator|administrator|executive|committee|sponsor|partner|staff|organization|organisation|enterprise|company|client|debtor|creditor|collector|agent|analyst|founder|ceo|cfo|coo|vp|head)\b/.test(normalized);
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
  return isGenericAudienceLabel(value) || isLikelyJobActionLabel(value);
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

  const selected = ranked[0];
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

function computePotentialProjected(mojo_score: number) {
  const current = clamp(mojo_score, 0, 100);
  const headroom = 100 - current;

  const potential_score = Math.round(
    clamp(current + Math.min(22, headroom * 0.35), 0, 100),
  );
  const projected_score = Math.round(
    clamp(
      Math.max(potential_score + 10, current + Math.min(42, headroom * 0.62)),
      0,
      100,
    ),
  );

  return { potential_score, projected_score };
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
}) {
  const marketBaseline = deriveMarketBaselineCalibration(args.baselineResultJson);
  const safeInputs = Array.isArray(args.inputs) ? args.inputs : [];
  const safeSteps = Array.isArray(args.jobSteps) ? args.jobSteps : [];
  const safeOpps = Array.isArray(args.opportunities) ? args.opportunities : [];
  const ledger = Array.isArray(args.baselineResultJson?.evidence_ledger)
    ? args.baselineResultJson.evidence_ledger
    : [];

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
  const initiativeBase = deriveInitiativeFocusContext({
    jobSteps: safeSteps,
    strategicProblems: args.strategicProblems,
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
      0.15 * strategicAlignmentNorm
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
  const { potential_score, projected_score } = computePotentialProjected(mojo_score);

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
    },
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
  "program-model": "foundation",
  "needs-assessment": "foundation",

  // execution (3)
  "referral-map": "execution",
  "brand-narrative": "execution",
  "channel-strat": "execution",

  // market evidence (4)
  "outcome-data": "market_evidence",
  "donor-retention": "market_evidence",
  "grant-pipeline": "market_evidence",
  "family-satisfaction": "market_evidence",
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

  if (key === "needs-assessment") return "foundation";
  if (key === "outcome-data") return "market_evidence";

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
  "program-model",
  "needs-assessment",
  "outcome-data",
  "referral-map",
  "brand-narrative",
  "channel-strat",
  "donor-retention",
  "grant-pipeline",
  "family-satisfaction",
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
      maxItems: 1,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          journey_key: { type: "string", enum: ["customer"] },
          outcome_title: { type: "string" },
          outcome_statement: { type: "string" },
          leading_indicator: { type: "string" },
          target_direction: { type: "string" },
          evidence_basis: { type: "string" },
          confidence: { type: "integer" },
        },
        required: [
          "journey_key",
          "outcome_title",
          "outcome_statement",
          "leading_indicator",
          "target_direction",
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
    `If a reviewer flags unsupported certainty, reduce precision instead of inventing facts.\n`;

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

    const anonClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: userRes, error: authError } = await anonClient.auth.getUser();
    const user = userRes?.user;
    if (authError || !user) return jsonResponse({ error: "Unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));
    const company_id = body?.company_id;
    const company_name = body?.company_name;
    const website = typeof body?.website === "string" ? body.website : "";
    const reviewMode = String(body?.review_mode || "").trim().toLowerCase();
    const allowHighSeverityReviewSave = reviewMode === "advisory" || body?.allow_review_block_save === true;
    const contextMode = String(body?.context_mode || "").trim().toLowerCase();
    const forceUploadedOnlyContext = contextMode === "uploaded_only" || body?.prefer_uploaded_context === true;
    const requestedJourneyKeys = parseRequestedJourneyKeys(body?.journeys_to_generate);
    const submittedJobMaps = parseSelectedJobMaps(body?.job_maps);

    if (!company_id || !company_name) {
      return jsonResponse({ error: "company_id and company_name required" }, 400);
    }

    const lockTtlMinutes = 15;
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

    const stopLockHeartbeat = startCompanyRunLockHeartbeat({
      supabase,
      companyId: company_id,
      ttlMinutes: lockTtlMinutes,
    });

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
    const strategicProblemBrief = [
      buildStrategicProblemBrief(strategicProblems),
      buildStrategicAssumptionBrief(strategicAssumptions),
      "Use both strategic problems and assumptions to determine what to prioritize, what to test next, and where confidence is still low.",
    ].join("\n\n");
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
    if (!selectedMapByKey.has("customer")) {
      const existingCustomer = existingJobMaps.find((map) => map.journey_key === "customer");
      if (existingCustomer) {
        selectedMapByKey.set("customer", existingCustomer);
      }
    }
    if (!selectedMapByKey.has("customer") && !hasExplicitJobMapRequest && selectedMapByKey.size > 0) {
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

    const targetJourneyKeys: JourneyKey[] = [
      ...new Set(selectedJobMaps.map((map) => map.journey_key)),
    ];
    const jobMapUpdateJourneyKeys: JourneyKey[] =
      explicitSelectedJourneyKeys.length > 0 ? explicitSelectedJourneyKeys : targetJourneyKeys;
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

    const baselineContextIntro =
      researchContextMode === "uploaded_evidence_fallback"
        ? "Public baseline was weak or ambiguous. Use uploaded company evidence as primary context."
        : "Public baseline context (augmented with uploaded files):";
    const baselineBrief = [
      baselineContextIntro,
      buildBaselineBrief(effectiveBaselineResultJson),
      uploadedEvidenceContext.brief,
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
      `- If evidence indicates youth mental health, do not output elder care, senior living, home care, or adjacent sectors\n` +
      `- For commercial businesses, translate nonprofit-style placeholders into category-relevant equivalents (customer retention, growth pipeline, customer satisfaction)\n` +
      `- Never output "not applicable", "N/A", or "not relevant" for required inputs; provide the closest category-specific signal instead\n` +
      `- Embed ODI framing in at least needs-assessment, outcome-data, and referral-map by referencing job/outcome context and importance/satisfaction evidence\n` +
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
      `- Use ODI job map sequencing language (define, locate, prepare, confirm, execute, monitor, modify, conclude) as the structural spine\n` +
      `- step_label 2–5 words, action-oriented, no generic funnel labels\n` +
      `- description 18–40 words, concrete, sequential, and tied to the selected job performer context\n` +
      `- evidence_status must be one of evidenced, implied, or unclear\n` +
      evidencedDefinitionConstraint +
      `- implied = strongly suggested by the business model or multiple signals, but not directly proven\n` +
      `- unclear = weak, missing, or ambiguous evidence\n` +
      `- evidence_basis 8–24 words explaining the evidence or inference behind the step status\n` +
      evidenceConfidenceConstraint +
      `- gap_note 6–18 words and specific when there is a gap\n` +
      `- designed=true only when the step appears intentionally supported and evidence_status is evidenced or implied\n` +
      `- designed=false when evidence_status is unclear\n` +
      `- has_gap=true when there is a visible weakness, missing capability, or unclear handoff\n` +
      `- if has_gap=false, set gap_note to an empty string\n`;

    const journeysUserText =
      `Company: ${company_name}\nWebsite: ${website || "unknown"}\n\n` +
      `${evidenceContextHeading}:\n${baselineBrief}\n\n` +
      `Client-stated strategic problems:\n${strategicProblemBrief}\n\n` +
      `Selected job maps:\n${selectedJobMapBrief}\n\n` +
      `Create these journeys: ${targetJourneyKeys.join(", ")}.\n` +
      `For each journey: 6–8 ODI-style steps, numbered 1..N.\n` +
      `Make the sequence realistic for this exact company category and audience.\n` +
      `Do not use generic labels like "Engagement" or "Operations" unless they are qualified.\n` +
      `Mark designed=false and has_gap=true when evidence remains unclear.\n`;

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
    journeys = alignedJourneys;

    if (journeys.length !== targetJourneyKeys.length) {
      const found = new Set(journeys.map((journey) => normalizeJourneyKey(journey?.journey_key)));
      const missing = targetJourneyKeys.filter((key) => !found.has(key));
      return jsonResponse({
        error: `Expected journeys for keys: ${targetJourneyKeys.join(", ")}. Missing: ${missing.join(", ")}`,
      }, 500);
    }

    // -------------------------
    // 3) Generate OPPORTUNITIES (customer journey)
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
      `- Opportunities should directly address the client-stated strategic problems when provided\n` +
      `- outcome must read like a strong product discovery outcome or ODI desired outcome, not a feature idea, deliverable, or recommendation\n` +
      `- Use a structured formula close to: direction + measurable dimension + object + context\n` +
      `- Start with verbs like minimize, reduce, increase, improve, maximize, or avoid when appropriate\n` +
      `- Keep outcomes solution-free, stable over time, and measurable in spirit\n` +
      `- Good outcomes describe a change in customer behavior, progress, clarity, effort, risk, confidence, continuity, completion, conversion, or retention\n` +
      `- Good outcomes stay within the company's span of influence, rather than naming broad business goals with no customer mechanism\n` +
      `- Do not output initiatives, launches, campaigns, dashboards, websites, forms, workflows, programs, portals, tools, or features as outcomes\n` +
      `- Do not use vague outcome text like "Improve engagement" or "Increase awareness" without a concrete object and context\n` +
      noIndustrySwitchConstraint +
      `- Good example style: "Minimize the time it takes to complete intake during a family crisis"\n` +
      `- Better example style: "Increase the likelihood that a referred family completes the first intake step after initial outreach"\n` +
      `- Bad example style: "Build a better intake form", "Add referral dashboard", or "Launch a new donor campaign"\n` +
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
    const weakOutcomeCount = opportunities.filter((opp) => analyzeOutcomeQuality(String(opp?.outcome || "")).weak).length;
    if (weakOutcomeCount > 0) {
      const repairedOppsResult = await repairWeakOpportunities({
        apiKey: openaiKey,
        model: openaiModel,
        companyName: company_name,
        website,
        baselineBrief,
        strategicProblemBrief,
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
      if (repairedCustomerOnly.length >= 8) {
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
    }));

    if (opportunities.length < 8) {
      return jsonResponse({
        error: "Generated opportunities did not align to existing customer job-map steps.",
      }, 500);
    }
    const opportunityFrameworkKeys = frameworkKeysFor("opportunities");
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
            },
            required: ["category", "title", "short_description", "pts_value", "effort", "type", "sort_order"],
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
      `- Use the journey and opportunity context provided; routes should feel like logical initiatives, not raw issues\n` +
      `- Prioritize routes that directly reduce the client-stated strategic problems when provided\n` +
      `- title should be 3-7 words and action-oriented\n` +
      `- short_description should be 16-32 words and mention why the route matters\n` +
      `- pts_value should be 1..10 and reflect likely score impact\n` +
      `- sort_order should rank strongest routes first within the whole set\n` +
      noIndustrySwitchConstraint +
      `- Fix = remove blockers/gaps, Improve = strengthen existing systems, Create = build net-new strategic assets\n` +
      `- type must match category in title case\n`;

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
    const routeFrameworkKeys = frameworkKeysFor("routes");

    // -------------------------
    // 5) Generate POSITIONING CANVAS
    // -------------------------
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
    };

    const positioningFrameworkKeys = getFrameworkRoutingPlan("positioning").map((framework) => framework.key);

    const positioningCanvasSystemText =
      `You are generating an April Dunford style positioning canvas for a strategy platform.\n` +
      `Return ONLY valid JSON matching the schema. No prose outside the JSON.\n` +
      `Apply the framework guidance below as decision rules, not as output headings.\n\n` +
      `Framework guidance:\n${buildFrameworkBrief("positioning", getFrameworkRoutingPlan("positioning"))}\n\n` +
      `Rules:\n` +
      `- Stay strictly consistent with the provided website, evidence, category, audience, and company context\n` +
      `- Never switch industries, populations, or buyer types; if the evidence says youth mental healthcare, do not output elder care, senior living, or adjacent but different markets\n` +
      `- competitive_alternatives should be real alternatives, including manual workarounds or doing nothing when relevant\n` +
      `- competitive_alternatives must serve the same customer/job context as the company; do not list alternatives from unrelated sectors\n` +
      `- unique_attributes should be specific and credible, not vague marketing claims\n` +
      `- value_for_customer should describe what customers can do or achieve that they could not before\n` +
      `- best_fit_customers should describe the clearest-fit audience in one paragraph\n` +
      `- market_category should be the category the company should claim or reshape\n` +
      evidenceAlignmentConstraint +
      `- positioning should directly address the client-stated strategic problem framing when provided\n` +
      `- category_rationale should explain why this category framing helps buyers understand the company\n` +
      `- current_tagline should be an exact homepage or website phrase if publicly evidenced; if not clearly present, return 'unknown'\n` +
      `- proposed_tagline should be a strategist-quality direction, not a generic slogan\n` +
      `- highlighted=true only for the strongest or most differentiating items\n`;

    const positioningCanvasUserText =
      `Company: ${company_name}\nWebsite: ${website || "unknown"}\n\n` +
      `${evidenceContextHeading}:\n${baselineBrief}\n\n` +
      `Client-stated strategic problems:\n${strategicProblemBrief}\n\n` +
      `Selected job maps:\n${selectedJobMapBrief}\n\n` +
      `Generated strategy inputs:\n${buildInputBrief(inputs)}\n\n` +
      `Generated opportunities:\n${buildOpportunityBrief(opportunities)}\n\n` +
      `Generated routes:\n${routes
        .slice(0, 10)
        .map((route: any, index: number) =>
          `${index + 1}. ${route?.category || "improve"} | ${route?.title || "Untitled"} | ${route?.short_description || "No description"}`
        )
        .join("\n")}\n\n` +
      `Generate a positioning canvas for this exact company.`;

    const positioningPromise = callOpenAIJSON({
      apiKey: openaiKey,
      model: openaiModel,
      schemaName: "mojo_positioning_canvas_v1",
      schema: positioningCanvasSchema,
      systemText: positioningCanvasSystemText,
      userText: positioningCanvasUserText,
      maxOutputTokens: 2200,
      temperature: 0.2,
    });

    // -------------------------
    // 6) Generate STRATEGY CASCADE
    // -------------------------
    const strategyCascadeSchema = {
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
    };

    const strategyFrameworkKeys = positioningFrameworkKeys;

    const strategyCascadeSystemText =
      `You are generating a strategy cascade for a strategy platform.\n` +
      `Return ONLY valid JSON matching the schema. No prose outside the JSON.\n` +
      `Synthesize the evidence into a clear Roger Martin style cascade.\n` +
      `Use strong, executive-quality language, but stay tethered to the supplied evidence.\n` +
      `If evidence is thin, make the uncertainty explicit through status and assumptions rather than pretending certainty.\n\n` +
      `Rules:\n` +
      evidenceConsistencyConstraint +
      `- Strategy choices should directly resolve or reduce the client-stated strategic problem(s) when provided\n` +
      noIndustrySwitchConstraint +
      `- If evidence indicates youth mental health, do not output elder care, senior living, home care, or adjacent sectors\n` +
      `- winning_aspiration, where_to_play, and how_to_win should each be one well-written paragraph\n` +
      `- capabilities should be concrete operational or strategic abilities, not departments\n` +
      `- management_systems should be recurring operating loops, measurement systems, governance, planning, or resource systems\n` +
      `- status=strong only when the capability or system is meaningfully evidenced\n` +
      `- status=developing when there is some evidence but it appears incomplete or immature\n` +
      `- status=gap when it appears important but weak, missing, or unproven\n` +
      `- note should be a short evidence-based explanation, 6-16 words\n` +
      `- assumptions should read like untested strategic beliefs or claims implied by the company story\n` +
      `- assumptions.note should explain why the assumption is untested or what would validate it\n`;

    const strategyCascadeUserText =
      `Company: ${company_name}\nWebsite: ${website || "unknown"}\n\n` +
      `${evidenceContextHeading}:\n${baselineBrief}\n\n` +
      `Client-stated strategic problems:\n${strategicProblemBrief}\n\n` +
      `Selected job maps:\n${selectedJobMapBrief}\n\n` +
      `Generated strategy inputs:\n${buildInputBrief(inputs)}\n\n` +
      `Generated journeys:\n${buildJourneyBrief(journeys)}\n\n` +
      `Generated opportunities:\n${buildOpportunityBrief(opportunities)}\n\n` +
      `Generated routes:\n${routes
        .slice(0, 12)
        .map((route: any, index: number) =>
          `${index + 1}. ${route?.category || "improve"} | ${route?.title || "Untitled"} | ${route?.short_description || "No description"}`
        )
        .join("\n")}\n\n` +
      `Generate a full strategy cascade for this exact company in the supplied schema.`;

    const strategyPromise = callOpenAIJSON({
      apiKey: openaiKey,
      model: openaiModel,
      schemaName: "mojo_strategy_cascade_v1",
      schema: strategyCascadeSchema,
      systemText: strategyCascadeSystemText,
      userText: strategyCascadeUserText,
      maxOutputTokens: 2200,
      temperature: 0.2,
    });

    let [positioningCanvasResult, strategyCascadeResult] = await Promise.all([
      positioningPromise,
      strategyPromise,
    ]);

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
      positioning: positioningCanvasResult,
      strategy: strategyCascadeResult,
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
          positioning: positioningCanvasResult,
          strategy: strategyCascadeResult,
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
        positioningCanvasResult = repairedBundle?.positioning ?? positioningCanvasResult;
        strategyCascadeResult = repairedBundle?.strategy ?? strategyCascadeResult;

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
          positioning: positioningCanvasResult,
          strategy: strategyCascadeResult,
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

    // -------------------------
    // 7) Clear old rows for company
    // -------------------------
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
    await supabase.from("opportunities").delete().eq("company_id", company_id);
    await supabase.from("routes").delete().eq("company_id", company_id);
    await supabase.from("managed_outcomes").delete().eq("company_id", company_id);
    await supabase.from("odi_needs").delete().eq("company_id", company_id);
    await supabase.from("odi_market_definitions").delete().eq("company_id", company_id);
    await supabase.from("positioning_canvases").delete().eq("company_id", company_id);
    await supabase.from("strategy_cascades").delete().eq("company_id", company_id);

    // -------------------------
    // 8) Insert inputs / steps / opps / routes
    // -------------------------
    let inputsInserted = 0;
    let stepsInserted = 0;
    let oppsInserted = 0;
    let routesInserted = 0;
    let managedOutcomesInserted = 0;
    let odiNeedsInserted = 0;
    let odiMarketDefinitionsInserted = 0;
    let positioningCanvasInserted = 0;
    let strategyCascadeInserted = 0;
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
      if (!jobMapUpdateJourneyKeySet.has(journeyKey)) continue;

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

    // Opportunities: recompute tier from score to keep consistent
    for (const opp of opportunities) {
      const normalizedJourneyKey = normalizeJourneyKey(opp?.journey_key);
      const journeyKey = normalizedJourneyKey || "customer";

      const importance = clamp(Number(opp?.importance) || 5, 1, 10);
      const satisfaction = clamp(Number(opp?.satisfaction) || 5, 1, 10);
      const opportunity_score = clamp(
        Number(opp?.opportunity_score) || (importance + (10 - satisfaction)),
        0,
        20,
      );

      const priority_tier =
        opportunity_score >= 12 ? "focus" : opportunity_score >= 7 ? "monitor" : "defer";

      const { error: oppErr } = await supabase.from("opportunities").insert({
        company_id,
        user_id: user.id,
        frameworks_used: opportunityFrameworkKeys,
        outcome: String(opp?.outcome || ""),
        step_number: Number(opp?.step_number) || 0,
        step_label: String(opp?.step_label || ""),
        journey_key: journeyKey,
        importance,
        satisfaction,
        opportunity_score,
        priority_tier,
      });

      if (oppErr) console.error("[research-company] opportunity insert error:", oppErr);
      else oppsInserted++;
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
    const artifactSourcePath =
      researchContextMode === "uploaded_evidence_fallback" ? "uploaded_file_research" : "public_research";

    const journeyDerivedExecutor = audienceFromJourneyTitle(customerJourney?.journey_title);
    const journeyDerivedJtbd = jtbdFromJourneyTitle(customerJourney?.journey_title);
    const normalizedCompanyName = normalizeAudienceSignal(company_name);
    const companyExecutorFallback = normalizedCompanyName ? `${normalizedCompanyName} customer` : "Primary job performer";
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
      String(chooserCandidate || (researchContextMode === "uploaded_evidence_fallback" ? "Buying/decision lead" : fallbackUnknownLabel));
    const jtbdFallbackSubject = isInvalidAudienceLabel(job_executor)
      ? "the primary job performer"
      : job_executor.toLowerCase();
    const jtbd =
      journeyDerivedJtbd ||
      `When ${jtbdFallbackSubject} are trying to make progress, they need to define, execute, and validate outcomes with less risk and rework.`;

    const { error: odiMarketErr } = await supabase.from("odi_market_definitions").insert({
      company_id,
      user_id: user.id,
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
        tier: "need",
        desired_outcome: desiredOutcome,
        journey_key: "customer",
        step_number: Number(opp?.step_number) || 0,
        step_label: String(opp?.step_label || ""),
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

    // Routes
    for (const route of routes) {
      const category = ["fix", "improve", "create"].includes(String(route?.category))
        ? String(route.category)
        : "improve";

      const routeType = category === "fix" ? "Fix" : category === "create" ? "Create" : "Improve";
      const effort = ["low", "medium", "high"].includes(String(route?.effort))
        ? String(route.effort)
        : "medium";

      const routePayload = {
        company_id,
        user_id: user.id,
        frameworks_used: routeFrameworkKeys,
        category,
        title: String(route?.title || ""),
        short_description: String(route?.short_description || ""),
        pts_value: clamp(Number(route?.pts_value) || 1, 1, 10),
        effort,
        type: String(route?.type || routeType),
        sort_order: Math.max(1, Number(route?.sort_order) || routesInserted + 1),
      };

      let { error: routeErr } = await supabase.from("routes").insert(routePayload);

      if (routeErr && String(routeErr.message || "").toLowerCase().includes("frameworks_used")) {
        const fallback = await supabase.from("routes").insert({
          company_id,
          user_id: user.id,
          category,
          title: String(route?.title || ""),
          short_description: String(route?.short_description || ""),
          pts_value: clamp(Number(route?.pts_value) || 1, 1, 10),
          effort,
          type: String(route?.type || routeType),
          sort_order: Math.max(1, Number(route?.sort_order) || routesInserted + 1),
        });
        routeErr = fallback.error;
      }

      if (routeErr) console.error("[research-company] route insert error:", routeErr);
      else routesInserted++;
    }

    const managedOutcomesResult = await generateManagedOutcomes({
      apiKey: openaiKey,
      model: openaiModel,
      companyName: company_name,
      website,
      baselineBrief,
      strategicProblemBrief,
      journeys,
      opportunities,
    });

    let managedOutcomes = Array.isArray(managedOutcomesResult?.outcomes)
      ? managedOutcomesResult.outcomes
      : [];

    const weakManagedOutcomeCount = managedOutcomes.filter((outcome) =>
      analyzeManagedOutcomeSpecificity({
        outcome_title: String(outcome?.outcome_title || ""),
        outcome_statement: String(outcome?.outcome_statement || ""),
        leading_indicator: String(outcome?.leading_indicator || ""),
      }).weak
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
        opportunities,
        outcomes: managedOutcomes,
      });

      const repairedManagedOutcomes = Array.isArray(repairedManagedOutcomesResult?.outcomes)
        ? repairedManagedOutcomesResult.outcomes
        : [];

      const repairedCustomerOutcomes = repairedManagedOutcomes.filter(
        (outcome) => String(outcome?.journey_key || "") === "customer"
      );

      if (repairedCustomerOutcomes.length >= 1) {
        managedOutcomes = repairedCustomerOutcomes;
      }
    }

    managedOutcomes = managedOutcomes.filter(
      (outcome) => String(outcome?.journey_key || "") === "customer"
    );

    for (const outcome of managedOutcomes) {
      const journeyKey = "customer";

      const { error: managedOutcomeErr } = await supabase.from("managed_outcomes").insert({
        company_id,
        user_id: user.id,
        journey_key: journeyKey,
        outcome_title: String(outcome?.outcome_title || ""),
        outcome_statement: String(outcome?.outcome_statement || ""),
        leading_indicator: String(outcome?.leading_indicator || ""),
        target_direction: String(outcome?.target_direction || ""),
        evidence_basis: String(outcome?.evidence_basis || ""),
        confidence: clamp(Number(outcome?.confidence) || 0, 0, 100),
        frameworks_used: opportunityFrameworkKeys,
      });

      if (managedOutcomeErr) {
        console.error("[research-company] managed outcome insert error:", managedOutcomeErr);
      } else {
        managedOutcomesInserted++;
      }
    }

    const positioningPayload = {
      company_id,
      user_id: user.id,
      frameworks_used: positioningFrameworkKeys,
      competitive_alternatives_json: Array.isArray(positioningCanvasResult?.competitive_alternatives)
        ? positioningCanvasResult.competitive_alternatives
        : [],
      unique_attributes_json: Array.isArray(positioningCanvasResult?.unique_attributes)
        ? positioningCanvasResult.unique_attributes
        : [],
      value_for_customer: String(positioningCanvasResult?.value_for_customer || ""),
      best_fit_customers: String(positioningCanvasResult?.best_fit_customers || ""),
      market_category: String(positioningCanvasResult?.market_category || ""),
      category_rationale: String(positioningCanvasResult?.category_rationale || ""),
      current_tagline: String(positioningCanvasResult?.current_tagline || ""),
      proposed_tagline: String(positioningCanvasResult?.proposed_tagline || ""),
    };

    let { error: positioningErr } = await supabase.from("positioning_canvases").insert(positioningPayload);
    if (positioningErr && String(positioningErr.message || "").toLowerCase().includes("frameworks_used")) {
      const fallback = await supabase.from("positioning_canvases").insert({
        company_id,
        user_id: user.id,
        competitive_alternatives_json: Array.isArray(positioningCanvasResult?.competitive_alternatives)
          ? positioningCanvasResult.competitive_alternatives
          : [],
        unique_attributes_json: Array.isArray(positioningCanvasResult?.unique_attributes)
          ? positioningCanvasResult.unique_attributes
          : [],
        value_for_customer: String(positioningCanvasResult?.value_for_customer || ""),
        best_fit_customers: String(positioningCanvasResult?.best_fit_customers || ""),
        market_category: String(positioningCanvasResult?.market_category || ""),
        category_rationale: String(positioningCanvasResult?.category_rationale || ""),
        current_tagline: String(positioningCanvasResult?.current_tagline || ""),
        proposed_tagline: String(positioningCanvasResult?.proposed_tagline || ""),
      });
      positioningErr = fallback.error;
    }

    if (positioningErr) console.error("[research-company] positioning canvas insert error:", positioningErr);
    else positioningCanvasInserted++;

    const cascadePayload = {
      company_id,
      user_id: user.id,
      frameworks_used: strategyFrameworkKeys,
      winning_aspiration: String(strategyCascadeResult?.winning_aspiration || ""),
      where_to_play: String(strategyCascadeResult?.where_to_play || ""),
      how_to_win: String(strategyCascadeResult?.how_to_win || ""),
      capabilities_json: Array.isArray(strategyCascadeResult?.capabilities)
        ? strategyCascadeResult.capabilities
        : [],
      management_systems_json: Array.isArray(strategyCascadeResult?.management_systems)
        ? strategyCascadeResult.management_systems
        : [],
      assumptions_json: Array.isArray(strategyCascadeResult?.assumptions)
        ? strategyCascadeResult.assumptions
        : [],
    };

    let { error: cascadeErr } = await supabase.from("strategy_cascades").insert(cascadePayload);
    if (cascadeErr && String(cascadeErr.message || "").toLowerCase().includes("frameworks_used")) {
      const fallback = await supabase.from("strategy_cascades").insert({
        company_id,
        user_id: user.id,
        winning_aspiration: String(strategyCascadeResult?.winning_aspiration || ""),
        where_to_play: String(strategyCascadeResult?.where_to_play || ""),
        how_to_win: String(strategyCascadeResult?.how_to_win || ""),
        capabilities_json: Array.isArray(strategyCascadeResult?.capabilities)
          ? strategyCascadeResult.capabilities
          : [],
        management_systems_json: Array.isArray(strategyCascadeResult?.management_systems)
          ? strategyCascadeResult.management_systems
          : [],
        assumptions_json: Array.isArray(strategyCascadeResult?.assumptions)
          ? strategyCascadeResult.assumptions
          : [],
      });
      cascadeErr = fallback.error;
    }

    if (cascadeErr) console.error("[research-company] strategy cascade insert error:", cascadeErr);
    else strategyCascadeInserted++;

    // -------------------------
    // 9) Use baselineRun (fetched once) + update company scores
    // -------------------------
    const run = baselineRun ?? null;

    const scored = scoreCompanyMojo({
      baselineResultJson: effectiveBaselineResultJson,
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
      routes: routes.map((route) => ({
        title: route?.title,
        short_description: route?.short_description,
        category: route?.category,
      })),
      positioning: {
        competitive_alternatives: Array.isArray(positioningCanvasResult?.competitive_alternatives)
          ? positioningCanvasResult.competitive_alternatives
          : [],
        unique_attributes: Array.isArray(positioningCanvasResult?.unique_attributes)
          ? positioningCanvasResult.unique_attributes
          : [],
        value_for_customer: positioningCanvasResult?.value_for_customer,
        best_fit_customers: positioningCanvasResult?.best_fit_customers,
        market_category: positioningCanvasResult?.market_category,
        category_rationale: positioningCanvasResult?.category_rationale,
        current_tagline: positioningCanvasResult?.current_tagline,
        proposed_tagline: positioningCanvasResult?.proposed_tagline,
      },
      strategy: {
        winning_aspiration: strategyCascadeResult?.winning_aspiration,
        where_to_play: strategyCascadeResult?.where_to_play,
        how_to_win: strategyCascadeResult?.how_to_win,
        capabilities: Array.isArray(strategyCascadeResult?.capabilities) ? strategyCascadeResult.capabilities : [],
        management_systems: Array.isArray(strategyCascadeResult?.management_systems) ? strategyCascadeResult.management_systems : [],
        assumptions: Array.isArray(strategyCascadeResult?.assumptions) ? strategyCascadeResult.assumptions : [],
      },
      strategicProblems,
      gamma: 2.2,
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
          market_category: String(positioningCanvasResult?.market_category || ""),
          proposed_tagline: String(positioningCanvasResult?.proposed_tagline || ""),
        },
        strategy: {
          winning_aspiration: String(strategyCascadeResult?.winning_aspiration || ""),
          where_to_play: String(strategyCascadeResult?.where_to_play || ""),
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
          leading_indicator: String(outcome?.leading_indicator || ""),
          confidence: Number(outcome?.confidence) || 0,
        })),
        strategic_problems: strategicProblems.map((item) => ({
          statement: item.statement,
          source: item.source,
          status: item.status,
        })),
        positioning: positioningCanvasResult,
        strategy: strategyCascadeResult,
      },
    });

    return jsonResponse({
      message: "Research complete",
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
      odi_market_definitions_inserted: odiMarketDefinitionsInserted,
      odi_needs_inserted: odiNeedsInserted,
      positioning_canvas_inserted: positioningCanvasInserted,
      strategy_cascade_inserted: strategyCascadeInserted,
      mojo_score: scored.mojo_score,
      evidence_status: scored.evidence_status,
    });
    } finally {
      stopLockHeartbeat();
      await releaseCompanyRunLock(supabase, company_id);
    }
  } catch (err) {
    console.error("[research-company] error:", err);
    return jsonResponse({ error: String((err as any)?.message || err) }, 500);
  }
});
