import { Building2, CheckCircle2, FlaskConical, Globe, type LucideIcon } from "lucide-react";
import type { SourceConfidenceSignals, SourceTier } from "@/lib/sourceConfidence";

const META: Record<
  SourceTier,
  {
    label: string;
    icon: LucideIcon;
    bg: string;
    fg: string;
    border: string;
    offBg: string;
    offFg: string;
    offBorder: string;
  }
> = {
  public: {
    label: "Public",
    icon: Globe,
    bg: "#EDF4F6",
    fg: "#233C4B",
    border: "#C4D7DE",
    offBg: "#F6F8FA",
    offFg: "#9AA8B0",
    offBorder: "#D9E2E8",
  },
  company: {
    label: "Company",
    icon: Building2,
    bg: "#FFF6D8",
    fg: "#A06700",
    border: "#F3D77A",
    offBg: "#FBF8ED",
    offFg: "#B5A98D",
    offBorder: "#E9DFC7",
  },
  evidence: {
    label: "Evidence",
    icon: FlaskConical,
    bg: "#EEF6E7",
    fg: "#2E6B52",
    border: "#BDD8CF",
    offBg: "#F4F8F2",
    offFg: "#9BB2A6",
    offBorder: "#DCE8E0",
  },
  implemented_tested: {
    label: "Implemented & Tested",
    icon: CheckCircle2,
    bg: "#EAF3EC",
    fg: "#25603E",
    border: "#BFD8C6",
    offBg: "#F3F7F4",
    offFg: "#9FB2A7",
    offBorder: "#D9E5DC",
  },
};

const ORDER: SourceTier[] = ["public", "company", "evidence", "implemented_tested"];

function isEnabled(tier: SourceTier, signals: SourceConfidenceSignals) {
  if (tier === "public") return true;
  if (tier === "company") return signals.hasCompanyEvidence;
  if (tier === "evidence") return signals.hasPrimaryEvidence;
  return signals.hasImplementedTested;
}

function Pill({
  tier,
  enabled,
}: {
  tier: SourceTier;
  enabled: boolean;
}) {
  const meta = META[tier];
  const Icon = meta.icon;
  return (
    <span
      className="inline-flex items-center rounded-full border px-2.5 py-1 font-sans text-[10px]"
      style={{
        background: enabled ? meta.bg : meta.offBg,
        color: enabled ? meta.fg : meta.offFg,
        borderColor: enabled ? meta.border : meta.offBorder,
      }}
    >
      <Icon className="mr-1.5 h-3.5 w-3.5" />
      <span className="uppercase tracking-[0.08em]">{meta.label}</span>
    </span>
  );
}

export function SourceLegend({
  signals,
  className = "",
}: {
  signals: SourceConfidenceSignals;
  className?: string;
}) {
  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`.trim()}>
      {ORDER.map((tier) => (
        <Pill key={tier} tier={tier} enabled={isEnabled(tier, signals)} />
      ))}
    </div>
  );
}

