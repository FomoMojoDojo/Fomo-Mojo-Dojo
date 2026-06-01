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
  line: "#DDE6D1",
  teal: "#5F9B8C",
  coral: "#FF7D2D",
  amber: "#FAC846",
};

function phaseAccent(phase: EngagementPhase): string {
  if (phase === "outside_signals" || phase === "validate_outside") return "#6E847F";
  if (phase === "diagnose" || phase === "validate_diagnose") return "#C48A2A";
  if (phase === "focus" || phase === "validate_focus") return c.coral;
  return c.teal;
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
  const currentIndex = PHASE_DEFS.findIndex((p) => p.key === currentPhase);
  const currentDef = PHASE_DEFS[currentIndex] ?? PHASE_DEFS[0];
  const mainPhases = PHASE_DEFS.filter((p) => !p.isValidate);
  const mainIndex = mainPhases.findIndex((p) => p.key === currentPhase);
  const ordinal = mainIndex >= 0 ? mainIndex + 1 : null;
  const accent = phaseAccent(currentPhase);

  const phaseLabel = currentDef.isValidate
    ? `Checkpoint — ${currentDef.label}`
    : `Phase ${ordinal} of ${mainPhases.length} · ${currentDef.label}`;

  function go(delta: number) {
    if (!isAdmin || !onPhaseChange) return;
    const newIndex = currentIndex + delta;
    if (newIndex >= 0 && newIndex < PHASE_DEFS.length) {
      onPhaseChange(PHASE_DEFS[newIndex].key);
    }
  }

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        borderBottom: `1px solid ${c.line}`,
        paddingBottom: 10,
        marginBottom: 12,
      }}
    >
      {isAdmin && currentIndex > 0 && (
        <button
          type="button"
          onClick={() => go(-1)}
          style={{
            fontFamily: "monospace",
            fontSize: 10,
            color: c.muted,
            background: "none",
            border: "none",
            cursor: "pointer",
            padding: "2px 4px",
            lineHeight: 1,
          }}
          title="Previous phase"
        >
          ←
        </button>
      )}

      <span
        style={{
          fontFamily: "monospace",
          fontSize: 10,
          fontWeight: 600,
          color: accent,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          lineHeight: 1,
        }}
      >
        {phaseLabel}
      </span>

      {currentDef.tagline && (
        <span
          style={{
            fontFamily: "monospace",
            fontSize: 10,
            color: c.muted,
            letterSpacing: "0.05em",
            lineHeight: 1,
          }}
        >
          — {currentDef.tagline}
        </span>
      )}

      {isAdmin && currentIndex < PHASE_DEFS.length - 1 && (
        <button
          type="button"
          onClick={() => go(1)}
          style={{
            fontFamily: "monospace",
            fontSize: 10,
            color: c.muted,
            background: "none",
            border: "none",
            cursor: "pointer",
            padding: "2px 4px",
            lineHeight: 1,
          }}
          title="Next phase"
        >
          →
        </button>
      )}

      {isAdmin && (
        <span
          style={{
            fontFamily: "monospace",
            fontSize: 9,
            color: c.muted,
            opacity: 0.6,
            marginLeft: "auto",
            letterSpacing: "0.08em",
          }}
        >
          ADMIN: ← → TO CHANGE
        </span>
      )}
    </div>
  );
}
