import { useState, useMemo, useRef } from 'react';
import { ROUTES_DATA, type Route } from '@/lib/routesData';
import { Check, Circle, Loader2, ChevronDown, ChevronUp } from 'lucide-react';
import { MetaBadge, ScoreChip, StateBadge, TierBadge } from '@/components/ui/semantic-badges';

/* ── Palette matching alt view ── */
const c = {
  bg: '#eae5db',
  field: '#ddd8cd',
  card: '#ffffff',
  line: '#ebe7e0',
  lineFaint: '#f0ede8',
  charcoal: '#2c2925',
  secondary: '#5c5750',
  muted: '#9a958d',
  faint: '#c4bfb5',
  coral: '#e8613a',
  teal: '#3a9a8c',
  amber: '#c48a2a',
};

const catMeta = {
  fix:     { stroke: c.coral, label: 'Fix',     bg: `${c.coral}14`, border: `${c.coral}40`, activeBg: `${c.coral}22` },
  improve: { stroke: c.amber, label: 'Improve', bg: `${c.amber}14`, border: `${c.amber}40`, activeBg: `${c.amber}22` },
  create:  { stroke: c.teal,  label: 'Create',  bg: `${c.teal}14`,  border: `${c.teal}40`,  activeBg: `${c.teal}22` },
} as const;

const effortLabel: Record<string, string> = { low: 'Low', medium: 'Med', high: 'High' };
const statusIcon = (s: string) => {
  if (s === 'complete') return <Check className="w-3 h-3" style={{ color: c.teal }} />;
  if (s === 'in_progress') return <Loader2 className="w-3 h-3 animate-spin" style={{ color: c.amber }} />;
  return <Circle className="w-3 h-3" style={{ color: c.faint }} />;
};

type SortMode = 'recommended' | 'impact' | 'effort';
const effortRank: Record<string, number> = { low: 1, medium: 2, high: 3 };

function routePath(index: number, total: number, x1: number, x2: number, cy: number, height: number): string {
  const spread = height * 0.34;
  const t = total <= 1 ? 0.5 : index / (total - 1);
  const yOffset = (t - 0.5) * spread * 2;
  const midX = (x1 + x2) / 2;
  const bend = yOffset * 0.5;
  return `M ${x1} ${cy} C ${midX - 40} ${cy + yOffset + bend}, ${midX + 40} ${cy + yOffset + bend}, ${x2} ${cy}`;
}

const cardStyle = {
  background: c.card,
  borderRadius: 12,
  boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
  border: `1px solid ${c.line}`,
} as const;

interface Props {
  onRouteSelect?: (route: Route) => void;
  currentScore?: number;
  potentialScore?: number;
}

