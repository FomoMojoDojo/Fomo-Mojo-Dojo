import { D } from "./tokens";

export interface SignalBasis {
  publicCount: number;
  teamCount: number;
  customerCount: number;
}

export function SignalBasisChip({ publicCount, teamCount, customerCount }: SignalBasis) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 28, flexWrap: "wrap" }}>
      <span style={{ fontFamily: D.mono, fontSize: 9, textTransform: "uppercase" as const, letterSpacing: "0.12em", color: D.inkFaint }}>
        Signal Basis
      </span>
      <span style={{ fontFamily: D.mono, fontSize: 9, color: D.hairline }}>·</span>
      <span style={{ fontFamily: D.mono, fontSize: 10, color: D.inkFaint }}>
        {publicCount} public
      </span>
      <span style={{ fontFamily: D.mono, fontSize: 9, color: D.hairline }}>·</span>
      <span style={{ fontFamily: D.mono, fontSize: 10, color: D.inkFaint }}>
        {teamCount} team
      </span>
      <span style={{ fontFamily: D.mono, fontSize: 9, color: D.hairline }}>·</span>
      <span style={{ fontFamily: D.mono, fontSize: 10, color: customerCount === 0 ? D.signal : D.ink }}>
        {customerCount} customers
      </span>
    </div>
  );
}
