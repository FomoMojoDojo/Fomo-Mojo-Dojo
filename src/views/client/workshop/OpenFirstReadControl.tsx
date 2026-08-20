// OC-2b + FR-FLOW-1b + FR8-LINK — the SINGLE First Read entry point on the workshop
// Inputs tab. ALWAYS rendered for every company (the rail owns its own empty/dead-id
// states); deliberately NOT gated on hasHierarchy/spine/baseline (the state-proxy
// defect class). `dark` only themes it to the intro branch it renders under.
//
// FR8-LINK (operator ruling): the PRIMARY link now opens the 8-beat client surface
// (/preview/client-refine/first-read/:companyId) — a plain navigation, NO session
// mint (the 8-beat surface has no session; minting here would orphan V2 sessions).
// The V2 presenter flow stays reachable through the quiet legacy link, which keeps
// the FR-FLOW-1b mint-if-missing semantics exactly: reuse an existing
// open|proposal_issued session, else create one, then navigate to the rail. The
// rail itself still never auto-mints on load (orphan-session law).

import { supabase } from "@/integrations/supabase/client";
import { clientRefineFirstReadPath } from "@/lib/clientRefinePreview";

export const OPEN_FIRST_READ_LABEL = "Open First Read →"; // operator-signed (OC-2b brief)
export const OPEN_LEGACY_FIRST_READ_LABEL = "open legacy first read"; // FR8-LINK ruling

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
  const href = companyId ? clientRefineFirstReadPath(companyId) : undefined;
  const legacyHref = companyId ? `/first-read/${companyId}` : undefined;

  // PRIMARY — the 8-beat surface. Plain navigation, never mints.
  const onOpen = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (!companyId) return;
    e.preventDefault();
    navigate(clientRefineFirstReadPath(companyId));
  };

  // LEGACY — V2 presenter rail, FR-FLOW-1b mint-if-missing preserved verbatim.
  const onOpenLegacy = async (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (!companyId) return;
    e.preventDefault();
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
      <a
        href={legacyHref}
        aria-disabled={disabled}
        onClick={onOpenLegacy}
        style={{
          fontFamily: "monospace", fontSize: dark ? 9 : 10, letterSpacing: "0.06em",
          color: disabled ? (dark ? "rgba(246,246,244,0.2)" : "#ccc") : (dark ? "rgba(246,246,244,0.4)" : "#999"),
          background: "none", padding: 0,
          textDecoration: "underline", textDecorationStyle: "dotted", textUnderlineOffset: 3,
          pointerEvents: disabled ? "none" : "auto", cursor: disabled ? "default" : "pointer",
        }}
      >
        {OPEN_LEGACY_FIRST_READ_LABEL}
      </a>
      {/* Sub-line — OPERATOR-SIGNED 2026-07-23. It describes the PRESENTER-LED V2
          walkthrough, so it stays attached to the legacy link it is true of. */}
      <span style={{ fontFamily: "monospace", fontSize: dark ? 9 : 10, color: dark ? "rgba(246,246,244,0.35)" : "#aaa" }}>
        The presenter-led first-meeting walkthrough for this company.
      </span>
    </div>
  );
}
