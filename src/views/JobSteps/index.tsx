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
import { useSourceConfidence } from "@/hooks/useSourceConfidence";
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

type JourneyKey = "customer" | "revenue" | "operations";

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

type JourneyDraftMap = Record<JourneyKey, { title: string; subtitle: string }>;

const JOURNEY_STYLE: Record<
  JourneyKey,
  { rail: string; dot: string; preview?: string }
> = {
  customer: { rail: c.coral, dot: c.coral },
  revenue: { rail: c.teal, dot: c.teal, preview: "Project preview" },
  operations: { rail: c.slate, dot: c.slate },
};

function safeText(value: string | null | undefined, fallback = "") {
  return value?.trim() || fallback;
}

function titleFromKey(key: JourneyKey) {
  if (key === "customer") return "Customer Journey";
  if (key === "revenue") return "Revenue Journey";
  return "Operations Journey";
}

function subtitleFromKey(key: JourneyKey) {
  if (key === "customer") return "How a customer experiences the end-to-end service.";
  if (key === "revenue") return "How the company secures and grows revenue.";
  return "How the company builds and operates the service.";
}

async function describeJobMapInvokeError(error: unknown) {
  if (error instanceof FunctionsHttpError) {
    const payloadText = await error.context.text().catch(() => "");
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

function groupJourneys(items: JobStepRow[]): JourneyGroup[] {
  const order: JourneyKey[] = ["customer", "revenue", "operations"];

  return order
    .map((key) => {
      const steps = items
        .filter((item) => item.journey_key === key)
        .sort((a, b) => (a.step_number ?? 0) - (b.step_number ?? 0));

      if (steps.length === 0) return null;

      const first = steps[0];
      return {
        key,
        title: safeText(first.journey_title, titleFromKey(key)),
        subtitle: safeText(first.journey_subtitle, subtitleFromKey(key)),
        steps,
      };
    })
    .filter((group): group is JourneyGroup => group !== null);
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

  const publicSignalText = [
    String(lens.value_chain || ""),
    String(lens.economic_engine || ""),
    String(lens.adoption_constraints || ""),
    String(lens.risk_surface || ""),
    ...ledger.slice(0, 14).map((entry) => `${String(entry?.bucket || "")} ${String(entry?.snippet || "")}`),
  ]
    .join(" ")
    .toLowerCase();

  const countMatches = (terms: string[]) =>
    terms.reduce((sum, term) => (publicSignalText.includes(term) ? sum + 1 : sum), 0);

  const options: SuggestedJourneyOption[] = [];

  if (!existingJourneyKeys.has("customer")) {
    const customerSignalRaw = safeText(lens.user || lens.primary_buyer || lens.chooser, "");
    const customerSignal = normalizeRoleLabel(customerSignalRaw || "Core Audience");
    options.push({
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
      options.push({
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
      options.push({
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
  return key;
}

function OdiNeedsSection({
  marketDefinition,
  needs,
}: {
  marketDefinition: OdiMarketDefinitionRow | null;
  needs: OdiNeedRow[];
}) {
  const jobExecutor = safeText(marketDefinition?.job_executor, "Unknown from stored ODI definition");
  const chooser = safeText(marketDefinition?.chooser, "Unknown from stored ODI definition");
  const jtbd = safeText(
    marketDefinition?.jtbd,
    "Understand and complete the core job progress for this offering"
  );

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
      <div className="mb-5">
        <div className="flex items-center gap-2">
          <h2 className="font-sans text-[24px] font-semibold" style={{ color: c.charcoal }}>
            ODI Needs
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

        <div className="rounded-2xl border p-4 lg:col-span-2" style={{ borderColor: c.line, background: c.paper }}>
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

      <div
        className="mt-5 rounded-2xl border overflow-hidden"
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

  const { rail, dot, preview } = JOURNEY_STYLE[journey.key];
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
  hasCustomerJourney,
}: {
  options: SuggestedJourneyOption[];
  drafts: JourneyDraftMap;
  onDraftChange: (key: JourneyKey, field: "title" | "subtitle", value: string) => void;
  onAddMap: (key: JourneyKey) => void;
  runningKey: JourneyKey | null;
  hasCustomerJourney: boolean;
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
              {!hasCustomerJourney && option.key !== "customer" ? (
                <p className="font-sans text-[12px]" style={{ color: c.secondary }}>
                  Add customer map first.
                </p>
              ) : (
                <span />
              )}
              <button
                type="button"
                onClick={() => onAddMap(option.key)}
                disabled={runningKey !== null || (!hasCustomerJourney && option.key !== "customer")}
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
  const {
    loading,
    items,
    error,
    removingJourneyKey,
    removeJourneyMap,
    refetch: refetchJobSteps,
  } = useJobSteps(activeCompany?.id);
  const { run: baselineRun, refetch: refetchBaseline } = usePublicBaseline(activeCompany?.id);
  const { marketDefinition, needs } = useOdiNeeds(activeCompany?.id);
  const { signals: sourceSignals } = useSourceConfidence({
    companyId: activeCompany?.id,
    areaScoresJson: activeCompany?.area_scores_json,
  });
  const [journeyDrafts, setJourneyDrafts] = useState<JourneyDraftMap>({
    customer: { title: "", subtitle: "" },
    revenue: { title: "", subtitle: "" },
    operations: { title: "", subtitle: "" },
  });
  const [runningJourneyKey, setRunningJourneyKey] = useState<JourneyKey | null>(null);
  const [recentlyRemovedKeys, setRecentlyRemovedKeys] = useState<JourneyKey[]>([]);

  const journeys = useMemo(() => groupJourneys(items), [items]);
  const totalGaps = useMemo(
    () => journeys.reduce((sum, journey) => sum + journey.steps.filter((step) => step.has_gap).length, 0),
    [journeys]
  );
  const suggestedJourneyOptions = useMemo(() => {
    const inferred = inferSuggestedJourneyOptions({ baselineRun, journeys });
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
  }, [baselineRun, journeys, recentlyRemovedKeys]);
  const hasCustomerJourney = useMemo(
    () => journeys.some((journey) => journey.key === "customer"),
    [journeys],
  );

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

  const updateJourneyDraft = (key: JourneyKey, field: "title" | "subtitle", value: string) => {
    setJourneyDrafts((previous) => ({
      ...previous,
      [key]: {
        ...previous[key],
        [field]: value,
      },
    }));
  };

  const addMap = async (key: JourneyKey) => {
    if (!activeCompany?.id) {
      toast.error("Select a company before running journey research.");
      return;
    }
    if (key !== "customer" && !hasCustomerJourney) {
      toast.error("Add the customer map first.");
      return;
    }

    try {
      setRunningJourneyKey(key);
      const draft = journeyDrafts[key];
      const suggested = suggestedJourneyOptions.find((option) => option.key === key);
      const fallbackTitle = suggested?.title || titleFromKey(key);
      const fallbackSubtitle = suggested?.subtitle || subtitleFromKey(key);
      const jobMap = {
        journey_key: key,
        journey_title: safeText(draft?.title, fallbackTitle),
        journey_subtitle: safeText(draft?.subtitle, fallbackSubtitle),
        source: draft?.title || draft?.subtitle ? "custom" : "suggested",
      };

      const { data, error: invokeError } = await supabase.functions.invoke("research-company", {
        body: {
          company_id: activeCompany.id,
          company_name: activeCompany.name,
          website: activeCompany.website ?? "",
          journeys_to_generate: [key],
          job_maps: [jobMap],
        },
      });

      if (invokeError) {
        throw new Error(await describeJobMapInvokeError(invokeError));
      }
      if (data?.error) {
        throw new Error(String(data.message || data.error));
      }

      await Promise.all([refetchJobSteps(), refetchBaseline()]);
      setRecentlyRemovedKeys((previous) => previous.filter((removed) => removed !== key));
      toast.success(`${titleCaseJourney(key)} map added.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add job map.");
    } finally {
      setRunningJourneyKey(null);
    }
  };

  const handleRemoveJourneyMap = async (key: JourneyKey) => {
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
      setRecentlyRemovedKeys((previous) =>
        previous.includes(key) ? previous : [...previous, key],
      );
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
            <SuggestedMapsSection
              options={suggestedJourneyOptions}
              drafts={journeyDrafts}
              onDraftChange={updateJourneyDraft}
              onAddMap={addMap}
              runningKey={runningJourneyKey}
              hasCustomerJourney={hasCustomerJourney}
            />

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

                <OdiNeedsSection
                  marketDefinition={marketDefinition}
                  needs={needs}
                />

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
          </div>
        )}
      </main>
    </div>
  );
}
