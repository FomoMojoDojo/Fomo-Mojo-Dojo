import StrategicInspectShell from "@/components/inspect/StrategicInspectShell";
import TierAlignmentGrid from "@/components/inspect/TierAlignmentGrid";
import type { TierCellData } from "@/lib/strategicObject";
import type { OpportunityRow } from "@/hooks/useOpportunities";

const MONO = '"JetBrains Mono", ui-monospace, "SFMono-Regular", monospace';

// crpv-aligned neutral palette
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

const JOURNEY_LABEL: Record<string, string> = {
  customer: "Customer Journey",
  revenue: "Revenue Journey",
  operations: "Operations Journey",
};

function priorityLabel(tier: string): { label: string; explanation: string } {
  if (tier === "focus") return { label: "Focus", explanation: "High importance, low satisfaction — the strongest underserved signal." };
  if (tier === "monitor") return { label: "Monitor", explanation: "Moderate signal — worth tracking but not the highest priority right now." };
  return { label: "Defer", explanation: "Lower priority signal — revisit when higher-priority outcomes are addressed." };
}

function serviceStateLabel(importance: number | null, satisfaction: number | null): string {
  const imp = importance ?? 5;
  const sat = satisfaction ?? 5;
  if (imp >= 7 && sat < 5) return "High-priority gap — important but not well served.";
  if (imp >= 7 && sat >= 7) return "Well served — monitor for shifts in importance.";
  if (imp < 4) return "Lower priority — less critical to customer job success.";
  return "Moderate priority — strengthen service quality or re-evaluate importance.";
}

function deriveTierCells(_opp: OpportunityRow): TierCellData[] {
  // Outside Signals: the ODI scoring methodology itself is public.
  // Organization Signals: a managed_outcome_id link is an internal record, not org evidence.
  // Customer Signals: require statistically validated primary research — OpportunityRow carries
  //   no such signal, so this tier is never shown here.
  // Market Validation: not applicable without implementation testing data.
  return [
    { tier: "outside", label: "Outside Signals", present: true, detail: "Customer needs scoring" },
    { tier: "org", label: "Organization Signals", present: false },
    { tier: "market", label: "Market Validation", present: false },
  ];
}

function changeBullets(opp: OpportunityRow): string[] {
  const bullets: string[] = [];
  const imp = opp.importance ?? 5;
  const sat = opp.satisfaction ?? 5;

  if (sat < 5) bullets.push("Improving satisfaction with this outcome would lower the opportunity score and reduce priority pressure.");
  if (imp > 7) bullets.push("This outcome consistently ranks as high-importance — validate with direct customer interviews before acting.");
  if (!opp.managed_outcome_id) bullets.push("Linking this opportunity to a managed outcome would unlock richer evidence and confidence tracking.");
  if (opp.priority_tier === "monitor") bullets.push("Gathering stronger evidence of dissatisfaction would move this into the focus lane.");
  if (bullets.length === 0) bullets.push("Run updated customer research to refine the importance and satisfaction signals.");
  return bullets;
}

const SECTION_LABEL: React.CSSProperties = {
  margin: "0 0 10px",
  fontFamily: MONO,
  fontSize: 9,
  textTransform: "uppercase",
  letterSpacing: "0.12em",
  color: c.inkFaint,
};

const DIVIDER: React.CSSProperties = {
  height: 1,
  background: c.line,
  margin: 0,
};

