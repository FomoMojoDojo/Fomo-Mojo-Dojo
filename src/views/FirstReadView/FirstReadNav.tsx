// First Read · rail navigation (Back / count / Next).
//
// OC-2c: on the LAST act, "Next →" is ABSENT (not merely disabled) — no dead
// control. Back remains (disabled on the first act).
//
// FR-UX-1: the bar is LOCKED to the viewport bottom (position: fixed) instead of
// scrolling with content, so Back/Next are always reachable on every act. The rail
// pads its content so nothing hides behind the bar (FirstReadView main padding).
// position:fixed is inline (not only CSS) so the fixed shape is assertable in the
// rendered tree; the visual chrome (theme background, top border) is the CSS class.

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
    <div
      className="cvs-fr-navbar"
      style={{ position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 20 }}
    >
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
    </div>
  );
}
