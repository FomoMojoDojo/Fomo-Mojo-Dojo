import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, ChevronRight } from "lucide-react";
import TopNav from "@/components/layout/TopNav";
import AiBoundaryNote from "@/components/AiBoundaryNote";
import { useCompany } from "@/hooks/useCompany";
import { useJobSteps, type JobStepRow } from "@/hooks/useJobSteps";
import { useOdiNeeds, type OdiMarketDefinitionRow, type OdiNeedRow } from "@/hooks/useOdiNeeds";
import { MetaBadge, ScoreChip, StateBadge } from "@/components/ui/semantic-badges";

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

function JourneySection({ journey }: { journey: JourneyGroup }) {
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

export default function JobStepsView() {
  const { activeCompany } = useCompany();
  const { loading, items, error } = useJobSteps(activeCompany?.id);
  const { marketDefinition, needs } = useOdiNeeds(activeCompany?.id);

  const journeys = useMemo(() => groupJourneys(items), [items]);
  const totalGaps = useMemo(
    () => journeys.reduce((sum, journey) => sum + journey.steps.filter((step) => step.has_gap).length, 0),
    [journeys]
  );

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
            Job steps and desired-outcome context across the customer, revenue, and operations journeys for the current company.
          </p>
        </div>

          <Link
            to="/"
            className="rounded-full border px-4 py-2 font-mono text-[11px] uppercase tracking-[0.08em]"
            style={{ borderColor: c.line, color: c.secondary, background: c.card }}
          >
            Back to Map
          </Link>
        </div>

        <AiBoundaryNote
          label="Public Research"
          tone="public"
          className="mb-6 max-w-[780px]"
          detail="This journey map is generated from the public baseline and company research flow. Designed steps may be directly evidenced or strongly implied by the public evidence; they are not the same as validated internal proof."
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
        ) : journeys.length === 0 ? (
          <div
            className="rounded-[24px] border px-6 py-12 text-center"
            style={{ borderColor: c.line, background: c.panel }}
          >
            <p className="font-sans text-[15px]" style={{ color: c.secondary }}>
              No job step data is available yet. Run AI Research in Admin → Companies to generate industry-specific journey maps.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {journeys.map((journey) => (
              <JourneySection key={journey.key} journey={journey} />
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
                <strong style={{ color: c.charcoal }}>{totalGaps} steps have active gaps</strong> across the current journeys.
                Use this page to confirm the sequence and then move to Inputs and Opportunities to close the highest-impact issues.
              </p>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
