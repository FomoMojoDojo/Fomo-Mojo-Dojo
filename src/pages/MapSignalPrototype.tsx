import { useEffect, useMemo, useState } from "react";
import TopNav from "@/components/layout/TopNav";
import { useCompany } from "@/hooks/useCompany";
import { useRoutes, type RouteRow } from "@/views/Routes/useRoutes";

type SignalTone = "off-route" | "watch" | "on-route";
type ZoomMode = "overview" | "turn";

type RouteOption = {
  id: string;
  title: string;
  summary: string;
  points: number;
  effort: string;
  category: string;
};

const colors = {
  bg: "#faf7f6",
  card: "#ffffff",
  line: "#dfe8da",
  lineSoft: "#edf3ea",
  text: "#233C4B",
  muted: "#5e7772",
  offRoute: "#FF7D2D",
  watch: "#FAC846",
  onRoute: "#5F9B8C",
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function toneFromValue(value: number): SignalTone {
  if (value >= 70) return "on-route";
  if (value >= 45) return "watch";
  return "off-route";
}

function toneLabel(tone: SignalTone) {
  if (tone === "on-route") return "On Route";
  if (tone === "watch") return "Watch";
  return "Off Route";
}

function toneColor(tone: SignalTone) {
  if (tone === "on-route") return colors.onRoute;
  if (tone === "watch") return colors.watch;
  return colors.offRoute;
}

function segmentLengths(points: Array<{ x: number; y: number }>) {
  const lengths: number[] = [];
  let total = 0;
  for (let i = 0; i < points.length - 1; i += 1) {
    const dx = points[i + 1].x - points[i].x;
    const dy = points[i + 1].y - points[i].y;
    const len = Math.hypot(dx, dy);
    lengths.push(len);
    total += len;
  }
  return { lengths, total };
}

function pointAtProgress(points: Array<{ x: number; y: number }>, progress: number) {
  if (points.length === 0) return { x: 0, y: 0 };
  if (points.length === 1) return points[0];
  const bounded = clamp(progress, 0, 1);
  const { lengths, total } = segmentLengths(points);
  const target = total * bounded;
  let traveled = 0;
  for (let i = 0; i < lengths.length; i += 1) {
    const len = lengths[i];
    if (traveled + len >= target) {
      const ratio = len > 0 ? (target - traveled) / len : 0;
      return {
        x: points[i].x + (points[i + 1].x - points[i].x) * ratio,
        y: points[i].y + (points[i + 1].y - points[i].y) * ratio,
      };
    }
    traveled += len;
  }
  return points[points.length - 1];
}

function pointsUntilProgress(points: Array<{ x: number; y: number }>, progress: number) {
  if (points.length === 0) return [];
  if (points.length === 1) return [...points];
  const bounded = clamp(progress, 0, 1);
  const { lengths, total } = segmentLengths(points);
  const target = total * bounded;
  let traveled = 0;
  const output = [points[0]];
  for (let i = 0; i < lengths.length; i += 1) {
    const len = lengths[i];
    if (traveled + len < target) {
      output.push(points[i + 1]);
      traveled += len;
      continue;
    }
    const ratio = len > 0 ? (target - traveled) / len : 0;
    output.push({
      x: points[i].x + (points[i + 1].x - points[i].x) * ratio,
      y: points[i].y + (points[i + 1].y - points[i].y) * ratio,
    });
    break;
  }
  return output;
}

function routeToOption(route: RouteRow): RouteOption {
  const rawPoints = Number.isFinite(route.pts_value as number) ? Number(route.pts_value) : 6;
  return {
    id: route.id,
    title: route.title || "Untitled route",
    summary: route.short_description || "Route details available on hover.",
    points: clamp(Math.round(rawPoints), 1, 20),
    effort: String(route.effort || "medium").toLowerCase(),
    category: String(route.category || "improve").toLowerCase(),
  };
}

function fallbackOptions(companyName: string): RouteOption[] {
  return [
    {
      id: "fallback-1",
      title: "Validate baseline assumptions",
      summary: `Confirm what is true now for ${companyName} before committing resources.`,
      points: 8,
      effort: "medium",
      category: "fix",
    },
    {
      id: "fallback-2",
      title: "Map alternatives in the active market",
      summary: "Clarify what buyers compare against so positioning choices are grounded.",
      points: 7,
      effort: "medium",
      category: "fix",
    },
    {
      id: "fallback-3",
      title: "Tighten channel and conversion path",
      summary: "Define one path from attention to committed demand.",
      points: 6,
      effort: "medium",
      category: "improve",
    },
    {
      id: "fallback-4",
      title: "Prioritize one measurable outcome",
      summary: "Choose one outcome and one metric to validate the route quickly.",
      points: 5,
      effort: "low",
      category: "improve",
    },
  ];
}

function SignalNode({
  label,
  tone,
  emphasis = false,
}: {
  label: string;
  tone: SignalTone;
  emphasis?: boolean;
}) {
  const color = toneColor(tone);
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative h-20 w-20">
        <div
          className="absolute inset-0 rounded-full opacity-35"
          style={{
            background: color,
            animation: "signalPulse 2200ms ease-in-out infinite",
            transformOrigin: "center",
          }}
        />
        <div className="absolute inset-[14px] rounded-full border-2" style={{ borderColor: color, background: "#fff" }} />
        <div
          className="absolute inset-[24px] rounded-full"
          style={{
            background: color,
            boxShadow: emphasis ? `0 0 0 6px ${color}22` : "none",
            animation: emphasis ? "signalBeat 1600ms ease-in-out infinite" : "none",
          }}
        />
      </div>
      <div className="text-center">
        <p className="text-[10px] uppercase tracking-[0.18em]" style={{ color: colors.muted }}>
          {label}
        </p>
        <p className="text-sm font-semibold" style={{ color }}>
          {toneLabel(tone)}
        </p>
      </div>
    </div>
  );
}

