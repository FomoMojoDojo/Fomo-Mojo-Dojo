import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import TopNav from "@/components/layout/TopNav";
import { Button } from "@/components/ui/button";
import { MetaBadge, ScoreChip, StateBadge, TierBadge } from "@/components/ui/semantic-badges";
import { useAuth } from "@/hooks/useAuth";
import { useClientOnboardingMojoMap } from "@/hooks/useClientOnboardingMojoMap";
import {
  CLIENT_ONBOARDING_MOJOMAP_EDITOR_ROUTE,
  CLIENT_ONBOARDING_MOJOMAP_ID,
  type OnboardingMapConfig,
} from "@/lib/clientOnboardingMojoMapConfig";
import { getOnboardingOwnershipScoreModel } from "@/lib/scoring/onboardingOwnership";

type PanelSelection =
  | { type: "layer"; id: string }
  | { type: "constraint" };
type InternalMapViewMode = "standard" | "founders";

const c = {
  bg: "#faf7f6",
  field: "#FFFFFF",
  card: "#ffffff",
  line: "#DDE6D1",
  lineFaint: "#EEF3E9",
  charcoal: "#233C4B",
  secondary: "#46606D",
  muted: "#6E847F",
  faint: "#C8D8CA",
  coral: "#FF7D2D",
  teal: "#5F9B8C",
  amber: "#FAC846",
};

const cardStyle = {
  background: c.card,
  borderRadius: 12,
  boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
  border: `1px solid ${c.line}`,
} as const;

const MAP_CENTER = { x: 380, y: 360 };
const RING_RADII = [120, 180, 240, 300, 348];
const LAYER_ANGLES = [-90, -30, 20, 90, 156];
const OUTER_LOOP_RADIUS = 390;
const CONSTRAINT_NODE = { x: 130, y: 210 };

