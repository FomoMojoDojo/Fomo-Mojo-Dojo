// FR-FLOW-1b — the LEGACY (V2 presenter) First Read link on the workshop Inputs tab.
// The PRIMARY 8-beat entry point moved to the side nav ("First read" under Inputs, 2026-08-21);
// only the quiet legacy link + its sub-line remain here, UNCHANGED. The legacy link keeps the
// FR-FLOW-1b mint-if-missing semantics exactly: reuse an existing open|proposal_issued session,
// else create one, then navigate to the V2 rail. The rail never auto-mints on load (orphan law).

import { supabase } from "@/integrations/supabase/client";

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
  const legacyHref = companyId ? `/first-read/${companyId}` : undefined;

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
