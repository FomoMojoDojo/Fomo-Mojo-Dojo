/**
 * StrategicOrientationLayer — orientation surface components.
 *
 * Active export: SupportingLensesSection (imported in ClientRefinePreviewView.tsx,
 * rendered in the crpv-pressure-lenses zone at the bottom of the pressure field).
 *
 * Default export (StrategicOrientationLayer): legacy — not rendered anywhere since
 * Phase 27 replaced the stacked orientation layer with the crpv-pressure-field grid.
 * Retained here in case another surface needs a compact orientation strip.
 * Do not render it on the homepage — the pressure field owns that surface.
 *
 * Uses inline styles only (no CSS custom properties) — portal-safe pattern.
 */

import type { StrategicOrientationSurface } from "@/lib/strategicOrientation";

// ─── Design tokens (inline — no crpv vars) ───────────────────────────────────

const C = {
  commit:        "#5F9B8C",
  blocked:       "#C4745A",
  blocker:       "#c44233",
  exploring:     "#6E847F",
  muted:         "#9298B5",
  mutedFaint:    "#5A6070",   // further demoted — supporting lenses, metadata
  lineFaint:     "#1E2E2C",
  lineStrong:    "#2A3D3B",
  tensionBlocker: "#c44233",
  tensionHigh:   "#b56c1a",
  tensionMedium: "#6E847F",
  interruptCrit: "#c44233",   // blockers / contradictions
  interruptWarn: "#b56c1a",   // warnings / instability
} as const;

// ─── Interruption strip ───────────────────────────────────────────────────────
// Appears before commitment readiness — breaks rhythm for critical state.
// Asymmetric left accent, no background fill, no decoration.

function InterruptionStrip({ message, severity }: {
  message: string;
  severity: "critical" | "warning";
}) {
  const color = severity === "critical" ? C.interruptCrit : C.interruptWarn;
  return (
    <div style={{
      marginBottom: 12,
      paddingLeft: 12,
      borderLeft: `3px solid ${color}`,
    }}>
      <p style={{
        fontSize: 11,
        color,
        margin: 0,
        lineHeight: 1.5,
        fontWeight: 500,
        letterSpacing: "0.01em",
      }}>
        {message}
      </p>
    </div>
  );
}

// ─── Commitment readiness ─────────────────────────────────────────────────────

function CommitmentReadinessRow({ label, sublabel, canCommit, blocked }: {
  label: string;
  sublabel: string | null;
  canCommit: boolean;
  blocked: boolean;
}) {
  const color = canCommit ? C.commit : blocked ? C.blocked : C.exploring;
  const prefix = blocked && !canCommit ? "⊗ " : "";

  return (
    <div style={{ marginBottom: 10 }}>
      <p style={{
        fontSize: 13,
        color,
        lineHeight: 1.45,
        margin: 0,
        fontWeight: canCommit ? 500 : blocked ? 500 : 400,
      }}>
        {prefix}{label}
      </p>
      {sublabel && (
        <p style={{ fontSize: 11, color: C.muted, margin: "3px 0 0", lineHeight: 1.4 }}>
          {sublabel}
        </p>
      )}
    </div>
  );
}

// ─── Tension row ──────────────────────────────────────────────────────────────
// Blockers: stronger border (3px), larger text, commitment blocker mark.
// High:     2px border, amber.
// Others:   1px border, muted.

function PrimaryTensionRow({ statement, isBlocker, pressure }: {
  statement: string;
  isBlocker: boolean;
  pressure: string;
}) {
  const borderWidth = isBlocker ? 3 : pressure === "high" ? 2 : 1;
  const borderColor = isBlocker ? C.tensionBlocker : pressure === "high" ? C.tensionHigh : C.lineStrong;
  const textColor   = isBlocker ? C.tensionBlocker : pressure === "high" ? C.tensionHigh : C.tensionMedium;
  const fontSize    = isBlocker ? 13 : 12;
  const fontWeight  = isBlocker ? 500 : 400;

  return (
    <p style={{
      fontSize,
      fontWeight,
      color: textColor,
      margin: "5px 0",
      paddingLeft: 10,
      borderLeft: `${borderWidth}px solid ${borderColor}`,
      lineHeight: 1.5,
    }}>
      {isBlocker ? "⊗ " : "· "}{statement}
    </p>
  );
}

// ─── Validation urgency ───────────────────────────────────────────────────────

function ValidationUrgencyRow({ text }: { text: string }) {
  return (
    <p style={{
      fontSize: 11,
      color: C.muted,
      fontFamily: '"JetBrains Mono", ui-monospace, monospace',
      textTransform: "uppercase",
      letterSpacing: "0.06em",
      margin: "10px 0 0",
      lineHeight: 1.4,
    }}>
      Requires validation: {text}
    </p>
  );
}

// ─── Memory lines ─────────────────────────────────────────────────────────────

function MemoryLine({ text }: { text: string }) {
  return (
    <p style={{
      fontSize: 10,
      color: C.muted,
      fontFamily: '"JetBrains Mono", ui-monospace, monospace',
      letterSpacing: "0.04em",
      margin: "8px 0 0",
      lineHeight: 1.5,
      opacity: 0.8,
    }}>
      {text}
    </p>
  );
}

// ─── Supporting Lenses section ────────────────────────────────────────────────
// Demoted to quiet contextual references.
// No equal-width treatment, no strong affordance, inline flow.

