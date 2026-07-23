// OC-2b + FR-FLOW-1b — the SINGLE First Read entry point on the workshop Inputs tab.
// ALWAYS rendered for every company (the rail owns its own empty/dead-id states);
// deliberately NOT gated on hasHierarchy/spine/baseline (the state-proxy defect class).
// `dark` only themes it to the intro branch it renders under.
//
// FR-FLOW-1b: intake is gone. This control now MINTS-IF-MISSING on a deliberate click —
// reuse an existing open|proposal_issued session, else create one — then navigates to
// the rail. The rail itself still never auto-mints on load (orphan-session law), so its
// honest-empty state stands for a direct-URL visit with no session. The href is kept as
// the semantic target (and so the router-less OC-2b mount tests keep asserting it); the
// onClick does the mint and a hard navigation (no router hook).

import { supabase } from "@/integrations/supabase/client";

export const OPEN_FIRST_READ_LABEL = "Open First Read →"; // operator-signed (OC-2b brief)

export default function OpenFirstReadControl({
  companyId,
  dark,
  navigate = (url: string) => window.location.assign(url),
}: {
  companyId: string | null;
  dark?: boolean;
  /** Injectable for tests; production hard-navigates via window.location. */
  navigate?: (url: string) => void;
}) {
  const disabled = !companyId;
  const href = companyId ? `/first-read/${companyId}` : undefined;

  const onOpen = async (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (!companyId) return;
    e.preventDefault();
    // mint-if-missing: reuse the most-recent open|proposal_issued session, else create one
    const { data: existing } = await supabase
      .from("first_read_sessions")
      .select("id")
      .eq("company_id", companyId)
      .in("status", ["open", "proposal_issued"])
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!existing) {
      await supabase.from("first_read_sessions").insert({ company_id: companyId, status: "open" });
    }
    navigate(`/first-read/${companyId}`);
  };

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: dark ? 16 : 12, flexWrap: "wrap" }}>
      <a
        href={href}
        aria-disabled={disabled}
        onClick={onOpen}
        style={{
          fontFamily: "monospace", fontSize: dark ? 9 : 10, letterSpacing: "0.06em",
          color: disabled ? (dark ? "rgba(246,246,244,0.25)" : "#bbb") : (dark ? "#7a9e90" : "#2f6b3a"),
          background: "none", padding: 0,
          textDecoration: "underline", textDecorationStyle: "dashed", textUnderlineOffset: 3,
          pointerEvents: disabled ? "none" : "auto", cursor: disabled ? "default" : "pointer",
        }}
      >
        {OPEN_FIRST_READ_LABEL}
      </a>
      {/* Sub-line — OPERATOR-SIGNED 2026-07-23. */}
      <span style={{ fontFamily: "monospace", fontSize: dark ? 9 : 10, color: dark ? "rgba(246,246,244,0.35)" : "#aaa" }}>
        The presenter-led first-meeting walkthrough for this company.
      </span>
    </div>
  );
}
