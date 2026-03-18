import type { ReactNode } from "react";

type TierTone = "focus" | "monitor" | "defer" | "need" | "want" | "desire";
type StateTone = "underserved" | "served" | "overserved" | "gap" | "designed" | "monitor";

const baseClass =
  "inline-flex items-center rounded-full border font-sans uppercase tracking-[0.08em]";

const tierStyles: Record<TierTone, { label: string; bg: string; fg: string; border: string }> = {
  focus: { label: "Prioritize", bg: "#FFF0E6", fg: "#FF7D2D", border: "#FFD1B4" },
  monitor: { label: "Investigate", bg: "#FFF6D8", fg: "#C68B00", border: "#F3D77A" },
  defer: { label: "Later", bg: "#EEF6E7", fg: "#5F9B8C", border: "#BDD8CF" },
  need: { label: "Need", bg: "#EEF6E7", fg: "#5F9B8C", border: "#BDD8CF" },
  want: { label: "Want", bg: "#F2F7E8", fg: "#7B9C4F", border: "#D1E2B1" },
  desire: { label: "Desire", bg: "#EDF4F6", fg: "#233C4B", border: "#C4D7DE" },
};

const stateStyles: Record<StateTone, { label: string; bg: string; fg: string; border: string }> = {
  underserved: { label: "Underserved", bg: "#FFF0E6", fg: "#FF7D2D", border: "#FFD1B4" },
  served: { label: "Served", bg: "#EEF6E7", fg: "#5F9B8C", border: "#BDD8CF" },
  overserved: { label: "Overserved", bg: "#EDF4F6", fg: "#233C4B", border: "#C4D7DE" },
  gap: { label: "Gap", bg: "#FFF0E6", fg: "#FF7D2D", border: "#FFD1B4" },
  designed: { label: "Designed", bg: "#F6F8EF", fg: "#6B8368", border: "#D9E4C8" },
  monitor: { label: "Optional", bg: "#FFF6D8", fg: "#C68B00", border: "#F3D77A" },
};

export function TierBadge({ tone, children }: { tone: TierTone; children?: ReactNode }) {
  const style = tierStyles[tone];

  return (
    <span
      className={`${baseClass} px-2.5 py-1 text-[10px] font-bold`}
      style={{ background: style.bg, color: style.fg, borderColor: style.border }}
    >
      {children ?? style.label}
    </span>
  );
}

export function StateBadge({ tone, children }: { tone: StateTone | string; children?: ReactNode }) {
  const style = stateStyles[tone as StateTone] ?? stateStyles.monitor;

  return (
    <span
      className={`${baseClass} px-2.5 py-1 text-[10px]`}
      style={{ background: style.bg, color: style.fg, borderColor: style.border }}
    >
      {children ?? style.label}
    </span>
  );
}

export function MetaBadge({ children }: { children: ReactNode }) {
  return (
    <span
      className={`${baseClass} bg-white px-2.5 py-1 text-[10px]`}
      style={{ borderColor: "#D7E2D8", color: "#233C4B" }}
    >
      {children}
    </span>
  );
}

export function ScoreChip({ label, value }: { label: string; value: number | null | undefined }) {
  return (
    <span
      className="inline-flex items-center rounded-full border bg-white px-2.5 py-1 font-sans text-[10px]"
      style={{ borderColor: "#D7E2D8", color: "#233C4B" }}
    >
      <span className="mr-1 uppercase tracking-[0.1em]" style={{ color: "#5F9B8C" }}>
        {label}
      </span>
      <span className="font-bold">{value ?? "—"}</span>
    </span>
  );
}
