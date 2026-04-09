import Interpretation from "@/components/client-view/decision-path/Interpretation";
import type { DecisionDriver, DecisionDriverTone } from "@/components/client-view/decision-path/types";

type ConstraintCardProps = {
  driver: DecisionDriver;
  tone: DecisionDriverTone;
  interpretationImpact: string;
  confidenceBasis: string;
  biggestRisk: string;
  shortLines: (lines: string[], fallback: string) => string[];
};

function toneLabel(tone: DecisionDriverTone) {
  if (tone === "risk") return "Low";
  if (tone === "uncertain") return "Medium";
  return "High";
}

export default function ConstraintCard({
  driver,
  tone,
  interpretationImpact,
  confidenceBasis,
  biggestRisk,
  shortLines,
}: ConstraintCardProps) {
  return (
    <aside key={driver.id} className={`decision-trust-panel is-visible is-${tone}`} aria-live="polite">
      <p className="decision-constraint-kicker">Primary Constraint</p>
      <p className="decision-trust-heading">
        {driver.label} · {toneLabel(tone)}
      </p>

      <Interpretation
        problem={driver.summary}
        impact={interpretationImpact}
        nextStep={driver.howToImprove}
      />

      <div className="decision-trust-block">
        <p className="decision-action-kicker">What we know</p>
        <ul className="decision-impact-list is-compact">
          {shortLines(driver.exists, "No strong signals yet.").map((line) => (
            <li key={`${driver.id}-known-${line}`}>{line}</li>
          ))}
        </ul>
      </div>

      <div className="decision-trust-block">
        <p className="decision-action-kicker">What's missing</p>
        <ul className="decision-impact-list is-compact">
          {shortLines(driver.missing, "No major gaps.").map((line) => (
            <li key={`${driver.id}-missing-${line}`}>{line}</li>
          ))}
        </ul>
      </div>

      <div className="decision-trust-block">
        <p className="decision-action-kicker">Why it matters</p>
        <p className="decision-path-body">{driver.whyItMatters}</p>
      </div>

      <div className="decision-trust-block">
        <p className="decision-action-kicker">Trust layer</p>
        <p className="decision-path-body">Confidence basis: {confidenceBasis}</p>
        <p className="decision-path-body">Biggest risk: {biggestRisk}</p>
      </div>
    </aside>
  );
}