function statusTone(status: "not_started" | "planned" | "in_progress") {
  if (status === "in_progress") return "served";
  if (status === "planned") return "monitor";
  return "gap";
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function mapLayerPoint(index: number) {
  const radius = RING_RADII[index] ?? RING_RADII[RING_RADII.length - 1];
  const angleDeg = LAYER_ANGLES[index] ?? -90;
  const angle = (angleDeg * Math.PI) / 180;
  return {
    x: MAP_CENTER.x + Math.cos(angle) * radius,
    y: MAP_CENTER.y + Math.sin(angle) * radius,
  };
}

function breakTitle(title: string) {
  const parts = title.split(" ");
  if (parts.length <= 2) return [title];
  const midpoint = Math.ceil(parts.length / 2);
  return [parts.slice(0, midpoint).join(" "), parts.slice(midpoint).join(" ")];
}

function hasPrimaryOwner(value: string | undefined | null) {
  return Boolean(value?.trim());
}

function ownershipToneColor(tone: "served" | "monitor" | "gap") {
  if (tone === "served") return c.teal;
  if (tone === "monitor") return c.amber;
  return c.coral;
}

function isInternalOperatingMap(mapType: string) {
  return mapType.toLowerCase().includes("internal");
}

type ClientOnboardingMojoMapViewProps = {
  configOverride?: OnboardingMapConfig;
  embedded?: boolean;
};

export function ClientOnboardingMojoMapView({
  configOverride,
  embedded = false,
}: ClientOnboardingMojoMapViewProps) {
  const { isAdmin } = useAuth();
  const {
    map: persistedConfig,
    loading: configLoading,
    error: configError,
    usingSeedFallback,
  } = useClientOnboardingMojoMap({
    mapId: CLIENT_ONBOARDING_MOJOMAP_ID,
    enabled: !configOverride,
  });
  const config = configOverride ?? persistedConfig;
  const foundersViewSupported = isInternalOperatingMap(config.type);
  const [selection, setSelection] = useState<PanelSelection>({
    type: "layer",
    id: config.layers[0]?.id ?? "",
  });
  const [viewMode, setViewMode] = useState<InternalMapViewMode>(
    foundersViewSupported ? "founders" : "standard",
  );
  const [selectedActionId, setSelectedActionId] = useState<string | null>(null);

  useEffect(() => {
    if (selection.type === "constraint") return;
    const exists = config.layers.some((layer) => layer.id === selection.id);
    if (!exists) {
      setSelection({
        type: "layer",
        id: config.layers[0]?.id ?? "",
      });
    }
  }, [config.layers, selection]);

  useEffect(() => {
    if (!foundersViewSupported && viewMode !== "standard") {
      setViewMode("standard");
      return;
    }
    if (foundersViewSupported && viewMode !== "founders" && viewMode !== "standard") {
      setViewMode("founders");
    }
  }, [foundersViewSupported, viewMode]);

  useEffect(() => {
    if (!selectedActionId) return;
    const exists = config.actionGroups.some((group) =>
      group.items.some((item) => item.id === selectedActionId),
    );
    if (!exists) setSelectedActionId(null);
  }, [config.actionGroups, selectedActionId]);

  const layerPoints = useMemo(
    () =>
      config.layers.map((layer, index) => ({
        layer,
        index,
        point: mapLayerPoint(index),
      })),
    [config.layers],
  );

  const layerPointById = useMemo(
    () =>
      Object.fromEntries(
        layerPoints.map((item) => [
          item.layer.id,
          item.point,
        ]),
      ) as Record<string, { x: number; y: number }>,
    [layerPoints],
  );

  const selectedLayer =
    selection.type === "layer"
      ? config.layers.find((item) => item.id === selection.id) ?? config.layers[0]
      : null;
  const constraintSelected = selection.type === "constraint";
  const totalActions = config.actionGroups.reduce((count, group) => count + group.items.length, 0);
  const ownershipScoreModel = useMemo(() => getOnboardingOwnershipScoreModel(config), [config]);
  const constraintCoverageCount = config.layers.filter((layer) =>
    config.constraint.affectedLayerIds.includes(layer.id),
  ).length;
  const foundersView = foundersViewSupported && viewMode === "founders";
  const showFallbackWarning = !configOverride && usingSeedFallback;
  const showLoadState = !configOverride && configLoading;
  const ownershipStatusLabel =
    ownershipScoreModel.criticalActionsCount > 0
      ? ownershipScoreModel.ownershipStatusLabel
      : "No Critical Actions";
  const foundersSecondaryMeta = [
    config.ownership.decider ? `Decider: ${config.ownership.decider}` : null,
    `Affects ${constraintCoverageCount}/${config.layers.length} layers`,
  ]
    .filter(Boolean)
    .join(" · ");
  const showTopNav = !embedded;
  const showBreadcrumb = !embedded;
  const showEditButton = !embedded && isAdmin;

  const copy = foundersView
    ? {
        headerEyebrow: "Founders View",
        northStarLabel: "Clarity Outcome",
        bottleneckLabel: "Main Constraint",
        bottleneckHint: "Trace what is blocked right now",
        systemLabel: "Clarity Map",
        systemPrompt: "Click a layer to see what matters, who owns it, and the next move.",
        cadenceLabel: "Keep It Alive",
        actionLabel: "Next Moves",
        actionPrompt: "Fix / Improve / Create",
        healthLabel: "Clarity & Momentum",
        liftsLabel: "Top Lifts",
        centerTopLine: "STUCK -> CLARITY",
        centerBottomLine: "WORKING MAP IN 6-8 WEEKS",
      }
    : {
        headerEyebrow: "Founder Operating Map",
        northStarLabel: "North Star Outcome",
        bottleneckLabel: "Current Bottleneck",
        bottleneckHint: "Trace impact across layers",
        systemLabel: "Founder Map System",
        systemPrompt: "Select a layer to inspect operating truth, or lock to the active bottleneck",
        cadenceLabel: "Operating Cadence",
        actionLabel: "Operator Queue",
        actionPrompt: "Near-Term Operator Moves (Fix / Improve / Create)",
        healthLabel: "Operating Health",
        liftsLabel: "Highest Leverage Lifts",
        centerTopLine: "WE'RE STUCK -> WORKING MAP",
        centerBottomLine: "REAL DECISIONS IN 6-8 WEEKS",
      };

  return (
    <div
      className={embedded ? "w-full" : "min-h-screen"}
      style={{
        background: c.bg,
        backgroundImage:
          `url("data:image/svg+xml,%3Csvg width='6' height='6' viewBox='0 0 6 6' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='%23000' fill-opacity='0.025'%3E%3Cpath d='M5 0h1L0 5V4zM6 5v1H5z'/%3E%3C/g%3E%3C/svg%3E")`,
      }}
    >
      {showTopNav ? <TopNav /> : null}

      <main className={embedded ? "max-w-content mx-auto px-4 sm:px-6 md:px-9 py-4" : "max-w-content mx-auto pt-6 px-4 sm:px-6 md:px-9 pb-12"}>
        {showBreadcrumb ? (
          <div className="mb-5">
            <Link
              to="/"
              className="font-mono text-[11px] uppercase tracking-[0.08em] hover:opacity-70 transition-opacity"
              style={{ color: c.muted }}
            >
              Map View
            </Link>
            <span className="font-mono text-[11px] mx-2" style={{ color: c.faint }}>
              &gt;
            </span>
            <span className="font-mono text-[11px] uppercase tracking-[0.08em]" style={{ color: c.secondary }}>
              Client Onboarding MojoMap
            </span>
          </div>
        ) : null}

        <section style={cardStyle} className="p-5 sm:p-6 mb-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-wider" style={{ color: c.muted }}>
                {copy.headerEyebrow}
              </p>
              <h1 className="font-sans text-[22px] font-bold mt-1" style={{ color: c.charcoal }}>
                {config.name}
              </h1>
              <p className="font-sans text-[13px] mt-2 max-w-3xl" style={{ color: c.secondary }}>
                {config.purpose}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {foundersViewSupported ? (
                <div
                  className="inline-flex items-center rounded-full border bg-white p-1"
                  style={{ borderColor: c.line }}
                  role="group"
                  aria-label="Map view mode"
                >
                  <Button
                    type="button"
                    variant={viewMode === "standard" ? "secondary" : "ghost"}
                    size="sm"
                    aria-pressed={viewMode === "standard"}
                    onClick={() => setViewMode("standard")}
                  >
                    Standard
                  </Button>
                  <Button
                    type="button"
                    variant={viewMode === "founders" ? "secondary" : "ghost"}
                    size="sm"
                    aria-pressed={viewMode === "founders"}
                    onClick={() => setViewMode("founders")}
                  >
                    Founders View
                  </Button>
                </div>
              ) : null}
              {showEditButton ? (
                <Button asChild size="sm" variant="outline">
                  <Link to={CLIENT_ONBOARDING_MOJOMAP_EDITOR_ROUTE}>Edit Map</Link>
                </Button>
              ) : null}
            </div>
          </div>

          {!configOverride && configError ? (
            <div className="mt-3 rounded-md border px-3 py-2" style={{ borderColor: "#FFD1B4", background: "#FFF3EA" }}>
              <p className="font-sans text-[12px]" style={{ color: c.coral }}>
                {configError}
              </p>
            </div>
          ) : null}

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <MetaBadge>Primary Owner: {config.ownership.primaryOwner}</MetaBadge>
            {!hasPrimaryOwner(config.ownership.primaryOwner) ? (
              <StateBadge tone="gap">Missing Primary Owner</StateBadge>
            ) : null}
            <ScoreChip label="MojoScore" value={ownershipScoreModel.finalMojoScore} />
            <ScoreChip label="Ownership Strength" value={ownershipScoreModel.ownershipScore} />
            <StateBadge tone={ownershipScoreModel.ownershipTone}>{ownershipStatusLabel}</StateBadge>
            {showLoadState ? <MetaBadge>Loading saved map...</MetaBadge> : null}
            {showFallbackWarning ? <StateBadge tone="gap">Using seed fallback</StateBadge> : null}
          </div>

          <p
            className="mt-2 font-sans text-[12px] font-medium"
            style={{ color: ownershipToneColor(ownershipScoreModel.ownershipTone) }}
          >
            {ownershipScoreModel.headlineInsight}
          </p>

          <p className="mt-1 font-sans text-[12px]" style={{ color: c.muted }}>
            {foundersSecondaryMeta}
          </p>

          <div className="mt-4 grid grid-cols-1 lg:grid-cols-3 gap-3">
            <div
              className="lg:col-span-2 rounded-xl border px-4 py-4"
              style={{ borderColor: c.teal, background: "#EFF7F3" }}
            >
              <p className="font-mono text-[10px] uppercase tracking-[0.08em]" style={{ color: c.teal }}>
                {copy.northStarLabel}
              </p>
              <p className="font-sans text-[17px] leading-[1.5] mt-1" style={{ color: c.charcoal, fontWeight: 700 }}>
                {config.centerOutcome}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setSelection({ type: "constraint" })}
              className="rounded-xl border px-4 py-4 text-left hover:opacity-95 transition-opacity"
              style={{ borderColor: c.coral, background: "#FFF0E6" }}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-mono text-[10px] uppercase tracking-[0.08em]" style={{ color: c.coral }}>
                  {copy.bottleneckLabel}
                </p>
                <StateBadge tone="gap">{config.constraint.severity ?? "high"}</StateBadge>
              </div>
              <p className="font-sans text-[13px] font-semibold mt-1" style={{ color: c.charcoal }}>
                {config.constraint.title}
              </p>
              <p className="font-mono text-[10px] mt-2 uppercase tracking-[0.08em]" style={{ color: c.secondary }}>
                {copy.bottleneckHint}
              </p>
            </button>
          </div>
        </section>

        <div
          className="rounded-2xl p-5 sm:p-6"
          style={{
            background: c.field,
            boxShadow:
              "inset 0 2px 6px rgba(0,0,0,0.07), inset 0 0 0 1px rgba(0,0,0,0.04)",
          }}
        >
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
            <section style={cardStyle} className="xl:col-span-2 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-wider" style={{ color: c.muted }}>
                    {copy.systemLabel}
                  </p>
                  <p className="font-sans text-[13px] font-semibold" style={{ color: c.charcoal }}>
                    {copy.systemPrompt}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <ScoreChip label="Layers" value={config.layers.length} />
                  <StateBadge tone="gap">{foundersView ? "Constraint Live" : "Constraint Active"}</StateBadge>
                  {!foundersView ? <ScoreChip label="Affected" value={constraintCoverageCount} /> : null}
                  <MetaBadge>
                    {foundersView
                      ? config.continuousUpdate.cadence || "Weekly review cadence"
                      : config.continuousUpdate.title}
                  </MetaBadge>
                </div>
              </div>

              <div className="overflow-x-auto">
                <svg
                  viewBox="0 0 760 760"
                  className="w-full min-w-[560px] max-h-[760px]"
                  aria-label="Client Onboarding MojoMap rings"
                >
                  <defs>
                    <pattern id="onboarding-grid" width="36" height="36" patternUnits="userSpaceOnUse">
                      <path d="M 36 0 L 0 0 0 36" fill="none" stroke={c.line} strokeWidth="0.55" opacity="0.8" />
                    </pattern>
                  </defs>

                  <rect width="760" height="760" fill="url(#onboarding-grid)" opacity="0.35" />

                  {RING_RADII.map((radius, index) => {
                    const active =
                      selection.type === "layer" &&
                      config.layers[index] &&
                      config.layers[index].id === selection.id;
                    return (
                      <circle
                        key={`ring-${radius}`}
                        cx={MAP_CENTER.x}
                        cy={MAP_CENTER.y}
                        r={radius}
                        fill="none"
                        stroke={active ? c.teal : c.line}
                        strokeWidth={active ? 2.3 : 1.2}
                        opacity={active ? 0.8 : 0.7}
                      />
                    );
                  })}

                  <circle
                    cx={MAP_CENTER.x}
                    cy={MAP_CENTER.y}
                    r={OUTER_LOOP_RADIUS}
                    fill="none"
                    stroke={c.muted}
                    strokeWidth="1.3"
                    strokeDasharray="8 6"
                    opacity="0.6"
                  />

                  <text
                    x={MAP_CENTER.x}
                    y={MAP_CENTER.y + OUTER_LOOP_RADIUS + 18}
                    textAnchor="middle"
                    className="font-mono"
                    fontSize="10"
                    fill={c.muted}
                    letterSpacing="0.11em"
                  >
                    CONTINUOUS UPDATE LOOP
                  </text>

                  {layerPoints.map(({ layer, point }) => (
                    <line
                      key={`center-link-${layer.id}`}
                      x1={MAP_CENTER.x}
                      y1={MAP_CENTER.y}
                      x2={point.x}
                      y2={point.y}
                      stroke={c.line}
                      strokeWidth="1.1"
                      opacity="0.85"
                    />
                  ))}

                  {config.constraint.affectedLayerIds.map((layerId) => {
                    const point = layerPointById[layerId];
                    if (!point) return null;
                    const active =
                      selection.type === "constraint" ||
                      (selection.type === "layer" && selection.id === layerId);
                    return (
                      <line
                        key={`constraint-link-${layerId}`}
                        x1={CONSTRAINT_NODE.x + 84}
                        y1={CONSTRAINT_NODE.y + 34}
                        x2={point.x}
                        y2={point.y}
                        stroke={c.coral}
                        strokeWidth={active ? 2.3 : 1.8}
                        strokeDasharray={active ? "none" : "5 4"}
                        opacity={active ? 0.85 : 0.58}
                      />
                    );
                  })}

                  <g>
                    <circle
                      cx={MAP_CENTER.x}
                      cy={MAP_CENTER.y}
                      r="74"
                      fill={c.teal}
                      opacity="0.2"
                    />
                    <circle
                      cx={MAP_CENTER.x}
                      cy={MAP_CENTER.y}
                      r="60"
                      fill={c.teal}
                      stroke={c.teal}
                      strokeWidth="2.3"
                    />
                    <text x={MAP_CENTER.x} y={MAP_CENTER.y - 6} textAnchor="middle" className="font-sans" fontSize="12" fill="#fff" fontWeight="700">
                      {copy.centerTopLine}
                    </text>
                    <text x={MAP_CENTER.x} y={MAP_CENTER.y + 14} textAnchor="middle" className="font-mono" fontSize="9" fill="#d8f2ec">
                      {copy.centerBottomLine}
                    </text>
                  </g>

                  {layerPoints.map(({ layer, index, point }) => {
                    const selected = selection.type === "layer" && selection.id === layer.id;
                    const highlightedByConstraint =
                      selection.type === "constraint" &&
                      config.constraint.affectedLayerIds.includes(layer.id);
                    const lines = breakTitle(layer.title);
                    return (
                      <g
                        key={layer.id}
                        style={{ cursor: "pointer" }}
                        onClick={() => setSelection({ type: "layer", id: layer.id })}
                      >
                        <circle
                          cx={point.x}
                          cy={point.y}
                          r={selected ? 53 : 49}
                          fill={selected ? c.amber : "#fff"}
                          stroke={highlightedByConstraint ? c.coral : selected ? c.amber : c.line}
                          strokeWidth={selected ? 2.8 : highlightedByConstraint ? 2.4 : 1.6}
                        />
                        <text x={point.x} y={point.y - 18} textAnchor="middle" className="font-mono" fontSize="9" fill={c.muted}>
                          LAYER {index + 1}
                        </text>
                        {lines.map((line, lineIndex) => (
                          <text
                            key={`${layer.id}-line-${line}`}
                            x={point.x}
                            y={point.y + lineIndex * 13 - ((lines.length - 1) * 6)}
                            textAnchor="middle"
                            className="font-sans"
                            fontSize="11"
                            fill={c.charcoal}
                            fontWeight="600"
                          >
                            {line}
                          </text>
                        ))}
                      </g>
                    );
                  })}

                  <g
                    onClick={() => setSelection({ type: "constraint" })}
                    style={{ cursor: "pointer" }}
                  >
                    <circle
                      cx={CONSTRAINT_NODE.x + 84}
                      cy={CONSTRAINT_NODE.y + 34}
                      r={constraintSelected ? 60 : 54}
                      fill={c.coral}
                      opacity={constraintSelected ? 0.24 : 0.16}
                    />
                    <rect
                      x={CONSTRAINT_NODE.x}
                      y={CONSTRAINT_NODE.y}
                      width="168"
                      height="68"
                      rx="10"
                      fill="#FFF0E6"
                      stroke={c.coral}
                      strokeWidth={constraintSelected ? 3 : 2.5}
                    />
                    <text
                      x={CONSTRAINT_NODE.x + 84}
                      y={CONSTRAINT_NODE.y + 17}
                      textAnchor="middle"
                      className="font-mono"
                      fontSize="9"
                      fill={c.coral}
                      letterSpacing="0.08em"
                    >
                      ACTIVE BOTTLENECK
                    </text>
                    <text
                      x={CONSTRAINT_NODE.x + 84}
                      y={CONSTRAINT_NODE.y + 37}
                      textAnchor="middle"
                      className="font-sans"
                      fontSize="11"
                      fill={c.charcoal}
                      fontWeight="700"
                    >
                      PRIMARY CONSTRAINT
                    </text>
                    <text
                      x={CONSTRAINT_NODE.x + 84}
                      y={CONSTRAINT_NODE.y + 52}
                      textAnchor="middle"
                      className="font-mono"
                      fontSize="8"
                      fill={c.secondary}
                      letterSpacing="0.06em"
                    >
                      CLICK TO TRACE IMPACT
                    </text>
                  </g>
                </svg>
              </div>
            </section>

            <section style={cardStyle} className="p-4">
              <div
                className="rounded-lg border px-3 py-3 mb-3"
                style={{ borderColor: c.coral, background: "#FFF0E6" }}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="font-mono text-[10px] uppercase tracking-[0.08em]" style={{ color: c.coral }}>
                    Active Bottleneck
                  </p>
                  <button
                    type="button"
                    onClick={() => setSelection({ type: "constraint" })}
                    className="font-mono text-[10px] uppercase tracking-[0.08em] hover:opacity-80"
                    style={{ color: c.secondary }}
                  >
                    Trace
                  </button>
                </div>
                <p className="font-sans text-[13px] font-semibold mt-1" style={{ color: c.charcoal }}>
                  {config.constraint.title}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <StateBadge tone="gap">{config.constraint.severity ?? "high"} severity</StateBadge>
                  <MetaBadge>Impacts {constraintCoverageCount} layers</MetaBadge>
                </div>
              </div>

              {selection.type === "constraint" ? (
                <>
                  <p className="font-mono text-[10px] uppercase tracking-wider" style={{ color: c.muted }}>
                    Primary Constraint
                  </p>
                  <p className="font-sans text-[16px] font-bold mt-2" style={{ color: c.charcoal }}>
                    {config.constraint.title}
                  </p>
                  <p className="font-sans text-[13px] mt-2 leading-[1.6]" style={{ color: c.secondary }}>
                    {config.constraint.whyItMatters || config.constraint.role}
                  </p>

                  <div className="mt-3 rounded-lg border px-3 py-3" style={{ borderColor: "#FFD1B4", background: "#FFF0E6" }}>
                    <p className="font-mono text-[10px] uppercase tracking-[0.08em]" style={{ color: c.coral }}>
                      Constraint Symptoms
                    </p>
                    <ul className="mt-2 space-y-1.5 list-disc pl-4">
                      {config.constraint.symptoms.map((item) => (
                        <li key={item} className="font-sans text-[12px] leading-[1.55]" style={{ color: c.secondary }}>{item}</li>
                      ))}
                    </ul>
                  </div>

                  <div className="mt-3">
                    <p className="font-mono text-[10px] uppercase tracking-[0.08em]" style={{ color: c.muted }}>
                      Affected Layers
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {config.layers
                        .filter((layer) => config.constraint.affectedLayerIds.includes(layer.id))
                        .map((layer) => (
                          <MetaBadge key={layer.id}>{layer.title}</MetaBadge>
                        ))}
                    </div>
                  </div>
                </>
              ) : selectedLayer ? (
                <>
                  <p className="font-mono text-[10px] uppercase tracking-wider" style={{ color: c.muted }}>
                    Layer Detail
                  </p>
                  <p className="font-sans text-[17px] font-bold mt-2" style={{ color: c.charcoal }}>
                    {selectedLayer.title}
                  </p>
                  <p className="font-sans text-[13px] leading-[1.65] mt-2" style={{ color: c.secondary }}>
                    {selectedLayer.purpose}
                  </p>

                  <div className="mt-3 flex flex-wrap gap-2">
                    {selectedLayer.outputLabel ? <MetaBadge>Output: {selectedLayer.outputLabel}</MetaBadge> : null}
                    {selectedLayer.risk ? <StateBadge tone="gap">Risk: {selectedLayer.risk}</StateBadge> : null}
                  </div>

                  <div className="mt-3">
                    <p className="font-mono text-[10px] uppercase tracking-[0.08em]" style={{ color: c.muted }}>
                      What Must Be True
                    </p>
                    <ul className="mt-2 space-y-1.5 list-disc pl-4">
                      {selectedLayer.content.map((item) => (
                        <li key={item} className="font-sans text-[12px] leading-[1.55]" style={{ color: c.secondary }}>{item}</li>
                      ))}
                    </ul>
                  </div>

                  {selectedLayer.suggestedInputs?.length ? (
                    <div className="mt-3">
                      <p className="font-mono text-[10px] uppercase tracking-[0.08em]" style={{ color: c.muted }}>
                        Suggested Inputs
                      </p>
                      <ul className="mt-2 space-y-1.5 list-disc pl-4">
                        {selectedLayer.suggestedInputs.map((item) => (
                          <li key={item} className="font-sans text-[12px] leading-[1.55]" style={{ color: c.secondary }}>{item}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}

                  {selectedLayer.suggestedActivities?.length ? (
                    <div className="mt-3">
                      <p className="font-mono text-[10px] uppercase tracking-[0.08em]" style={{ color: c.muted }}>
                        Suggested Activities
                      </p>
                      <ul className="mt-2 space-y-1.5 list-disc pl-4">
                        {selectedLayer.suggestedActivities.map((item) => (
                          <li key={item} className="font-sans text-[12px] leading-[1.55]" style={{ color: c.secondary }}>{item}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </>
              ) : null}

              <div className="mt-4 rounded-lg border px-3 py-3" style={{ borderColor: c.line, background: c.lineFaint }}>
                <p className="font-mono text-[10px] uppercase tracking-[0.08em]" style={{ color: c.muted }}>
                  {copy.cadenceLabel}
                </p>
                <ul className="mt-2 space-y-1 list-disc pl-4">
                  {config.continuousUpdate.content.map((item) => (
                    <li key={item} className="font-sans text-[12px] leading-[1.55]" style={{ color: c.secondary }}>{item}</li>
                  ))}
                </ul>
                <p className="mt-2 font-sans text-[12px] font-semibold" style={{ color: c.charcoal }}>
                  Output: {config.continuousUpdate.outputLabel}
                </p>
              </div>
            </section>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 mt-4">
            <section style={cardStyle} className="xl:col-span-2 p-4">
              <div className="flex items-baseline justify-between gap-2 mb-2">
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-wider" style={{ color: c.muted }}>
                    {copy.actionLabel}
                  </p>
                  <p className="font-sans text-[13px] font-semibold" style={{ color: c.charcoal }}>
                    {copy.actionPrompt}
                  </p>
                </div>
                <MetaBadge>{totalActions} actions</MetaBadge>
              </div>

              <div className="space-y-3">
                {config.actionGroups.map((group) => (
                  <div key={group.id} className="rounded-lg border p-3" style={{ borderColor: c.line, background: c.lineFaint }}>
                    <div className="mb-2">
                      <TierBadge tone={group.id === "fix" ? "focus" : group.id === "improve" ? "monitor" : "defer"}>
                        {group.title}
                      </TierBadge>
                    </div>
                    <div className="space-y-2">
                      {group.items.map((item) => {
                        const ownerIsSet = hasPrimaryOwner(item.ownership.primaryOwner);
                        const isSelected = selectedActionId === item.id;
                        return (
                          <div
                            key={item.id}
                            className="group rounded-md border bg-white px-3 py-2.5 transition-colors"
                            style={{
                              borderColor: !ownerIsSet ? c.coral : isSelected ? c.teal : c.line,
                              background: !ownerIsSet ? "#FFF7F2" : isSelected ? "#F7FCFA" : "#fff",
                            }}
                            role="button"
                            tabIndex={0}
                            onClick={() =>
                              setSelectedActionId((current) => (current === item.id ? null : item.id))
                            }
                            onKeyDown={(event) => {
                              if (event.key === "Enter" || event.key === " ") {
                                event.preventDefault();
                                setSelectedActionId((current) => (current === item.id ? null : item.id));
                              }
                            }}
                          >
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div className="min-w-[240px] flex-1">
                                <p className="font-sans text-[12px] font-semibold" style={{ color: c.charcoal }}>
                                  {item.title}
                                </p>
                                <p
                                  className="mt-1 font-sans text-[12px] font-semibold transition-colors"
                                  style={{ color: ownerIsSet ? c.charcoal : c.coral }}
                                >
                                  Primary Owner: {item.ownership.primaryOwner || "Unassigned"}
                                </p>
                                {item.ownership.decider ? (
                                  <p className="mt-0.5 font-sans text-[11px]" style={{ color: c.secondary }}>
                                    Decider: {item.ownership.decider}
                                  </p>
                                ) : null}
                                {item.ownership.contributors?.length ? (
                                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                                    {item.ownership.contributors.map((contributor) => (
                                      <span
                                        key={`${item.id}-contributor-${contributor}`}
                                        className="inline-flex items-center rounded-full border px-2 py-0.5 font-sans text-[10px]"
                                        style={{ borderColor: c.line, color: c.secondary, background: "#fff" }}
                                      >
                                        {contributor}
                                      </span>
                                    ))}
                                  </div>
                                ) : null}
                              </div>
                              <div className="flex flex-wrap items-center gap-2">
                                {!ownerIsSet ? (
                                  <StateBadge tone="gap">Unowned</StateBadge>
                                ) : (
                                  <StateBadge tone="served">Owned</StateBadge>
                                )}
                                {isSelected ? <MetaBadge>Selected</MetaBadge> : null}
                                <StateBadge tone={statusTone(item.status)}>{item.status.replace("_", " ")}</StateBadge>
                                <ScoreChip label="Impact" value={item.impact} />
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section style={cardStyle} className="p-4">
              <p className="font-mono text-[10px] uppercase tracking-wider" style={{ color: c.muted }}>
                {copy.healthLabel}
              </p>
              <div className="mt-2 flex items-center justify-between gap-2">
                <p className="font-sans text-[34px] font-black leading-none" style={{ color: c.charcoal }}>
                  {ownershipScoreModel.finalMojoScore}
                </p>
                <StateBadge tone={ownershipScoreModel.ownershipTone}>
                  {ownershipScoreModel.ownershipStatusLabel}
                </StateBadge>
              </div>
              <p className="mt-1 font-sans text-[11px]" style={{ color: c.muted }}>
                Base {ownershipScoreModel.baseMojoScore} x ownership multiplier{" "}
                {ownershipScoreModel.ownershipMultiplier.toFixed(2)}
              </p>

              <div className="mt-3 rounded-lg border px-3 py-3" style={{ borderColor: c.line, background: c.lineFaint }}>
                <p className="font-mono text-[10px] uppercase tracking-[0.08em]" style={{ color: c.muted }}>
                  Ownership Summary
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <MetaBadge>
                    Owned critical actions: {ownershipScoreModel.ownedCriticalActionsCount}/
                    {ownershipScoreModel.criticalActionsCount}
                  </MetaBadge>
                  <MetaBadge>
                    Unowned critical actions: {ownershipScoreModel.unownedCriticalActionsCount}
                  </MetaBadge>
                  <MetaBadge>Ownership Strength: {ownershipScoreModel.ownershipScore}</MetaBadge>
                </div>
                {ownershipScoreModel.potentialScoreLift > 0 ? (
                  <p className="mt-2 font-sans text-[11px]" style={{ color: c.secondary }}>
                    Assigning owners to Fix actions improves your reachable score by +{ownershipScoreModel.potentialScoreLift}.
                  </p>
                ) : null}
              </div>

              <div className="mt-3 space-y-2">
                {ownershipScoreModel.subscores.map((item) => {
                  const isOwnershipStrength = item.id === "ownership_strength";
                  const score = clamp(item.value, 0, 100);
                  return (
                    <div key={item.id}>
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-sans text-[12px]" style={{ color: c.secondary }}>
                          {item.label}
                        </p>
                        <div className="flex items-center gap-2">
                          <p className="font-mono text-[11px]" style={{ color: c.charcoal }}>
                            {score}
                          </p>
                          {isOwnershipStrength ? (
                            <StateBadge tone={ownershipScoreModel.ownershipTone}>
                              {ownershipScoreModel.ownershipStatusLabel}
                            </StateBadge>
                          ) : null}
                        </div>
                      </div>
                      <div className="mt-1 h-[6px] w-full rounded-full overflow-hidden" style={{ background: c.line }}>
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${score}%`,
                            background: score >= 70 ? c.teal : score >= 60 ? c.amber : c.coral,
                          }}
                        />
                      </div>
                      {isOwnershipStrength ? (
                        <p className="mt-1 font-sans text-[11px]" style={{ color: c.secondary }}>
                          {ownershipScoreModel.ownershipSubscoreInsight}
                        </p>
                      ) : null}
                    </div>
                  );
                })}
              </div>

              <div className="mt-4 rounded-lg border px-3 py-3" style={{ borderColor: c.line, background: c.lineFaint }}>
                <p className="font-mono text-[10px] uppercase tracking-[0.08em]" style={{ color: c.muted }}>
                  {copy.liftsLabel}
                </p>
                <ul className="mt-2 space-y-1.5 list-disc pl-4">
                  {ownershipScoreModel.topLifts.map((item) => (
                    <li key={item} className="font-sans text-[12px] leading-[1.5]" style={{ color: c.secondary }}>{item}</li>
                  ))}
                </ul>
              </div>
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}

export default function ClientOnboardingMojoMap() {
  return <ClientOnboardingMojoMapView />;
}