export default function OpportunityInspectPanel({
  open,
  onClose,
  opportunity,
}: {
  open: boolean;
  onClose: () => void;
  opportunity: OpportunityRow | null;
}) {
  if (!opportunity) return null;

  const imp = opportunity.importance ?? 5;
  const sat = opportunity.satisfaction ?? 5;
  const oppScore = Math.round(Number(opportunity.opportunity_score ?? 0));
  const priority = priorityLabel(opportunity.priority_tier);
  const tierCells = deriveTierCells(opportunity);
  const bullets = changeBullets(opportunity);
  const journeyLabel = JOURNEY_LABEL[opportunity.journey_key] ?? opportunity.journey_key;
  const stepContext = opportunity.step_number ? `Checkpoint ${opportunity.step_number}` : null;
  const stepDetail = opportunity.step_label ? ` · ${opportunity.step_label}` : "";

  return (
    <StrategicInspectShell
      open={open}
      onClose={onClose}
      title={opportunity.outcome}
      subtitle={[journeyLabel, stepContext ? `${stepContext}${stepDetail}` : null].filter(Boolean).join(" · ")}
    >
      {/* Section 0: What this claims */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <p style={SECTION_LABEL}>What this claims</p>
        <div style={{ border: `1px solid ${c.line}`, background: c.lineSoft, padding: "10px 12px" }}>
          <p style={{ margin: "0 0 2px", fontFamily: MONO, fontSize: 9, textTransform: "uppercase", letterSpacing: "0.1em", color: c.inkFaint }}>Priority</p>
          <p style={{ margin: "0 0 4px", fontSize: 13, fontWeight: 600, color: c.ink }}>{priority.label}</p>
          <p style={{ margin: 0, fontSize: 12, lineHeight: 1.5, color: c.inkSoft }}>{priority.explanation}</p>
        </div>
        <TierAlignmentGrid cells={tierCells} />
      </div>

      <div style={DIVIDER} />

      {/* Section 1: How this was scored */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <p style={SECTION_LABEL}>How this was scored</p>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
          <span style={{ fontSize: 28, fontWeight: 700, color: c.ink, lineHeight: 1 }}>{oppScore}</span>
          <span style={{ fontFamily: MONO, fontSize: 9, textTransform: "uppercase", letterSpacing: "0.1em", color: c.inkFaint }}>
            Opportunity score
          </span>
        </div>
        <div style={{ border: `1px solid ${c.line}`, background: c.lineSoft, padding: "10px 12px", display: "flex", flexDirection: "column", gap: 10 }}>
          <p style={{ margin: 0, fontSize: 12, lineHeight: 1.5, color: c.inkSoft }}>
            Score = (how important it is − how well it's satisfied) × how important it is
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontFamily: MONO, fontSize: 9, textTransform: "uppercase", letterSpacing: "0.1em", color: c.inkFaint, width: 76, flexShrink: 0 }}>
                Importance
              </span>
              <div style={{ flex: 1, height: 5, background: c.line }}>
                <div style={{ width: `${imp * 10}%`, height: "100%", background: c.coral }} />
              </div>
              <span style={{ fontFamily: MONO, fontSize: 11, color: c.ink, width: 16, textAlign: "right" }}>{imp}</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontFamily: MONO, fontSize: 9, textTransform: "uppercase", letterSpacing: "0.1em", color: c.inkFaint, width: 76, flexShrink: 0 }}>
                Satisfaction
              </span>
              <div style={{ flex: 1, height: 5, background: c.line }}>
                <div style={{ width: `${sat * 10}%`, height: "100%", background: c.teal }} />
              </div>
              <span style={{ fontFamily: MONO, fontSize: 11, color: c.ink, width: 16, textAlign: "right" }}>{sat}</span>
            </div>
          </div>
          <p style={{ margin: 0, fontSize: 12, lineHeight: 1.5, color: c.inkSoft }}>
            {serviceStateLabel(imp, sat)}
          </p>
          <div style={{ borderLeft: `2px solid ${c.amber}`, paddingLeft: 8 }}>
            <p style={{ margin: 0, fontSize: 11, lineHeight: 1.5, color: c.inkFaint }}>
              <strong style={{ color: c.inkSoft }}>Tentative.</strong>{" "}
              These scores are estimated using a structured needs-scoring approach and have not been validated with primary customer research. Treat as directional until interviews confirm them.
            </p>
          </div>
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