function NextLegPath({
  progress,
  currentTone,
  nextTone,
  distancePoints,
}: {
  progress: number;
  currentTone: SignalTone;
  nextTone: SignalTone;
  distancePoints: number;
}) {
  const legPoints = [
    { x: 20, y: 76 },
    { x: 86, y: 54 },
    { x: 164, y: 64 },
    { x: 236, y: 40 },
  ];
  const movingPoint = pointAtProgress(legPoints, progress);
  const completedPoints = pointsUntilProgress(legPoints, progress);
  const completedPath = completedPoints.map((point) => `${point.x},${point.y}`).join(" ");
  const fullPath = legPoints.map((point) => `${point.x},${point.y}`).join(" ");

  return (
    <div className="mx-auto mt-4 w-full max-w-[270px] rounded-xl border p-2.5" style={{ borderColor: colors.line, background: "#fff" }}>
      <div className="flex items-center justify-between">
        <p className="text-[10px] uppercase tracking-[0.16em]" style={{ color: colors.muted }}>
          Next Leg
        </p>
        <p className="text-xs font-medium" style={{ color: colors.text }}>
          +{distancePoints} signal points
        </p>
      </div>
      <svg viewBox="0 0 260 98" className="mt-1.5 w-full">
        <polyline points={fullPath} fill="none" stroke={colors.lineSoft} strokeWidth={6} strokeLinecap="round" />
        <polyline points={completedPath} fill="none" stroke={colors.text} strokeWidth={6} strokeLinecap="round" />
        <circle cx={legPoints[0].x} cy={legPoints[0].y} r={6} fill={toneColor(currentTone)} />
        <circle cx={legPoints[3].x} cy={legPoints[3].y} r={6} fill={toneColor(nextTone)} />
        <circle
          cx={movingPoint.x}
          cy={movingPoint.y}
          r={13}
          fill={colors.onRoute}
          opacity={0.2}
          style={{ animation: "signalPulse 1800ms ease-in-out infinite" }}
        />
        <circle cx={movingPoint.x} cy={movingPoint.y} r={6} fill={colors.onRoute} />
        <circle cx={movingPoint.x} cy={movingPoint.y} r={2.5} fill="#fff" />
      </svg>
    </div>
  );
}

