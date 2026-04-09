type InterpretationProps = {
  problem: string;
  impact: string;
  nextStep: string;
};

export default function Interpretation({ problem, impact, nextStep }: InterpretationProps) {
  return (
    <div className="decision-trust-block">
      <p className="decision-action-kicker">Interpretation</p>
      <p className="decision-path-body">Problem: {problem}</p>
      <p className="decision-path-body">Why: {impact}</p>
      <p className="decision-path-body">Do: {nextStep}</p>
    </div>
  );
}

