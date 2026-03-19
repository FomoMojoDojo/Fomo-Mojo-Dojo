import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { FunctionsHttpError } from "@supabase/supabase-js";
import TopNav from "@/components/layout/TopNav";
import AiBoundaryNote from "@/components/AiBoundaryNote";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import { useJobSteps, type JobStepRow } from "@/hooks/useJobSteps";
import { useOdiNeeds, type OdiMarketDefinitionRow, type OdiNeedRow } from "@/hooks/useOdiNeeds";
import { usePublicBaseline } from "@/hooks/usePublicBaseline";
import { useStrategyCascade } from "@/hooks/useStrategyCascade";
import { useStrategicProblems } from "@/hooks/useStrategicProblems";
import { useInputs } from "@/hooks/useInputs";
import { useSourceConfidence } from "@/hooks/useSourceConfidence";
import type { InputItem } from "@/lib/types";
import { MetaBadge, ScoreChip, StateBadge } from "@/components/ui/semantic-badges";
import { SourceLegend } from "@/components/provenance/SourceLegend";

const c = {
  bg: "#faf7f6",
  panel: "#FFFFFF",
  card: "#ffffff",
  paper: "#FFFFFF",
  line: "#DDE6D1",
  lineFaint: "#EEF3E9",
  charcoal: "#233C4B",
  secondary: "#46606D",
  muted: "#6E847F",
  faint: "#C8D8CA",
  coral: "#FF7D2D",
  teal: "#5F9B8C",
  slate: "#233C4B",
  gap: "#FF7D2D",
  empty: "#E7EEDC",
  designedDot: "#7B8F66",
};

const STEP_CARD_WIDTH = "250px";
const STEP_DETAIL_BLOCK_HEIGHT = "96px";

type JourneyKey = string;

type JourneyGroup = {
  key: JourneyKey;
  title: string;
  subtitle: string;
  steps: JobStepRow[];
};

type SuggestedJourneyOption = {
  key: JourneyKey;
  title: string;
  subtitle: string;
  confidence: number;
  rationale: string;
};

type JourneyDraftMap = Record<string, { title: string; subtitle: string }>;

const JOURNEY_STYLE: Record<
  string,
  { rail: string; dot: string; preview?: string }
> = {
  customer: { rail: c.coral, dot: c.coral },
  revenue: { rail: c.teal, dot: c.teal, preview: "Project preview" },
  operations: { rail: c.slate, dot: c.slate },
};

function safeText(value: string | null | undefined, fallback = "") {
  return value?.trim() || fallback;
}

function normalizeJourneyKey(value: string) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function titleFromKey(key: JourneyKey) {
  if (key === "customer") return "Customer Journey";
  if (key === "revenue") return "Revenue Journey";
  if (key === "operations") return "Operations Journey";
  return `${titleCaseFromKey(key)} Journey`;
}

function subtitleFromKey(key: JourneyKey) {
  if (key === "customer") return "How a customer experiences the end-to-end service.";
  if (key === "revenue") return "How the company secures and grows revenue.";
  if (key === "operations") return "How the company builds and operates the service.";
  return `How ${titleCaseFromKey(key).toLowerCase()} progress through the work from start to finish.`;
}

function titleCaseFromKey(key: string) {
  return key
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ") || "Custom Journey";
}

function fallbackStyleForJourney(key: string) {
  const palette = [
    { rail: c.coral, dot: c.coral },
    { rail: c.teal, dot: c.teal },
    { rail: c.slate, dot: c.slate },
    { rail: "#A0C382", dot: "#A0C382" },
    { rail: "#FAC846", dot: "#FAC846" },
  ];
  const hash = Array.from(key).reduce((sum, ch) => sum + ch.charCodeAt(0), 0);
  return palette[hash % palette.length];
}

async function describeJobMapInvokeError(error: unknown) {
  const maybeContext = (() => {
    if (!error || typeof error !== "object") return null;
    const candidate = (error as { context?: { text?: () => Promise<string> } }).context;
    if (!candidate || typeof candidate.text !== "function") return null;
    return candidate;
  })();

  if (error instanceof FunctionsHttpError || maybeContext) {
    const payloadText = await (maybeContext?.text?.() ?? Promise.resolve("")).catch(() => "");
    const payload = (() => {
      if (!payloadText) return null;
      try {
        return JSON.parse(payloadText) as {
          error?: string;
          status?: string;
          message?: string;
        };
      } catch {
        return null;
      }
    })();

    const status = String(payload?.status || "");
    if (status === "job_map_selection_required") {
      return "Choose at least one job map, then run research.";
    }
    if (status === "customer_job_map_required") {
      return "Include a customer job map so opportunities can anchor to the primary job performer.";
    }

    return String(payload?.message || payload?.error || payloadText || error.message);
  }

  return error instanceof Error ? error.message : String(error);
}

function shouldUseLocalMapFallback(message: string) {
  const text = String(message || "").toLowerCase();
  return (
    text.includes("missing openai_api_key") ||
    text.includes("edge function returned a non-2xx status code") ||
    text.includes("public baseline is not strong enough") ||
    text.includes("insufficient_public_evidence") ||
    text.includes("ambiguous_public_evidence") ||
    text.includes("customer_job_map_required")
  );
}

const LOCAL_ODI_STEP_SEED = [
  { label: "Define desired outcome", description: "Clarify the primary progress target and constraints before evaluating alternatives." },
  { label: "Locate best options", description: "Identify and compare available options relevant to this job context." },
  { label: "Prepare to execute", description: "Gather prerequisites, resources, and decision criteria needed to act." },
  { label: "Execute core action", description: "Perform the core action sequence that advances the job toward completion." },
  { label: "Monitor progress", description: "Track results, quality, and confidence signals while progressing through the job." },
  { label: "Adjust and conclude", description: "Resolve issues, confirm outcomes, and close the loop for repeatable success." },
];

function groupJourneys(items: JobStepRow[]): JourneyGroup[] {
  const byKey = new Map<string, JobStepRow[]>();
  for (const item of items) {
    const key = safeText(item.journey_key, "").toLowerCase();
    if (!key) continue;
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key)!.push(item);
  }

  const preferredOrder = ["customer", "revenue", "operations"];
  const orderedKeys = [
    ...preferredOrder.filter((key) => byKey.has(key)),
    ...Array.from(byKey.keys())
      .filter((key) => !preferredOrder.includes(key))
      .sort((a, b) => a.localeCompare(b)),
  ];

  return orderedKeys.map((key) => {
    const steps = (byKey.get(key) ?? []).slice().sort((a, b) => (a.step_number ?? 0) - (b.step_number ?? 0));
    const first = steps[0];
    return {
      key,
      title: safeText(first?.journey_title, key === "customer" || key === "revenue" || key === "operations" ? titleFromKey(key) : `Job Map: ${titleCaseFromKey(key)}`),
      subtitle: safeText(first?.journey_subtitle, key === "customer" || key === "revenue" || key === "operations" ? subtitleFromKey(key) : `How ${titleCaseFromKey(key).toLowerCase()} define, prepare, execute, monitor, and improve progress.`),
      steps,
    };
  });
}