function OverviewRouteDots({ options }: { options: RouteOption[] }) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const visibleOptions = options.slice(0, 10);
  const active = visibleOptions.find((item) => item.id === hoveredId) || visibleOptions[0];
  const activeIndex = Math.max(
    0,
    hoveredId ? visibleOptions.findIndex((item) => item.id === hoveredId) : 0,
  );
  const pathPoints = [
    { x: 58, y: 210 },
    { x: 220, y: 154 },
    { x: 430, y: 170 },
    { x: 640, y: 104 },
    { x: 860, y: 84 },
    { x: 930, y: 52 },
  ];
  const fullPath = pathPoints.map((point) => `${point.x},${point.y}`).join(" ");
  const stopProgresses = visibleOptions.map((_, index) => {
    if (visibleOptions.length === 1) return 0.5;
    return 0.08 + (index / (visibleOptions.length - 1)) * 0.86;
  });
  const activeProgress = stopProgresses[Math.min(activeIndex, stopProgresses.length - 1)] ?? 0.08;
  const traveledPoints = pointsUntilProgress(pathPoints, activeProgress);
  const traveledPath = traveledPoints.map((point) => `${point.x},${point.y}`).join(" ");

  return (
    <div className="mt-6 rounded-xl border p-4 sm:p-5" style={{ borderColor: colors.line, background: "#fff" }}>
      <p className="text-[10px] uppercase tracking-[0.18em]" style={{ color: colors.muted }}>
        Route Stops ({visibleOptions.length})
      </p>
      <svg viewBox="0 0 980 260" className="mt-3 w-full">
        <polyline
          points={fullPath}
          fill="none"
          stroke={colors.lineSoft}
          strokeWidth={7}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <polyline
          points={traveledPath}
          fill="none"
          stroke={colors.onRoute}
          strokeWidth={7}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {visibleOptions.map((option, index) => {
          const stop = pointAtProgress(pathPoints, stopProgresses[index] ?? 0.08);
          const isHovered = option.id === hoveredId;
          const isPassed = index <= activeIndex;
          return (
            <g key={option.id}>
              <circle
                cx={stop.x}
                cy={stop.y}
                r={isHovered ? 13 : 10}
                fill={isPassed ? colors.onRoute : colors.watch}
                opacity={0.95}
                style={{ cursor: "pointer", animation: "signalBeat 2600ms ease-in-out infinite" }}
                onMouseEnter={() => setHoveredId(option.id)}
                onMouseLeave={() => setHoveredId(null)}
              />
              <circle cx={stop.x} cy={stop.y} r={isHovered ? 5 : 4} fill="#fff" />
            </g>
          );
        })}
      </svg>

      <div className="mt-3 rounded-lg border p-3" style={{ borderColor: colors.line, background: "#fff" }}>
        <p className="text-[10px] uppercase tracking-[0.16em]" style={{ color: colors.muted }}>
          {hoveredId ? "Stop Detail" : "Next Stop"}
        </p>
        <p className="mt-1 text-sm font-semibold" style={{ color: colors.text }}>
          {active?.title || "No route options yet"}
        </p>
        <p className="mt-1 text-sm" style={{ color: colors.muted }}>
          {active?.summary || "Add routes to populate this view."}
        </p>
        <p className="mt-2 text-xs" style={{ color: colors.muted }}>
          {active ? `Stop ${activeIndex + 1} of ${visibleOptions.length}` : "No stops available"}
        </p>
      </div>
    </div>
  );
}

