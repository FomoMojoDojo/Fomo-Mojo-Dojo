// Routes view presentational primitives — relocated verbatim from ClientRefinePreviewRoutesView (strand 3a).
import { R, HIERARCHY_STATE_LABEL } from "./shared";
import type { ClaimState } from "@/lib/claimState";

export function splitActionText(text: string): [string, string] {
  const words = text.split(" ");
  const split = Math.max(2, Math.ceil(words.length * 0.45));
  return [words.slice(0, split).join(" "), words.slice(split).join(" ")];
}

// Ring button — standalone interactive (use only where NOT nested in a button parent)
export function ExpandRingBtn({ open, onClick }: { open: boolean; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={open ? "Collapse" : "Expand"}
      style={{
        width: 28, height: 28, borderRadius: "50%",
        border: `1.5px solid ${open ? R.ink : R.hairline}`,
        background: open ? R.ink : "transparent",
        color: open ? "#fff" : "rgba(17,17,17,0.45)",
        cursor: "pointer",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontFamily: R.mono, fontSize: 15, lineHeight: 1, fontWeight: 400,
        flexShrink: 0,
      }}
    >
      {open ? "−" : "+"}
    </button>
  );
}

// Visual-only ring indicator — use inside a <button> parent (no nested button)
export function ExpandRingIndicator({ open }: { open: boolean }) {
  return (
    <span style={{
      width: 26, height: 26, borderRadius: "50%",
      border: `1.5px solid ${open ? R.ink : R.hairline}`,
      background: open ? R.ink : "transparent",
      color: open ? "#fff" : "rgba(17,17,17,0.45)",
      display: "inline-flex", alignItems: "center", justifyContent: "center",
      fontFamily: R.mono, fontSize: 14, lineHeight: 1, fontWeight: 400,
      flexShrink: 0,
    }}>
      {open ? "−" : "+"}
    </span>
  );
}

export function InkMetaChip({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div style={{ display: "flex", gap: 5, alignItems: "baseline" }}>
      <span style={{ fontFamily: R.mono, fontSize: 8, textTransform: "uppercase", letterSpacing: "0.12em", color: "rgba(17,17,17,0.4)" }}>{label}</span>
      <span style={{ fontFamily: R.mono, fontSize: 10, fontWeight: 600, color: accent ? R.signal : "rgba(17,17,17,0.65)" }}>{value}</span>
    </div>
  );
}

export function RouteStateTag({ claimState }: { claimState: ClaimState }) {
  const isDiagnose = claimState === "diagnose";
  const label = HIERARCHY_STATE_LABEL[claimState] ?? claimState;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      fontFamily: R.mono, fontSize: 8.5, textTransform: "uppercase", letterSpacing: "0.1em",
      color: isDiagnose ? R.signal : "rgba(17,17,17,0.5)",
      padding: "2px 7px",
      background: isDiagnose ? "rgba(255,91,41,0.12)" : "rgba(17,17,17,0.05)",
      borderRadius: 2,
    }}>
      {isDiagnose && (
        <span className="crpv-pulse-dot" style={{
          width: 5, height: 5, borderRadius: "50%",
          background: R.signal, flexShrink: 0, display: "inline-block",
        }} />
      )}
      {label}
    </span>
  );
}

export function ScoreChip({ label, value, accent, dim }: { label: string; value: number; accent?: boolean; dim?: boolean }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", padding: "0 14px" }}>
      <span style={{
        fontFamily: R.mono, fontSize: 22, fontWeight: 500,
        color: accent ? R.signal : dim ? "rgba(17,17,17,0.35)" : R.ink,
        lineHeight: 1, fontVariantNumeric: "tabular-nums",
      }}>
        {value}
      </span>
      <span style={{
        fontFamily: R.mono, fontSize: 8, textTransform: "uppercase", letterSpacing: "0.12em",
        color: "rgba(17,17,17,0.4)", marginTop: 3,
      }}>
        {label}
      </span>
    </div>
  );
}

export function HierarchyScoreStrip({ current, reachable, unlockable }: { current: number; reachable: number; unlockable: number }) {
  const max = Math.max(unlockable, 100);
  const filledPct   = (current / max) * 100;
  const reachPct    = (reachable / max) * 100;
  const unlockPct   = (unlockable / max) * 100;
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      borderTop: `1px solid ${R.hairline}`, borderBottom: `1px solid ${R.hairline}`,
      padding: "16px 0", marginBottom: 48,
    }}>
      {/* Left: thin segmented bar */}
      <div style={{ flex: 1, position: "relative", height: 3, background: "rgba(17,17,17,0.08)", borderRadius: 1, overflow: "hidden", marginRight: 24 }}>
        <div style={{ position: "absolute", left: 0, top: 0, height: "100%", width: `${filledPct}%`, background: R.ink, borderRadius: 1 }} />
        {reachPct > filledPct && (
          <div style={{ position: "absolute", left: `${filledPct}%`, top: 0, height: "100%", width: `${reachPct - filledPct}%`, background: R.ink, opacity: 0.22, borderRadius: 1 }} />
        )}
        {unlockPct > reachPct && (
          <div style={{ position: "absolute", left: `${reachPct}%`, top: 0, height: "100%", width: `${unlockPct - reachPct}%`, background: R.signal, opacity: 0.55, borderRadius: 1 }} />
        )}
      </div>
      {/* Right: compact score chips */}
      <div style={{ display: "flex", alignItems: "center", gap: 0, flexShrink: 0, borderLeft: `1px solid ${R.hairline}` }}>
        <ScoreChip label="NOW" value={current} accent />
        <span style={{ fontFamily: R.mono, fontSize: 12, color: "rgba(17,17,17,0.25)", padding: "0 4px" }}>→</span>
        <ScoreChip label="REACHABLE" value={Math.round(reachable)} />
        <span style={{ fontFamily: R.mono, fontSize: 12, color: "rgba(17,17,17,0.25)", padding: "0 4px" }}>→</span>
        <ScoreChip label="UNLOCKABLE" value={Math.round(unlockable)} dim />
      </div>
    </div>
  );
}

export function KeystoneStripe({ action, scoreLift }: { action: string; scoreLift: number }) {
  const [actionBefore, actionSignal] = splitActionText(action);
  return (
    <div style={{
      background: R.ink,
      marginLeft: -60, width: "calc(100% + 120px)",
      padding: "28px 60px",
      marginBottom: 48,
      display: "flex", alignItems: "center", justifyContent: "space-between", gap: 32,
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontFamily: R.mono, fontSize: 9, textTransform: "uppercase", letterSpacing: "0.14em", color: "rgba(246,246,244,0.45)", margin: "0 0 10px" }}>
          § KEY MOVE
        </p>
        <p style={{ fontFamily: R.sans, fontSize: 18, fontWeight: 600, color: "#f6f6f4", lineHeight: 1.45, margin: 0, maxWidth: 580 }}>
          {actionBefore}{" "}
          <span style={{ color: R.signal }}>{actionSignal}</span>
        </p>
      </div>
      <div style={{ flexShrink: 0, textAlign: "right" }}>
        <p style={{ fontFamily: R.mono, fontSize: 52, fontWeight: 500, color: R.signal, lineHeight: 1, margin: 0, fontVariantNumeric: "tabular-nums" }}>
          +{scoreLift}
        </p>
        <p style={{ fontFamily: R.mono, fontSize: 8.5, color: "rgba(246,246,244,0.45)", textTransform: "uppercase", letterSpacing: "0.12em", margin: "4px 0 0" }}>
          PTS REACHABLE
        </p>
      </div>
    </div>
  );
}