function normalizeRoleLabel(value: string) {
  const cleaned = value
    .replace(/\s+/g, " ")
    .replace(/^[\s,.;:-]+|[\s,.;:-]+$/g, "")
    .trim();
  if (!cleaned) return "Core Audience";
  return cleaned.length > 48 ? `${cleaned.slice(0, 45).trim()}…` : cleaned;
}

function inferRevenueMapTitle(economicEngine: string, publicSignalText: string) {
  const text = `${economicEngine} ${publicSignalText}`.toLowerCase();
  if (/(investment|investor|capital|funding|raise)/.test(text)) {
    return "Job Map: Getting Financial Investment";
  }
  if (/(donor|grant|philanthrop)/.test(text)) {
    return "Job Map: Securing Donor and Grant Support";
  }
  if (/(referral|pipeline|conversion|enrollment)/.test(text)) {
    return "Job Map: Converting Qualified Demand";
  }
  return "Job Map: Securing Revenue Outcomes";
}

function inferSuggestedJourneyOptions(args: {
  baselineRun: any | null;
  journeys: JourneyGroup[];
  inputs: InputItem[];
  strategicProblems: Array<{ statement: string; status?: string; source?: string }>;
  whereToPlay?: string | null;
  howToWin?: string | null;
}): SuggestedJourneyOption[] {
  const existingJourneyKeys = new Set(args.journeys.map((journey) => journey.key));
  const baseline = args.baselineRun?.result_json as {
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
  } | null;

  const lens = baseline?.lens_card ?? {};
  const ledger = Array.isArray(baseline?.evidence_ledger) ? baseline.evidence_ledger : [];

  const uploadedSignalText = args.inputs
    .flatMap((input) => [
      input.input_key,
      input.input_label,
      input.sub_group,
      input.description,
      input.why_it_matters,
      ...input.files.flatMap((file) => [file.file_name, ...(file.tags ?? [])]),
    ])
    .join(" ")
    .toLowerCase();
  const strategicProblemText = args.strategicProblems
    .map((item) => String(item?.statement || ""))
    .join(" ")
    .toLowerCase();

  const publicSignalText = [
    String(lens.value_chain || ""),
    String(lens.economic_engine || ""),
    String(lens.adoption_constraints || ""),
    String(lens.risk_surface || ""),
    ...ledger.slice(0, 14).map((entry) => `${String(entry?.bucket || "")} ${String(entry?.snippet || "")}`),
    String(args.whereToPlay || ""),
    String(args.howToWin || ""),
    uploadedSignalText,
    strategicProblemText,
  ]
    .join(" ")
    .toLowerCase();

  const marketSignalText = [
    String(lens.user || ""),
    String(lens.primary_buyer || ""),
    String(lens.chooser || ""),
    String(lens.value_chain || ""),
    String(args.whereToPlay || ""),
    String(args.howToWin || ""),
    strategicProblemText,
  ]
    .join(" ")
    .toLowerCase();

  const fileSignals = args.inputs.flatMap((input) =>
    input.files.map((file) => ({
      fileName: String(file.file_name || ""),
      tags: (file.tags ?? []).map((tag) => String(tag || "")),
    })),
  );

  const matchingProblemSnippets = (matcher: RegExp) =>
    args.strategicProblems
      .map((problem) => String(problem?.statement || "").trim())
      .filter((statement) => matcher.test(statement))
      .map((statement) => statement.split(/\n+/)[0].trim())
      .filter(Boolean)
      .slice(0, 2);

  const matchingFileSnippets = (matcher: RegExp) =>
    fileSignals
      .map((file) => `${file.fileName} ${file.tags.join(" ")}`.trim())
      .filter((snippet) => matcher.test(snippet))
      .map((snippet) => snippet.split(/\s+/).slice(0, 10).join(" "))
      .slice(0, 2);

  const countMatches = (terms: string[]) =>
    terms.reduce((sum, term) => (publicSignalText.includes(term) ? sum + 1 : sum), 0);

  const options: SuggestedJourneyOption[] = [];
  const addOption = (option: SuggestedJourneyOption) => {
    if (existingJourneyKeys.has(option.key)) return;
    if (options.some((item) => item.key === option.key)) return;
    options.push(option);
  };

  if (!existingJourneyKeys.has("customer")) {
    const customerSignalRaw = safeText(lens.user || lens.primary_buyer || lens.chooser, "");
    const customerSignal = normalizeRoleLabel(customerSignalRaw || "Core Audience");
    addOption({
      key: "customer",
      title: `Job Map: ${customerSignal}`,
      subtitle: `How ${customerSignal.toLowerCase()} define, locate, prepare, execute, monitor, and conclude progress.`,
      confidence: customerSignalRaw ? 95 : 80,
      rationale: customerSignalRaw
        ? `Public signal identifies primary job performer context: ${customerSignalRaw}`
        : "Customer job map is required first and should define the core functional job performer.",
    });
  }

  if (!existingJourneyKeys.has("revenue")) {
    const revenueMatches = countMatches([
      "revenue",
      "pricing",
      "contract",
      "renewal",
      "payer",
      "reimbursement",
      "donor",
      "fundraising",
      "referral",
      "pipeline",
      "conversion",
    ]);
    const economicEngine = safeText(lens.economic_engine, "");
    const hasEconomicSignal =
      economicEngine.length > 0 && economicEngine.toLowerCase() !== "unknown";

    if (revenueMatches >= 2 || hasEconomicSignal) {
      const revenueTitle = inferRevenueMapTitle(economicEngine, publicSignalText);
      addOption({
        key: "revenue",
        title: revenueTitle,
        subtitle: "How the company secures, converts, and retains economic value for the chosen market.",
        confidence: Math.min(92, 50 + revenueMatches * 8 + (hasEconomicSignal ? 12 : 0)),
        rationale: hasEconomicSignal
          ? `Public signal in economic engine: ${economicEngine}`
          : "Public signals suggest monetization, funding, or referral conversion dynamics.",
      });
    }
  }

  if (!existingJourneyKeys.has("operations")) {
    const operationsMatches = countMatches([
      "operations",
      "delivery",
      "capacity",
      "workflow",
      "staffing",
      "compliance",
      "quality",
      "handoff",
      "throughput",
      "support",
      "service continuity",
    ]);
    const adoptionConstraints = safeText(lens.adoption_constraints, "");
    const riskSurface = safeText(lens.risk_surface, "");
    const hasOpsSignal =
      (adoptionConstraints.length > 0 && adoptionConstraints.toLowerCase() !== "unknown") ||
      (riskSurface.length > 0 && riskSurface.toLowerCase() !== "unknown");

    if (operationsMatches >= 2 || hasOpsSignal) {
      addOption({
        key: "operations",
        title: "Job Map: Delivering Consistent Service",
        subtitle: "How delivery systems coordinate define, prepare, execute, monitor, and adjust work at quality.",
        confidence: Math.min(92, 50 + operationsMatches * 8 + (hasOpsSignal ? 10 : 0)),
        rationale: hasOpsSignal
          ? `Public signal in constraints/risk: ${safeText(adoptionConstraints || riskSurface)}`
          : "Public signals suggest delivery, quality, or operational coordination risk.",
      });
    }
  }

  const audienceCandidates = new Set<string>();
  const hasCafeMarketSignal = /\bcafe|cafes|coffee|venue|venues|restaurant|restaurants\b/.test(marketSignalText);
  const hasCommercialSignal = /\bb2b\b|\bwholesale\b|\bdistribution\b|\bpartner\b|\bprocurement\b|\bbuyer\b/.test(marketSignalText);
  const cafeEvidenceMatcher = /\bcafe owner|cafe owners|coffee program|roaster|espresso|specialty venue|restaurant buyer|wholesale account\b/i;
  const cafeProblemSources = matchingProblemSnippets(cafeEvidenceMatcher);
  const cafeFileSources = matchingFileSnippets(cafeEvidenceMatcher);
  const hasCafeEvidenceSignal = cafeProblemSources.length > 0 || cafeFileSources.length > 0;
  if (hasCafeMarketSignal && (hasCommercialSignal || /\bcafe\b|\bcafes\b/.test(marketSignalText) || hasCafeEvidenceSignal)) {
    audienceCandidates.add("Cafe Owners and Specialty Venue Buyers");
  }
  if (/\binvestor|investment|capital raise|funding round\b/.test(marketSignalText)) {
    audienceCandidates.add("Investors and Investment Committee");
  }
  if (/\bfranchise|wholesale partner|distribution partner|channel partner\b/.test(marketSignalText)) {
    audienceCandidates.add("Channel and Distribution Partners");
  }

  for (const candidate of audienceCandidates) {
    const key = `customer-${candidate.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48)}`;
    const hasCafeCandidate = candidate === "Cafe Owners and Specialty Venue Buyers";
    const candidateEvidence = hasCafeCandidate
      ? [
          ...cafeProblemSources.map((source) => `Problem: ${source}`),
          ...cafeFileSources.map((source) => `File: ${source}`),
        ].slice(0, 3)
      : [];
    const rationale = hasCafeCandidate
      ? candidateEvidence.length > 0
        ? `Derived from uploaded/client evidence: ${candidateEvidence.join(" • ")}`
        : "Inferred from market context and uploaded/internal signals."
      : "Inferred from market context and uploaded/internal signals.";
    addOption({
      key,
      title: `Job Map: ${candidate}`,
      subtitle: `How ${candidate.toLowerCase()} define, evaluate, select, execute, and monitor progress.`,
      confidence: hasCafeCandidate && hasCafeEvidenceSignal ? 90 : 76,
      rationale,
    });
  }

  return options.sort((a, b) => b.confidence - a.confidence);
}

