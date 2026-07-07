import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  buildFrameworkBrief,
  getFrameworkRoutingPlan,
  type FrameworkArtifact,
  type FrameworkReference,
} from "../_shared/frameworkLibrary.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const LOCAL_HOST_ALLOWLIST = new Set(["localhost", "127.0.0.1", "::1", "host.docker.internal"]);
const DEFAULT_AREAS = ["positioning", "strategy", "market", "odi"] as const;
const PROMPT_VERSION = "local-alignment-v2-2026-03-25";
const OLLAMA_TIMEOUT_MS = 4_000;
const COMPARISON_SIGNATURE_VERSION = "local-align-v2-2026-03-25";
const PLAIN_LANGUAGE_RULES =
  "Use clear, plain language for all output. " +
  "Avoid consulting jargon, business cliches, and buzzwords. " +
  "Use concrete wording and short direct sentences. " +
  "For ODI needs and outcomes, keep one idea per sentence and use plain wording (for example: 'tracked decision results'). " +
  "Only keep specialized terms when they come directly from source evidence or user-provided terms. " +
  "Preserve direct quotes exactly as written. Do not paraphrase quoted text. " +
  "If clarity help is needed, keep the original wording and add a separate optional line prefixed with 'Suggested clearer version:'.";

const INPUT_KEYS_BY_AREA: Record<string, string[]> = {
  positioning: ["comp-alt", "unique-attr", "val-prop", "target-aud", "market-cat", "brand-narrative"],
  strategy: ["operating-model", "customer-research", "outcome-evidence", "acquisition-map", "channel-strat"],
  market: ["market-cat", "target-aud", "comp-alt", "customer-research", "brand-narrative"],
  odi: ["outcome-evidence", "customer-research", "operating-model"],
};

function uniqueFrameworks(frameworks: FrameworkReference[]) {
  const byKey = new Map<string, FrameworkReference>();
  for (const framework of frameworks) byKey.set(framework.key, framework);
  return [...byKey.values()];
}

function frameworkPlanForArea(areaKey: string) {
  if (areaKey === "positioning") {
    const artifact: FrameworkArtifact = "positioning";
    const frameworks = getFrameworkRoutingPlan(artifact);
    return {
      artifact,
      frameworkKeys: frameworks.map((framework) => framework.key),
      frameworkBrief: buildFrameworkBrief(artifact, frameworks),
    };
  }

  if (areaKey === "market") {
    const artifact: FrameworkArtifact = "positioning";
    const frameworks = uniqueFrameworks([
      ...getFrameworkRoutingPlan("positioning"),
      ...getFrameworkRoutingPlan("inputs"),
    ]);
    return {
      artifact,
      frameworkKeys: frameworks.map((framework) => framework.key),
      frameworkBrief: buildFrameworkBrief(artifact, frameworks),
    };
  }

  if (areaKey === "odi") {
    const artifact: FrameworkArtifact = "opportunities";
    const frameworks = uniqueFrameworks([
      ...getFrameworkRoutingPlan("journeys"),
      ...getFrameworkRoutingPlan("opportunities"),
      ...getFrameworkRoutingPlan("routes"),
    ]);
    return {
      artifact,
      frameworkKeys: frameworks.map((framework) => framework.key),
      frameworkBrief: buildFrameworkBrief(artifact, frameworks),
    };
  }

  // "strategy" local comparison is closest to strategy execution and route coherence.
  const artifact: FrameworkArtifact = "routes";
  const frameworks = uniqueFrameworks([
    ...getFrameworkRoutingPlan("inputs"),
    ...getFrameworkRoutingPlan("routes"),
  ]);
  return {
    artifact,
    frameworkKeys: frameworks.map((framework) => framework.key),
    frameworkBrief: buildFrameworkBrief(artifact, frameworks),
  };
}

type Claim = {
  claim: string;
  source: string;
  confidence: number;
  tier?: string;
};

type AreaComparison = {
  area_key: string;
  approach_checks: Array<{ check: string; status: "pass" | "partial" | "fail"; note: string }>;
  public_claims: Claim[];
  internal_claims: Claim[];
  overlaps: Array<{ theme: string; public_claim: string; internal_claim: string; confidence: number }>;
  gaps: Array<{ theme: string; gap_type: "missing_internal" | "missing_public" | "conflict"; impact: "low" | "medium" | "high"; description: string }>;
  why_gaps_likely: string[];
  actions: Array<{ action: string; evidence_needed: string; priority: "low" | "medium" | "high" }>;
  applies_to_areas: string[];
  score_impact: { should_change: boolean; direction: "up" | "down" | "none"; points: number; reason: string };
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function normalizeText(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

function isPublicEvidencePath(value: unknown) {
  return normalizeText(value).includes("public");
}

function claimTierFromSourcePath(sourcePath: unknown, ignorePublicBaseline: boolean) {
  if (ignorePublicBaseline) return "company" as const;
  return isPublicEvidencePath(sourcePath) ? "public" as const : "company" as const;
}

function safeParseJsonObject(input: unknown): Record<string, unknown> | null {
  if (input && typeof input === "object") return input as Record<string, unknown>;
  if (typeof input !== "string") return null;
  const trimmed = input.trim();
  if (!trimmed) return null;
  try {
    const parsed = JSON.parse(trimmed);
    if (parsed && typeof parsed === "object") return parsed as Record<string, unknown>;
  } catch {
    // continue
  }
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try {
      const parsed = JSON.parse(trimmed.slice(start, end + 1));
      if (parsed && typeof parsed === "object") return parsed as Record<string, unknown>;
    } catch {
      return null;
    }
  }
  return null;
}

function clampInt(value: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Math.round(value)));
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function stableHash(input: string) {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function signatureForComparison(args: {
  companyId: string;
  areas: string[];
  baselineRunId: string | null;
  baselineRunAt: string | null;
  positioningId: string | null;
  positioningUpdatedAt: string | null;
  strategyId: string | null;
  strategyUpdatedAt: string | null;
  marketDefinitionId: string | null;
  marketDefinitionUpdatedAt: string | null;
  odiNeedsSlice: string;
  inputs: Array<Record<string, unknown>>;
  files: Array<Record<string, unknown>>;
}) {
  const inputSlice = args.inputs
    .map((entry) =>
      [
        String(entry.id || ""),
        String(entry.input_key || ""),
        String(entry.updated_at || ""),
        String(entry.status || ""),
        String(entry.completeness || ""),
      ].join(":"),
    )
    .sort()
    .join("|");

  const fileSlice = args.files
    .map((entry) => {
      const tags = Array.isArray(entry.tags) ? (entry.tags as unknown[]).map((tag) => String(tag || "")).sort().join(",") : "";
      return [String(entry.id || ""), String(entry.input_id || ""), String(entry.uploaded_at || ""), tags].join(":");
    })
    .sort()
    .join("|");

  const raw = [
    `company:${args.companyId}`,
    `areas:${args.areas.slice().sort().join(",")}`,
    `baseline:${args.baselineRunId || "-"}@${args.baselineRunAt || "-"}`,
    `positioning:${args.positioningId || "-"}@${args.positioningUpdatedAt || "-"}`,
    `strategy:${args.strategyId || "-"}@${args.strategyUpdatedAt || "-"}`,
    `market:${args.marketDefinitionId || "-"}@${args.marketDefinitionUpdatedAt || "-"}`,
    `odi:${args.odiNeedsSlice || "-"}`,
    `inputs:${inputSlice}`,
    `files:${fileSlice}`,
  ].join("||");

  return `${COMPARISON_SIGNATURE_VERSION}:${stableHash(raw)}`;
}

function isLocalOllamaUrl(rawUrl: string) {
  try {
    const url = new URL(rawUrl);
    return LOCAL_HOST_ALLOWLIST.has(normalizeText(url.hostname));
  } catch {
    return false;
  }
}

function hasTag(tags: string[], expected: string[]) {
  const normalized = tags.map((tag) => normalizeText(tag).replace(/[_-]+/g, " "));
  return normalized.some((tag) => expected.includes(tag));
}

function inferTierFromTags(tags: string[]) {
  if (hasTag(tags, ["implemented & tested", "implemented tested", "implemented + testing", "implemented testing", "testing"])) return "implemented_tested";
  if (hasTag(tags, ["primary evidence", "evidence", "research"])) return "evidence";
  if (hasTag(tags, ["public"])) return "public";
  if (hasTag(tags, ["company"])) return "company";
  // Uploaded client files should default to company evidence unless explicitly marked otherwise.
  return "company";
}

function asClaimList(value: unknown): Claim[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const obj = entry as Record<string, unknown>;
      const claim = String(obj.claim || "").trim();
      if (!claim) return null;
      return {
        claim,
        source: String(obj.source || "unknown"),
        confidence: clampInt(Number(obj.confidence || 50), 0, 100),
        tier: String(obj.tier || ""),
      };
    })
    .filter((entry): entry is Claim => entry !== null)
    .slice(0, 12);
}

