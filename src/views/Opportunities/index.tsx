import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import TopNav from "@/components/layout/TopNav";
import { useCompany } from "@/hooks/useCompany";
import { useOpportunities, type OpportunityRow } from "@/hooks/useOpportunities";
import { MetaBadge, ScoreChip, StateBadge, TierBadge } from "@/components/ui/semantic-badges";

const c = {
  bg: "#faf7f6",
  panel: "#FFFFFF",
  card: "#ffffff",
  paper: "#FFFFFF",
  line: "#DDE6D1",
  charcoal: "#233C4B",
  secondary: "#46606D",
  muted: "#6E847F",
  focus: "#FF7D2D",
  monitor: "#FAC846",
  defer: "#5F9B8C",
};

const JOURNEY_ACCENT: Record<string, string> = {
  customer: "#FF7D2D",
  revenue: "#5F9B8C",
  operations: "#233C4B",
};

function titleCaseJourney(key: string) {
  if (key === "customer") return "Customer";
  if (key === "revenue") return "Revenue";
  if (key === "operations") return "Operations";
  return key;
}

function servingLabel(item: OpportunityRow) {
  const importance = item.importance ?? 0;
  const satisfaction = item.satisfaction ?? 0;
  const delta = importance - satisfaction;

  if (delta >= 3) return "underserved";
  if (delta <= -2) return "overserved";
  return "served";
}