function TimelineRow({
  steps,
  color,
}: {
  steps: JobStepRow[];
  color: string;
}) {
  return (
    <div className="flex gap-3 px-5 py-4">
      {steps.map((step, index) => {
        const evidenced = step.evidence_status === "evidenced";
        const implied = step.evidence_status === "implied";
        const active = evidenced || implied || !!step.designed;
        const bg = evidenced ? color : implied ? `${color}B3` : c.empty;
        const text = evidenced || implied ? "#fff" : c.muted;

        return (
          <div key={step.id} className="w-[250px] shrink-0" style={{ width: STEP_CARD_WIDTH }}>
            <div className="flex items-center">
              <div
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full font-mono text-[12px] font-bold"
                style={{ background: bg, color: text }}
              >
                {step.step_number ?? "—"}
              </div>
              {index < steps.length - 1 ? (
                <div
                  className="ml-2 h-[3px] flex-1 rounded-full"
                  style={{ background: active ? `${color}40` : c.line }}
                />
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function StepCard({ step }: { step: JobStepRow }) {
  const evidenceTone =
    step.evidence_status === "evidenced"
      ? { label: "Evidenced", color: c.teal, bg: "#EEF6E7", border: "#BDD8CF" }
      : step.evidence_status === "implied"
        ? { label: "Implied", color: c.slate, bg: "#EDF4F6", border: "#C4D7DE" }
        : { label: "Unclear", color: c.gap, bg: "#FFF0E6", border: "#FFD1B4" };

  return (
    <div
      className="flex h-full w-[250px] shrink-0 flex-col overflow-hidden rounded-2xl"
      style={{
        width: STEP_CARD_WIDTH,
        background: c.paper,
        border: `1px solid ${step.has_gap ? "#E7C3A4" : c.line}`,
        boxShadow: step.has_gap ? "0 0 0 1px rgba(255,125,45,0.08) inset" : "none",
      }}
    >
      <div className="flex min-h-[440px] flex-1 flex-col p-4">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.12em]" style={{ color: c.muted }}>
            Step {step.step_number ?? "—"}
          </p>
          <p className="mt-2 font-sans text-[14px] font-bold leading-tight" style={{ color: c.charcoal }}>
            {safeText(step.step_label, "Untitled step")}
          </p>
          <p className="mt-2 font-sans text-[12px] leading-[1.55]" style={{ color: c.secondary }}>
            {safeText(step.description, "No description yet.")}
          </p>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span
            className="inline-flex items-center rounded-full border px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.08em]"
            style={{ color: evidenceTone.color, background: evidenceTone.bg, borderColor: evidenceTone.border }}
          >
            {evidenceTone.label}
          </span>
          <MetaBadge>Conf {step.evidence_confidence ?? 0}</MetaBadge>
        </div>

        <div
          className="mt-3 rounded-xl border px-3 py-2"
          style={{ borderColor: c.line, background: c.lineFaint, minHeight: STEP_DETAIL_BLOCK_HEIGHT }}
        >
          <p className="font-mono text-[10px] uppercase tracking-[0.08em]" style={{ color: c.muted }}>
            Evidence Basis
          </p>
          <p className="mt-1 font-sans text-[12px] leading-[1.55]" style={{ color: c.secondary }}>
            {safeText(step.evidence_basis, "No evidence rationale captured.")}
          </p>
        </div>

        {step.has_gap ? (
          <div
            className="mt-3 rounded-xl border px-3 py-2"
            style={{
              borderColor: "#E7C3A4",
              background: "#FFF7F0",
              minHeight: STEP_DETAIL_BLOCK_HEIGHT,
            }}
          >
            <p
              className="font-mono text-[10px] font-bold uppercase tracking-[0.1em]"
              style={{ color: c.gap }}
            >
              Gap Identified
            </p>
            <p
              className="mt-1 font-sans text-[12px] leading-[1.55]"
              style={{ color: c.gap }}
            >
              {safeText(step.gap_note, "Gap present, but no rationale captured yet.")}
            </p>
          </div>
        ) : (
          <div style={{ minHeight: STEP_DETAIL_BLOCK_HEIGHT }} className="mt-3" />
        )}
      </div>

      <div
        className="flex min-h-[34px] items-center border-t px-4 py-2"
        style={{ borderColor: c.line }}
      >
        {step.has_gap ? (
          <span className="flex items-center gap-1 font-mono text-[10px] font-bold uppercase tracking-[0.08em]" style={{ color: c.gap }}>
            <span className="inline-block h-2 w-2 rounded-full" style={{ background: c.gap }} />
            Gap
          </span>
        ) : (
          <span className="font-mono text-[10px] uppercase tracking-[0.08em]" style={{ color: c.muted }}>
            {step.designed ? "Designed" : evidenceTone.label}
          </span>
        )}
      </div>
    </div>
  );
}

function titleCaseJourney(key: string) {
  if (key === "customer") return "Customer";
  if (key === "revenue") return "Revenue";
  if (key === "operations") return "Operations";
  return titleCaseFromKey(key);
}

function OdiContextSection({
  marketDefinition,
  marketContext,
}: {
  marketDefinition: OdiMarketDefinitionRow | null;
  marketContext?: string;
}) {
  const jobExecutor = safeText(marketDefinition?.job_executor, "Unknown from stored ODI definition");
  const chooser = safeText(marketDefinition?.chooser, "Unknown from stored ODI definition");
  const jtbd = safeText(
    marketDefinition?.jtbd,
    "Understand and complete the core job progress for this offering"
  );
  const market = safeText(marketContext, "No market context captured yet.");

  return (
    <section
      className="rounded-[28px] border px-6 py-6"
      style={{ borderColor: c.line, background: c.panel }}
    >
      <div className="mb-5">
        <div className="flex items-center gap-2">
          <h2 className="font-sans text-[24px] font-semibold" style={{ color: c.charcoal }}>
            ODI Needs & Market Context
          </h2>
          <MetaBadge>Public only</MetaBadge>
        </div>
        <p className="mt-1 max-w-4xl font-sans text-[14px]" style={{ color: c.secondary }}>
          This is a first-pass ODI layer inferred from public evidence and generated opportunity data. Later it can absorb interviews,
          meeting notes, and client documents to sharpen the needs structure.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <div className="rounded-2xl border p-4" style={{ borderColor: c.line, background: c.paper }}>
          <p className="font-mono text-[10px] uppercase tracking-[0.1em]" style={{ color: c.muted }}>
            Market Context
          </p>
          <p className="mt-2 font-sans text-[13px] leading-[1.55]" style={{ color: c.secondary }}>
            {market}
          </p>
        </div>

        <div className="rounded-2xl border p-4" style={{ borderColor: c.line, background: c.paper }}>
          <p className="font-mono text-[10px] uppercase tracking-[0.1em]" style={{ color: c.muted }}>
            Job Executor
          </p>
          <p className="mt-2 font-sans text-[15px] font-semibold" style={{ color: c.charcoal }}>
            {jobExecutor}
          </p>
          <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.1em]" style={{ color: c.muted }}>
            Chooser
          </p>
          <p className="mt-2 font-sans text-[13px]" style={{ color: c.secondary }}>
            {chooser}
          </p>
        </div>

        <div className="rounded-2xl border p-4 lg:col-span-1" style={{ borderColor: c.line, background: c.paper }}>
          <p className="font-mono text-[10px] uppercase tracking-[0.1em]" style={{ color: c.muted }}>
            Job to Be Done
          </p>
          <p className="mt-2 font-sans text-[15px] font-semibold leading-[1.45]" style={{ color: c.charcoal }}>
            {jtbd}
          </p>
          <p className="mt-2 font-sans text-[13px] leading-[1.6]" style={{ color: c.secondary }}>
            ODI needs should be written as stable, solution-free desired outcome statements. The current set and its scores are inferred from public evidence and generated opportunity data, not from validated ODI survey responses.
          </p>
        </div>
      </div>
    </section>
  );
}

function OdiNeedsListSection({ needs }: { needs: OdiNeedRow[] }) {
  const needItems = [...needs].sort((a, b) => {
    const scoreDiff = (b.opportunity_score ?? 0) - (a.opportunity_score ?? 0);
    if (scoreDiff !== 0) return scoreDiff;
    return (b.importance ?? 0) - (a.importance ?? 0);
  });

  return (
    <section
      className="rounded-[28px] border px-6 py-6"
      style={{ borderColor: c.line, background: c.panel }}
    >
      <div
        className="rounded-2xl border overflow-hidden"
        style={{ borderColor: c.line, background: c.paper }}
      >
        <div className="h-[5px] w-full" style={{ background: c.coral }} />
        <div className="p-4">
          <div className="mb-3">
            <h3 className="font-sans text-[20px] font-semibold" style={{ color: c.charcoal }}>
              Needs
            </h3>
            <p className="mt-1 font-sans text-[13px]" style={{ color: c.secondary }}>
              Desired outcome statements inferred from public evidence. These should follow ODI logic: solution-free, stable over time, and measurable in spirit. Importance and satisfaction below are estimated placeholders until interview or survey data exists.
            </p>
          </div>

          {needItems.length === 0 ? (
            <p className="font-sans text-[13px]" style={{ color: c.secondary }}>
              No ODI needs identified yet from public evidence.
            </p>
          ) : (
            <div className="space-y-3">
              {needItems.map((item) => (
                <div
                  key={item.id}
                  className="rounded-xl border p-3"
                  style={{ borderColor: c.line, background: c.card }}
                >
                  <p className="font-sans text-[13px] font-semibold leading-[1.45]" style={{ color: c.charcoal }}>
                    {item.desired_outcome}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <StateBadge tone={item.service_state} />
                    <MetaBadge>{titleCaseJourney(item.journey_key)}</MetaBadge>
                    <MetaBadge>{item.step_label || "Unassigned step"}</MetaBadge>
                    <ScoreChip label="Est. I" value={item.importance} />
                    <ScoreChip label="Est. S" value={item.satisfaction} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function JourneySection({
  journey,
  onRemove,
  removing,
}: {
  journey: JourneyGroup;
  onRemove: (key: JourneyKey) => void;
  removing: boolean;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const style = JOURNEY_STYLE[journey.key] ?? fallbackStyleForJourney(journey.key);
  const { rail, dot, preview } = style;
  const designedCount = journey.steps.filter((step) => step.designed).length;
  const evidencedCount = journey.steps.filter((step) => step.evidence_status === "evidenced").length;
  const gapsCount = journey.steps.filter((step) => step.has_gap).length;

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const checkScroll = () => {
      setCanScrollLeft(el.scrollLeft > 4);
      setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
    };

    checkScroll();
    el.addEventListener("scroll", checkScroll);
    window.addEventListener("resize", checkScroll);

    return () => {
      el.removeEventListener("scroll", checkScroll);
      window.removeEventListener("resize", checkScroll);
    };
  }, [journey.steps.length]);

  const scrollByCards = (direction: -1 | 1) => {
    scrollRef.current?.scrollBy({ left: direction * 340, behavior: "smooth" });
  };

  return (
    <section
      className="overflow-hidden rounded-[28px] border p-0"
      style={{
        background: "#FFFFFF",
        borderColor: c.line,
        boxShadow: "0 1px 2px rgba(0,0,0,0.03)",
      }}
    >
      <div className="h-full w-[6px]" style={{ background: rail, float: "left" }} />
      <div className="ml-[6px] px-6 py-6">
        <div className="mb-3 flex items-start justify-between gap-4">
          <div>
            {preview ? (
              <div
                className="mb-2 inline-flex rounded-sm px-2 py-1 font-mono text-[10px] uppercase tracking-[0.08em]"
                style={{ background: "#2c2925", color: "#fff" }}
              >
                {preview}
              </div>
            ) : null}
            <h2 className="font-sans text-[24px] font-semibold leading-tight" style={{ color: c.charcoal }}>
              {journey.title}
            </h2>
            <p className="mt-1 max-w-4xl font-sans text-[14px]" style={{ color: c.secondary }}>
              {journey.subtitle}
            </p>
          </div>

          <div className="mt-1 flex items-center gap-5 whitespace-nowrap">
            <span className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.08em]" style={{ color: c.secondary }}>
              <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: c.designedDot }} />
              {designedCount} designed
            </span>
            <span className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.08em]" style={{ color: c.secondary }}>
              <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: c.teal }} />
              {evidencedCount} evidenced
            </span>
            <span className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.08em]" style={{ color: c.secondary }}>
              <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: c.gap }} />
              {gapsCount} gaps
            </span>
            <button
              type="button"
              onClick={() => onRemove(journey.key)}
              disabled={removing}
              className="rounded-full border px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.08em] disabled:opacity-50"
              style={{ borderColor: c.line, color: c.secondary, background: c.card }}
            >
              {removing ? "Removing…" : "Remove Map"}
            </button>
          </div>
        </div>

        <div className="relative mt-1">
          {canScrollLeft ? (
            <button
              type="button"
              aria-label="Scroll left"
              onClick={() => scrollByCards(-1)}
              className="absolute left-2 top-1/2 z-10 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border"
              style={{ background: c.card, borderColor: c.line, color: c.secondary }}
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
          ) : null}

          <div ref={scrollRef} className="overflow-x-auto pb-1">
            <div className="inline-block min-w-full">
              <TimelineRow steps={journey.steps} color={dot} />

              <div className="flex gap-3 px-5">
              {journey.steps.map((step) => (
                <StepCard key={step.id} step={step} />
              ))}
              </div>
            </div>
          </div>

          {canScrollRight ? (
            <button
              type="button"
              aria-label="Scroll right"
              onClick={() => scrollByCards(1)}
              className="absolute right-2 top-1/2 z-10 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border"
              style={{ background: c.card, borderColor: c.line, color: c.secondary }}
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function SuggestedMapsSection({
  options,
  drafts,
  onDraftChange,
  onAddMap,
  runningKey,
}: {
  options: SuggestedJourneyOption[];
  drafts: JourneyDraftMap;
  onDraftChange: (key: string, field: "title" | "subtitle", value: string) => void;
  onAddMap: (key: string) => void;
  runningKey: string | null;
}) {
  if (options.length === 0) return null;

  return (
    <section
      className="rounded-[24px] border px-6 py-5"
      style={{ borderColor: c.line, background: c.panel }}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-sans text-[18px] font-semibold" style={{ color: c.charcoal }}>
            Choose Job Maps
          </p>
          <p className="mt-1 font-sans text-[13px]" style={{ color: c.secondary }}>
            Add maps one at a time. You can edit title/subtitle first, then click add.
          </p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
        {options.map((option) => (
          <div
            key={option.key}
            className="rounded-xl border p-3"
            style={{ borderColor: c.line, background: c.paper }}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <MetaBadge>{titleCaseJourney(option.key)}</MetaBadge>
              <ScoreChip label="Confidence" value={option.confidence} />
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <p className="font-sans text-[14px] font-semibold" style={{ color: c.charcoal }}>
                {drafts[option.key]?.title || option.title}
              </p>
              <MetaBadge>Public signal</MetaBadge>
            </div>
            <p className="mt-2 font-sans text-[12px] leading-[1.5]" style={{ color: c.secondary }}>
              {option.rationale}
            </p>
            <div className="mt-3 grid grid-cols-1 gap-2">
              <input
                value={drafts[option.key]?.title || option.title}
                onChange={(event) => onDraftChange(option.key, "title", event.target.value)}
                className="w-full rounded-lg border px-2.5 py-2 font-sans text-[12px] outline-none"
                style={{ borderColor: c.line, color: c.charcoal, background: "#fff" }}
                placeholder="Map title"
              />
              <textarea
                value={drafts[option.key]?.subtitle || option.subtitle}
                onChange={(event) => onDraftChange(option.key, "subtitle", event.target.value)}
                className="min-h-[62px] w-full rounded-lg border px-2.5 py-2 font-sans text-[12px] outline-none"
                style={{ borderColor: c.line, color: c.secondary, background: "#fff" }}
                placeholder="Map subtitle"
              />
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <span />
              <button
                type="button"
                onClick={() => onAddMap(option.key)}
                disabled={runningKey !== null}
                className="rounded-full border px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.08em] disabled:opacity-50"
                style={{ borderColor: c.line, color: c.secondary, background: c.card }}
              >
                {runningKey === option.key ? "Adding…" : "Add Map"}
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export default function JobStepsView() {
  const { activeCompany } = useCompany();
  const activeCompanyId = activeCompany?.id ?? null;
  const {
    loading,
    items,
    error,
    removingJourneyKey,
    removeJourneyMap,
    refetch: refetchJobSteps,
  } = useJobSteps(activeCompanyId ?? undefined);
  const { run: baselineRun, refetch: refetchBaseline } = usePublicBaseline(activeCompanyId ?? undefined);
  const { item: strategyCascade } = useStrategyCascade(activeCompanyId ?? undefined);
  const { items: strategicProblems } = useStrategicProblems(activeCompanyId ?? undefined);
  const { query: inputsQuery } = useInputs(activeCompanyId ?? undefined);
  const { marketDefinition, needs } = useOdiNeeds(activeCompanyId ?? undefined);
  const { signals: sourceSignals } = useSourceConfidence({
    companyId: activeCompanyId ?? undefined,
    areaScoresJson: activeCompany?.area_scores_json,
  });
  const [journeyDrafts, setJourneyDrafts] = useState<JourneyDraftMap>({});
  const [customMapDraft, setCustomMapDraft] = useState({ key: "", title: "", subtitle: "" });
  const [runningJourneyKey, setRunningJourneyKey] = useState<string | null>(null);
  const [showChooseMaps, setShowChooseMaps] = useState(true);
  const [showCustomMapForm, setShowCustomMapForm] = useState(false);
  const [recentlyRemovedKeysByCompany, setRecentlyRemovedKeysByCompany] = useState<Record<string, string[]>>({});

  const scopedBaselineRun = useMemo(() => {
    if (!activeCompanyId || !baselineRun) return null;
    return baselineRun?.company_id === activeCompanyId ? baselineRun : null;
  }, [activeCompanyId, baselineRun]);

  const recentlyRemovedKeys = useMemo(() => {
    if (!activeCompanyId) return [];
    return recentlyRemovedKeysByCompany[activeCompanyId] ?? [];
  }, [activeCompanyId, recentlyRemovedKeysByCompany]);

  useEffect(() => {
    setJourneyDrafts({});
    setCustomMapDraft({ key: "", title: "", subtitle: "" });
    setRunningJourneyKey(null);
    setShowChooseMaps(true);
    setShowCustomMapForm(false);
  }, [activeCompanyId]);

  const journeys = useMemo(() => groupJourneys(items), [items]);
  const totalGaps = useMemo(
    () => journeys.reduce((sum, journey) => sum + journey.steps.filter((step) => step.has_gap).length, 0),
    [journeys]
  );
  const suggestedJourneyOptions = useMemo(() => {
    const inferred = inferSuggestedJourneyOptions({
      baselineRun: scopedBaselineRun,
      journeys,
      inputs: inputsQuery.data ?? [],
      strategicProblems,
      whereToPlay: strategyCascade?.where_to_play ?? "",
      howToWin: strategyCascade?.how_to_win ?? "",
    });
    const byKey = new Map<JourneyKey, SuggestedJourneyOption>(inferred.map((option) => [option.key, option]));
    for (const key of recentlyRemovedKeys) {
      if (!byKey.has(key)) {
        byKey.set(key, {
          key,
          title: titleFromKey(key),
          subtitle: subtitleFromKey(key),
          confidence: 70,
          rationale: "Previously removed map. Add it again any time.",
        });
      }
    }
    return Array.from(byKey.values()).sort((a, b) => b.confidence - a.confidence);
  }, [scopedBaselineRun, journeys, recentlyRemovedKeys, inputsQuery.data, strategicProblems, strategyCascade?.where_to_play, strategyCascade?.how_to_win]);
  useEffect(() => {
    setJourneyDrafts((previous) => {
      const next = { ...previous };
      for (const option of suggestedJourneyOptions) {
        const current = next[option.key] || { title: "", subtitle: "" };
        next[option.key] = {
          title: safeText(current.title, option.title),
          subtitle: safeText(current.subtitle, option.subtitle),
        };
      }
      return next;
    });
  }, [suggestedJourneyOptions]);

  const updateJourneyDraft = (key: string, field: "title" | "subtitle", value: string) => {
    setJourneyDrafts((previous) => ({
      ...previous,
      [key]: {
        ...previous[key],
        [field]: value,
      },
    }));
  };

  const insertLocalDraftMap = async (args: {
    key: string;
    title: string;
    subtitle: string;
  }) => {
    if (!activeCompanyId) throw new Error("No active company selected.");
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData?.user?.id) {
      throw new Error("Sign in required to add a local job map draft.");
    }

    const { data: existingRows, error: existingErr } = await supabase
      .from("job_steps")
      .select("id")
      .eq("company_id", activeCompanyId)
      .eq("journey_key", args.key)
      .limit(1);
    if (existingErr) throw new Error(existingErr.message || "Failed to verify existing map.");
    if ((existingRows ?? []).length > 0) return false;

    const rows = LOCAL_ODI_STEP_SEED.map((seed, index) => ({
      company_id: activeCompanyId,
      user_id: authData.user.id,
      journey_key: args.key,
      journey_title: args.title,
      journey_subtitle: args.subtitle,
      step_number: index + 1,
      step_label: seed.label,
      description: seed.description,
      designed: false,
      has_gap: true,
      evidence_status: "unclear",
      evidence_basis: "Local draft step generated without external model run.",
      evidence_confidence: 20,
      gap_note: "Awaiting evidence-backed research and validation.",
    }));

    const { error: insertErr } = await supabase.from("job_steps").insert(rows);
    if (insertErr) throw new Error(insertErr.message || "Failed to insert local job map draft.");
    return true;
  };

  const runAddMap = async (args: {
    key: string;
    title?: string;
    subtitle?: string;
    source?: "suggested" | "custom";
  }) => {
    if (!activeCompany?.id) {
      toast.error("Select a company before running journey research.");
      return;
    }
    const key = normalizeJourneyKey(args.key);
    if (!key) {
      toast.error("Enter a valid map key.");
      return;
    }

    try {
      setRunningJourneyKey(key);
      const jobMap = {
        journey_key: key,
        journey_title: safeText(args.title, titleFromKey(key)),
        journey_subtitle: safeText(args.subtitle, subtitleFromKey(key)),
        source: args.source || "custom",
      };
      const existingCustomerJourney = journeys.find((journey) => journey.key === "customer");
      const customerSupportMap =
        key !== "customer" && existingCustomerJourney
          ? {
              journey_key: "customer",
              journey_title: safeText(existingCustomerJourney.title, titleFromKey("customer")),
              journey_subtitle: safeText(existingCustomerJourney.subtitle, subtitleFromKey("customer")),
              source: "existing" as const,
            }
          : null;
      const jobMapsPayload = customerSupportMap ? [customerSupportMap, jobMap] : [jobMap];

      const { data, error: invokeError } = await supabase.functions.invoke("research-company", {
        body: {
          company_id: activeCompany.id,
          company_name: activeCompany.name,
          website: activeCompany.website ?? "",
          journeys_to_generate: [key],
          job_maps: jobMapsPayload,
        },
      });

      if (invokeError) {
        const invokeMessage = await describeJobMapInvokeError(invokeError);
        if (shouldUseLocalMapFallback(invokeMessage)) {
          const inserted = await insertLocalDraftMap({
            key,
            title: jobMap.journey_title,
            subtitle: jobMap.journey_subtitle,
          });
          await Promise.all([refetchJobSteps(), refetchBaseline()]);
          if (inserted) {
            toast.success(`${titleCaseJourney(key)} map added as a local draft.`);
            toast.message("Run full AI Research later to generate evidence-backed steps and opportunities.");
          } else {
            toast.message(`${titleCaseJourney(key)} map already exists.`);
          }
          return;
        }
        throw new Error(invokeMessage);
      }
      if (data?.error) {
        throw new Error(String(data.message || data.error));
      }

      await Promise.all([refetchJobSteps(), refetchBaseline()]);
      if (activeCompanyId) {
        setRecentlyRemovedKeysByCompany((previous) => ({
          ...previous,
          [activeCompanyId]: (previous[activeCompanyId] ?? []).filter((removed) => removed !== key),
        }));
      }
      toast.success(`${titleCaseJourney(key)} map added.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add job map.");
    } finally {
      setRunningJourneyKey(null);
    }
  };

  const addMap = async (key: string) => {
    const draft = journeyDrafts[key];
    const suggested = suggestedJourneyOptions.find((option) => option.key === key);
    const fallbackTitle = suggested?.title || titleFromKey(key);
    const fallbackSubtitle = suggested?.subtitle || subtitleFromKey(key);
    await runAddMap({
      key,
      title: safeText(draft?.title, fallbackTitle),
      subtitle: safeText(draft?.subtitle, fallbackSubtitle),
      source: draft?.title || draft?.subtitle ? "custom" : "suggested",
    });
  };

  const addCustomMap = async () => {
    const derivedKey = normalizeJourneyKey(customMapDraft.key || customMapDraft.title);
    if (!derivedKey) {
      toast.error("Enter a custom map key or title.");
      return;
    }
    await runAddMap({
      key: derivedKey,
      title: safeText(customMapDraft.title, titleFromKey(derivedKey)),
      subtitle: safeText(customMapDraft.subtitle, subtitleFromKey(derivedKey)),
      source: "custom",
    });
    setCustomMapDraft({ key: "", title: "", subtitle: "" });
  };

  const handleRemoveJourneyMap = async (key: string) => {
    if (!activeCompany?.id) {
      toast.error("Select a company before removing a job map.");
      return;
    }

    const confirmed = window.confirm(
      `Remove the ${titleCaseJourney(key)} job map from this company? This deletes its current step map.`,
    );
    if (!confirmed) return;

    try {
      await removeJourneyMap(key);
      if (activeCompanyId) {
        setRecentlyRemovedKeysByCompany((previous) => {
          const current = previous[activeCompanyId] ?? [];
          return {
            ...previous,
            [activeCompanyId]: current.includes(key) ? current : [...current, key],
          };
        });
      }
      toast.success(
        key === "customer"
          ? "Customer job map and related opportunities, ODI needs, outcomes, and routes removed."
          : `${titleCaseJourney(key)} job map and related opportunities/ODI needs removed.`,
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to remove job map.");
    }
  };

  return (
    <div
      className="min-h-screen"
      style={{
        background: c.bg,
        backgroundImage:
          'url("data:image/svg+xml,%3Csvg width=\'6\' height=\'6\' viewBox=\'0 0 6 6\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cg fill=\'%23000\' fill-opacity=\'0.025\'%3E%3Cpath d=\'M5 0h1L0 5V4zM6 5v1H5z\'/%3E%3C/g%3E%3C/svg%3E")',
      }}
    >
      <TopNav />

      <main className="max-w-[1440px] mx-auto px-4 pb-12 pt-6 sm:px-6 md:px-8">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <div className="font-mono text-[11px] uppercase tracking-[0.08em]" style={{ color: c.muted }}>
              {activeCompany?.name || "No company selected"}
            </div>
          <h1 className="mt-1 font-sans text-[28px] font-semibold" style={{ color: c.charcoal }}>
            Job Steps Map
          </h1>
          <p className="mt-1 font-sans text-[14px]" style={{ color: c.secondary }}>
            Select and define ODI-style job maps first, then run research to generate steps and aligned opportunities.
          </p>
        </div>

          <div className="flex flex-col items-end gap-2">
            <div className="flex flex-wrap items-center justify-end gap-2">
              <MetaBadge>
                {activeCompany?.last_scored_at
                  ? `Updated ${new Date(activeCompany.last_scored_at).toLocaleDateString()}`
                  : "Awaiting research"}
              </MetaBadge>
              <SourceLegend signals={sourceSignals} />
            </div>
            <Link
              to="/"
              className="rounded-full border px-4 py-2 font-mono text-[11px] uppercase tracking-[0.08em]"
              style={{ borderColor: c.line, color: c.secondary, background: c.card }}
            >
              Back to Map
            </Link>
          </div>
        </div>

        <AiBoundaryNote
          label="Public Research"
          tone="public"
          className="mb-6 max-w-[780px]"
          detail="Map suggestions are inferred from public baseline signals. No job map is generated until you explicitly choose or define it."
        />

        {!activeCompany?.id ? (
          <div
            className="rounded-[24px] border px-6 py-12 text-center"
            style={{ borderColor: c.line, background: c.panel }}
          >
            <p className="font-sans text-[15px]" style={{ color: c.secondary }}>
              Select a company to view its job-step journey map.
            </p>
          </div>
        ) : loading ? (
          <div
            className="rounded-[24px] border px-6 py-12 text-center"
            style={{ borderColor: c.line, background: c.panel }}
          >
            <p className="font-mono text-[12px] uppercase tracking-[0.08em]" style={{ color: c.muted }}>
              Loading job steps…
            </p>
          </div>
        ) : error ? (
          <div
            className="rounded-[24px] border px-6 py-12 text-center"
            style={{ borderColor: c.line, background: c.panel }}
          >
            <p className="font-sans text-[15px]" style={{ color: c.gap }}>
              Failed to load job steps: {error}
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            <OdiContextSection
              marketDefinition={marketDefinition}
              marketContext={strategyCascade?.where_to_play}
            />

            <section
              className="rounded-[24px] border px-6 py-5"
              style={{ borderColor: c.line, background: c.panel }}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-sans text-[18px] font-semibold" style={{ color: c.charcoal }}>
                    Job Map Selection
                  </p>
                  <p className="mt-1 font-sans text-[13px]" style={{ color: c.secondary }}>
                    Selected maps are shown first. Choose suggested maps or add a custom one as needed.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowChooseMaps((current) => !current)}
                    className="rounded-full border px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.08em]"
                    style={{ borderColor: c.line, color: c.secondary, background: c.card }}
                  >
                    {showChooseMaps ? "Hide Choose Job Maps" : "Show Choose Job Maps"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowCustomMapForm((current) => !current)}
                    className="rounded-full border px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.08em]"
                    style={{ borderColor: c.line, color: c.secondary, background: c.card }}
                  >
                    {showCustomMapForm ? "Hide Add Custom" : "Show Add Custom"}
                  </button>
                </div>
              </div>

              <div className="mt-4 rounded-xl border px-4 py-3" style={{ borderColor: c.line, background: c.paper }}>
                <p className="font-mono text-[10px] uppercase tracking-[0.1em]" style={{ color: c.muted }}>
                  Selected Job Maps
                </p>
                {journeys.length === 0 ? (
                  <p className="mt-2 font-sans text-[13px]" style={{ color: c.secondary }}>
                    No job map selected yet.
                  </p>
                ) : (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {journeys.map((journey) => (
                      <span
                        key={`selected-${journey.key}`}
                        className="rounded-full border px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.08em]"
                        style={{ borderColor: c.line, color: c.secondary, background: "#fff" }}
                      >
                        {journey.title}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {showChooseMaps ? (
                <div className="mt-4">
                  <SuggestedMapsSection
                    options={suggestedJourneyOptions}
                    drafts={journeyDrafts}
                    onDraftChange={updateJourneyDraft}
                    onAddMap={addMap}
                    runningKey={runningJourneyKey}
                  />
                </div>
              ) : null}

              {showCustomMapForm ? (
                <div className="mt-4 rounded-xl border p-4" style={{ borderColor: c.line, background: c.paper }}>
                  <p className="font-mono text-[10px] uppercase tracking-[0.1em]" style={{ color: c.muted }}>
                    Add Custom Job Map
                  </p>
                  <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-3">
                    <input
                      value={customMapDraft.key}
                      onChange={(event) => setCustomMapDraft((prev) => ({ ...prev, key: event.target.value }))}
                      className="w-full rounded-lg border px-2.5 py-2 font-sans text-[12px] outline-none"
                      style={{ borderColor: c.line, color: c.charcoal, background: "#fff" }}
                      placeholder="Map key (optional, e.g. cafe-owner)"
                    />
                    <input
                      value={customMapDraft.title}
                      onChange={(event) => setCustomMapDraft((prev) => ({ ...prev, title: event.target.value }))}
                      className="w-full rounded-lg border px-2.5 py-2 font-sans text-[12px] outline-none"
                      style={{ borderColor: c.line, color: c.charcoal, background: "#fff" }}
                      placeholder="Map title (e.g. Job Map: Cafe Owner Buying)"
                    />
                    <input
                      value={customMapDraft.subtitle}
                      onChange={(event) => setCustomMapDraft((prev) => ({ ...prev, subtitle: event.target.value }))}
                      className="w-full rounded-lg border px-2.5 py-2 font-sans text-[12px] outline-none"
                      style={{ borderColor: c.line, color: c.secondary, background: "#fff" }}
                      placeholder="Subtitle"
                    />
                  </div>

                  <div className="mt-3 flex justify-end">
                    <button
                      type="button"
                      onClick={addCustomMap}
                      disabled={runningJourneyKey !== null}
                      className="rounded-full border px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.08em] disabled:opacity-50"
                      style={{ borderColor: c.line, color: c.secondary, background: c.card }}
                    >
                      {runningJourneyKey ? "Adding…" : "Add Custom Map"}
                    </button>
                  </div>
                </div>
              ) : null}
            </section>

            {journeys.length === 0 ? (
              <div
                className="rounded-[24px] border px-6 py-12 text-center"
                style={{ borderColor: c.line, background: c.panel }}
              >
                <p className="font-sans text-[15px]" style={{ color: c.secondary }}>
                  No job map exists yet. Choose or define at least one map above, then run research.
                </p>
              </div>
            ) : (
              <>
                {journeys.map((journey) => (
                  <JourneySection
                    key={journey.key}
                    journey={journey}
                    onRemove={handleRemoveJourneyMap}
                    removing={removingJourneyKey === journey.key}
                  />
                ))}

                <div
                  className="rounded-[24px] border px-6 py-5"
                  style={{ borderColor: c.line, background: c.panel }}
                >
                  <p className="font-sans text-[14px] leading-[1.6]" style={{ color: c.secondary }}>
                    <strong style={{ color: c.charcoal }}>{totalGaps} steps have active gaps</strong> across the current map{journeys.length === 1 ? "" : "s"}.
                    Use this page to confirm the sequence and then move to Inputs and Opportunities to close the highest-impact issues.
                  </p>
                </div>
              </>
            )}

            <OdiNeedsListSection needs={needs} />
          </div>
        )}
      </main>
    </div>
  );
}