function impactWeight(impact: "low" | "medium" | "high") {
  if (impact === "high") return 3;
  if (impact === "medium") return 2;
  return 1;
}

function deriveScoreImpact(args: {
  areaKey: string;
  publicClaims: Claim[];
  internalClaims: Claim[];
  overlaps: Array<{ theme: string; public_claim: string; internal_claim: string; confidence: number }>;
  gaps: Array<{ theme: string; gap_type: "missing_internal" | "missing_public" | "conflict"; impact: "low" | "medium" | "high"; description: string }>;
  internalTierCounts: Record<string, number>;
}) {
  const { areaKey, publicClaims, internalClaims, overlaps, gaps, internalTierCounts } = args;
  const publicCount = publicClaims.length;
  const internalCount = internalClaims.length;
  const overlapCount = overlaps.length;
  const gapSeverity = gaps.reduce((sum, gap) => sum + impactWeight(gap.impact), 0);

  const overlapRatio = internalCount > 0 ? overlapCount / Math.max(1, Math.min(publicCount, internalCount)) : 0;
  const coverageRatio = publicCount > 0 ? internalCount / publicCount : internalCount > 0 ? 1 : 0;

  const validationDepth =
    (internalTierCounts.company ?? 0) +
    2 * (internalTierCounts.evidence ?? 0) +
    3 * (internalTierCounts.implemented_tested ?? 0);

  if (publicCount === 0 && internalCount > 0) {
    const points = Math.min(4, Math.max(1, Math.round(validationDepth / 2)));
    return {
      should_change: true,
      direction: "up" as const,
      points,
      reason:
        `No reliable public baseline is available for ${areaKey}; uploaded company evidence now provides enough signal for a modest confidence increase.`,
    };
  }

  if (internalCount === 0 && gapSeverity >= 3) {
    const points = Math.min(7, 2 + gapSeverity);
    return {
      should_change: true,
      direction: "down" as const,
      points,
      reason: `No internal ${areaKey} evidence was found while high-impact gaps remain; confidence should decrease until this area is validated.`,
    };
  }

  if (gapSeverity >= 5 && overlapRatio < 0.3) {
    const points = Math.min(6, 2 + Math.round(gapSeverity / 2));
    return {
      should_change: true,
      direction: "down" as const,
      points,
      reason: `Gap severity is high relative to overlap in ${areaKey}; score should decrease until conflicts are reconciled.`,
    };
  }

  if (overlapRatio >= 0.45 && coverageRatio >= 0.35 && validationDepth >= 2) {
    const points = Math.min(8, Math.max(2, Math.round(2 + overlapRatio * 6 + Math.min(2, validationDepth / 3))));
    return {
      should_change: true,
      direction: "up" as const,
      points,
      reason: `${areaKey} now shows meaningful public/internal alignment with stronger evidence depth; score can increase modestly.`,
    };
  }

  if (overlapRatio >= 0.3 && internalCount > 0 && gaps.length === 0) {
    return {
      should_change: true,
      direction: "up" as const,
      points: 1,
      reason: `${areaKey} alignment improved, but evidence depth is still limited.`,
    };
  }

  return {
    should_change: false,
    direction: "none" as const,
    points: 0,
    reason: `Current ${areaKey} evidence does not justify a score change yet.`,
  };
}

