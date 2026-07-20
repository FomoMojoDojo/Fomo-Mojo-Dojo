/*
 * EOV-1 — the REFERENCE (standards) shell: a THIRD register in the outside
 * phase, designed to mount after MovementShell.
 *
 * ══ DORMANT — NOT MOUNTED ANYWHERE ═══════════════════════════════════════════
 * Client-facing mount REMOVED by operator ruling 2026-07-20: generic reference
 * data must not render in the client story. The Elements of Value pyramids are
 * byte-identical for every company, so in a story that opens all-about-them they
 * read as fill-in-the-blank content. Those elements now reach the client only
 * via the future selection/delta layer, attached to their instance.
 *
 * This file is RESERVED as the home of the Act C industry-standard job-map
 * library at FD-3. That library stays client-facing because it is
 * industry-specific — it IS about them. Do not mount this shell until FD-3
 * exists, and never mount company-identical content in it.
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