export default function StrategyJourneyMapAlt({ onRouteSelect, currentScore, potentialScore }: Props) {
  const { routes, readinessDimensions, mojoScoreSummary: seedSummary } = ROUTES_DATA;
  const summary = {
    ...seedSummary,
    currentScore: currentScore ?? seedSummary.currentScore,
    potentialScore: potentialScore ?? seedSummary.potentialScore,
  };

  const [catFilters, setCatFilters] = useState<Set<string>>(new Set(['fix', 'improve', 'create']));
  const [sortMode, setSortMode] = useState<SortMode>('recommended');
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailExpanded, setDetailExpanded] = useState(true);
  const [hoveredNode, setHoveredNode] = useState<'start' | 'current' | 'desired' | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const toggleCat = (cat: string) => {
    setCatFilters(prev => {
      const next = new Set(prev);
      if (next.has(cat)) { if (next.size > 1) next.delete(cat); } else next.add(cat);
      return next;
    });
  };

  const visibleRoutes = useMemo(() => {
    const filtered = routes.filter(r => catFilters.has(r.category));
    const sorters: Record<SortMode, (a: Route, b: Route) => number> = {
      recommended: (a, b) => (b.recommended ? 1 : 0) - (a.recommended ? 1 : 0) || b.mojoImpactPoints - a.mojoImpactPoints,
      impact: (a, b) => b.mojoImpactPoints - a.mojoImpactPoints,
      effort: (a, b) => effortRank[a.effort] - effortRank[b.effort],
    };
    return [...filtered].sort(sorters[sortMode]);
  }, [routes, catFilters, sortMode]);

  const recommendedRoute = visibleRoutes.find(r => r.recommended) || visibleRoutes[0];
  const selectedRoute = routes.find(r => r.id === selectedId) || null;

  const svgW = 960;
  const svgH = 420;
  const currentX = 170;
  const desiredX = 840;
  const cy = svgH / 2;
  const startR = 52;
  const currentR = 64;
  const desiredR = 50;

  return (
    <div className="overflow-hidden mb-5" style={cardStyle}>
      <div className="relative p-5 sm:p-6 pb-4">
        {/* Title row */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <span className="font-sans text-[10px] font-bold uppercase tracking-[0.1em]" style={{ color: c.coral }}>Strategy Journey Map</span>
            <p className="font-sans text-[13px] mt-0.5" style={{ color: c.secondary }}>Where are we — and where do we go next?</p>
          </div>
          <span className="font-mono text-[10px]" style={{ color: c.muted }}>{visibleRoutes.length} of {routes.length} routes</span>
        </div>

        {/* Map + Filters */}
        <div className="flex flex-col md:flex-row gap-4">
          {/* SVG Map */}
          <div className="overflow-x-auto flex-1">
            <svg
              ref={svgRef}
              viewBox={`0 0 ${svgW} ${svgH}`}
              className="w-full min-w-[500px]"
              style={{ maxHeight: 420 }}
            >
              <defs>
                <pattern id="grid-alt" width="40" height="40" patternUnits="userSpaceOnUse">
                  <path d="M 40 0 L 0 0 0 40" fill="none" stroke={c.line} strokeWidth="0.5" opacity="0.8" />
                </pattern>
                <filter id="glow-alt">
                  <feGaussianBlur stdDeviation="3" result="blur" />
                  <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
                </filter>
              </defs>
              <rect width={svgW} height={svgH} fill="url(#grid-alt)" opacity="0.4" />

              {/* Gap region */}
              {(() => {
                const gapX = currentX + currentR + 10;
                const gapW = desiredX - currentX - currentR - desiredR - 20;
                const gapH = svgH - 40;
                return (
                  <>
                    <rect x={gapX} y={20} width={gapW} height={gapH} rx="16" fill={c.lineFaint} opacity="0.7" />
                    <text x={gapX + gapW / 2} y={20 + gapH - 12} textAnchor="middle" className="font-mono" fontSize="9" fill={c.muted} letterSpacing="0.12em">THE GAP</text>
                  </>
                );
              })()}

              {/* Route paths */}
              {visibleRoutes.map((route, i) => {
                const isRec = route.id === recommendedRoute?.id;
                const isHovered = hoveredId === route.id;
                const isSelected = selectedId === route.id;
                const path = routePath(i, visibleRoutes.length, currentX + currentR + 4, desiredX - desiredR - 4, cy, svgH);
                const color = catMeta[route.category].stroke;
                return (
                  <g key={route.id}>
                    <path d={path} fill="none" stroke="transparent" strokeWidth="16" className="cursor-pointer"
                      onMouseEnter={() => setHoveredId(route.id)}
                      onMouseLeave={() => setHoveredId(null)}
                      onClick={() => { setSelectedId(route.id); onRouteSelect?.(route); }}
                    />
                    <path d={path} fill="none" stroke={color}
                      strokeWidth={isRec ? 3.5 : isHovered || isSelected ? 2.5 : 1.2}
                      strokeDasharray={isRec ? 'none' : '6 4'}
                      opacity={isHovered || isSelected ? 1 : isRec ? 0.85 : 0.25}
                      filter={isRec ? 'url(#glow-alt)' : undefined}
                      className="transition-all duration-200 pointer-events-none"
                    />
                  </g>
                );
              })}

              {/* Start / Baseline node */}
              <g
                onMouseEnter={() => setHoveredNode('start')}
                onMouseLeave={() => setHoveredNode(null)}
                className="cursor-pointer"
                style={{ opacity: hoveredNode === 'start' ? 1 : 0.4 }}
              >
                <circle cx={currentX} cy={cy} r={startR} fill={hoveredNode === 'start' ? '#b8c4d0' : '#d5dbe2'} stroke={hoveredNode === 'start' ? '#8a9bb0' : '#c0c8d2'} strokeWidth={1.5} strokeDasharray="4 3" />
                <text x={currentX} y={cy - 4} textAnchor="middle" fontSize="12" fill={c.secondary} className="font-sans" fontWeight="600">Baseline</text>
                <text x={currentX} y={cy + 10} textAnchor="middle" fontSize="9" fill={c.muted} className="font-mono">{Math.round(summary.currentScore)}</text>
              </g>

              {/* Current Reality node */}
              <g
                onMouseEnter={() => setHoveredNode('current')}
                onMouseLeave={() => setHoveredNode(null)}
                className="cursor-pointer"
                style={{ opacity: hoveredNode === 'current' ? 1 : 0.9 }}
              >
                <circle cx={currentX} cy={cy} r={currentR} fill={hoveredNode === 'current' ? c.coral : `${c.coral}cc`} stroke={c.coral} strokeWidth={hoveredNode === 'current' ? 3.5 : 2.5} />
                <circle cx={currentX} cy={cy} r={currentR} fill="none" stroke={c.coral} strokeWidth="2" opacity="0.3">
                  <animate attributeName="r" values={`${currentR};${currentR + 5};${currentR}`} dur="3s" repeatCount="indefinite" />
                  <animate attributeName="opacity" values="0.3;0;0.3" dur="3s" repeatCount="indefinite" />
                </circle>
                <text x={currentX} y={cy - 12} textAnchor="middle" fontSize="11" fill="#fff" className="font-sans" fontWeight="600">Current</text>
                <text x={currentX} y={cy + 2} textAnchor="middle" fontSize="11" fill="#fff" className="font-sans" fontWeight="600">Reality</text>
                <text x={currentX} y={cy + 24} textAnchor="middle" fontSize="22" fill="#fff" className="font-sans" fontWeight="800">{Math.round(summary.currentScore)}</text>
                {hoveredNode === 'current' && (
                  <>
                    <text x={currentX} y={cy + 42} textAnchor="middle" fontSize="8" fill="#ffffffaa" className="font-mono">Gap: {Math.round(summary.potentialScore - summary.currentScore)} pts</text>
                  </>
                )}
              </g>

              {/* Desired Outcome node */}
              <g
                onMouseEnter={() => setHoveredNode('desired')}
                onMouseLeave={() => setHoveredNode(null)}
                className="cursor-pointer"
                style={{ opacity: hoveredNode === 'desired' ? 1 : 0.9 }}
              >
                <circle cx={desiredX} cy={cy} r={desiredR} fill={hoveredNode === 'desired' ? c.teal : `${c.teal}cc`} stroke={c.teal} strokeWidth={hoveredNode === 'desired' ? 3 : 2} />
                <text x={desiredX} y={cy - 8} textAnchor="middle" fontSize="11" fill="#fff" className="font-sans" fontWeight="600">Projected</text>
                <text x={desiredX} y={cy + 6} textAnchor="middle" fontSize="11" fill="#fff" className="font-sans" fontWeight="600">Outcome</text>
                <text x={desiredX} y={cy + 26} textAnchor="middle" fontSize="20" fill="#fff" className="font-sans" fontWeight="800">{Math.round(summary.potentialScore)}</text>
                {hoveredNode === 'desired' && (
                  <text x={desiredX} y={cy + 44} textAnchor="middle" fontSize="8" fill="#ffffffaa" className="font-mono">+{Math.round(summary.potentialScore - summary.currentScore)} from current</text>
                )}
              </g>

              {/* Readiness gates */}
              {readinessDimensions.map((dim, i) => {
                const gateY = cy + currentR + 14 + i * 18;
                const barW = 50;
                const fillW = barW * (dim.percentComplete / 100);
                const barColor = dim.percentComplete >= 50 ? c.teal : dim.percentComplete >= 30 ? c.amber : c.coral;
                return (
                  <g key={dim.id}>
                    <text x={currentX - 30} y={gateY + 4} textAnchor="end" fontSize="8" fill={c.muted} className="font-mono" letterSpacing="0.05em">{dim.label}</text>
                    <rect x={currentX - 25} y={gateY - 2} width={barW} height={6} rx="3" fill={c.lineFaint} />
                    <rect x={currentX - 25} y={gateY - 2} width={fillW} height={6} rx="3" fill={barColor} />
                    <text x={currentX + 30} y={gateY + 4} fontSize="8" fill={c.muted} className="font-mono">{dim.percentComplete}%</text>
                  </g>
                );
              })}
            </svg>
          </div>

          {/* Filters sidebar */}
          <div className="flex flex-row md:flex-col gap-2.5 min-w-[120px] shrink-0 overflow-x-auto">
            <span className="font-sans text-[9px] font-bold uppercase tracking-wider" style={{ color: c.muted }}>Category</span>
            {(['fix', 'improve', 'create'] as const).map(cat => {
              const meta = catMeta[cat];
              const active = catFilters.has(cat);
              return (
                <button
                  key={cat}
                  onClick={() => toggleCat(cat)}
                  className="transition-all cursor-pointer text-left"
                  style={{
                    color: meta.stroke,
                    background: 'transparent',
                    opacity: active ? 1 : 0.5,
                  }}
                >
                  <TierBadge tone={cat === 'fix' ? 'focus' : cat === 'improve' ? 'monitor' : 'defer'}>
                    {meta.label}
                  </TierBadge>
                </button>
              );
            })}
            <div className="h-px my-1" style={{ background: c.line }} />
            <span className="font-sans text-[9px] font-bold uppercase tracking-wider" style={{ color: c.muted }}>Sort by</span>
            {([['recommended', 'Recommended'], ['impact', 'Highest Impact'], ['effort', 'Lowest Effort']] as const).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setSortMode(key as SortMode)}
                className="transition-all cursor-pointer text-left"
                style={{
                  opacity: sortMode === key ? 1 : 0.7,
                }}
              >
                <MetaBadge>{label}</MetaBadge>
              </button>
            ))}
          </div>
        </div>

        {/* Hover tooltip */}
        {hoveredId && !selectedId && (() => {
          const r = routes.find(r => r.id === hoveredId);
          if (!r) return null;
          return (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-lg p-3 px-4 shadow-xl z-10 max-w-[340px] animate-fade-in-up pointer-events-none" style={{ ...cardStyle, boxShadow: '0 4px 20px rgba(0,0,0,0.1)' }}>
              <div className="flex items-center gap-2 mb-1">
                <TierBadge tone={r.category === 'fix' ? 'focus' : r.category === 'improve' ? 'monitor' : 'defer'}>
                  {catMeta[r.category].label}
                </TierBadge>
                {r.recommended && <MetaBadge>Recommended</MetaBadge>}
              </div>
              <p className="font-sans text-[13px] font-semibold leading-tight" style={{ color: c.charcoal }}>{r.title}</p>
              <p className="font-sans text-[11px] leading-[1.5] mt-1" style={{ color: c.secondary }}>{r.shortDescription}</p>
              <div className="flex items-center gap-2 mt-2">
                <ScoreChip label="Pts" value={r.mojoImpactPoints} />
                <MetaBadge>{effortLabel[r.effort]} effort</MetaBadge>
              </div>
            </div>
          );
        })()}
      </div>

      {/* Selected route detail panel */}
      {selectedRoute && (
        <div style={{ borderTop: `1px solid ${c.line}` }}>
          <button
            onClick={() => setDetailExpanded(!detailExpanded)}
            className="w-full flex items-center justify-between px-6 py-3 cursor-pointer hover:bg-[#faf9f6] transition-colors"
          >
            <div className="flex items-center gap-3">
              <TierBadge tone={selectedRoute.category === 'fix' ? 'focus' : selectedRoute.category === 'improve' ? 'monitor' : 'defer'}>
                {catMeta[selectedRoute.category].label}
              </TierBadge>
              <h3 className="font-sans text-[15px] font-semibold" style={{ color: c.charcoal }}>{selectedRoute.title}</h3>
              {selectedRoute.recommended && <MetaBadge>Recommended</MetaBadge>}
              <ScoreChip label="Pts" value={selectedRoute.mojoImpactPoints} />
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={e => { e.stopPropagation(); setSelectedId(null); }}
                className="font-sans text-[9px] font-semibold uppercase hover:opacity-70 transition-opacity cursor-pointer"
                style={{ color: c.muted }}
              >
                Close
              </button>
              {detailExpanded ? <ChevronUp className="w-4 h-4" style={{ color: c.muted }} /> : <ChevronDown className="w-4 h-4" style={{ color: c.muted }} />}
            </div>
          </button>

          {detailExpanded && (
            <div className="px-4 sm:px-6 pb-5 grid grid-cols-1 md:grid-cols-3 gap-5 animate-fade-in-up">
              {/* Overview */}
              <div>
                <p className="font-sans text-[13px] leading-[1.65] mb-3" style={{ color: c.secondary }}>{selectedRoute.shortDescription}</p>
                <div className="flex items-center gap-2 flex-wrap">
                  <MetaBadge>{effortLabel[selectedRoute.effort]} effort</MetaBadge>
                  <StateBadge tone={selectedRoute.status === 'complete' ? 'designed' : selectedRoute.status === 'in_progress' ? 'served' : 'gap'}>
                    {selectedRoute.status.replace('_', ' ')}
                  </StateBadge>
                </div>
                {selectedRoute.dependencies.length > 0 && (
                  <div className="mt-3">
                    <span className="font-sans text-[9px] font-bold uppercase tracking-wider" style={{ color: c.muted }}>Depends on</span>
                    <div className="flex gap-1.5 mt-1">
                      {selectedRoute.dependencies.map(dep => (
                        <MetaBadge key={dep}>{dep}</MetaBadge>
                      ))}
                    </div>
                  </div>
                )}
                {selectedRoute.whyRecommended.length > 0 && (
                  <div className="mt-3 rounded-lg p-3" style={{ background: `${c.coral}08` }}>
                    <span className="font-sans text-[9px] font-bold uppercase tracking-wider" style={{ color: `${c.coral}99` }}>Why this matters</span>
                    <ul className="mt-1.5 space-y-1">
                      {selectedRoute.whyRecommended.map((r, i) => (
                        <li key={i} className="font-sans text-[11px] leading-[1.55] flex items-start gap-1.5" style={{ color: c.secondary }}>
                          <span className="mt-0.5 shrink-0" style={{ color: `${c.coral}60` }}>·</span>{r}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              {/* Steps */}
              <div>
                <span className="font-sans text-[10px] font-bold uppercase tracking-wider block mb-2" style={{ color: c.muted }}>Steps</span>
                <div className="space-y-2">
                  {selectedRoute.steps.map(step => (
                    <div key={step.id} className="flex items-start gap-2">
                      {statusIcon(step.status)}
                      <span className="font-sans text-[12px] leading-[1.5]" style={{ color: step.status === 'complete' ? c.faint : c.secondary, textDecoration: step.status === 'complete' ? 'line-through' : 'none' }}>
                        {step.title}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Evidence */}
              <div>
                <span className="font-sans text-[10px] font-bold uppercase tracking-wider block mb-2" style={{ color: c.muted }}>Evidence Needed</span>
                <div className="space-y-2">
                  {selectedRoute.evidenceChecklist.map(item => (
                    <div key={item.id} className="flex items-start gap-2">
                      {statusIcon(item.status === 'missing' ? 'not_started' : item.status)}
                      <span className="font-sans text-[11px] leading-[1.5]" style={{
                        color: item.status === 'complete' ? c.faint : item.status === 'missing' ? c.coral : c.secondary,
                        textDecoration: item.status === 'complete' ? 'line-through' : 'none',
                      }}>
                        {item.title}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
