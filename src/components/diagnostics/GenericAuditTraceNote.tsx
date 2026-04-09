type Props = {
  active: boolean;
  source: string;
  evaluation: string;
  scoring: string;
  why: string;
  className?: string;
};

const traceColor = "#6A44D7";
const traceBorder = "#D6CBFF";
const traceBg = "#F6F2FF";

export default function GenericAuditTraceNote({
  active,
  source,
  evaluation,
  scoring,
  why,
  className = "",
}: Props) {
  if (!active) return null;

  return (
    <div
      className={`rounded-xl border px-3 py-2.5 ${className}`.trim()}
      style={{ borderColor: traceBorder, background: traceBg }}
    >
      <p
        className="font-mono text-[10px] uppercase tracking-[0.1em]"
        style={{ color: traceColor }}
      >
        Generic Audit Trace
      </p>
      <p className="mt-1.5 font-sans text-[12px] leading-[1.55]" style={{ color: traceColor }}>
        <strong>Source:</strong> {source}
      </p>
      <p className="mt-1 font-sans text-[12px] leading-[1.55]" style={{ color: traceColor }}>
        <strong>AI evaluation:</strong> {evaluation}
      </p>
      <p className="mt-1 font-sans text-[12px] leading-[1.55]" style={{ color: traceColor }}>
        <strong>Scoring:</strong> {scoring}
      </p>
      <p className="mt-1 font-sans text-[12px] leading-[1.55]" style={{ color: traceColor }}>
        <strong>Why it matters:</strong> {why}
      </p>
    </div>
  );
}

