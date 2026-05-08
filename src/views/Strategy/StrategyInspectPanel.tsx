import StrategicInspectShell from "@/components/inspect/StrategicInspectShell";
import TierAlignmentGrid from "@/components/inspect/TierAlignmentGrid";
import type { TierCellData } from "@/lib/strategicObject";
import { generationContextLabel } from "@/lib/strategicObject";
import type { StrategyCascade, CascadeItem, CascadeAssumption } from "@/lib/types";
import type { SourceConfidenceSignals } from "@/lib/sourceConfidence";
import { buildStrategySources } from "@/lib/sourceLinks";
import SourcesUsedSection from "@/components/inspect/SourcesUsedSection";

const MONO = '"JetBrains Mono", ui-monospace, "SFMono-Regular", monospace';

const c = {
  ink: "#111111",
  inkSoft: "#555555",
  inkFaint: "#999999",
  line: "#d9d9d9",
  lineSoft: "#f5f5f5",
  teal: "#5f9b8c",
  coral: "#ff7d2d",
  amber: "#f59e0b",
};

const NULL_SIGNALS: SourceConfidenceSignals = {
  uploadedFiles: 0,
  hasCompanyEvidence: false,
  hasPrimaryEvidence: false,
  primaryEvidenceSignals: 0,
  testedSignal: 0,
  hasImplementedTested: false,
};

const SECTION_LABEL: React.CSSProperties = {
  margin: "0 0 10px",
  fontFamily: MONO,
  fontSize: 9,
  textTransform: "uppercase",
  letterSpacing: "0.12em",
  color: c.inkFaint,
};

const SUB_LABEL = (color: string): React.CSSProperties => ({
  margin: "0 0 6px",
  fontFamily: MONO,
  fontSize: 9,
  textTransform: "uppercase",
  letterSpacing: "0.1em",
  color,
});

const DIVIDER: React.CSSProperties = {
  height: 1,
  background: c.line,
};

function deriveTierCells(
  signals: SourceConfidenceSignals,
  cascade: StrategyCascade,
  hasBaseline: boolean,
): TierCellData[] {
  // Outside: public web, scraping, or external research only.
  // Framework names are methodology — not a signal source.
  const outsidePresent = hasBaseline;

  // Organization: uploaded files, internal documents, or strategy items backed by evidence.
  const hasItemEvidence =
    cascade.capabilities.some((c) => c.evidence) ||
    cascade.management_systems.some((m) => m.evidence);
  const orgPresent = signals.hasCompanyEvidence || hasItemEvidence;

  // Market Validation: customer interviews or ODI survey only.
  // Internal assumption testing does NOT qualify.
  const marketPresent = signals.hasPrimaryEvidence && signals.primaryEvidenceSignals > 0;

  const cells: TierCellData[] = [
    { tier: "outside", label: "Outside Signals",      present: outsidePresent },
    { tier: "org",     label: "Organization Signals", present: orgPresent     },
  ];

  if (signals.hasPrimaryEvidence) {
    cells.push({ tier: "customer", label: "Customer Signals", present: true });
  }

  cells.push({ tier: "market", label: "Market Validation", present: marketPresent });

  return cells;
}

function statusGlyph(status: CascadeItem["status"]) {
  if (status === "strong") return "◉";
  if (status === "developing") return "◎";
  return "○";
}

function statusColor(status: CascadeItem["status"]) {
  if (status === "strong") return c.teal;
  if (status === "developing") return c.amber;
  return c.coral;
}

function changeBullets(cascade: StrategyCascade, signals: SourceConfidenceSignals): string[] {
  const bullets: string[] = [];
  const gapCapabilities = cascade.capabilities.filter((cap) => cap.status === "gap");
  const untestedAssumptions = cascade.assumptions.filter((a) => !a.tested);
  const unverifiedItems = [...cascade.capabilities, ...cascade.management_systems].filter((item) => item.unverified);

  if (gapCapabilities.length > 0) {
    bullets.push(`${gapCapabilities.length} capability gap${gapCapabilities.length > 1 ? "s" : ""} are holding back this strategy — address these to strengthen the cascade.`);
  }
  if (untestedAssumptions.length > 0) {
    bullets.push(`${untestedAssumptions.length} assumption${untestedAssumptions.length > 1 ? "s" : ""} have not been tested — running these experiments would increase confidence.`);
  }
  if (unverifiedItems.length > 0) {
    bullets.push(`${unverifiedItems.length} item${unverifiedItems.length > 1 ? "s" : ""} are marked as unverified — validate with evidence to move them to a stronger status.`);
  }
  if (!signals.hasCompanyEvidence) {
    bullets.push("Adding organization-specific evidence would elevate this strategy above the public-source baseline.");
  }
  if (bullets.length === 0) {
    bullets.push("Run a strategy review to check alignment with current customer signals and market conditions.");
  }
  return bullets;
}

