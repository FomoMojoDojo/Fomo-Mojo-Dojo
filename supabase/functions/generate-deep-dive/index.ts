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

const AREA_BY_INPUT_KEY: Record<string, string> = {
  "comp-alt": "positioning",
  "unique-attr": "positioning",
  "val-prop": "positioning",
  "target-aud": "positioning",
  "market-cat": "positioning",
  "brand-narrative": "positioning",
  "program-model": "strategy",
  "needs-assessment": "strategy",
  "outcome-data": "product",
  "channel-strat": "marketing",
  "referral-map": "sales",
  "donor-retention": "sales",
  "grant-pipeline": "sales",
  "family-satisfaction": "cx",
};

const AREA_BY_GROUP_KEY: Record<string, string> = {
  foundation: "positioning",
  execution: "marketing",
  market_evidence: "cx",
};

const LOCAL_HOST_ALLOWLIST = new Set(["localhost", "127.0.0.1", "::1", "host.docker.internal"]);

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

type StrategicProblemRecord = {
  statement: string;
  source: string;
  status: string;
  reconciliation_note: string | null;
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

function buildStrategicProblemContext(rows: unknown) {
  const items = Array.isArray(rows) ? rows : [];
  const normalized: StrategicProblemRecord[] = items
    .map((row) => {
      const item = row as Record<string, unknown>;
      const statement = String(item.statement || "").trim();
      if (!statement) return null;
      return {
        statement,
        source: String(item.source || "client").trim().toLowerCase(),
        status: String(item.status || "open").trim().toLowerCase(),
        reconciliation_note: String(item.reconciliation_note || "").trim() || null,
      };
    })
    .filter((item): item is StrategicProblemRecord => Boolean(item));

  if (!normalized.length) {
    return {
      count: 0,
      reconciledCount: 0,
      text: "No strategic problem statements are currently recorded.",
    };
  }

  const reconciledCount = normalized.filter((item) => item.status === "reconciled").length;
  const lines = normalized
    .slice(0, 10)
    .map((item, index) => `${index + 1}. [${item.source} | ${item.status}] ${item.statement}${item.reconciliation_note ? ` | note: ${item.reconciliation_note}` : ""}`)
    .join("\n");

  return {
    count: normalized.length,
    reconciledCount,
    text: `${normalized.length} strategic problem statement(s), ${reconciledCount} reconciled.\n${lines}`,
  };
}

function normalizeTag(value: unknown) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ");
}

function isLocalOllamaUrl(rawUrl: string) {
  try {
    const url = new URL(rawUrl);
    return LOCAL_HOST_ALLOWLIST.has(String(url.hostname || "").trim().toLowerCase());
  } catch {
    return false;
  }
}