export default function MapSignalPrototype() {
  const { activeCompany } = useCompany();
  const { items: routeItems } = useRoutes(activeCompany?.id);
  const [zoomMode, setZoomMode] = useState<ZoomMode>("turn");
  const [nextLegProgress, setNextLegProgress] = useState(0.12);

  const demoValues = useMemo(() => {
    const current = typeof activeCompany?.mojo_score === "number" ? activeCompany.mojo_score : 22;
    return { current };
  }, [activeCompany?.mojo_score]);

  const options = useMemo<RouteOption[]>(() => {
    const companyLabel = activeCompany?.name?.trim() || "this company";
    if (!Array.isArray(routeItems) || routeItems.length === 0) {
      return fallbackOptions(companyLabel);
    }
    return routeItems
      .map(routeToOption)
      .sort((a, b) => b.points - a.points)
      .slice(0, 12);
  }, [activeCompany?.name, routeItems]);

  const topOption = options[0];
  const nextLift = clamp(topOption?.points ?? 6, 2, 18);
  const nextStateValue = clamp(demoValues.current + nextLift, 0, 100);

  const currentTone = toneFromValue(demoValues.current);
  const nextTone = toneFromValue(nextStateValue);

  useEffect(() => {
    let frameId = 0;
    const durationMs = 12000;
    const started = performance.now();
    const animate = (now: number) => {
      const phase = ((now - started) % durationMs) / durationMs;
      const sweep = phase < 0.5 ? phase * 2 : (1 - phase) * 2;
      const eased = 0.5 - 0.5 * Math.cos(Math.PI * sweep);
      setNextLegProgress(clamp(eased, 0.07, 0.94));
      frameId = requestAnimationFrame(animate);
    };
    frameId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frameId);
  }, []);

  return (
    <div className="min-h-screen" style={{ background: colors.bg }}>
      <style>{`
        @keyframes signalPulse {
          0% { transform: scale(0.82); opacity: 0.3; }
          70% { transform: scale(1.12); opacity: 0.08; }
          100% { transform: scale(1.16); opacity: 0; }
        }
        @keyframes signalBeat {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.08); }
        }
      `}</style>
      <TopNav />
      <main className="mx-auto max-w-[1120px] px-4 pb-12 pt-6 sm:px-6 md:px-8">
        <section
          className="rounded-2xl border p-5 sm:p-6"
          style={{ background: colors.card, borderColor: colors.line, boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[11px] uppercase tracking-[0.18em]" style={{ color: colors.muted }}>
                Prototype Option
              </p>
              <h1 className="text-2xl font-semibold" style={{ color: colors.text }}>
                GPS Signal Map
              </h1>
              <p className="mt-1 text-sm" style={{ color: colors.muted }}>
                {activeCompany?.name || "Selected Company"} • signal-first navigation view.
              </p>
            </div>

            <div className="inline-flex rounded-full border p-1" style={{ borderColor: colors.line }}>
              <button
                type="button"
                onClick={() => setZoomMode("overview")}
                className="rounded-full px-3 py-1.5 text-sm"
                style={{
                  background: zoomMode === "overview" ? colors.text : "transparent",
                  color: zoomMode === "overview" ? "#fff" : colors.text,
                }}
              >
                Zoomed Out
              </button>
              <button
                type="button"
                onClick={() => setZoomMode("turn")}
                className="rounded-full px-3 py-1.5 text-sm"
                style={{
                  background: zoomMode === "turn" ? colors.text : "transparent",
                  color: zoomMode === "turn" ? "#fff" : colors.text,
                }}
              >
                Next Turn
              </button>
            </div>
          </div>

          {zoomMode === "overview" ? (
            <div className="mt-8">
              <p className="text-sm" style={{ color: colors.muted }}>
                Zoomed-out view shows one path with sequential stops. Hover any stop to preview that route option.
              </p>
              <OverviewRouteDots options={options} />
            </div>
          ) : (
            <div className="mt-8 grid gap-4 lg:grid-cols-[360px_1fr]">
              <div className="rounded-xl border p-4" style={{ borderColor: colors.line, background: "#fff" }}>
                <p className="text-[10px] uppercase tracking-[0.18em]" style={{ color: colors.muted }}>
                  You Are Here
                </p>
                <div className="mt-3">
                  <SignalNode label="Current Reality" tone={currentTone} emphasis />
                </div>
                <NextLegPath
                  progress={nextLegProgress}
                  currentTone={currentTone}
                  nextTone={nextTone}
                  distancePoints={Math.max(1, Math.round(nextStateValue - demoValues.current))}
                />
              </div>

              <div className="rounded-xl border p-4 sm:p-5" style={{ borderColor: colors.line, background: "#fff" }}>
                <p className="text-[10px] uppercase tracking-[0.18em]" style={{ color: colors.muted }}>
                  Next Turn Guidance
                </p>
                <h2 className="mt-2 text-lg font-semibold" style={{ color: colors.text }}>
                  {topOption?.title || "Choose the next route"}
                </h2>
                <p className="mt-2 text-sm leading-relaxed" style={{ color: colors.muted }}>
                  {topOption?.summary || "When route options exist, this panel shows the highest-impact next move."}
                </p>
                <div className="mt-4 space-y-2 text-sm" style={{ color: colors.text }}>
                  <p>1. Complete this route item first.</p>
                  <p>2. Capture evidence that proves the change happened.</p>
                  <p>3. Re-evaluate signal state and choose the next leg.</p>
                </div>
              </div>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
