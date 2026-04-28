import StrategicInspectShell from "@/components/inspect/StrategicInspectShell";
import TierAlignmentGrid from "@/components/inspect/TierAlignmentGrid";
import type { TierCellData } from "@/lib/strategicObject";
import { generationContextLabel } from "@/lib/strategicObject";
import type { PositioningCanvas } from "@/lib/types";
import type { SourceConfidenceSignals } from "@/lib/sourceConfidence";

const MONO = '"JetBrains Mono", ui-monospace, "SFMono-Regular", monospace';

const c = {
  ink: "#111111",
  inkSoft: "#555555",
  inkFaint: "#999999",
  line: "#d9d9d9",
  lineSoft: "#f5f5f5",
  teal: "#5f9b8c",
  coral: "#ff7d2d",
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

// Framework keys that represent publicly-validated methodology.
// Positioning and strategy never use "odi"/"jtbd"/"public" keys — they use the methodology
// framework keys below, all of which are built on published public research.
const PUBLIC_FRAMEWORK_KEYS = new Set([
  "odi", "jtbd", "public_baseline", "public_research",
  "april_dunford", "strategy_cascade", "heath_brothers",
  "working_playbook", "positioning_first", "sxd",
  "market_validation", "strategic_goal_cards", "teresa_torres",
]);

function deriveTierCells(
  frameworksUsed: string[],
  signals: SourceConfidenceSignals,
  hasBaseline = false,
): TierCellData[] {
  const fw = frameworksUsed.map((f) => f.toLowerCase());
  const outsidePresent =
    hasBaseline ||
    fw.some((f) => PUBLIC_FRAMEWORK_KEYS.has(f) || f.includes("public") || f.includes("baseline") || f.includes("jtbd") || f.includes("odi"));

  const outsideDetail = outsidePresent ? "Published positioning frameworks" : undefined;

  const cells: TierCellData[] = [
    { tier: "outside", label: "Outside Signals", present: outsidePresent, detail: outsideDetail },
    { tier: "org", label: "Organization Signals", present: signals.hasCompanyEvidence },
  ];

  if (signals.hasPrimaryEvidence) {
    cells.push({ tier: "customer", label: "Customer Signals", present: true });
  }

  cells.push({ tier: "market", label: "Market Validation", present: signals.hasImplementedTested });
  return cells;
}

function fieldFilled(v: string | undefined | null): boolean {
  return typeof v === "string" && v.trim().length > 0;
}

function evidenceItems(canvas: PositioningCanvas): Array<{ label: string; present: boolean }> {
  return [
    { label: "Market category", present: fieldFilled(canvas.market_category) },
    { label: "Competitive alternatives", present: canvas.competitive_alternatives.length > 0 },
    { label: "Unique attributes", present: canvas.unique_attributes.length > 0 },
    { label: "Value proposition", present: fieldFilled(canvas.value_for_customer) },
    { label: "Best-fit customers", present: fieldFilled(canvas.best_fit_customers) },
    { label: "Category rationale", present: fieldFilled(canvas.category_rationale) },
  ];
}

function changeBullets(canvas: PositioningCanvas, signals: SourceConfidenceSignals): string[] {
  const bullets: string[] = [];
  if (!signals.hasCompanyEvidence) {
    bullets.push("Adding organization-specific evidence would strengthen the positioning claims.");
  }
  if (!signals.hasPrimaryEvidence) {
    bullets.push("Validating positioning with customer research would raise confidence above the public-source baseline.");
  }
  if (!fieldFilled(canvas.market_category)) {
    bullets.push("Defining the market category is a foundational step — other positioning decisions depend on it.");
  }
  if (canvas.unique_attributes.length === 0) {
    bullets.push("Listing at least three unique attributes would clarify what differentiates this offering.");
  }
  if (bullets.length === 0) {
    bullets.push("Run updated customer research to validate that the market category still holds.");
    bullets.push("Test the positioning narrative with prospects to check for resonance gaps.");
  }
  return bullets;
}

const NULL_SIGNALS: SourceConfidenceSignals = {
  uploadedFiles: 0,
  hasCompanyEvidence: false,
  hasPrimaryEvidence: false,
  primaryEvidenceSignals: 0,
  testedSignal: 0,
  hasImplementedTested: false,
};

export default function PositioningInspectPanel({
  open,
  onClose,
  canvas,
  frameworksUsed,
  signals = NULL_SIGNALS,
  hasBaseline = false,
}: {
  open: boolean;
  onClose: () => void;
  canvas: PositioningCanvas | null;
  frameworksUsed: string[];
  signals?: SourceConfidenceSignals;
  hasBaseline?: boolean;
}) {
  if (!canvas) return null;

  const genContext = generationContextLabel(frameworksUsed);
  const tierCells = deriveTierCells(frameworksUsed, signals, hasBaseline);
  const fields = evidenceItems(canvas);
  const present = fields.filter((f) => f.present);
  const missing = fields.filter((f) => !f.present);
  const bullets = changeBullets(canvas, signals);

  return (
    <StrategicInspectShell
      open={open}
      onClose={onClose}
      title={canvas.market_category || "Positioning Canvas"}
      subtitle={`Generated using: ${genContext}`}
    >
      {/* Section 0: What this claims */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <p style={SECTION_LABEL}>What this claims</p>
        {canvas.best_fit_customers && (
          <div style={{ border: `1px solid ${c.line}`, background: c.lineSoft, padding: "10px 12px" }}>
            <p style={{ margin: "0 0 2px", fontFamily: MONO, fontSize: 9, textTransform: "uppercase", letterSpacing: "0.1em", color: c.inkFaint }}>
              Best-fit customers
            </p>
            <p style={{ margin: 0, fontSize: 12, lineHeight: 1.5, color: c.inkSoft }}>{canvas.best_fit_customers}</p>
          </div>
        )}
        {canvas.value_for_customer && (
          <div style={{ border: `1px solid ${c.line}`, background: c.lineSoft, padding: "10px 12px" }}>
            <p style={{ margin: "0 0 2px", fontFamily: MONO, fontSize: 9, textTransform: "uppercase", letterSpacing: "0.1em", color: c.inkFaint }}>
              Value delivered
            </p>
            <p style={{ margin: 0, fontSize: 12, lineHeight: 1.5, color: c.inkSoft }}>{canvas.value_for_customer}</p>
          </div>
        )}
        <TierAlignmentGrid cells={tierCells} />
      </div>

      <div style={DIVIDER} />

      {/* Section 1: Evidence */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <p style={SECTION_LABEL}>Evidence</p>

        {present.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <p style={SUB_LABEL(c.teal)}>Populated</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {present.map((f) => (
                <div key={f.label} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: c.inkSoft }}>
                  <span style={{ color: c.teal }}>◉</span>
                  <span>{f.label}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <p style={SUB_LABEL(c.coral)}>Not yet filled</p>
          {missing.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {missing.map((f) => (
                <div key={f.label} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: c.coral }}>
                  <span>○</span>
                  <span>{f.label}</span>
                </div>
              ))}
            </div>
          ) : (
            <p style={{ margin: 0, fontSize: 12, color: c.inkFaint }}>All canvas fields are populated.</p>
          )}
        </div>
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
    </StrategicInspectShell>
  );
}
