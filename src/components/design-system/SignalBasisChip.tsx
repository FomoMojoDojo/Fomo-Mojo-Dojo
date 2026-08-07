import { useState } from "react";
import { D } from "./tokens";
import type { PublicBreakdown } from "@/hooks/useSignalLandscape";

export interface SignalBasis {
  publicCount: number;
  teamCount: number;
  customerCount: number;
  publicBreakdown?: PublicBreakdown;
}

// Signal-basis recount (operator-signed, 2026-06-11): the headline "public" number is
// independent outside voice only — non-syndicated outside_voice_about_client, deduped
// by content identity. One click deeper, the breakdown shows whose voices make up the
// whole public picture; the rows reconcile to the raw outside total, nothing silently
// dropped. The sharp drop from the old number is the product being truthful: the old
// count included the client's own words, competitor statements, and duplicate copies.
export function SignalBasisChip({ publicCount, teamCount, customerCount, publicBreakdown }: SignalBasis) {
  const [open, setOpen] = useState(false);
  const hasBreakdown = !!publicBreakdown;

  return (
    <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 6, marginBottom: 28, flexWrap: "wrap" }}>
      <span style={{ fontFamily: D.mono, fontSize: 9, textTransform: "uppercase" as const, letterSpacing: "0.12em", color: D.inkFaint }}>
        Signal Basis
      </span>
      <span style={{ fontFamily: D.mono, fontSize: 9, color: D.hairline }}>·</span>
      <button
        type="button"
        onClick={() => hasBreakdown && setOpen((v) => !v)}
        style={{
          fontFamily: D.mono,
          fontSize: 10,
          color: D.inkFaint,
          background: "none",
          border: "none",
          padding: 0,
          cursor: hasBreakdown ? "pointer" : "default",
          textDecoration: hasBreakdown ? "underline dotted" : "none",
        }}
        title={hasBreakdown ? "See the whole public picture" : undefined}
      >
        {publicCount} public
      </button>
      <span style={{ fontFamily: D.mono, fontSize: 9, color: D.hairline }}>·</span>
      <span style={{ fontFamily: D.mono, fontSize: 10, color: D.inkFaint }}>
        {teamCount} team
      </span>
      <span style={{ fontFamily: D.mono, fontSize: 9, color: D.hairline }}>·</span>
      <span style={{ fontFamily: D.mono, fontSize: 10, color: customerCount === 0 ? D.signal : D.ink }}>
        {customerCount} customers
      </span>

      {open && publicBreakdown && (
        <div
          style={{
            position: "absolute",
            top: 20,
            left: 0,
            zIndex: 40,
            background: "#fff",
            border: `1px solid ${D.hairline}`,
            borderRadius: 3,
            boxShadow: "0 4px 16px rgba(17,17,17,0.08)",
            padding: "10px 14px",
            minWidth: 240,
          }}
        >
          <BreakdownRow label="Independent voices" n={publicBreakdown.independent} emphasis />
          <BreakdownRow label="Your public voice" n={publicBreakdown.ownVoice} />
          <BreakdownRow label="Competitors & market" n={publicBreakdown.competitorsMarket} />
          {publicBreakdown.syndicatedExcluded > 0 && (
            <BreakdownRow label="Your voice on other sites" n={publicBreakdown.syndicatedExcluded} />
          )}
          {publicBreakdown.duplicatesMerged > 0 && (
            <BreakdownRow label="Merged duplicates" n={publicBreakdown.duplicatesMerged} />
          )}
          {publicBreakdown.analysisExcluded > 0 && (
            <BreakdownRow label="Our analysis (excluded)" n={publicBreakdown.analysisExcluded} />
          )}
        </div>
      )}
    </div>
  );
}

function BreakdownRow({ label, n, emphasis = false }: { label: string; n: number; emphasis?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 16, padding: "2px 0" }}>
      <span style={{ fontFamily: D.mono, fontSize: 10, color: emphasis ? D.ink : D.inkFaint, fontWeight: emphasis ? 600 : 400 }}>
        {label}
      </span>
      <span style={{ fontFamily: D.mono, fontSize: 10, color: emphasis ? D.ink : D.inkFaint, fontWeight: emphasis ? 600 : 400 }}>
        {n}
      </span>
    </div>
  );
}
