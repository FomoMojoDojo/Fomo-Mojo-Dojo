import type { ReactNode } from "react";

type TierTone = "focus" | "monitor" | "defer" | "need" | "want" | "desire";
type StateTone = "underserved" | "served" | "overserved" | "gap" | "designed" | "monitor";

const baseClass =
  "inline-flex items-center rounded-full border font-sans uppercase tracking-[0.08em]";

const tierStyles: Record<TierTone, { label: string; className: string }> = {
  focus: { label: "Prioritize", className: "border-rust/35 bg-white text-rust" },
  monitor: { label: "Investigate", className: "border-amber/35 bg-white text-amber" },
  defer: { label: "Later", className: "border-forest/35 bg-white text-forest" },
  need: { label: "Need", className: "border-forest/35 bg-white text-forest" },
  want: { label: "Want", className: "border-gold-dark/25 bg-white text-gold-dark" },
  desire: { label: "Desire", className: "border-slate/25 bg-white text-slate" },
};

const stateStyles: Record<StateTone, { label: string; className: string }> = {
  underserved: { label: "Underserved", className: "border-rust/35 bg-white text-rust" },
  served: { label: "Served", className: "border-forest/35 bg-white text-forest" },
  overserved: { label: "Overserved", className: "border-slate/25 bg-white text-slate" },
  gap: { label: "Gap", className: "border-rust/35 bg-white text-rust" },
  designed: { label: "Designed", className: "border-forest/25 bg-white text-forest-mid" },
  monitor: { label: "Optional", className: "border-amber/35 bg-white text-amber" },
};

export function TierBadge({ tone, children }: { tone: TierTone; children?: ReactNode }) {
  const style = tierStyles[tone];

  return (
    <span className={`${baseClass} ${style.className} px-2.5 py-1 text-[10px] font-bold`}>
      {children ?? style.label}
    </span>
  );
}

export function StateBadge({ tone, children }: { tone: StateTone | string; children?: ReactNode }) {
  const style = stateStyles[tone as StateTone] ?? stateStyles.monitor;

  return (
    <span className={`${baseClass} ${style.className} px-2.5 py-1 text-[10px]`}>
      {children ?? style.label}
    </span>
  );
}

export function MetaBadge({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center font-mono uppercase tracking-[0.09em] text-[9.5px]" style={{ color: "#6E847F" }}>
      {children}
    </span>
  );
}

export function ScoreChip({ label, value }: { label: string; value: number | null | undefined }) {
  return (
    <span className="inline-flex items-center gap-1 font-mono text-[9.5px]" style={{ color: "#6E847F" }}>
      <span className="uppercase tracking-[0.1em]">{label}</span>
      <span className="font-semibold" style={{ color: "#233C4B" }}>{value ?? "—"}</span>
    </span>
  );
}
