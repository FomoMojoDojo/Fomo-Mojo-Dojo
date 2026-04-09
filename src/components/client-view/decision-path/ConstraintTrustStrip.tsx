type ConstraintTrustStripProps = {
  confidenceBasis: string;
  signalsCaptured: string;
  biggestRisk: string;
};

export default function ConstraintTrustStrip({
  confidenceBasis,
  signalsCaptured,
  biggestRisk,
}: ConstraintTrustStripProps) {
  return (
    <section className="dp-constraint-trust" aria-label="Trust layer">
      <p className="dp-constraint-trust-line">
        <span>Confidence basis:</span> {confidenceBasis}
      </p>
      <p className="dp-constraint-trust-line">
        <span>Signals captured:</span> {signalsCaptured}
      </p>
      <p className="dp-constraint-trust-line">
        <span>Biggest risk:</span> {biggestRisk}
      </p>
    </section>
  );
}
