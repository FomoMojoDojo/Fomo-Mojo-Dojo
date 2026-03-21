import { Cloud, Cpu, HardDrive, Wrench } from "lucide-react";

export type LlmTraceItem = {
  id: string;
  tier: "public" | "local" | "fallback";
  label: string;
  detail: string;
};

const TIER_META = {
  public: {
    icon: Cloud,
    bg: "#EDF4F6",
    fg: "#233C4B",
    border: "#C4D7DE",
  },
  local: {
    icon: HardDrive,
    bg: "#EEF6E7",
    fg: "#2E6B52",
    border: "#BDD8CF",
  },
  fallback: {
    icon: Wrench,
    bg: "#FFF6D8",
    fg: "#A06700",
    border: "#F3D77A",
  },
} as const;

export function LlmTraceLegend({
  items,
  className = "",
}: {
  items: LlmTraceItem[];
  className?: string;
}) {
  if (!items.length) return null;

  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`.trim()}>
      {items.map((item) => {
        const meta = TIER_META[item.tier];
        const Icon = meta.icon;
        return (
          <span
            key={item.id}
            className="inline-flex items-center rounded-full border px-2.5 py-1 font-sans text-[10px]"
            style={{
              background: meta.bg,
              color: meta.fg,
              borderColor: meta.border,
            }}
            title={item.detail}
          >
            <Icon className="mr-1.5 h-3.5 w-3.5" />
            <span className="uppercase tracking-[0.08em]">{item.label}</span>
          </span>
        );
      })}
      <span
        className="inline-flex items-center rounded-full border px-2.5 py-1 font-sans text-[10px]"
        style={{ background: "#F5F7FA", color: "#5E6B75", borderColor: "#D8E0E7" }}
        title="Internal verification mode for team use"
      >
        <Cpu className="mr-1.5 h-3.5 w-3.5" />
        <span className="uppercase tracking-[0.08em]">LLM Trace</span>
      </span>
    </div>
  );
}

