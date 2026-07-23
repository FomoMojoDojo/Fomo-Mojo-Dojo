// First Read · rail navigation (Back / count / Next).
//
// OC-2c: on the LAST act, "Next →" previously rendered but did nothing (there is
// no act to advance to). It is now ABSENT on the last act — not merely disabled —
// so there is no dead control. Back remains (disabled on the first act). No copy
// changed.

export default function FirstReadNav({
  step,
  total,
  onBack,
  onNext,
}: {
  step: number;
  total: number;
  onBack: () => void;
  onNext: () => void;
}) {
  const isLast = step >= total - 1;
  return (
    <div className="cvs-fr-nav">
      <button type="button" className="cvs-pill-ghost" disabled={step === 0} onClick={onBack}>
        ← Back
      </button>
      <span className="cvs-fr-nav-count">{step + 1} / {total}</span>
      {!isLast && (
        <button type="button" className="cvs-pill-primary" onClick={onNext}>
          Next →
        </button>
      )}
    </div>
  );
}