export function SupportingLensesSection({ onNavigate }: {
  onNavigate?: (key: string) => void;
}) {
  const lenses = [
    { key: "routes",      label: "Routes",      role: "commitments" },
    { key: "positioning", label: "Positioning",  role: "market" },
    { key: "needs",       label: "Opportunities", role: "customer" },
    { key: "strategy",    label: "Strategy",     role: "direction" },
    { key: "council",     label: "Council",      role: "advisory" },
  ];

  return (
    <div style={{ width: "100%", textAlign: "left", marginTop: 8, paddingTop: 6, borderTop: `1px solid ${C.lineFaint}`, opacity: 0.82 }}>
      <span style={{
        fontSize: 7,
        color: C.mutedFaint,
        fontFamily: '"JetBrains Mono", ui-monospace, monospace',
        textTransform: "uppercase",
        letterSpacing: "0.08em",
        marginRight: 8,
      }}>
        Inspect via
      </span>
      {lenses.map((lens, i) => (
        <span key={lens.key} style={{ fontSize: 8.5, color: C.mutedFaint }}>
          {i > 0 && <span style={{ marginRight: 4, opacity: 0.5 }}>·</span>}
          {onNavigate ? (
            <button
              type="button"
              onClick={() => onNavigate(lens.key)}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                padding: 0,
                fontSize: 8.5,
                color: C.mutedFaint,
                textDecoration: "none",
                letterSpacing: "0.02em",
              }}
            >
              {lens.label}
            </button>
          ) : (
            <span>{lens.label}</span>
          )}
          <span style={{ opacity: 0.38, fontSize: 7.5 }}> {lens.role}</span>
          {" "}
        </span>
      ))}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function StrategicOrientationLayer({
  orientation,
  showMovement = false,
  movementLine = null,
  assumptionLine = null,
}: {
  orientation: StrategicOrientationSurface;
  showMovement?: boolean;
  movementLine?: string | null;
  assumptionLine?: string | null;
}) {
  const { commitmentReadiness, primaryTensions, movementSignals, validationUrgency, hasBlockingTensions } = orientation;
  const hasTensions    = primaryTensions.length > 0;
  const hasMovement    = showMovement && movementSignals.length > 0;
  const hasValidation  = Boolean(validationUrgency);
  const isBlocked      = commitmentReadiness.blockedRoutes.length > 0 && !commitmentReadiness.canCommit;

  // Interruption conditions — only surface the most critical one
  const showBlockerInterrupt = hasBlockingTensions;
  const showBlockedInterrupt = !showBlockerInterrupt && isBlocked;

  if (!hasTensions && !hasValidation && !hasMovement && !movementLine && !commitmentReadiness.label) {
    return null;
  }

  return (
    // Left-align this block within the centered command grid
    <div style={{
      width: "100%",
      textAlign: "left",
      paddingBottom: 12,
      marginBottom: 12,
      borderBottom: `1px solid ${C.lineFaint}`,
    }}>

      {/* Directional flow: 1. Interruptions (highest weight) */}
      {showBlockerInterrupt && (
        <InterruptionStrip
          message={`Commitment blocked — ${primaryTensions.filter(t => t.isCommitmentBlocker).length === 1 ? "a blocking tension" : "blocking tensions"} require resolution before advancing.`}
          severity="critical"
        />
      )}
      {showBlockedInterrupt && (
        <InterruptionStrip
          message={`Commitment risk elevated — ${commitmentReadiness.blockedRoutes.length} route${commitmentReadiness.blockedRoutes.length === 1 ? "" : "s"} blocked.`}
          severity="warning"
        />
      )}

      {/* 2. Commitment readiness — primary orientation concept */}
      <CommitmentReadinessRow
        label={commitmentReadiness.label}
        sublabel={commitmentReadiness.sublabel}
        canCommit={commitmentReadiness.canCommit}
        blocked={isBlocked}
      />

      {/* 3. Primary tensions — structural pressure, blockers first */}
      {hasTensions && (
        <div style={{ marginTop: 6 }}>
          {primaryTensions.map((t) => (
            <PrimaryTensionRow
              key={t.id}
              statement={t.statement}
              isBlocker={t.isCommitmentBlocker}
              pressure={t.pressure}
            />
          ))}
        </div>
      )}

      {/* 4. Validation urgency — what requires immediate attention */}
      {hasValidation && <ValidationUrgencyRow text={validationUrgency!} />}

      {/* 5. Movement signals — what is strengthening or weakening */}
      {hasMovement && (
        <div style={{ marginTop: 8 }}>
          {movementSignals.map((sig, i) => (
            <p key={i} style={{
              fontSize: 11,
              color: C.muted,
              margin: "3px 0",
              paddingLeft: 10,
              borderLeft: `1px solid ${C.lineStrong}`,
              lineHeight: 1.5,
            }}>
              {sig}
            </p>
          ))}
        </div>
      )}

      {/* 6. Memory lines — temporal orientation, quietest layer */}
      {movementLine && <MemoryLine text={movementLine} />}
      {assumptionLine && (
        <p style={{
          fontSize: 10,
          color: C.muted,
          fontFamily: '"JetBrains Mono", ui-monospace, monospace',
          letterSpacing: "0.04em",
          margin: "4px 0 0",
          lineHeight: 1.5,
          opacity: 0.7,
        }}>
          {assumptionLine}
        </p>
      )}
    </div>
  );
}
