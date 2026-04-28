import { useState } from "react";

export type ProgramPhase = "outside" | "diagnose" | "focus" | "flow";

export const PHASE_DEFS: Array<{
  key: ProgramPhase;
  label: string;
  tagline: string;
  description: string;
  steps: string[];
}> = [
  {
    key: "outside",
    label: "Outside",
    tagline: "Public available info",
    description:
      "Gather publicly available evidence: market research, competitive landscape, public claims, and initial signal on how the market sees the client.",
    steps: [
      "Public baseline run and evidence ledger complete",
      "Competitive landscape mapped",
      "Public claims documented (website, press, reviews)",
      "Customer evidence sources identified",
    ],
  },
  {
    key: "diagnose",
    label: "Diagnose",
    tagline: "Company docs · interviews · initial strategy draft",
    description:
      "Upload company documents, run stakeholder and customer interviews, produce an initial draft of strategy, positioning, needs, pain points, and desires.",
    steps: [
      "Company strategy / brand documents uploaded",
      "Stakeholder interviews conducted",
      "Customer interviews or surveys done",
      "Initial strategy and positioning draft complete",
      "Needs, pain points, and desires mapped",
    ],
  },
  {
    key: "focus",
    label: "Focus",
    tagline: "Customer needs research · importance / satisfaction · prioritized solutions",
    description:
      "Run the customer needs survey, score importance and satisfaction for each need, assign opportunities to desired outcomes, apply and test solutions against the highest-priority opportunities.",
    steps: [
      "Customer needs survey fielded and results recorded",
      "Importance and satisfaction scored for all needs",
      "Opportunities mapped to desired outcomes",
      "Top opportunities prioritized by opportunity score",
      "Solutions assigned and initial tests designed",
    ],
  },
  {
    key: "flow",
    label: "Flow",
    tagline: "Track · check in · clear next steps",
    description:
      "Track progress on the chosen branch, run regular check-ins, vote on approach adjustments, and maintain a clear record of why it matters and how each action addresses the core problem.",
    steps: [
      "Chosen branch / route locked in",
      "Why it matters and how it addresses the problem documented",
      "Clear next steps with owners defined",
      "Check-in and voting cadence established",
      "Progress and outcome metrics tracked",
    ],
  },
];

const c = {
  charcoal: "#233C4B",
  secondary: "#46606D",
  muted: "#6E847F",
  faint: "#C8D8CA",
  line: "#DDE6D1",
  lineFaint: "#EEF3E9",
  teal: "#5F9B8C",
  coral: "#FF7D2D",
  amber: "#FAC846",
};

function phaseColors(phase: ProgramPhase) {
  if (phase === "outside") return { accent: "#6E847F", bg: "#F4F6F5", border: "#B8CCCA", dot: "#6E847F" };
  if (phase === "diagnose") return { accent: "#C48A2A", bg: "#FFFCE8", border: "#F3D77A", dot: "#C48A2A" };
  if (phase === "focus") return { accent: c.coral, bg: "#FFF4EC", border: "#FFD1B4", dot: c.coral };
  return { accent: c.teal, bg: "#EFF7F3", border: "#B5D9CC", dot: c.teal };
}

export default function StrategyPhaseStrip({
  currentPhase,
  isAdmin = false,
  onPhaseChange,
}: {
  currentPhase: ProgramPhase;
  isAdmin?: boolean;
  onPhaseChange?: (phase: ProgramPhase) => void;
}) {
  const [hoveredPhase, setHoveredPhase] = useState<ProgramPhase | null>(null);

  const displayPhase = hoveredPhase ?? currentPhase;
  const displayDef = PHASE_DEFS.find((p) => p.key === displayPhase) ?? PHASE_DEFS[1];
  const currentIndex = PHASE_DEFS.findIndex((p) => p.key === currentPhase);

  return (
    <div
      className="rounded-xl overflow-hidden mb-4"
      style={{ border: `1px solid ${c.line}`, background: "#FFFFFF" }}
    >
      {/* Phase tab row */}
      <div className="flex" style={{ borderBottom: `1px solid ${c.line}` }}>
        {PHASE_DEFS.map((phase, index) => {
          const isCurrent = phase.key === currentPhase;
          const isHovered = hoveredPhase === phase.key;
          const isPast = index < currentIndex;
          const colors = phaseColors(phase.key);

          return (
            <button
              key={phase.key}
              type="button"
              className="relative flex-1 flex flex-col items-center gap-1 px-3 py-3 transition-all focus:outline-none"
              style={{
                background: isCurrent || isHovered ? colors.bg : "transparent",
                borderRight: index < PHASE_DEFS.length - 1 ? `1px solid ${c.line}` : "none",
                cursor: isAdmin ? "pointer" : "default",
              }}
              onMouseEnter={() => setHoveredPhase(phase.key)}
              onMouseLeave={() => setHoveredPhase(null)}
              onClick={() => {
                if (isAdmin && onPhaseChange) onPhaseChange(phase.key);
              }}
            >
              {/* Active indicator bar at top */}
              {isCurrent && (
                <div
                  className="absolute top-0 left-0 right-0 h-[3px]"
                  style={{ background: colors.accent }}
                />
              )}

              <div className="flex items-center gap-1.5">
                {/* Step dot */}
                <span
                  className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border font-mono text-[9px]"
                  style={{
                    borderColor: isCurrent ? colors.accent : isPast ? c.teal : c.line,
                    background: isCurrent ? colors.bg : isPast ? "#EFF7F3" : "transparent",
                    color: isCurrent ? colors.accent : isPast ? c.teal : c.muted,
                  }}
                >
                  {isPast ? "✓" : index + 1}
                </span>
                <span
                  className="font-mono text-[10px] uppercase tracking-[0.08em] font-semibold"
                  style={{
                    color: isCurrent ? colors.accent : isHovered ? colors.accent : isPast ? c.secondary : c.muted,
                  }}
                >
                  {phase.label}
                </span>
              </div>
              <span
                className="font-sans text-[10px] leading-tight text-center hidden sm:block"
                style={{ color: isCurrent ? colors.accent : c.muted }}
              >
                {phase.tagline}
              </span>
            </button>
          );
        })}
      </div>

      {/* Expanded detail panel for current/hovered phase */}
      <div className="px-4 py-3" style={{ background: phaseColors(displayPhase).bg }}>
        <div className="flex flex-col sm:flex-row sm:items-start gap-4">
          <div className="flex-1 min-w-0">
            <p className="font-sans text-[13px] leading-[1.6]" style={{ color: c.secondary }}>
              {displayDef.description}
            </p>
          </div>
          <div className="shrink-0 flex flex-col gap-1.5 min-w-[200px]">
            {displayDef.steps.map((step) => (
              <div key={step} className="flex items-start gap-1.5">
                <span
                  className="mt-[3px] inline-block h-[6px] w-[6px] shrink-0 rounded-full"
                  style={{ background: phaseColors(displayPhase).dot }}
                />
                <span className="font-sans text-[11px] leading-[1.5]" style={{ color: c.secondary }}>
                  {step}
                </span>
              </div>
            ))}
          </div>
        </div>
        {isAdmin && (
          <p className="mt-2 font-mono text-[9px] uppercase tracking-wider" style={{ color: phaseColors(displayPhase).accent }}>
            Admin: click a phase to set it as current
          </p>
        )}
      </div>
    </div>
  );
}
