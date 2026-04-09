import { Link, useLocation, useNavigate } from "react-router-dom";
import type { ClientMapSystemStatus } from "@/hooks/useClientMapInteractionState";

type ClientModeKey = "foundation" | "diagnosis" | "decision" | "execution" | "learning";

type ClientModeNavProps = {
  activeMode: ClientModeKey;
  mapStatus: ClientMapSystemStatus;
  committedAt?: string | null;
  primaryOwner?: string | null;
  onRerunAnalysis?: () => void | Promise<void>;
  rerunning?: boolean;
};

const MODES: Array<{ key: ClientModeKey; label: string; path: string }> = [
  { key: "foundation", label: "Foundation", path: "/foundation" },
  { key: "diagnosis", label: "Diagnosis", path: "/diagnosis" },
  { key: "decision", label: "Decision", path: "/decision" },
  { key: "execution", label: "Execution", path: "/execution" },
  { key: "learning", label: "Learning", path: "/learning" },
];

function nodeTone(key: ClientModeKey, activeMode: ClientModeKey) {
  if (key !== activeMode) return "bg-white border-[#c7d4ce] text-t-muted";
  if (key === "foundation") return "bg-[#233c4b]/10 border-[#233c4b] text-[#233c4b]";
  if (key === "diagnosis") return "bg-rust/10 border-rust text-rust";
  if (key === "decision") return "bg-amber/15 border-amber text-amber";
  if (key === "execution") return "bg-forest/10 border-forest text-forest";
  return "bg-[#5f9b8c]/15 border-[#5f9b8c] text-[#5f9b8c]";
}

function systemLabel(status: ClientMapSystemStatus) {
  if (status === "validated") {
    return {
      title: "VALIDATED",
      subtitle: "The core move is validated with active execution evidence.",
      tone: "text-forest",
    };
  }
  if (status === "committed" || status === "in_progress") {
    return {
      title: "IN EXECUTION",
      subtitle: "Committed and moving. Keep owner accountability tight.",
      tone: "text-forest",
    };
  }
  return {
    title: "EARLY SIGNAL",
    subtitle: "Based on internal + public inputs. Not yet validated.",
    tone: "text-rust",
  };
}

export default function ClientModeNav({
  activeMode,
  mapStatus,
  committedAt,
  primaryOwner,
  onRerunAnalysis,
  rerunning = false,
}: ClientModeNavProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const status = systemLabel(mapStatus);
  const orbit = [
    { key: "foundation" as const, x: 50, y: 8 },
    { key: "diagnosis" as const, x: 86, y: 30 },
    { key: "decision" as const, x: 78, y: 73 },
    { key: "execution" as const, x: 22, y: 73 },
    { key: "learning" as const, x: 14, y: 30 },
  ];

  return (
    <section className="sticky top-3 z-30 rounded-2xl border border-[#d8e1de] bg-white/95 px-4 py-3 shadow-sm backdrop-blur">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className={`font-mono text-[10px] uppercase tracking-[0.11em] ${status.tone}`}>{status.title}</p>
          <p className="mt-1 max-w-[560px] font-sans text-[12px] leading-[1.45] text-t-secondary">
            {status.subtitle}
          </p>
          {committedAt ? (
            <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.08em] text-t-muted">
              Committed {new Date(committedAt).toLocaleDateString()}
            </p>
          ) : null}
          {primaryOwner ? (
            <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.08em] text-t-muted">
              Primary owner {primaryOwner}
            </p>
          ) : null}
        </div>

        <nav className="flex items-center gap-1.5 rounded-full border border-[#d8e1de] bg-[#f7fbfa] p-1">
          {MODES.map((mode) => {
            const active = activeMode === mode.key || location.pathname === mode.path;
            return (
              <Link
                key={mode.key}
                to={mode.path}
                className={`rounded-full px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.09em] transition-all ${
                  active
                    ? "bg-[#233c4b] text-white shadow-sm"
                    : "text-t-secondary hover:bg-white hover:text-t-primary"
                }`}
              >
                {mode.label}
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="mt-2 flex justify-end">
        <button
          type="button"
          onClick={() => void onRerunAnalysis?.()}
          disabled={rerunning}
          className="rounded-full border border-[#d8e1de] bg-white px-3 py-1 font-mono text-[10px] uppercase tracking-[0.08em] text-t-secondary transition-opacity hover:opacity-80 disabled:opacity-60"
        >
          {rerunning ? "Re-running..." : "Re-run analysis"}
        </button>
      </div>

      <div className="mt-3">
        <p className="font-mono text-[9px] uppercase tracking-[0.1em] text-t-muted">Decision lifecycle map</p>
        <div className="mt-2 flex items-center justify-center">
          <div className="relative h-[150px] w-[230px]">
            <div className="absolute left-1/2 top-1/2 h-[120px] w-[120px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-[#d8e1de]" />
            <div className="absolute left-1/2 top-1/2 h-[72px] w-[72px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-[#e6eeeb]" />
            <div className="absolute left-1/2 top-1/2 h-[42px] w-[42px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#233c4b]/8" />
            {orbit.map((item) => {
              const mode = MODES.find((entry) => entry.key === item.key)!;
              const active = item.key === activeMode;
              return (
                <button
                  key={`orbit-${item.key}`}
                  type="button"
                  onClick={() => navigate(mode.path)}
                  className={`absolute inline-flex h-8 min-w-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border px-2 font-mono text-[9px] uppercase tracking-[0.08em] transition-colors ${nodeTone(item.key, activeMode)} ${active ? "shadow-sm" : "hover:bg-[#f7fbfa]"}`}
                  style={{ left: `${item.x}%`, top: `${item.y}%` }}
                  title={`${mode.label}${active ? " (current)" : ""}`}
                >
                  {mode.label.slice(0, 1)}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