function OpportunityCard({ item }: { item: OpportunityRow }) {
  const [expanded, setExpanded] = useState(false);
  const accent = JOURNEY_ACCENT[item.journey_key] || c.monitor;
  const evidenceNeeded = [
    item.step_label
      ? `Confirm where "${item.step_label}" currently breaks down in practice`
      : "Tie this opportunity to a named job step or workflow moment",
    "Collect direct customer, operator, or buyer language for this outcome",
    item.priority_tier === "focus"
      ? "Validate importance and dissatisfaction with interviews or survey inputs"
      : "Gather enough evidence to confirm this is worth prioritizing",
  ];
  const nextStep =
    item.priority_tier === "focus"
      ? "Interview users around this outcome before choosing a solution path."
      : item.priority_tier === "monitor"
        ? "Tighten evidence, then decide whether this should move into the focus lane."
        : "Keep this visible, but do not invest heavily until stronger underserved outcomes are confirmed.";

  return (
    <div
      className="overflow-hidden rounded-2xl border"
      style={{ borderColor: c.line, background: c.paper, boxShadow: "0 1px 2px rgba(0,0,0,0.03)" }}
    >
      <div className="h-[5px] w-full" style={{ background: accent }} />
      <button type="button" onClick={() => setExpanded((value) => !value)} className="w-full cursor-pointer p-5 text-left">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="mb-2 flex items-center gap-2">
              <TierBadge tone={item.priority_tier} />
              <MetaBadge>{titleCaseJourney(item.journey_key)}</MetaBadge>
              {item.step_number ? <MetaBadge>Step {item.step_number}</MetaBadge> : null}
            </div>

            <p className="font-mono text-[10px] uppercase tracking-[0.08em]" style={{ color: c.muted }}>
              Desired Outcome Opportunity
            </p>
            <h3 className="mt-1 font-sans text-[16px] font-semibold leading-tight" style={{ color: c.charcoal }}>
              {item.outcome || "Untitled opportunity"}
            </h3>

            <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.08em]" style={{ color: c.muted }}>
              Job step context
            </p>
            <p className="mt-1 font-sans text-[13px]" style={{ color: c.secondary }}>
              {item.step_label || "Unassigned step"}
            </p>
          </div>

          <div className="flex items-start gap-3">
            <ScoreChip label="Est. Opp" value={item.opportunity_score} />
            <div style={{ color: c.muted }}>{expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}</div>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <StateBadge tone={servingLabel(item)} />
          <ScoreChip label="Est. I" value={item.importance} />
          <ScoreChip label="Est. S" value={item.satisfaction} />
        </div>

        <p className="mt-4 font-sans text-[12px] leading-[1.6]" style={{ color: c.secondary }}>
          {item.priority_tier === "focus"
            ? "This desired outcome looks underserved enough to prioritize before choosing a specific solution direction."
            : item.priority_tier === "monitor"
              ? "This desired outcome likely matters, but the next move is to improve evidence and test assumptions."
              : "Keep this desired outcome visible, but defer solution work until higher-leverage underserved outcomes are clearer."}
        </p>
        <p className="mt-2 font-sans text-[12px] leading-[1.6]" style={{ color: c.secondary }}>
          Importance, satisfaction, and opportunity values are estimated from public evidence and generated research, not validated ODI survey results.
        </p>
      </button>

      {expanded ? (
        <div className="border-t p-5 pt-4 animate-fade-in-up" style={{ borderColor: c.line }}>
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.08em]" style={{ color: c.muted }}>
                Next Step
              </p>
              <p className="mt-2 font-sans text-[12px] leading-[1.65]" style={{ color: c.secondary }}>
                {nextStep}
              </p>
            </div>

            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.08em]" style={{ color: c.muted }}>
                Missing Evidence
              </p>
              <ul className="mt-2 space-y-2">
                {evidenceNeeded.map((entry, index) => (
                  <li
                    key={`${item.id}-evidence-${index}`}
                    className="flex items-start gap-2 font-sans text-[12px] leading-[1.6]"
                    style={{ color: c.secondary }}
                  >
                    <span style={{ color: accent }}>•</span>
                    <span>{entry}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function OpportunitySection({
  title,
  subtitle,
  items,
}: {
  title: string;
  subtitle: string;
  items: OpportunityRow[];
}) {
  if (items.length === 0) return null;

  return (
    <section className="space-y-3">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h2 className="font-sans text-[24px] font-semibold" style={{ color: c.charcoal }}>
            {title}
          </h2>
          <p className="font-sans text-[13px]" style={{ color: c.secondary }}>
            {subtitle}
          </p>
        </div>

        <MetaBadge>{items.length} opportunities</MetaBadge>
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {items.map((item) => (
          <OpportunityCard key={item.id} item={item} />
        ))}
      </div>
    </section>
  );
}

function ViewToggle({
  mode,
  onChange,
}: {
  mode: "list" | "map";
  onChange: (mode: "list" | "map") => void;
}) {
  return (
    <div
      className="inline-flex rounded-full border p-1"
      style={{ borderColor: c.line, background: c.card }}
    >
      {([
        { key: "list", label: "List View" },
        { key: "map", label: "Opportunity Map" },
      ] as const).map((item) => {
        const active = mode === item.key;
        return (
          <button
            key={item.key}
            type="button"
            onClick={() => onChange(item.key)}
            className="rounded-full px-4 py-2 font-mono text-[10px] uppercase tracking-[0.08em] transition-colors"
            style={{
              background: active ? c.charcoal : "transparent",
              color: active ? "#fff" : c.secondary,
            }}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

function OpportunityTreeView({ items }: { items: OpportunityRow[] }) {
  const grouped = ["customer", "revenue", "operations"].map((journeyKey) => {
    const journeyItems = items.filter((item) => item.journey_key === journeyKey);
    const stepMap = new Map<string, OpportunityRow[]>();

    for (const item of journeyItems) {
      const key = `${item.step_number ?? "?"}|${item.step_label ?? "Unassigned step"}`;
      if (!stepMap.has(key)) stepMap.set(key, []);
      stepMap.get(key)?.push(item);
    }

    const steps = Array.from(stepMap.entries())
      .map(([key, rows]) => {
        const [stepNumber, stepLabel] = key.split("|");
        return {
          stepNumber,
          stepLabel,
          items: rows.sort((a, b) => (b.opportunity_score ?? 0) - (a.opportunity_score ?? 0)),
        };
      })
      .sort((a, b) => Number(a.stepNumber) - Number(b.stepNumber));

    return {
      journeyKey,
      steps,
    };
  });

  return (
    <div className="space-y-6">
      <div className="rounded-[24px] border p-5" style={{ borderColor: c.line, background: c.panel }}>
        <h2 className="font-sans text-[22px] font-semibold" style={{ color: c.charcoal }}>
          Opportunity Tree
        </h2>
        <p className="mt-2 max-w-4xl font-sans text-[13px] leading-[1.7]" style={{ color: c.secondary }}>
          This view organizes opportunities the way an opportunity map would start to branch: by journey, then by job step,
          then by desired outcome opportunities. Solution branches should come only after the strongest opportunities are validated. Current scores are estimated from public evidence, not survey-based ODI measurements.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        {grouped.map(({ journeyKey, steps }) => {
          const accent = JOURNEY_ACCENT[journeyKey] || c.monitor;
          return (
            <section
              key={journeyKey}
              className="rounded-[24px] border p-4"
              style={{ borderColor: c.line, background: c.panel }}
            >
              <div className="flex items-center gap-2 mb-4">
                <span className="inline-block h-3 w-3 rounded-full" style={{ background: accent }} />
                <h3 className="font-sans text-[20px] font-semibold" style={{ color: c.charcoal }}>
                  {titleCaseJourney(journeyKey)}
                </h3>
              </div>

              {steps.length === 0 ? (
                <div className="rounded-2xl border border-dashed p-4" style={{ borderColor: c.line, background: c.card }}>
                  <p className="font-sans text-[13px]" style={{ color: c.secondary }}>
                    No opportunities mapped to this journey yet.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {steps.map((step) => (
                    <div
                      key={`${journeyKey}-${step.stepNumber}-${step.stepLabel}`}
                      className="rounded-2xl border p-4"
                      style={{ borderColor: c.line, background: c.card }}
                    >
                      <div className="mb-3">
                        <p className="font-mono text-[10px] uppercase tracking-[0.08em]" style={{ color: c.muted }}>
                          Job Step {step.stepNumber}
                        </p>
                        <p className="mt-1 font-sans text-[14px] font-semibold" style={{ color: c.charcoal }}>
                          {step.stepLabel}
                        </p>
                      </div>

                      <div className="space-y-3">
                        {step.items.map((item) => (
                          <div
                            key={item.id}
                            className="rounded-xl border p-3"
                            style={{ borderColor: c.line, background: c.paper }}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <p className="font-sans text-[13px] font-semibold leading-[1.45]" style={{ color: c.charcoal }}>
                                {item.outcome}
                              </p>
                              <TierBadge tone={item.priority_tier} />
                            </div>

                            <div className="mt-3 flex flex-wrap gap-2">
                              <StateBadge tone={servingLabel(item)} />
                              <ScoreChip label="Est. I" value={item.importance} />
                              <ScoreChip label="Est. S" value={item.satisfaction} />
                              <ScoreChip label="Est. Opp" value={item.opportunity_score} />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}

export default function OpportunitiesView() {
  const { activeCompany } = useCompany();
  const { loading, items, error } = useOpportunities(activeCompany?.id);
  const [viewMode, setViewMode] = useState<"list" | "map">("list");

  const prioritizeNow = items.filter((item) => item.priority_tier === "focus");
  const investigateNext = items.filter((item) => item.priority_tier === "monitor");
  const laterOpportunities = items.filter((item) => item.priority_tier === "defer");

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
        <div className="mb-6">
          <div className="font-mono text-[11px] uppercase tracking-[0.08em]" style={{ color: c.muted }}>
            {activeCompany?.name || "No company selected"}
          </div>
          <h1 className="mt-1 font-sans text-[28px] font-semibold" style={{ color: c.charcoal }}>
            Opportunities
          </h1>
          <p className="mt-1 max-w-4xl font-sans text-[14px]" style={{ color: c.secondary }}>
            Focus on the desired outcomes behind the jobs customers, buyers, and operators are trying to get done. Prioritize underserved outcomes first, then test assumptions before locking into solution choices. Current importance, satisfaction, and opportunity values are estimated from public evidence until interviews or surveys exist.
          </p>
          {items.length > 0 ? (
            <div className="mt-4">
              <ViewToggle mode={viewMode} onChange={setViewMode} />
            </div>
          ) : null}
        </div>

        {!activeCompany?.id ? (
          <div className="rounded-[24px] border px-6 py-12 text-center" style={{ borderColor: c.line, background: c.panel }}>
            <p className="font-sans text-[15px]" style={{ color: c.secondary }}>
              Select a company to view opportunity data.
            </p>
          </div>
        ) : loading ? (
          <div className="rounded-[24px] border px-6 py-12 text-center" style={{ borderColor: c.line, background: c.panel }}>
            <p className="font-mono text-[12px] uppercase tracking-[0.08em]" style={{ color: c.muted }}>
              Loading opportunities…
            </p>
          </div>
        ) : error ? (
          <div className="rounded-[24px] border px-6 py-12 text-center" style={{ borderColor: c.line, background: c.panel }}>
            <p className="font-sans text-[15px]" style={{ color: c.focus }}>
              Failed to load opportunities: {error}
            </p>
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-[24px] border px-6 py-12 text-center" style={{ borderColor: c.line, background: c.panel }}>
            <p className="font-sans text-[15px]" style={{ color: c.secondary }}>
              No opportunity data yet. Run AI Research in Admin → Companies.
            </p>
          </div>
        ) : viewMode === "map" ? (
          <OpportunityTreeView items={items} />
        ) : (
          <div className="space-y-8">
            <OpportunitySection
              title="Prioritize Now"
              subtitle="Strong opportunities that deserve attention before you commit to a solution."
              items={prioritizeNow}
            />
            <OpportunitySection
              title="Investigate Next"
              subtitle="Promising opportunities where the next move is better evidence, sharper assumptions, or smaller tests."
              items={investigateNext}
            />
            <OpportunitySection
              title="Later Opportunities"
              subtitle="Keep these visible, but sequence them after higher-leverage opportunity work."
              items={laterOpportunities}
            />
          </div>
        )}
      </main>
    </div>
  );
}