function deterministicCompare(args: {
  areaKey: string;
  publicClaims: Claim[];
  internalClaims: Claim[];
  internalTierCounts: Record<string, number>;
}) {
  const { areaKey, publicClaims, internalClaims, internalTierCounts } = args;
  const overlaps = [];
  const gaps = [];

  if (publicClaims.length === 0) {
    gaps.push({
      theme: "Public baseline coverage",
      gap_type: "missing_public" as const,
      impact: "medium" as const,
      description: "No usable public baseline claims were available for this area.",
    });
  }

  if (internalClaims.length === 0) {
    gaps.push({
      theme: "Internal evidence coverage",
      gap_type: "missing_internal" as const,
      impact: "high" as const,
      description: "No company or primary-evidence claims were extracted from uploaded artifacts.",
    });
  }

  if (publicClaims.length > 0 && internalClaims.length > 0) {
    const pairCount = Math.min(publicClaims.length, internalClaims.length, 3);
    for (let i = 0; i < pairCount; i += 1) {
      overlaps.push({
        theme: `Shared theme ${i + 1}`,
        public_claim: publicClaims[i].claim,
        internal_claim: internalClaims[i].claim,
        confidence: clampInt((publicClaims[i].confidence + internalClaims[i].confidence) / 2, 30, 95),
      });
    }
  }

  const approachChecks = areaKey === "positioning"
    ? [
        {
          check: "Alternatives, differentiation, value, and category are represented",
          status: publicClaims.length >= 3 ? "pass" : "partial",
          note: publicClaims.length >= 3
            ? "Core positioning structure is present in the current draft."
            : "Positioning structure exists but is thin or incomplete.",
        },
        {
          check: "Primary market evidence supports positioning claims",
          status: internalTierCounts.evidence > 0 ? "pass" : internalTierCounts.company > 0 ? "partial" : "fail",
          note: internalTierCounts.evidence > 0
            ? "Primary-evidence signals exist."
            : internalTierCounts.company > 0
              ? "Company artifacts exist but primary market evidence is still missing."
              : "No internal evidence is available yet.",
        },
      ]
    : areaKey === "strategy"
      ? [
          {
            check: "Cascade coherence from aspiration to systems",
            status: publicClaims.length >= 3 ? "pass" : "partial",
            note: publicClaims.length >= 3
              ? "Strategy structure appears present in current artifacts."
              : "Strategy elements are present but not robustly documented.",
          },
          {
            check: "Execution evidence supports strategic assumptions",
            status: internalTierCounts.evidence > 0 || internalTierCounts.implemented_tested > 0
              ? "pass"
              : internalTierCounts.company > 0
                ? "partial"
                : "fail",
            note: internalTierCounts.evidence > 0 || internalTierCounts.implemented_tested > 0
              ? "Primary or implemented evidence is available."
              : internalTierCounts.company > 0
                ? "Company inputs exist but external validation is limited."
                : "No internal evidence is attached for strategy validation.",
          },
        ]
      : areaKey === "market"
        ? [
            {
              check: "Market context names category, executor, and chooser clearly",
              status: publicClaims.length >= 3 ? "pass" : "partial",
              note: publicClaims.length >= 3
                ? "Market framing has enough structure to evaluate."
                : "Market framing exists but is still thin or generic.",
            },
            {
              check: "Uploaded evidence confirms market assumptions",
              status: internalTierCounts.evidence > 0 || internalTierCounts.implemented_tested > 0
                ? "pass"
                : internalTierCounts.company > 0
                  ? "partial"
                  : "fail",
              note: internalTierCounts.evidence > 0 || internalTierCounts.implemented_tested > 0
                ? "Primary or implemented evidence supports market assumptions."
                : internalTierCounts.company > 0
                  ? "Company files exist but primary evidence is still limited."
                  : "No uploaded internal evidence is mapped to market context yet.",
            },
          ]
        : [
            {
              check: "ODI needs are expressed as outcome statements with score context",
              status: publicClaims.length >= 3 ? "pass" : "partial",
              note: publicClaims.length >= 3
                ? "ODI-style outcome context is present."
                : "ODI context exists but needs stronger structure and specificity.",
            },
            {
              check: "Uploaded evidence validates ODI needs and priorities",
              status: internalTierCounts.evidence > 0 || internalTierCounts.implemented_tested > 0
                ? "pass"
                : internalTierCounts.company > 0
                  ? "partial"
                  : "fail",
              note: internalTierCounts.evidence > 0 || internalTierCounts.implemented_tested > 0
                ? "Primary or implemented evidence supports ODI needs."
                : internalTierCounts.company > 0
                  ? "Company uploads exist but stronger interview/survey evidence is still needed."
                  : "No uploaded internal evidence is mapped to ODI needs yet.",
            },
          ];

  const derivedImpact = deriveScoreImpact({
    areaKey,
    publicClaims,
    internalClaims,
    overlaps,
    gaps,
    internalTierCounts,
  });

  return {
    area_key: areaKey,
    approach_checks: approachChecks,
    public_claims: publicClaims,
    internal_claims: internalClaims,
    overlaps,
    gaps,
    why_gaps_likely: gaps.length > 0
      ? ["Public baseline was created earlier than current internal uploads, so claims are not fully reconciled yet."]
      : ["Current public and internal evidence appear directionally aligned."],
    actions: gaps.length > 0
      ? [
          {
            action: "Reconcile public and internal claims in the strategic narrative.",
            evidence_needed: "Primary interviews/surveys plus updated internal KPI evidence.",
            priority: "high" as const,
          },
        ]
      : [
          {
            action: "Keep monitoring for drift as new evidence is added.",
            evidence_needed: "Monthly evidence refresh and claim audit.",
            priority: "medium" as const,
          },
        ],
    applies_to_areas:
      areaKey === "positioning"
        ? ["strategy", "market", "routes"]
        : areaKey === "strategy"
          ? ["positioning", "market", "opportunities"]
          : areaKey === "market"
            ? ["positioning", "strategy", "opportunities"]
            : ["journeys", "opportunities", "routes"],
    score_impact: derivedImpact,
  } as AreaComparison;
}

