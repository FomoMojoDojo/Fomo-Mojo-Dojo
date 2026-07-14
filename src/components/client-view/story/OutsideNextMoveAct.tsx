/*
 * Outside · Act 4 — Next Move (CV-2). Pure navigation copy per the design
 * reference — no data reads. "Start Diagnose" switches the story surface to
 * the Diagnose phase (still scaffolds until CV-3 — honest at this stage).
 * "Refresh read" is rendered DISABLED: no recompute may fire from this
 * surface in this gate.
 */

// ── Client-facing copy — PENDING OPERATOR SIGNATURE (CV-2) ────────────────────
const EYEBROW = "Next move";
const HEADLINE = "Take this read inside.";
const BODY =
  "Next we rebuild your side from your own documents — no forms, we read your world — and set it against this one. That's where the gap becomes visible.";
const PRIMARY_LABEL = "Start Diagnose";
const GHOST_LABEL = "Refresh read";
// ──────────────────────────────────────────────────────────────────────────────

export default function OutsideNextMoveAct({ onStartDiagnose }: { onStartDiagnose: () => void }) {
  return (
    <section className="cvs-act cvs-act-narrow" aria-label="Outside · Act 4 — Next move">
      <p className="cvs-act-eyebrow">{EYEBROW}</p>
      <h2 className="cvs-nextmove-headline">{HEADLINE}</h2>
      <p className="cvs-support">{BODY}</p>
      <div className="cvs-pill-row">
        <button type="button" className="cvs-pill-primary" onClick={onStartDiagnose}>
          {PRIMARY_LABEL}
        </button>
        {/* Inert by gate rule: no recompute from this surface in CV-2. */}
        <button type="button" className="cvs-pill-ghost" disabled title="Not available yet">
          {GHOST_LABEL}
        </button>
      </div>
    </section>
  );
}
