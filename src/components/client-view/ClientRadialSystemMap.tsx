import { useMemo, useState } from "react";
import type {
  ClientActionSummary,
  ClientConstraintSummary,
  ClientOwnershipSummary,
  ClientSignalStrengthSummary,
} from "@/lib/clientViewModel";

type Node = {
  id: string;
  label: string;
  value: string;
  x: number;
  y: number;
  tone: "constraint" | "focus" | "ownership" | "score";
};

type ClientRadialSystemMapProps = {
  constraint: ClientConstraintSummary;
  topActions: ClientActionSummary[];
  ownership: ClientOwnershipSummary;
  signalStrength: ClientSignalStrengthSummary;
};

function toneClasses(tone: Node["tone"], active: boolean) {
  if (tone === "constraint") {
    return active ? "border-rust bg-rust/15 text-rust" : "border-rust/35 bg-white text-rust";
  }
  if (tone === "focus") {
    return active ? "border-forest bg-forest/15 text-forest" : "border-forest/35 bg-white text-forest";
  }
  if (tone === "ownership") {
    return active ? "border-amber bg-amber/20 text-amber" : "border-amber/35 bg-white text-amber";
  }
  return active ? "border-[#233c4b] bg-[#233c4b]/10 text-[#233c4b]" : "border-[#233c4b]/35 bg-white text-[#233c4b]";
}

function short(value: string, max = 80) {
  const cleaned = value.replace(/\s+/g, " ").trim();
  if (cleaned.length <= max) return cleaned;
  return `${cleaned.slice(0, max - 3).trimEnd()}...`;
}

export default function ClientRadialSystemMap({
  constraint,
  topActions,
  ownership,
  signalStrength,
}: ClientRadialSystemMapProps) {
  const nodes = useMemo<Node[]>(() => {
    const primaryAction = topActions[0]?.title || "Set top priority";
    const ownershipState =
      ownership.unownedCriticalActions > 0
        ? `${ownership.unownedCriticalActions} unowned critical actions`
        : "Critical actions are owned";

    const scoreState = `Proof ${signalStrength.proof.level} · Execution ${signalStrength.execution.level}`;

    return [
      { id: "constraint", label: "Constraint", value: short(constraint.title, 56), x: 50, y: 10, tone: "constraint" },
      { id: "focus", label: "Priority", value: short(primaryAction, 56), x: 86, y: 44, tone: "focus" },
      { id: "ownership", label: "Ownership", value: short(ownershipState, 56), x: 50, y: 78, tone: "ownership" },
      { id: "score", label: "Signals", value: short(scoreState, 56), x: 14, y: 44, tone: "score" },
    ];
  }, [constraint.title, ownership.unownedCriticalActions, signalStrength.execution.level, signalStrength.proof.level, topActions]);

  const [activeNodeId, setActiveNodeId] = useState<string>("constraint");
  const activeNode = nodes.find((node) => node.id === activeNodeId) || nodes[0];

  return (
    <section className="rounded-3xl bg-white px-4 py-5">
      <div className="relative mx-auto aspect-square w-full max-w-[680px]">
        <div className="absolute inset-[8%] rounded-full border border-[#dce6e2]" />
        <div className="absolute inset-[20%] rounded-full border border-[#e8efec]" />
        <div className="absolute inset-[34%] rounded-full border border-[#eef4f2]" />

        <div className="absolute left-1/2 top-1/2 flex h-[180px] w-[180px] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-[#233c4b]/20 bg-[#233c4b]/6 px-4 text-center">
          <div>
            <p className="font-mono text-[9px] uppercase tracking-[0.08em] text-rust">System constraint</p>
            <p className="mt-2 font-sans text-[16px] font-semibold leading-[1.3] text-t-primary">
              {short(constraint.title, 92)}
            </p>
          </div>
        </div>

        {nodes.map((node) => {
          const isActive = node.id === activeNodeId;
          return (
            <button
              key={node.id}
              type="button"
              onClick={() => setActiveNodeId(node.id)}
              className={`absolute w-[170px] -translate-x-1/2 -translate-y-1/2 rounded-xl border px-3 py-2 text-left transition-all ${toneClasses(node.tone, isActive)} ${isActive ? "shadow-sm" : "hover:bg-[#f7fbfa]"}`}
              style={{ left: `${node.x}%`, top: `${node.y}%` }}
            >
              <p className="font-mono text-[9px] uppercase tracking-[0.08em]">{node.label}</p>
              <p className="mt-1 font-sans text-[12px] leading-[1.35]">{node.value}</p>
            </button>
          );
        })}
      </div>

      <div className="mx-auto mt-3 max-w-[680px] rounded-xl border border-[#d8e1de] bg-[#f8fbfa] px-3 py-2">
        <p className="font-mono text-[9px] uppercase tracking-[0.08em] text-t-muted">Active node</p>
        <p className="mt-1 font-sans text-[14px] font-semibold text-t-primary">{activeNode.label}</p>
        <p className="font-sans text-[13px] leading-[1.45] text-t-secondary">{activeNode.value}</p>
      </div>
    </section>
  );
}