function sanitizeAreaComparison(areaKey: string, raw: Record<string, unknown> | null, fallback: AreaComparison): AreaComparison {
  if (!raw) return fallback;

  const approachChecks = Array.isArray(raw.approach_checks)
    ? raw.approach_checks
        .map((entry) => {
          if (!entry || typeof entry !== "object") return null;
          const check = String((entry as Record<string, unknown>).check || "").trim();
          if (!check) return null;
          const rawStatus = normalizeText((entry as Record<string, unknown>).status);
          const status = rawStatus === "pass" || rawStatus === "partial" || rawStatus === "fail" ? rawStatus : "partial";
          return {
            check,
            status,
            note: String((entry as Record<string, unknown>).note || "").trim() || "No note provided.",
          };
        })
        .filter((entry): entry is { check: string; status: "pass" | "partial" | "fail"; note: string } => entry !== null)
        .slice(0, 8)
    : fallback.approach_checks;

  const overlaps = Array.isArray(raw.overlaps)
    ? raw.overlaps
        .map((entry) => {
          if (!entry || typeof entry !== "object") return null;
          const obj = entry as Record<string, unknown>;
          const publicClaim = String(obj.public_claim || "").trim();
          const internalClaim = String(obj.internal_claim || "").trim();
          if (!publicClaim || !internalClaim) return null;
          return {
            theme: String(obj.theme || "Shared theme").trim(),
            public_claim: publicClaim,
            internal_claim: internalClaim,
            confidence: clampInt(Number(obj.confidence || 60), 0, 100),
          };
        })
        .filter((entry): entry is { theme: string; public_claim: string; internal_claim: string; confidence: number } => entry !== null)
        .slice(0, 10)
    : fallback.overlaps;

  const gaps = Array.isArray(raw.gaps)
    ? raw.gaps
        .map((entry) => {
          if (!entry || typeof entry !== "object") return null;
          const obj = entry as Record<string, unknown>;
          const rawGapType = normalizeText(obj.gap_type);
          const gapType =
            rawGapType === "missing_internal" || rawGapType === "missing_public" || rawGapType === "conflict"
              ? (rawGapType as "missing_internal" | "missing_public" | "conflict")
              : "conflict";
          const rawImpact = normalizeText(obj.impact);
          const impact = rawImpact === "low" || rawImpact === "medium" || rawImpact === "high"
            ? (rawImpact as "low" | "medium" | "high")
            : "medium";
          const description = String(obj.description || "").trim();
          if (!description) return null;
          return {
            theme: String(obj.theme || "Gap").trim(),
            gap_type: gapType,
            impact,
            description,
          };
        })
        .filter((entry): entry is { theme: string; gap_type: "missing_internal" | "missing_public" | "conflict"; impact: "low" | "medium" | "high"; description: string } => entry !== null)
        .slice(0, 10)
    : fallback.gaps;

  const whyGapsLikely = Array.isArray(raw.why_gaps_likely)
    ? raw.why_gaps_likely.map((entry) => String(entry || "").trim()).filter(Boolean).slice(0, 6)
    : fallback.why_gaps_likely;

  const actions = Array.isArray(raw.actions)
    ? raw.actions
        .map((entry) => {
          if (!entry || typeof entry !== "object") return null;
          const obj = entry as Record<string, unknown>;
          const action = String(obj.action || "").trim();
          if (!action) return null;
          const rawPriority = normalizeText(obj.priority);
          const priority = rawPriority === "low" || rawPriority === "medium" || rawPriority === "high"
            ? (rawPriority as "low" | "medium" | "high")
            : "medium";
          return {
            action,
            evidence_needed: String(obj.evidence_needed || "Additional validation evidence.").trim(),
            priority,
          };
        })
        .filter((entry): entry is { action: string; evidence_needed: string; priority: "low" | "medium" | "high" } => entry !== null)
        .slice(0, 8)
    : fallback.actions;

  const scoreImpactRaw = (raw.score_impact && typeof raw.score_impact === "object")
    ? (raw.score_impact as Record<string, unknown>)
    : {};
  const rawDirection = normalizeText(scoreImpactRaw.direction);
  const direction = rawDirection === "up" || rawDirection === "down" || rawDirection === "none"
    ? (rawDirection as "up" | "down" | "none")
    : fallback.score_impact.direction;
  const points = clampInt(Number(scoreImpactRaw.points ?? fallback.score_impact.points), 0, 20);
  const shouldChange = Boolean(scoreImpactRaw.should_change ?? fallback.score_impact.should_change);

  return {
    area_key: areaKey,
    approach_checks: approachChecks.length > 0 ? approachChecks : fallback.approach_checks,
    public_claims: asClaimList(raw.public_claims).length > 0 ? asClaimList(raw.public_claims) : fallback.public_claims,
    internal_claims: asClaimList(raw.internal_claims).length > 0 ? asClaimList(raw.internal_claims) : fallback.internal_claims,
    overlaps,
    gaps,
    why_gaps_likely: whyGapsLikely.length > 0 ? whyGapsLikely : fallback.why_gaps_likely,
    actions: actions.length > 0 ? actions : fallback.actions,
    applies_to_areas: Array.isArray(raw.applies_to_areas)
      ? raw.applies_to_areas.map((entry) => String(entry || "").trim()).filter(Boolean).slice(0, 8)
      : fallback.applies_to_areas,
    score_impact: {
      should_change: shouldChange,
      direction,
      points,
      reason: String(scoreImpactRaw.reason || fallback.score_impact.reason).trim() || fallback.score_impact.reason,
    },
  };
}

