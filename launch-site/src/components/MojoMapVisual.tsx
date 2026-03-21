import type { ReactNode } from "react";

type MojoMapVisualProps = {
  variant: "hero" | "core";
};

type Node = {
  id: string;
  x: number;
  y: number;
  r: number;
  label: string;
  kind: "neutral" | "constraint" | "next";
};

const nodes: Node[] = [
  { id: "n1", x: 140, y: 120, r: 12, label: "Signals", kind: "neutral" },
  { id: "n2", x: 250, y: 90, r: 14, label: "Adoption", kind: "constraint" },
  { id: "n3", x: 365, y: 145, r: 11, label: "Execution", kind: "neutral" },
  { id: "n4", x: 210, y: 230, r: 16, label: "Constraint", kind: "constraint" },
  { id: "n5", x: 330, y: 255, r: 15, label: "Next Move", kind: "next" },
  { id: "n6", x: 120, y: 290, r: 10, label: "Team", kind: "neutral" },
  { id: "n7", x: 410, y: 320, r: 12, label: "Momentum", kind: "next" },
];

const links: [string, string][] = [
  ["n1", "n2"],
  ["n2", "n3"],
  ["n2", "n4"],
  ["n4", "n5"],
  ["n5", "n7"],
  ["n6", "n4"],
  ["n3", "n5"],
];

const mapById = new Map(nodes.map((node) => [node.id, node]));

function NodeBadge({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={[
        "rounded-full border border-white/20 bg-black/40 px-3 py-1 text-[10px] tracking-[0.14em] uppercase",
        className ?? "",
      ].join(" ")}
    >
      {children}
    </div>
  );
}

export function MojoMapVisual({ variant }: MojoMapVisualProps) {
  const isHero = variant === "hero";

  return (
    <div className="relative isolate h-full min-h-[340px] w-full overflow-hidden rounded-[32px] border border-fm-line/80 bg-[#050913]/95 shadow-card sm:min-h-[420px]">
      <div className="absolute -left-20 top-0 h-56 w-56 rounded-full bg-fm-teal/20 blur-[90px]" />
      <div className="absolute -bottom-16 right-0 h-64 w-64 rounded-full bg-fm-green/20 blur-[120px]" />

      <div className={isHero ? "absolute inset-0 bg-gradient-to-br from-white/5 to-transparent" : "hidden"} />

      <svg
        viewBox="0 0 520 400"
        className={[
          "h-full w-full p-6 sm:p-8",
          isHero ? "opacity-75 blur-[1.2px]" : "opacity-100",
        ].join(" ")}
        aria-hidden="true"
      >
        <defs>
          <linearGradient id="pathGlow" x1="0" x2="1" y1="0" y2="1">
            <stop offset="0%" stopColor="#25ddc2" stopOpacity="0.2" />
            <stop offset="100%" stopColor="#75fda4" stopOpacity="0.9" />
          </linearGradient>
          <filter id="lineBlur">
            <feGaussianBlur stdDeviation="1" />
          </filter>
          <filter id="nodeGlow">
            <feDropShadow dx="0" dy="0" stdDeviation="8" floodColor="#24dbc1" floodOpacity="0.45" />
          </filter>
        </defs>

        {links.map(([from, to]) => {
          const start = mapById.get(from);
          const end = mapById.get(to);
          if (!start || !end) return null;
          const isHotPath = !isHero && (from === "n4" || to === "n5" || to === "n7");
          return (
            <line
              key={`${from}-${to}`}
              x1={start.x}
              y1={start.y}
              x2={end.x}
              y2={end.y}
              stroke={isHotPath ? "url(#pathGlow)" : "#23415d"}
              strokeWidth={isHotPath ? 2.8 : 1.4}
              filter={isHotPath ? "url(#lineBlur)" : undefined}
              className={isHotPath ? "animate-pulse-slow" : ""}
            />
          );
        })}

        {nodes.map((node) => {
          const isConstraint = node.kind === "constraint";
          const isNext = node.kind === "next";
          const showHighlight = !isHero && (isConstraint || isNext);

          let fill = "#112138";
          if (showHighlight && isConstraint) fill = "#163247";
          if (showHighlight && isNext) fill = "#0f3f3a";

          return (
            <g key={node.id}>
              {showHighlight ? (
                <circle
                  cx={node.x}
                  cy={node.y}
                  r={node.r + 11}
                  fill={isConstraint ? "rgba(40, 186, 255, 0.2)" : "rgba(116, 253, 162, 0.2)"}
                  className="animate-pulse-slow"
                />
              ) : null}
              <circle
                cx={node.x}
                cy={node.y}
                r={node.r}
                fill={fill}
                stroke={showHighlight ? "#8cfbe1" : "#295172"}
                strokeWidth={showHighlight ? 2 : 1.2}
                filter={showHighlight ? "url(#nodeGlow)" : undefined}
              />
            </g>
          );
        })}
      </svg>

      <div className="pointer-events-none absolute inset-x-6 bottom-6 flex items-center justify-between text-fm-text/90 sm:inset-x-8">
        <NodeBadge className="text-fm-muted">Live Strategic State</NodeBadge>
        {!isHero ? <NodeBadge className="text-fm-green">Next Move Identified</NodeBadge> : null}
      </div>

      {!isHero ? (
        <div className="pointer-events-none absolute left-6 top-6 rounded-xl border border-fm-teal/30 bg-fm-teal/10 px-3 py-2 text-[11px] text-fm-text/90 shadow-glow backdrop-blur-sm sm:left-8 sm:top-8">
          Biggest Constraint: Product story clarity
        </div>
      ) : null}
    </div>
  );
}
