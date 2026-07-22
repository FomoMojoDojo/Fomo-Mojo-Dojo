/*
 * EOV-1 — the REFERENCE (standards) shell: a THIRD register in the outside phase.
 *
 * ══ MOUNTED AT FD-3 ══════════════════════════════════════════════════════════
 * As of FD-3 this shell is MOUNTED at the TOP of the Outside phase in
 * ClientStoryView, wrapping FrontDoorMapAct — the industry-standard job map, the
 * cold-open "standard shape" shown before any reading of the company. (The
 * earlier "designed to mount after MovementShell" plan is superseded: FD-3 is the
 * cold open and stands FIRST.)
 *
 * The Elements of Value pyramids remain OUT (operator ruling 2026-07-20): generic,
 * byte-identical-per-company content must never mount here. Only industry-specific
 * reference content — which IS about the client's world — belongs in this shell.
 * FrontDoorMapAct is that content: a published, industry-keyed standard map, never
 * company-identical fill.
 *
 * The divider copy below remains operator-signed and must not be altered.
 *
 * Why its own shell and not another act inside MovementShell: MovementShell's
 * signed sub reads "Our reading of your public footprint — not your words yet."
 * Everything under it is an inference ABOUT THIS COMPANY. Reference data says
 * nothing about the client at all, so mounting it there would make a published
 * taxonomy read as a finding about the company — the exact contamination the
 * FD-1 wall exists to prevent, arriving through the copy layer instead of the
 * schema. The register shift is stated outright, the way MovementShell states
 * its own.
 *
 * Slots: Act C (industry-standard job map, reserved for FD-3) and Act D
 * (Elements of Value). Nothing company-scoped may ever mount in here.
 */

// ── Client-facing copy — OPERATOR-SIGNED VERBATIM 2026-07-20 (EOV-1) ──────────
const DIVIDER_EYEBROW = "How value gets measured";
const DIVIDER_SUB =
  "Published frameworks, shown as they were published — not a reading of your business.";
// ─────────────────────────────────────────────────────────────────────────────

export default function StandardsShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="cvs-std" aria-label="Published standards register">
      <div className="cvs-std-divider">
        <p className="cvs-std-divider-eyebrow">{DIVIDER_EYEBROW}</p>
        <p className="cvs-std-divider-sub">{DIVIDER_SUB}</p>
      </div>
      {children}
    </div>
  );
}