async function callLocalComparison(args: {
  ollamaUrl: string;
  model: string;
  companyName: string;
  website: string;
  areaKey: string;
  frameworkBrief: string;
  frameworkKeys: string[];
  context: Record<string, unknown>;
}) {
  async function fetchWithTimeout(url: string, init: RequestInit) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), OLLAMA_TIMEOUT_MS);
    try {
      return await fetch(url, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timeoutId);
    }
  }

  const systemText =
    "You are a local strategy analyst running strictly on private local inference. " +
    "Use only the provided context JSON. Do not invent facts or external sources. " +
    "Apply the framework guidance below as decision rules, not as output headings. " +
    "Evaluate using this methodology stack: strategy cascade coherence, positioning-first sequencing, customer-job evidence quality (ODI/JTBD), positioning quality, and GTM execution linkage. " +
    "Never use framework creator names in output labels, checks, or recommendations; keep wording neutral. " +
    `${PLAIN_LANGUAGE_RULES} ` +
    "Return only JSON.";

  const userText =
    `Company: ${args.companyName}\n` +
    `Website: ${args.website || "unknown"}\n` +
    `Area: ${args.areaKey}\n` +
    `Framework keys: ${args.frameworkKeys.join(", ")}\n\n` +
    `Framework guidance:\n${args.frameworkBrief}\n\n` +
    `Context JSON:\n${JSON.stringify(args.context)}\n\n` +
    "Return JSON with keys: approach_checks, public_claims, internal_claims, overlaps, gaps, why_gaps_likely, actions, applies_to_areas, score_impact.";

  const payload = {
    model: args.model,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: systemText },
      { role: "user", content: userText },
    ],
  };

  let resp = await fetchWithTimeout(`${args.ollamaUrl}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer ollama" },
    body: JSON.stringify(payload),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Local comparison model failed (${resp.status}): ${text}`);
  }

  const data = await resp.json();
  const content = data?.choices?.[0]?.message?.content;
  return safeParseJsonObject(content);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    if (!supabaseUrl || !serviceRole || !anonKey) return json({ error: "Missing Supabase env vars" }, 500);

    const ollamaUrl = Deno.env.get("OLLAMA_BASE_URL") ?? "http://host.docker.internal:11434/v1";
    const ollamaModel = Deno.env.get("OLLAMA_MODEL") ?? "llama3:70b";

    if (!isLocalOllamaUrl(ollamaUrl)) {
      return json({
        error: "Local-only policy violation: OLLAMA_BASE_URL must resolve to localhost/host.docker.internal.",
      }, 412);
    }

    const supabase = createClient(supabaseUrl, serviceRole);
    const authHeader = req.headers.get("Authorization");
    const anonClient = createClient(
      supabaseUrl,
      anonKey,
      authHeader ? { global: { headers: { Authorization: authHeader } } } : {},
    );

    let requesterUserId: string | null = null;
    if (authHeader) {
      const { data: userRes, error: authErr } = await anonClient.auth.getUser();
      if (authErr || !userRes?.user) {
        console.log("[local-alignment] auth context unavailable, continuing with fallback user", authErr?.message);
      } else {
        requesterUserId = userRes.user.id;
      }
    } else {
      console.log("[local-alignment] missing Authorization header, using fallback user attribution");
    }

    const body = await req.json().catch(() => ({}));
    const companyId = String(body?.company_id || "").trim();
    const trigger = String(body?.trigger || "manual").trim();
    const applyScoreUpdate = body?.apply_score_update === true;
    const ignorePublicBaseline = body?.ignore_public_baseline === true;
    const areasRequested = Array.isArray(body?.areas)
      ? body.areas.map((entry: unknown) => String(entry || "").trim().toLowerCase()).filter(Boolean)
      : [...DEFAULT_AREAS];
    const areas = Array.from(
      new Set(areasRequested.filter((area) => area === "positioning" || area === "strategy" || area === "market" || area === "odi")),
    );
    if (!companyId) return json({ error: "company_id is required" }, 400);
    if (areas.length === 0) return json({ error: "No valid areas requested" }, 400);

    if (requesterUserId) {
      const { data: companyAccess, error: accessErr } = await anonClient
        .from("companies")
        .select("id")
        .eq("id", companyId)
        .maybeSingle();
      if (accessErr || !companyAccess) {
        console.log("[local-alignment] company access check failed, continuing with service-role fallback", accessErr?.message);
      }
    }

    const [{ data: companyRow }, { data: baselineRun }, { data: positioningRow }, { data: strategyRow }, { data: marketDefinitionRow }, { data: odiNeedRows }, { data: inputRows }] =
      await Promise.all([
        supabase
          .from("companies")
          .select("id,name,website,created_by,mojo_score,potential_score,projected_score,evidence_status,evidence_note,area_scores_json")
          .eq("id", companyId)
          .maybeSingle(),
        supabase
          .from("public_baseline_runs")
          .select("id,created_at,result_json")
          .eq("company_id", companyId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from("positioning_canvases")
          .select("id,market_category,value_for_customer,current_tagline,proposed_tagline,best_fit_customers,competitive_alternatives_json,unique_attributes_json,updated_at")
          .eq("company_id", companyId)
          // Gate 3a: role-scoped, deliberately ungated — internal→local is legal.
          .eq("artifact_role", "market_read")
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from("strategy_cascades")
          .select("id,winning_aspiration,where_to_play,how_to_win,capabilities_json,management_systems_json,assumptions_json,updated_at")
          .eq("company_id", companyId)
          .eq("artifact_role", "market_read")
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from("odi_market_definitions")
          .select("id,job_executor,chooser,jtbd,source_path,updated_at,created_at")
          .eq("company_id", companyId)
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from("odi_needs")
          .select("id,desired_outcome,importance,satisfaction,opportunity_score,journey_key,step_label,source_path,created_at")
          .eq("company_id", companyId)
          .order("opportunity_score", { ascending: false })
          .limit(120),
        supabase
          .from("inputs")
          .select("id,input_key,input_label,sub_group,group_key,description,why_it_matters,status,completeness,updated_at")
          .eq("company_id", companyId),
      ]);

    if (!companyRow) return json({ error: "Company not found" }, 404);
    const fallbackUserId = String((companyRow as { created_by?: unknown })?.created_by || "").trim();
    const runUserId = requesterUserId || fallbackUserId;
    if (!runUserId) return json({ error: "Could not resolve user for local alignment run." }, 500);
    const effectiveBaselineRun = ignorePublicBaseline ? null : baselineRun;

    const inputs = Array.isArray(inputRows) ? inputRows : [];
    const inputIds = inputs.map((entry: any) => entry.id).filter(Boolean);
    const { data: fileRows } = inputIds.length > 0
      ? await supabase
          .from("input_files")
          .select("id,input_id,file_name,tags,uploaded_at")
          .in("input_id", inputIds)
      : { data: [] };
    const files = Array.isArray(fileRows) ? fileRows : [];

    const filesByInput = new Map<string, Array<Record<string, unknown>>>();
    for (const file of files as any[]) {
      const key = String(file?.input_id || "");
      if (!key) continue;
      if (!filesByInput.has(key)) filesByInput.set(key, []);
      filesByInput.get(key)!.push(file as Record<string, unknown>);
    }

    const comparisonSignature = signatureForComparison({
      companyId,
      areas,
      baselineRunId: effectiveBaselineRun?.id ? String(effectiveBaselineRun.id) : null,
      baselineRunAt: effectiveBaselineRun?.created_at ? String(effectiveBaselineRun.created_at) : null,
      positioningId: (positioningRow as { id?: unknown } | null)?.id
        ? String((positioningRow as { id?: unknown }).id)
        : null,
      positioningUpdatedAt: (positioningRow as { updated_at?: unknown } | null)?.updated_at
        ? String((positioningRow as { updated_at?: unknown }).updated_at)
        : null,
      strategyId: (strategyRow as { id?: unknown } | null)?.id
        ? String((strategyRow as { id?: unknown }).id)
        : null,
      strategyUpdatedAt: (strategyRow as { updated_at?: unknown } | null)?.updated_at
        ? String((strategyRow as { updated_at?: unknown }).updated_at)
        : null,
      marketDefinitionId: (marketDefinitionRow as { id?: unknown } | null)?.id
        ? String((marketDefinitionRow as { id?: unknown }).id)
        : null,
      marketDefinitionUpdatedAt: (marketDefinitionRow as { updated_at?: unknown; created_at?: unknown } | null)?.updated_at
        ? String((marketDefinitionRow as { updated_at?: unknown }).updated_at)
        : (marketDefinitionRow as { created_at?: unknown } | null)?.created_at
          ? String((marketDefinitionRow as { created_at?: unknown }).created_at)
          : null,
      odiNeedsSlice: Array.isArray(odiNeedRows)
        ? odiNeedRows
            .slice(0, 50)
            .map((entry: any) =>
              [
                String(entry?.id || ""),
                String(entry?.desired_outcome || "").slice(0, 80),
                String(entry?.opportunity_score || ""),
                String(entry?.source_path || ""),
              ].join(":"),
            )
            .join("|")
        : "",
      inputs: (inputs as Record<string, unknown>[]),
      files: (files as Record<string, unknown>[]),
    });

    const baselineJson = (effectiveBaselineRun?.result_json && typeof effectiveBaselineRun.result_json === "object")
      ? effectiveBaselineRun.result_json as Record<string, unknown>
      : {};
    const marketDefinition = (marketDefinitionRow && typeof marketDefinitionRow === "object")
      ? marketDefinitionRow as Record<string, unknown>
      : null;
    const odiNeeds = Array.isArray(odiNeedRows)
      ? (odiNeedRows as Array<Record<string, unknown>>)
      : [];
    const baselineHypotheses = Array.isArray(baselineJson?.top_hypotheses)
      ? baselineJson.top_hypotheses.map((entry) => String(entry || "").trim()).filter(Boolean).slice(0, 6)
      : [];
    const alignmentSummary = String((baselineJson?.message_alignment as Record<string, unknown> | undefined)?.alignment_summary || "").trim();
    const baselineLedgerCount = Array.isArray(baselineJson?.evidence_ledger)
      ? baselineJson.evidence_ledger.length
      : 0;
    const hasPublicBaselineContext =
      baselineHypotheses.length > 0 || alignmentSummary.length > 0 || baselineLedgerCount > 0;
    const derivedClaimTier = hasPublicBaselineContext ? "public" : "company";
    const confidenceForDerivedClaim = (publicConfidence: number, companyConfidence = 74) =>
      hasPublicBaselineContext ? publicConfidence : companyConfidence;

    const areaResults: Record<string, AreaComparison> = {};
    let totalInternalClaims = 0;
    let totalPublicClaims = 0;
    const tierTotals = { public: 0, company: 0, evidence: 0, implemented_tested: 0 };
    let skipAiForRemainingAreas = false;

    for (const areaKey of areas) {
      const keySet = new Set(INPUT_KEYS_BY_AREA[areaKey] || []);
      const areaInputs = inputs.filter((entry: any) => {
        const inputKey = String(entry?.input_key || "").trim();
        if (keySet.has(inputKey)) return true;
        const subGroup = normalizeText(entry?.sub_group);
        const groupKey = normalizeText(entry?.group_key);
        if (areaKey === "positioning") return subGroup.includes("position") || subGroup.includes("market") || subGroup.includes("story");
        if (areaKey === "strategy") return subGroup.includes("strategy") || subGroup.includes("program") || subGroup.includes("delivery");
        if (areaKey === "market") return subGroup.includes("market") || subGroup.includes("audience") || groupKey.includes("market");
        return (
          subGroup.includes("odi") ||
          subGroup.includes("journey") ||
          subGroup.includes("outcome") ||
          subGroup.includes("research") ||
          inputKey.includes("outcome") ||
          inputKey.includes("need")
        );
      });

      const publicClaims: Claim[] = [];
      for (const hypothesis of baselineHypotheses.slice(0, 4)) {
        publicClaims.push({ claim: hypothesis, source: "public_baseline.top_hypotheses", confidence: 55, tier: "public" });
      }
      if (alignmentSummary) {
        publicClaims.push({ claim: alignmentSummary, source: "public_baseline.message_alignment", confidence: 60, tier: "public" });
      }

      if (areaKey === "positioning") {
        const positioning = positioningRow as Record<string, unknown> | null;
        const marketCategory = String(positioning?.market_category || "").trim();
        const valueForCustomer = String(positioning?.value_for_customer || "").trim();
        const currentTagline = String(positioning?.current_tagline || "").trim();
        const proposedTagline = String(positioning?.proposed_tagline || "").trim();
        if (marketCategory) publicClaims.push({ claim: `Market category: ${marketCategory}`, source: "positioning_canvas.market_category", confidence: confidenceForDerivedClaim(68), tier: derivedClaimTier });
        if (valueForCustomer) publicClaims.push({ claim: `Value statement: ${valueForCustomer}`, source: "positioning_canvas.value_for_customer", confidence: confidenceForDerivedClaim(65), tier: derivedClaimTier });
        if (currentTagline) publicClaims.push({ claim: `Current tagline: ${currentTagline}`, source: "positioning_canvas.current_tagline", confidence: confidenceForDerivedClaim(60), tier: derivedClaimTier });
        if (proposedTagline) publicClaims.push({ claim: `Proposed direction: ${proposedTagline}`, source: "positioning_canvas.proposed_tagline", confidence: confidenceForDerivedClaim(60), tier: derivedClaimTier });
      } else if (areaKey === "strategy") {
        const strategy = strategyRow as Record<string, unknown> | null;
        const aspiration = String(strategy?.winning_aspiration || "").trim();
        const whereToPlay = String(strategy?.where_to_play || "").trim();
        const howToWin = String(strategy?.how_to_win || "").trim();
        if (aspiration) publicClaims.push({ claim: `Winning aspiration: ${aspiration}`, source: "strategy_cascade.winning_aspiration", confidence: confidenceForDerivedClaim(68), tier: derivedClaimTier });
        if (whereToPlay) publicClaims.push({ claim: `Where to play: ${whereToPlay}`, source: "strategy_cascade.where_to_play", confidence: confidenceForDerivedClaim(66), tier: derivedClaimTier });
        if (howToWin) publicClaims.push({ claim: `How to win: ${howToWin}`, source: "strategy_cascade.how_to_win", confidence: confidenceForDerivedClaim(66), tier: derivedClaimTier });
      } else if (areaKey === "market") {
        const positioning = positioningRow as Record<string, unknown> | null;
        const strategy = strategyRow as Record<string, unknown> | null;
        const baselineCategory = String(baselineJson?.category_archetype || "").trim();
        const marketCategory = String(positioning?.market_category || "").trim();
        const bestFitCustomers = String(positioning?.best_fit_customers || "").trim();
        const whereToPlay = String(strategy?.where_to_play || "").trim();
        const jobExecutor = String(marketDefinition?.job_executor || "").trim();
        const chooser = String(marketDefinition?.chooser || "").trim();
        const jtbd = String(marketDefinition?.jtbd || "").trim();
        const marketSourcePath = String(marketDefinition?.source_path || "unknown");
        const marketSourceTier = claimTierFromSourcePath(marketSourcePath, ignorePublicBaseline);
        if (baselineCategory) publicClaims.push({ claim: `Baseline archetype: ${baselineCategory}`, source: "public_baseline.category_archetype", confidence: 60, tier: "public" });
        if (marketCategory) publicClaims.push({ claim: `Market category: ${marketCategory}`, source: "positioning_canvas.market_category", confidence: confidenceForDerivedClaim(70), tier: derivedClaimTier });
        if (bestFitCustomers) publicClaims.push({ claim: `Best-fit customers: ${bestFitCustomers}`, source: "positioning_canvas.best_fit_customers", confidence: confidenceForDerivedClaim(65), tier: derivedClaimTier });
        if (whereToPlay) publicClaims.push({ claim: `Where to play: ${whereToPlay}`, source: "strategy_cascade.where_to_play", confidence: confidenceForDerivedClaim(66), tier: derivedClaimTier });
        if (jobExecutor) publicClaims.push({ claim: `Job executor: ${jobExecutor}`, source: `odi_market_definitions.${marketSourcePath}`, confidence: marketSourceTier === "public" ? 58 : 78, tier: marketSourceTier });
        if (chooser) publicClaims.push({ claim: `Chooser: ${chooser}`, source: `odi_market_definitions.${marketSourcePath}`, confidence: marketSourceTier === "public" ? 58 : 78, tier: marketSourceTier });
        if (jtbd) publicClaims.push({ claim: `JTBD: ${jtbd}`, source: `odi_market_definitions.${marketSourcePath}`, confidence: marketSourceTier === "public" ? 58 : 80, tier: marketSourceTier });
      } else if (areaKey === "odi") {
        const marketSourcePath = String(marketDefinition?.source_path || "unknown");
        const jtbd = String(marketDefinition?.jtbd || "").trim();
        const marketSourceTier = claimTierFromSourcePath(marketSourcePath, ignorePublicBaseline);
        if (jtbd) {
          publicClaims.push({
            claim: `ODI job context: ${jtbd}`,
            source: `odi_market_definitions.${marketSourcePath}`,
            confidence: marketSourceTier === "public" ? 58 : 80,
            tier: marketSourceTier,
          });
        }

        const topNeeds = [...odiNeeds]
          .sort((a, b) => Number(b?.opportunity_score || 0) - Number(a?.opportunity_score || 0))
          .slice(0, 8);
        for (const need of topNeeds) {
          const outcome = String(need?.desired_outcome || "").trim();
          if (!outcome) continue;
          const sourcePath = String(need?.source_path || "unknown");
          const importance = Number(need?.importance || 0);
          const satisfaction = Number(need?.satisfaction || 0);
          const opp = Number(need?.opportunity_score || 0);
          const sourceTier = claimTierFromSourcePath(sourcePath, ignorePublicBaseline);
          publicClaims.push({
            claim: `Need: ${outcome} (I:${importance || "?"}, S:${satisfaction || "?"}, Opp:${opp || "?"})`,
            source: `odi_needs.${sourcePath}`,
            confidence: sourceTier === "public" ? 56 : 82,
            tier: sourceTier,
          });
        }
      }

      const strictPublicClaims = publicClaims
        .filter((claim) => normalizeText(claim.tier || "public") === "public")
        .slice(0, 10);
      const derivedCompanyClaims = publicClaims
        .filter((claim) => normalizeText(claim.tier || "public") !== "public")
        .slice(0, 8);

      const internalClaims: Claim[] = derivedCompanyClaims.map((claim) => ({
        claim: claim.claim,
        source: claim.source,
        confidence: clampInt(Number(claim.confidence || 72), 0, 100),
        tier: String(claim.tier || "company"),
      }));
      const internalTierCounts = { public: 0, company: 0, evidence: 0, implemented_tested: 0 };
      for (const claim of derivedCompanyClaims) {
        const tier = normalizeText(claim.tier || "company");
        if (tier === "public" || tier === "company" || tier === "evidence" || tier === "implemented_tested") {
          internalTierCounts[tier as keyof typeof internalTierCounts] += 1;
        } else {
          internalTierCounts.company += 1;
        }
      }
      for (const input of areaInputs as any[]) {
        const inputFiles = filesByInput.get(String(input?.id || "")) || [];
        if (inputFiles.length === 0) continue;

        const tags = inputFiles.flatMap((file) =>
          Array.isArray(file?.tags) ? (file.tags as unknown[]).map((tag) => String(tag || "")) : [],
        );
        const tier = inferTierFromTags(tags);
        internalTierCounts[tier as keyof typeof internalTierCounts] += 1;

        const description = String(input?.description || "").trim();
        const why = String(input?.why_it_matters || "").trim();
        const claimText = description || why || `${String(input?.input_label || "Input")} evidence uploaded.`;
        const fileNames = inputFiles.map((file) => String(file?.file_name || "")).filter(Boolean).slice(0, 3);
        const sourceLabel = fileNames.length > 0
          ? `${String(input?.input_key || "input")} (${fileNames.join(", ")})`
          : String(input?.input_key || "input");

        internalClaims.push({
          claim: claimText,
          source: sourceLabel,
          confidence: tier === "implemented_tested" ? 90 : tier === "evidence" ? 82 : tier === "company" ? 72 : 58,
          tier,
        });
      }

      totalPublicClaims += strictPublicClaims.length;
      totalInternalClaims += internalClaims.length;
      tierTotals.public += internalTierCounts.public;
      tierTotals.company += internalTierCounts.company;
      tierTotals.evidence += internalTierCounts.evidence;
      tierTotals.implemented_tested += internalTierCounts.implemented_tested;

      const deterministic = deterministicCompare({
        areaKey,
        publicClaims: strictPublicClaims,
        internalClaims: internalClaims.slice(0, 10),
        internalTierCounts,
      });

      const context = {
        area_key: areaKey,
        methodology: [
          "Keep strategy cascade and positioning coherent.",
          "Separate public assumptions from company and primary evidence.",
          "Treat primary interviews/surveys as stronger than public claims.",
          "Tie recommendations to highest-impact gaps first.",
        ],
        framework_plan: frameworkPlanForArea(areaKey),
        public_claims: deterministic.public_claims,
        internal_claims: deterministic.internal_claims,
        internal_tier_counts: internalTierCounts,
        baseline_run_at: effectiveBaselineRun?.created_at ?? null,
      };

      const frameworkPlan = frameworkPlanForArea(areaKey);

      let aiRaw: Record<string, unknown> | null = null;
      if (!skipAiForRemainingAreas) {
        try {
          aiRaw = await callLocalComparison({
            ollamaUrl,
            model: ollamaModel,
            companyName: String(companyRow.name || ""),
            website: String(companyRow.website || ""),
            areaKey,
            frameworkBrief: frameworkPlan.frameworkBrief,
            frameworkKeys: frameworkPlan.frameworkKeys,
            context,
          });
        } catch (err) {
          const errorMessage = String((err as Error)?.message || err);
          console.log("[local-alignment] ai compare fallback", areaKey, errorMessage);
          if (
            errorMessage.toLowerCase().includes("abort") ||
            errorMessage.toLowerCase().includes("timed out") ||
            errorMessage.toLowerCase().includes("fetch failed") ||
            errorMessage.toLowerCase().includes("connection") ||
            errorMessage.toLowerCase().includes("econn")
          ) {
            skipAiForRemainingAreas = true;
          }
        }
      }

      const sanitized = sanitizeAreaComparison(areaKey, aiRaw, deterministic);
      const uploadedOnlySanitized = ignorePublicBaseline
        ? {
            ...sanitized,
            public_claims: [] as Claim[],
            overlaps: [],
            gaps: sanitized.gaps.filter((gap) => gap.gap_type !== "missing_public"),
          }
        : sanitized;
      const derivedImpact = deriveScoreImpact({
        areaKey,
        publicClaims: uploadedOnlySanitized.public_claims,
        internalClaims: uploadedOnlySanitized.internal_claims,
        overlaps: uploadedOnlySanitized.overlaps,
        gaps: uploadedOnlySanitized.gaps,
        internalTierCounts,
      });

      const shouldOverrideScoreImpact =
        !uploadedOnlySanitized.score_impact.should_change ||
        uploadedOnlySanitized.score_impact.direction === "none" ||
        uploadedOnlySanitized.score_impact.points <= 0;

      areaResults[areaKey] = shouldOverrideScoreImpact
        ? { ...uploadedOnlySanitized, score_impact: derivedImpact }
        : uploadedOnlySanitized;
    }

    let delta = 0;
    const reasons: string[] = [];
    for (const areaKey of Object.keys(areaResults)) {
      const impact = areaResults[areaKey].score_impact;
      if (!impact.should_change || impact.direction === "none") {
        reasons.push(`${areaKey}: ${impact.reason}`);
        continue;
      }
      const points = clampInt(impact.points, 0, 20);
      delta += impact.direction === "down" ? -points : points;
      reasons.push(`${areaKey}: ${impact.reason}`);
    }

    const aggregateScoreImpact = {
      should_change: delta !== 0,
      direction: delta > 0 ? "up" : delta < 0 ? "down" : "none",
      points: Math.abs(delta),
      reason: reasons.join(" | ").slice(0, 1200),
    };

    const currentMojoRaw = Number((companyRow as { mojo_score?: unknown })?.mojo_score);
    const hasCurrentMojo = Number.isFinite(currentMojoRaw);
    const currentMojo = hasCurrentMojo ? clampInt(currentMojoRaw, 0, 100) : 0;
    let effectiveMojoForRun = hasCurrentMojo ? currentMojo : null;
    const existingAreaScores =
      (companyRow as { area_scores_json?: unknown })?.area_scores_json &&
        typeof (companyRow as { area_scores_json?: unknown }).area_scores_json === "object"
        ? ((companyRow as { area_scores_json: Record<string, unknown> }).area_scores_json)
        : {};
    const priorLocalAlignment =
      existingAreaScores.local_alignment && typeof existingAreaScores.local_alignment === "object"
        ? (existingAreaScores.local_alignment as Record<string, unknown>)
        : {};
    const lastManualApply =
      priorLocalAlignment.last_manual_apply && typeof priorLocalAlignment.last_manual_apply === "object"
        ? (priorLocalAlignment.last_manual_apply as Record<string, unknown>)
        : {};
    const previousComparisonSignature =
      typeof lastManualApply.comparison_signature === "string"
        ? String(lastManualApply.comparison_signature)
        : null;

    let appliedScoreUpdate = {
      applied: false,
      previous_mojo: hasCurrentMojo ? currentMojo : null,
      updated_mojo: hasCurrentMojo ? currentMojo : null,
      direction: aggregateScoreImpact.direction,
      points: aggregateScoreImpact.points,
      reason: applyScoreUpdate
        ? "No score update was applied."
        : "Manual score update was not requested for this run.",
      applied_at: null as string | null,
      comparison_signature: comparisonSignature,
    };

    if (applyScoreUpdate) {
      if (previousComparisonSignature && previousComparisonSignature === comparisonSignature) {
        appliedScoreUpdate = {
          ...appliedScoreUpdate,
          direction: "none",
          reason:
            "This local comparison was already applied to the score. Add new evidence or rerun baseline before applying again.",
        };
      } else if (
        aggregateScoreImpact.should_change &&
        aggregateScoreImpact.direction !== "none" &&
        aggregateScoreImpact.points > 0
      ) {
        const signedDelta = aggregateScoreImpact.direction === "down"
          ? -Math.abs(aggregateScoreImpact.points)
          : Math.abs(aggregateScoreImpact.points);
        const updatedMojo = clampInt(currentMojo + signedDelta, 0, 100);
        const appliedAt = new Date().toISOString();

        const existingEvidenceNote = String((companyRow as { evidence_note?: unknown })?.evidence_note || "").trim();
        const applyNote =
          `Manual local alignment apply (${aggregateScoreImpact.direction} ${aggregateScoreImpact.points}) ` +
          `at ${appliedAt}. ${aggregateScoreImpact.reason}`;
        const nextEvidenceNote = existingEvidenceNote
          ? `${existingEvidenceNote}\n\n${applyNote}`.slice(0, 8000)
          : applyNote.slice(0, 8000);

        const nextAreaScores = {
          ...existingAreaScores,
          local_alignment: {
            ...priorLocalAlignment,
            last_manual_apply: {
              applied_at: appliedAt,
              previous_mojo: hasCurrentMojo ? currentMojo : null,
              updated_mojo: updatedMojo,
              direction: aggregateScoreImpact.direction,
              points: aggregateScoreImpact.points,
              reason: aggregateScoreImpact.reason,
              comparison_signature: comparisonSignature,
            },
          },
        };

        // SCORE-1 law: snapshotMojoScore (v1.1.0) is the SOLE writer of the
        // companies score columns. The alignment delta is a calibration read —
        // its full trail persists in area_scores_json.local_alignment +
        // evidence_note, and updatedMojo flows to research_artifact_runs only.
        const { error: updateScoreErr } = await supabase
          .from("companies")
          .update({
            last_scored_at: appliedAt,
            evidence_note: nextEvidenceNote,
            area_scores_json: nextAreaScores,
          })
          .eq("id", companyId);

        if (updateScoreErr) {
          console.log("[local-alignment] score apply error", updateScoreErr.message);
          appliedScoreUpdate = {
            ...appliedScoreUpdate,
            direction: "none",
            reason: `Score update failed: ${updateScoreErr.message}`,
          };
        } else {
          effectiveMojoForRun = updatedMojo;
          appliedScoreUpdate = {
            applied: true,
            previous_mojo: hasCurrentMojo ? currentMojo : null,
            updated_mojo: updatedMojo,
            direction: aggregateScoreImpact.direction,
            points: aggregateScoreImpact.points,
            reason: aggregateScoreImpact.reason,
            applied_at: appliedAt,
            comparison_signature: comparisonSignature,
          };
        }
      } else {
        appliedScoreUpdate = {
          ...appliedScoreUpdate,
          direction: "none",
          reason:
            "Manual score update requested, but this run did not produce a positive or negative score delta worth applying.",
        };
      }
    }

    const summaryJson = {
      run_type: "local_alignment",
      trigger,
      run_ledger: {
        provider: "ollama_local",
        model: ollamaModel,
        endpoint: ollamaUrl,
        local_only_verified: true,
        prompt_version: PROMPT_VERSION,
        generated_at: new Date().toISOString(),
      },
      source_mix: {
        public_claims: totalPublicClaims,
        internal_claims: totalInternalClaims,
        tiers: tierTotals,
      },
      framework_routing: {
        positioning: frameworkPlanForArea("positioning").frameworkKeys,
        strategy: frameworkPlanForArea("strategy").frameworkKeys,
        market: frameworkPlanForArea("market").frameworkKeys,
        odi: frameworkPlanForArea("odi").frameworkKeys,
      },
      areas: Object.values(areaResults).map((entry) => ({
        area_key: entry.area_key,
        overlaps: entry.overlaps.length,
        gaps: entry.gaps.length,
        score_impact: entry.score_impact,
      })),
      score_impact: aggregateScoreImpact,
      applied_score_update: appliedScoreUpdate,
    };

    const artifactsJson = {
      baseline_run_id: effectiveBaselineRun?.id ?? null,
      positioning_canvas_id: (positioningRow as { id?: unknown } | null)?.id ?? null,
      strategy_cascade_id: (strategyRow as { id?: unknown } | null)?.id ?? null,
      market_definition_id: (marketDefinitionRow as { id?: unknown } | null)?.id ?? null,
      areas: areaResults,
      lineage: {
        company_id: companyId,
        uploaded_file_count: files.length,
        input_count: inputs.length,
        odi_need_count: odiNeeds.length,
      },
    };

    const { data: insertedRun, error: insertErr } = await supabase
      .from("research_artifact_runs")
      .insert({
        company_id: companyId,
        user_id: runUserId,
        provenance_type: "framework_adjudicated",
        baseline_run_id: effectiveBaselineRun?.id ?? null,
        status: "local_alignment",
        mojo_score: effectiveMojoForRun,
        evidence_status: String(companyRow.evidence_status || "") || null,
        summary_json: summaryJson,
        artifacts_json: artifactsJson,
      })
      .select("id,created_at")
      .single();

    if (insertErr) {
      console.log("[local-alignment] persist error", insertErr.message);
      return json({ error: insertErr.message }, 500);
    }

    return json({
      id: insertedRun?.id,
      created_at: insertedRun?.created_at,
      provider: "ollama_local",
      model: ollamaModel,
      local_only_verified: true,
      areas: areaResults,
      score_impact: aggregateScoreImpact,
      applied_score_update: appliedScoreUpdate,
    });
  } catch (err) {
    console.error("[local-alignment] error", err);
    return json({ error: String((err as Error)?.message || err) }, 500);
  }
});
