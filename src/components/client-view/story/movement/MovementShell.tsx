/*
 * MPD-3 — the inferred-strategy MOVEMENT shell (client view, after the
 * Outside evidence acts). A DISTINCT REGISTER from the evidence acts: this is
 * the strategy we read from the public footprint — inferred, not spoken by
 * the client. The divider renders that register shift.
 *
 * SCOPE (EOV-1): only readings OF THIS COMPANY belong in here — Act A (markets)
 * and Act B (positioning). The industry-standard job map that once had a slot
 * reserved here is REFERENCE content and mounts in StandardsShell instead: it
 * says nothing about the client, so under this shell's sub ("not your words
 * yet") a published taxonomy would read as a finding about the company.
 */

// ── Client-facing copy — SIGNED AS-IS 2026-07-16 (MPD-3 copy) ─────────────────
const DIVIDER_EYEBROW = "The strategy we can see";
const DIVIDER_SUB = "Our reading of your public footprint — not your words yet.";
// ──────────────────────────────────────────────────────────────────────────────

export default function MovementShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="cvs-mv" aria-label="Inferred strategy movement">
      <div className="cvs-mv-divider">
        <p className="cvs-mv-divider-eyebrow">{DIVIDER_EYEBROW}</p>
        <p className="cvs-mv-divider-sub">{DIVIDER_SUB}</p>
      </div>
      {children}
    </div>
  );
}