function normalizeText(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

function resolveAreaFromSubGroup(subGroup: unknown): string | null {
  const normalized = normalizeText(subGroup);
  if (!normalized) return null;

  if (
    normalized.includes("positioning") ||
    normalized.includes("competitive") ||
    normalized.includes("providers")
  ) return "positioning";
  if (normalized.includes("strategy")) return "strategy";
  if (normalized.includes("service delivery") || normalized.includes("program model") || normalized.includes("program")) {
    return "product";
  }
  if (normalized.includes("awareness") || normalized.includes("marketing") || normalized.includes("outreach")) {
    return "marketing";
  }
  if (normalized.includes("referral") || normalized.includes("fundraising") || normalized.includes("sales")) {
    return "sales";
  }
  if (normalized.includes("family") || normalized.includes("experience") || normalized.includes("cx")) {
    return "cx";
  }

  return null;
}

function resolveAreaForInput(input: Record<string, unknown>): string {
  const byInputKey = AREA_BY_INPUT_KEY[normalizeText(input.input_key)];
  if (byInputKey) return byInputKey;
  const bySubGroup = resolveAreaFromSubGroup(input.sub_group);
  if (bySubGroup) return bySubGroup;
  const byGroupKey = AREA_BY_GROUP_KEY[normalizeText(input.group_key)];
  if (byGroupKey) return byGroupKey;
  return "strategy";
}

function hasAnyTag(tags: string[], candidates: string[]) {
  return tags.some((tag) => candidates.includes(tag));
}

function inferSourceTier(tags: string[]) {
  if (hasAnyTag(tags, ["implemented & tested", "implemented tested", "implemented + testing", "implemented testing", "testing"])) return "implemented_tested";
  if (hasAnyTag(tags, ["primary evidence", "evidence", "research"])) return "evidence";
  if (hasAnyTag(tags, ["company"])) return "company";
  if (hasAnyTag(tags, ["public"])) return "public";
  return "company";
}

const TAG_HINTS_BY_AREA: Record<string, string[]> = {
  positioning: ["positioning", "competitive", "brand"],
  strategy: ["strategy"],
  product: ["operations"],
  marketing: ["marketing", "channel"],
  sales: ["financial", "pipeline", "referral"],
  cx: ["customer data", "customer experience", "experience", "odi", "jtbd", "interview", "survey"],
};

const FILE_NAME_HINTS_BY_AREA: Record<string, string[]> = {
  positioning: ["position", "compet", "market-cat", "value-prop", "brand", "messag"],
  strategy: ["strategy", "aspiration", "where-to-play", "how-to-win", "cascade"],
  product: ["program", "service", "delivery", "ops", "operation"],
  marketing: ["campaign", "channel", "outreach", "awareness", "content"],
  sales: ["sales", "revenue", "referral", "pipeline", "funnel", "fundraising", "grant"],
  cx: ["customer", "client", "family", "journey", "odi", "jtbd", "need", "survey", "interview"],
};

function inferAreaHintsFromTags(tags: string[]) {
  const found = new Set<string>();
  for (const tag of tags) {
    const normalized = String(tag || "").toLowerCase().trim();
    if (!normalized) continue;
    if (normalized.startsWith("__area:")) {
      const area = normalized.replace("__area:", "").trim();
      if (area) found.add(area);
    }
    for (const [areaKey, hints] of Object.entries(TAG_HINTS_BY_AREA)) {
      if (hints.some((hint) => normalized.includes(hint))) {
        found.add(areaKey);
      }
    }
  }
  return [...found];
}

function inferAreaHintsFromFileName(fileName: unknown) {
  const normalized = String(fileName || "").toLowerCase();
  if (!normalized) return [] as string[];
  const found = new Set<string>();
  for (const [areaKey, hints] of Object.entries(FILE_NAME_HINTS_BY_AREA)) {
    if (hints.some((hint) => normalized.includes(hint))) {
      found.add(areaKey);
    }
  }
  return [...found];
}

function fileSupportsArea(params: {
  areaKey: string;
  file: Record<string, unknown>;
  input: Record<string, unknown> | null;
}) {
  const { areaKey, file, input } = params;
  if (input && resolveAreaForInput(input) === areaKey) return true;
  const rawTags = (Array.isArray(file.tags) ? file.tags : [])
    .map((tag) => String(tag || "").trim().toLowerCase())
    .filter(Boolean);
  if (rawTags.includes(`__area:${areaKey}`)) return true;
  if (inferAreaHintsFromTags(rawTags).includes(areaKey)) return true;
  if (inferAreaHintsFromFileName(file.file_name).includes(areaKey)) return true;
  return false;
}

function withProvenanceSummary(analysis: DeepDiveResult, summary: string) {
  if (!summary.trim()) return analysis;
  const hasSummary = analysis.what_we_found.toLowerCase().includes("source mix:");
  if (hasSummary) return analysis;
  return {
    ...analysis,
    what_we_found: `${summary}\n\n${analysis.what_we_found}`,
  };
}

function mergeDeterministicGaps(
  analysis: DeepDiveResult,
  deterministicGaps: Array<{ gap: string; description: string }>,
) {
  if (!Array.isArray(deterministicGaps) || deterministicGaps.length === 0) return analysis;

  const merged: Array<{ gap: string; description: string }> = [];
  const seen = new Set<string>();
  for (const item of [...analysis.holding_back, ...deterministicGaps]) {
    const gap = String(item?.gap || "").trim();
    const description = String(item?.description || "").trim();
    if (!gap || !description) continue;
    const key = `${gap.toLowerCase()}::${description.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push({ gap, description });
  }

  return {
    ...analysis,
    holding_back: merged.slice(0, 10),
  };
}

function normalizeSnippet(text: string, max = 180) {
  const compact = String(text || "").replace(/\s+/g, " ").trim();
  if (!compact) return "";
  if (compact.length <= max) return compact;
  return `${compact.slice(0, max - 1).trimEnd()}…`;
}

function withLlmTraceBlock(
  analysis: DeepDiveResult,
  trace: {
    provider: string;
    model: string;
    endpoint: string;
    uploadedFiles: string[];
    snippets: Array<{ file: string; snippet: string }>;
  },
) {
  const existing = String(analysis.what_we_found || "");
  if (existing.includes("[LLM_TRACE]")) return analysis;

  const uploadedFilesLine =
    trace.uploadedFiles.length > 0
      ? trace.uploadedFiles.slice(0, 14).join(" | ")
      : "none";
  const snippetLines =
    trace.snippets.length > 0
      ? trace.snippets
          .slice(0, 8)
          .map((item) => `snippet: ${item.file} :: ${normalizeSnippet(item.snippet)}`)
          .join("\n")
      : "snippet: none :: no direct text snippet extracted from uploaded files";

  const block =
    `[LLM_TRACE]\n` +
    `provider: ${trace.provider}\n` +
    `model: ${trace.model}\n` +
    `endpoint: ${trace.endpoint}\n` +
    `uploaded_files: ${uploadedFilesLine}\n` +
    `${snippetLines}\n` +
    `[/LLM_TRACE]`;

  return {
    ...analysis,
    what_we_found: `${block}\n\n${existing}`,
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
    const OLLAMA_MODEL = Deno.env.get("OLLAMA_MODEL") ?? "qwen2.5:7b-instruct";
    if (!isLocalOllamaUrl(OLLAMA_BASE_URL)) {
      return new Response(JSON.stringify({
        error: "Local-only policy violation: OLLAMA_BASE_URL must be localhost/host.docker.internal.",
      }), {
        status: 412,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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

    const { data: strategicProblemRows, error: strategicProblemErr } = await supabase
      .from("strategy_problem_statements")
      .select("statement, source, status, reconciliation_note")
      .eq("company_id", company_id)
      .order("created_at", { ascending: true })
      .limit(80);
    if (strategicProblemErr) {
      console.log("generate-deep-dive strategic problem fetch error:", strategicProblemErr.message);
    }
    const strategicProblemContext = buildStrategicProblemContext(strategicProblemRows ?? []);

    // Get inputs for this company and auto-map each input to a deep-dive area.
    const { data: inputs } = await supabase
      .from("inputs")
      .select("*")
      .eq("company_id", company_id);

    const allInputs = (inputs || []) as Array<Record<string, unknown>>;
    const inputById = new Map<string, Record<string, unknown>>();
    for (const input of allInputs) {
      const id = String(input.id || "").trim();
      if (id) inputById.set(id, input);
    }
    const areaInputs = allInputs.filter((i) => resolveAreaForInput(i) === area_key);

    // Get subitems for area inputs
    const areaInputIds = areaInputs.map((i: any) => i.id);
    const { data: subitems } = areaInputIds.length > 0
      ? await supabase.from("input_subitems").select("*").in("input_id", areaInputIds)
      : { data: [] };

    // Get files for all inputs, then keep files that support this area.
    const allInputIds = [...inputById.keys()];
    const { data: allFiles } = allInputIds.length > 0
      ? await supabase.from("input_files").select("*").in("input_id", allInputIds)
      : { data: [] };
    const files = (allFiles || []).filter((file: any) => {
      const input = inputById.get(String(file.input_id || "").trim()) ?? null;
      return fileSupportsArea({ areaKey: area_key, file, input });
    });

    const uncertainMarkers = ["unknown", "unclear", "not verified", "needs verification", "thin evidence", "not evidenced"];
    const deterministicGapHints: Array<{ gap: string; description: string }> = [];
    const pushDeterministicGap = (gap: string, description: string) => {
      const normalizedGap = String(gap || "").trim();
      const normalizedDescription = String(description || "").trim();
      if (!normalizedGap || !normalizedDescription) return;
      if (deterministicGapHints.some((item) => item.gap === normalizedGap && item.description === normalizedDescription)) return;
      deterministicGapHints.push({ gap: normalizedGap, description: normalizedDescription });
    };
    if (strategicProblemContext.count === 0) {
      pushDeterministicGap(
        "No strategic problem framing",
        "Capture and reconcile a client-stated strategic problem so this area can be prioritized against a clear decision context.",
      );
    } else if (strategicProblemContext.reconciledCount === 0 && strategicProblemContext.count > 1) {
      pushDeterministicGap(
        "Strategic problem not reconciled",
        "Multiple strategic problems exist but none are reconciled. Prioritize one framing before finalizing recommendations.",
      );
    }

    // Build context for AI
    const inputContext = areaInputs.map((input: any) => {
      const inputSubs = (subitems || []).filter((s: any) => s.input_id === input.id);
      const inputFiles = (files || []).filter((f: any) => f.input_id === input.id);
      const normalizedTags = Array.from(new Set(
        inputFiles.flatMap((f: any) =>
          (Array.isArray(f.tags) ? f.tags : [])
            .map((tag: unknown) => normalizeTag(tag))
            .filter(Boolean),
        ),
      ));
      const sourceTier = inferSourceTier(normalizedTags);
      const hasPublic = normalizedTags.includes("public");
      const hasCompanyLike = sourceTier !== "public";
      const hasMixedSources = hasPublic && hasCompanyLike;
      const descriptiveText = `${String(input.description || "")} ${String(input.why_it_matters || "")}`.toLowerCase();
      const hasUncertainText = uncertainMarkers.some((marker) => descriptiveText.includes(marker));

      if (hasCompanyLike && hasUncertainText) {
        pushDeterministicGap(
          `${input.input_label}: reconcile prior assumptions`,
          `Company evidence now exists, but this area is still written as uncertain. Confirm what changed and update the baseline assumption.`,
        );
      }

      if (hasMixedSources) {
        pushDeterministicGap(
          `${input.input_label}: source mismatch check`,
          `Public and company evidence are both present. Resolve conflicts explicitly so this area has one coherent, verified narrative.`,
        );
      }

      return {
        label: input.input_label,
        input_key: input.input_key,
        sub_group: input.sub_group,
        completeness: input.completeness,
        status: input.status,
        score_impact: input.score_impact,
        description: input.description,
        why_it_matters: input.why_it_matters,
        source_tier_hint: sourceTier,
        source_tags: normalizedTags,
        subitems_done: inputSubs.filter((s: any) => s.done).map((s: any) => s.name),
        subitems_remaining: inputSubs.filter((s: any) => !s.done).map((s: any) => s.name),
        files_attached: inputFiles.map((f: any) => ({ name: f.file_name, tags: f.tags })),
      };
    });
    const crossAreaSupportingFiles = (files || [])
      .filter((file: any) => !areaInputIds.includes(file.input_id))
      .map((file: any) => {
        const input = inputById.get(String(file.input_id || "").trim());
        return {
          file_name: String(file.file_name || ""),
          input_label: String(input?.input_label || "Unmapped input"),
          sub_group: String(input?.sub_group || ""),
          tags: Array.isArray(file.tags) ? file.tags : [],
        };
      })
      .slice(0, 20);

    const sourceCounts = inputContext.reduce(
      (acc, item: any) => {
        const tier = String(item.source_tier_hint || "company");
        if (tier === "public") acc.public += 1;
        if (tier === "company") acc.company += 1;
        if (tier === "evidence") acc.evidence += 1;
        if (tier === "implemented_tested") acc.implemented += 1;
        return acc;
      },
      { public: 0, company: 0, evidence: 0, implemented: 0 },
    );
    const provenanceSummary = `Source mix: Public ${sourceCounts.public} · Company ${sourceCounts.company} · Research ${sourceCounts.evidence} · Testing ${sourceCounts.implemented}`;
    const modelPathSummary = `LLM path: local_ollama · model: ${OLLAMA_MODEL}`;
    const combinedSummary = `${provenanceSummary}\n${modelPathSummary}`;

    // Read text content from uploaded files. Prefer sidecar extracted text for binary docs.
    const fileContents: string[] = [];
    const extractedSnippets: Array<{ file: string; snippet: string }> = [];
    const filesForExtraction = (files || []).slice(0, 8);

    for (const tf of filesForExtraction) {
      try {
        let text = "";
        const sidecarPath = `${String(tf.file_path || "").trim()}.extracted.txt`;
        if (sidecarPath && sidecarPath !== ".extracted.txt") {
          const { data: sidecarData } = await supabase.storage.from("input-files").download(sidecarPath);
          if (sidecarData) {
            text = await sidecarData.text();
          }
        }

        if (!text && /\.(txt|csv|md|json)$/i.test(String(tf.file_name || ""))) {
          const { data: fileData } = await supabase.storage.from("input-files").download(tf.file_path);
          if (fileData) {
            text = await fileData.text();
          }
        }

        if (text) {
          fileContents.push(`--- ${tf.file_name} ---\n${text.slice(0, 3000)}`);
          extractedSnippets.push({
            file: String(tf.file_name || "uploaded-file"),
            snippet: normalizeSnippet(text),
          });
        }
      } catch { /* skip unreadable */ }
    }
    const uploadedFiles = Array.from(new Set((files || [])
      .map((file: any) => String(file?.file_name || "").trim())
      .filter(Boolean)));

const systemPrompt = `You are a strategic analyst for a consulting platform. Generate a deep-dive analysis for the "${AREA_LABELS[area_key]}" area based on actual client data.

Your output must reflect what evidence EXISTS (uploaded files, completed checklist items) vs what's MISSING (incomplete items, no files).

When files have been uploaded for an input, acknowledge this as evidence that work has been done — do NOT say "no data exists" if files are present.

Be specific, reference actual file names and completed items. Use markdown bold (**text**) for emphasis.

When company evidence (or stronger) is present, do not keep this area framed as public-only. Upgrade confidence language to match the evidence source tier.

Use strategic problem statements as the prioritization anchor for what matters, what is missing, and what should happen next.

Use clear, plain language. Avoid consulting jargon, business cliches, and buzzwords unless the source evidence explicitly uses those terms.
For ODI-style needs or outcomes, keep one clear idea per sentence and use plain wording (for example: "tracked decision results").
If source text includes direct quotes or company-specific phrasing/taglines, keep them exactly as written.
If a clearer phrasing would help, keep the original and add a separate optional line starting with "Suggested clearer version:".`;

    const userPrompt = `Area: ${AREA_LABELS[area_key]}

Strategic problem context:
${strategicProblemContext.text}

Input status for this area:
${JSON.stringify(inputContext, null, 2)}

${fileContents.length > 0 ? `\nFile contents:\n${fileContents.join("\n\n")}` : ""}
${crossAreaSupportingFiles.length > 0 ? `\nSupporting files mapped from other inputs:\n${JSON.stringify(crossAreaSupportingFiles, null, 2)}` : ""}

${combinedSummary}

Generate the analysis as structured data. For path_forward, each step should have: step (string), duration (string), owner (string), impact_pts (number 1-10), action_label (optional string). For holding_back, each item should have: gap (string), description (string). Only include genuine remaining gaps — if evidence exists, don't list it as a gap.`;

const response = await fetch(`${OLLAMA_BASE_URL}/chat/completions`, {
        method: "POST",
      headers: {
Authorization: "Bearer ollama",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
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
            model: OLLAMA_MODEL,
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
              model: OLLAMA_MODEL,
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
        const analysis = mergeDeterministicGaps(
          withProvenanceSummary(
            normalizeDeepDive(parsed, AREA_LABELS[area_key]),
            combinedSummary,
          ),
          deterministicGapHints,
        );
        const tracedAnalysis = withLlmTraceBlock(analysis, {
          provider: "ollama_local",
          model: OLLAMA_MODEL,
          endpoint: OLLAMA_BASE_URL,
          uploadedFiles,
          snippets: extractedSnippets,
        });

        const { error: upsertErr } = await supabase
          .from("deep_dive_analyses")
          .upsert({
            user_id: user.id,
            company_id,
            area_key,
            why_it_matters: tracedAnalysis.why_it_matters,
            what_we_found: tracedAnalysis.what_we_found,
            what_good_looks_like: tracedAnalysis.what_good_looks_like,
            path_forward: tracedAnalysis.path_forward,
            holding_back: tracedAnalysis.holding_back,
            generated_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }, { onConflict: "user_id,company_id,area_key" });

        if (upsertErr) throw upsertErr;

        return new Response(JSON.stringify({
          ...tracedAnalysis,
          run_ledger: {
            provider: "ollama_local",
            model: OLLAMA_MODEL,
            endpoint: OLLAMA_BASE_URL,
            path: "local_uploaded_files",
          },
        }), {
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
    const analysis = mergeDeterministicGaps(
      withProvenanceSummary(
        normalizeDeepDive(
          parsedFromTools ?? parsedFromContent ?? {},
          AREA_LABELS[area_key],
        ),
        combinedSummary,
      ),
      deterministicGapHints,
    );
    const tracedAnalysis = withLlmTraceBlock(analysis, {
      provider: "ollama_local",
      model: OLLAMA_MODEL,
      endpoint: OLLAMA_BASE_URL,
      uploadedFiles,
      snippets: extractedSnippets,
    });

    // Upsert into deep_dive_analyses
    const { error: upsertErr } = await supabase
      .from("deep_dive_analyses")
      .upsert({
        user_id: user.id,
        company_id,
        area_key,
        why_it_matters: tracedAnalysis.why_it_matters,
        what_we_found: tracedAnalysis.what_we_found,
        what_good_looks_like: tracedAnalysis.what_good_looks_like,
        path_forward: tracedAnalysis.path_forward,
        holding_back: tracedAnalysis.holding_back,
        generated_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id,company_id,area_key" });

    if (upsertErr) throw upsertErr;

    return new Response(JSON.stringify({
      ...tracedAnalysis,
      run_ledger: {
        provider: "ollama_local",
        model: OLLAMA_MODEL,
        endpoint: OLLAMA_BASE_URL,
        path: "local_uploaded_files",
      },
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("generate-deep-dive error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
