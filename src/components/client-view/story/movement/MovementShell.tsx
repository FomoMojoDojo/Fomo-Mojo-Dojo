/*
 * MPD-3 — the inferred-strategy MOVEMENT shell (client view, after the
 * Outside evidence acts). A DISTINCT REGISTER from the evidence acts: this is
 * the strategy we read from the public footprint — inferred, not spoken by
 * the client. The divider renders that register shift; Acts B/C (positioning,
 * job map) will mount inside the same shell in later gates.
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