export default function StrategyInspectPanel({
  open,
  onClose,
  cascade,
  frameworksUsed,
  signals = NULL_SIGNALS,
  hasBaseline = false,
}: {
  open: boolean;
  onClose: () => void;
  cascade: StrategyCascade | null;
  frameworksUsed: string[];
  signals?: SourceConfidenceSignals;
  hasBaseline?: boolean;
}) {
  if (!cascade) return null;

  const genContext = generationContextLabel(frameworksUsed);
  const tierCells = deriveTierCells(signals, cascade, hasBaseline);
  const bullets = changeBullets(cascade, signals);
  const strategySources = buildStrategySources(cascade);

  const strongCapabilities = cascade.capabilities.filter((c) => c.status === "strong");
  const developingCapabilities = cascade.capabilities.filter((c) => c.status === "developing");
  const gapCapabilities = cascade.capabilities.filter((c) => c.status === "gap");
  const testedAssumptions = cascade.assumptions.filter((a: CascadeAssumption) => a.tested);
  const untestedAssumptions = cascade.assumptions.filter((a: CascadeAssumption) => !a.tested);

  return (
    <StrategicInspectShell
      open={open}
      onClose={onClose}
      title="Strategy Cascade"
      subtitle={`Generated using: ${genContext}`}
    >
      {/* Section 0: What this claims */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <p style={SECTION_LABEL}>What this claims</p>
        {cascade.winning_aspiration && (
          <div style={{ border: `1px solid ${c.line}`, background: c.lineSoft, padding: "10px 12px" }}>
            <p style={{ margin: "0 0 2px", fontFamily: MONO, fontSize: 9, textTransform: "uppercase", letterSpacing: "0.1em", color: c.inkFaint }}>
              Winning aspiration
            </p>
            <p style={{ margin: 0, fontSize: 12, lineHeight: 1.5, color: c.inkSoft }}>{cascade.winning_aspiration}</p>
          </div>
        )}
        {cascade.where_to_play && (
          <div style={{ border: `1px solid ${c.line}`, background: c.lineSoft, padding: "10px 12px" }}>
            <p style={{ margin: "0 0 2px", fontFamily: MONO, fontSize: 9, textTransform: "uppercase", letterSpacing: "0.1em", color: c.inkFaint }}>
              Where to play
            </p>
            <p style={{ margin: 0, fontSize: 12, lineHeight: 1.5, color: c.inkSoft }}>{cascade.where_to_play}</p>
          </div>
        )}
        <TierAlignmentGrid cells={tierCells} />
      </div>

      <div style={DIVIDER} />

      {/* Section 1: Evidence */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <p style={SECTION_LABEL}>Evidence</p>

        {cascade.capabilities.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <p style={SUB_LABEL(c.inkFaint)}>Capabilities</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {[...strongCapabilities, ...developingCapabilities, ...gapCapabilities].map((cap, i) => (
                <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 12, lineHeight: 1.5 }}>
                  <span style={{ color: statusColor(cap.status), flexShrink: 0 }}>{statusGlyph(cap.status)}</span>
                  <span style={{ color: c.inkSoft, flex: 1 }}>{cap.name}</span>
                  {cap.unverified && (
                    <span style={{ fontFamily: MONO, fontSize: 9, textTransform: "uppercase", letterSpacing: "0.08em", color: c.inkFaint }}>
                      unverified
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {cascade.assumptions.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <p style={SUB_LABEL(c.inkFaint)}>Assumptions</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {testedAssumptions.map((a, i) => (
                <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 12, lineHeight: 1.5 }}>
                  <span style={{ color: c.teal, flexShrink: 0 }}>◉</span>
                  <span style={{ color: c.inkSoft }}>{a.assumption}</span>
                </div>
              ))}
              {untestedAssumptions.map((a, i) => (
                <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 12, lineHeight: 1.5 }}>
                  <span style={{ color: c.coral, flexShrink: 0 }}>○</span>
                  <span style={{ color: c.inkSoft, flex: 1 }}>{a.assumption}</span>
                  <span style={{ fontFamily: MONO, fontSize: 9, textTransform: "uppercase", letterSpacing: "0.08em", color: c.inkFaint }}>
                    untested
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {cascade.capabilities.length === 0 && cascade.assumptions.length === 0 && (
          <p style={{ margin: 0, fontSize: 12, color: c.inkFaint }}>No capabilities or assumptions recorded yet.</p>
        )}
      </div>

      <div style={DIVIDER} />

      {/* Section 2: What would change this */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <p style={SECTION_LABEL}>What would change this</p>
        <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 6 }}>
          {bullets.map((b, i) => (
            <li key={i} style={{ display: "flex", gap: 8, fontSize: 12, lineHeight: 1.55, color: c.inkSoft }}>
              <span style={{ color: c.inkFaint, flexShrink: 0 }}>·</span>
              <span>{b}</span>
            </li>
          ))}
        </ul>
      </div>

      <div style={DIVIDER} />

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <p style={SECTION_LABEL}>Sources used</p>
        <SourcesUsedSection sources={strategySources} />
      </div>
    </StrategicInspectShell>
  );
}
