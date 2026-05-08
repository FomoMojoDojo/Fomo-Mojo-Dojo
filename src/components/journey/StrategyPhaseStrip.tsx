import { useState } from "react";
import { PHASE_DEFS as ENGINE_PHASE_DEFS, type EngagementPhase } from "@/lib/engagementPhase";

// Re-export for any remaining consumers that import ProgramPhase from this file.
export type ProgramPhase = EngagementPhase;

// Flatten engine defs into the strip's expected shape.
export const PHASE_DEFS = ENGINE_PHASE_DEFS.map((d) => ({
  key:         d.key,
  label:       d.label,
  tagline:     d.tagline,
  description: d.description,
  steps:       d.steps,
  isValidate:  d.isValidate,
}));

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

function phaseColors(phase: EngagementPhase) {
  if (phase === "outside_signals" || phase === "validate_outside")
    return { accent: "#6E847F", bg: "#F4F6F5", border: "#B8CCCA", dot: "#6E847F" };
  if (phase === "diagnose" || phase === "validate_diagnose")
    return { accent: "#C48A2A", bg: "#FFFCE8", border: "#F3D77A", dot: "#C48A2A" };
  if (phase === "focus" || phase === "validate_focus")
    return { accent: c.coral, bg: "#FFF4EC", border: "#FFD1B4", dot: c.coral };
  return { accent: c.teal, bg: "#EFF7F3", border: "#B5D9CC", dot: c.teal };
}

export default function StrategyPhaseStrip({
  currentPhase,
  isAdmin = false,
  onPhaseChange,
}: {
  currentPhase: EngagementPhase;
  isAdmin?: boolean;
  onPhaseChange?: (phase: EngagementPhase) => void;
}) {
  const [hoveredPhase, setHoveredPhase] = useState<EngagementPhase | null>(null);

  const displayPhase = hoveredPhase ?? currentPhase;
  const displayDef = PHASE_DEFS.find((p) => p.key === displayPhase) ?? PHASE_DEFS[0];
  const currentIndex = PHASE_DEFS.findIndex((p) => p.key === currentPhase);

  // Ordinal numbers for main phases only (1–4)
  let mainOrdinalCounter = 0;
  const mainOrdinals = PHASE_DEFS.map((p) => {
    if (!p.isValidate) { mainOrdinalCounter++; return mainOrdinalCounter; }
    return null;
  });

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
          const isValidate = phase.isValidate;
          const colors = phaseColors(phase.key);
          const ordinal = mainOrdinals[index];

          return (
            <button
              key={phase.key}
              type="button"
              className="relative flex flex-col items-center justify-center gap-1 py-3 transition-all focus:outline-none"
              style={{
                flex: isValidate ? "0 0 52px" : "1 1 0",
                minWidth: isValidate ? 48 : 0,
                padding: isValidate ? "12px 4px" : "12px 12px",
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

              {isValidate ? (
                /* Validate checkpoint — compact gateway indicator */
                <span
                  className="font-mono text-[9px] uppercase tracking-[0.04em]"
                  style={{
                    color: isCurrent ? colors.accent : isPast ? c.teal : c.muted,
                    opacity: isCurrent || isHovered ? 1 : 0.65,
                    lineHeight: 1,
                  }}
                >
                  {isPast ? "✓" : "▾"}
                </span>
              ) : (
                /* Main phase — full treatment */
                <>
                  <div className="flex items-center gap-1.5">
                    <span
                      className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border font-mono text-[9px]"
                      style={{
                        borderColor: isCurrent ? colors.accent : isPast ? c.teal : c.line,
                        background: isCurrent ? colors.bg : isPast ? "#EFF7F3" : "transparent",
                        color: isCurrent ? colors.accent : isPast ? c.teal : c.muted,
                      }}
                    >
                      {isPast ? "✓" : ordinal}
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
                </>
              )}
            </button>
          );
        })}
      </div>

      {/* Expanded detail panel for current/hovered phase */}
      <div className="px-4 py-3" style={{ background: phaseColors(displayPhase).bg }}>
        <div className="flex flex-col sm:flex-row sm:items-start gap-4">
          <div className="flex-1 min-w-0">
            {displayDef.isValidate && (
              <p className="font-mono text-[9px] uppercase tracking-[0.08em] mb-1" style={{ color: phaseColors(displayPhase).accent }}>
                Checkpoint
              </p>
            )}
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
