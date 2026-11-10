import { useEffect, useRef, useState } from "react";
import type React from "react";
import { home } from "@/data/home";

const AX = 80, AY0 = 320, EX = 1760, W = 2200;
const BASE = {
  possible: { cy: 320, ry: 250, rx: 64 },
  plausible: { cy: 330, ry: 190, rx: 50 },
  goal: { cy: 250, ry: 110, rx: 38 },
  probable: { cy: 350, ry: 44, rx: 18 },
};

export function FutureCone() {
  const [hover, setHover] = useState<number | null>(null);
  const [pt, setPt] = useState({ x: 0, y: 0 });
  const track = (e: React.MouseEvent) => { const r = box.current!.getBoundingClientRect(); setPt({ x: e.clientX - r.left, y: e.clientY - r.top }); };
  const strat = home.strategies;
  const box = useRef<HTMLDivElement>(null);
  const [H, setH] = useState(640);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setH(Math.max(560, Math.round(e!.contentRect.height))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  // stretch everything vertically around the axis line to fill the viewport height
  // apex sits on the map's time line (measured), so the line into Today continues into the cone
  const [lineY, setLineY] = useState<number | null>(null);
  useEffect(() => {
    const measure = () => {
      const t = document.querySelector("[data-timeline]"); const el = box.current;
      if (t && el) setLineY(t.getBoundingClientRect().top - el.getBoundingClientRect().top);
    };
    measure(); window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [H]);
  const AY = Math.min(H - 200, Math.max(200, lineY ?? 60 + (AY0 - 60) * ((H - 60) / 580)));
  const ku = (AY - 60) / (AY0 - 60), kd = (H - AY) / (640 - AY0);
  const k = (ku + kd) / 2;
  const sy = (v: number) => (v < AY0 ? AY - (AY0 - v) * ku : AY + (v - AY0) * kd);
  const rings = Object.fromEntries(Object.entries(BASE).map(([n, r]) => [n, { cy: sy(r.cy), ry: r.ry * k, rx: r.rx * Math.min(k, 1.4) }])) as typeof BASE;
  const yFor = (e: number) => AY - e * 220 * k;

  return (
    <div className="flex h-full flex-col">
      <div ref={box} className="relative min-h-0 flex-1">
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: W, height: H }} className="absolute left-0 top-0" role="img" aria-label="Your futures cone">
        {/* time axis */}
        <line x1={AX} y1={40} x2={W - 60} y2={40} stroke="var(--foreground)" strokeWidth={1.5} />
        <path d={`M${W - 68} 34 L${W - 58} 40 L${W - 68} 46`} fill="none" stroke="var(--foreground)" strokeWidth={1.5} />
        {[["Focus · ~6 weeks", 620], ["Goal date · 2028", EX]].map(([t, x]) => (
          <g key={t as string}>
            <text x={x as number} y={26} className="fill-foreground font-mono text-[13px] font-bold uppercase tracking-[0.16em]" textAnchor="middle">{t}</text>
            <line x1={x as number} y1={52} x2={x as number} y2={H - 20} stroke="var(--muted-foreground)" strokeDasharray="2 6" />
          </g>
        ))}

        {/* cone outlines */}
        {Object.entries(rings).map(([k, r], i) => (
          <g key={k}>
            <path
              d={`M${AX} ${AY} L${EX} ${r.cy - r.ry} M${AX} ${AY} L${EX} ${r.cy + r.ry}`}
              stroke="var(--muted-foreground)" strokeOpacity={k === "possible" ? 0.5 : 0.3} strokeWidth={0.75} fill="none"
            />
          </g>
        ))}
        <path d={`M${AX} ${AY} L${EX} ${rings.goal.cy - rings.goal.ry} L${EX} ${rings.goal.cy + rings.goal.ry} Z`} fill="var(--kind-echoed)" opacity={0.22} />
        {Object.entries(rings).map(([k, r]) => (
          <ellipse key={k} cx={EX} cy={r.cy} rx={r.rx} ry={r.ry}
            fill={k === "goal" ? "var(--evidence)" : k === "probable" ? "var(--next)" : "var(--surface)"}
            fillOpacity={k === "possible" ? 0.6 : 0.9}
            stroke="var(--muted-foreground)" strokeOpacity={0.5} strokeWidth={0.75} />
        ))}

        {/* strategy lines */}
        {strat.map((s, i) => {
          const y = yFor(s.end);
          const col = s.status === "stalled" ? "var(--tone-goal-ink)" : s.status === "planned" ? "var(--tone-market-ink)" : "var(--foreground)";
          const x2 = s.status === "stalled" ? 760 : EX;
          const y2 = s.status === "stalled" ? AY + (y - AY) * ((760 - AX) / (EX - AX)) : y;
          const on = hover === i;
          return (
            <g key={s.name} onMouseEnter={(e) => { track(e); setHover(i); }} onMouseMove={track} onMouseLeave={() => setHover(null)} onClick={() => setHover(on ? null : i)} className="cursor-pointer">
              <line x1={AX} y1={AY} x2={x2} y2={y2} stroke="transparent" strokeWidth={18} />
              <line x1={AX} y1={AY} x2={x2} y2={y2}
                stroke={col}
                strokeWidth={on ? 3 : 1.75}
                strokeDasharray={s.status === "planned" ? "8 7" : undefined}
                className="transition-all" />
              {s.status === "stalled"
                ? <rect x={x2 - 6} y={y2 - 6} width={12} height={12} fill={col} />
                : <circle cx={x2} cy={y2} r={on ? 7 : 5} fill={s.status === "planned" ? "var(--surface)" : col} stroke={col} strokeWidth={2} className="transition-all" />}
              <text x={x2 + 16} y={y2 + 5} fill={col} stroke="var(--paper)" strokeWidth={5} paintOrder="stroke" className="text-[17px] font-semibold">{s.name}</text>
            </g>
          );
        })}

        {/* ring labels */}
        {[["Possible", rings.possible.cy - rings.possible.ry + 20], ["Your goal · " + home.goal, rings.goal.cy - 40], ["Probable", rings.probable.cy], ["Plausible", rings.plausible.cy + rings.plausible.ry + 10]].map(([t, y]) => (
          <g key={t as string}>
            <line x1={EX + 70} y1={y as number} x2={EX + 200} y2={y as number} stroke="var(--muted-foreground)" strokeOpacity={0.5} strokeDasharray="2 4" />
            <text x={EX + 210} y={(y as number) + 5} className="fill-foreground font-mono text-[15px] font-semibold uppercase tracking-[0.12em]">{t}</text>
          </g>
        ))}
        <text x={EX + 210} y={rings.probable.cy + 24} className="fill-muted-foreground text-[15px]">If nothing changes · score {home.ifNothingChanges}</text>
        {/* the gap between the Today inset and the cone: time line keeps running across it */}
        <line x1={0} y1={AY} x2={AX} y2={AY} stroke="var(--foreground)" strokeOpacity={0.4} strokeWidth={1} />
        <circle cx={AX} cy={AY} r={9} fill="var(--dot)" stroke="var(--foreground)" strokeWidth={2} />
      </svg>
      {hover !== null && (
        <div className="pointer-events-none absolute z-20 w-[340px] rounded-xl bg-surface p-4 shadow-lift"
          style={{ left: Math.min(pt.x - 40, W - 360), top: pt.y + 28 }}>
          <div className="font-display text-lg font-bold">{strat[hover]!.name}</div>
          <div className="label mt-1 text-[10px] text-muted-foreground">{strat[hover]!.status}</div>
          <p className="mt-2 text-[15px] leading-snug">{strat[hover]!.note}</p>
        </div>
      )}
      </div>

      <div className="mt-2 flex h-[40px] shrink-0 items-start justify-between gap-8 px-2">
        <p className="label text-[12px] text-muted-foreground">Paths: black = underway · blue dashed = planned · amber square = stalled · thin grey = the cone · hover a path for more</p>
      </div>
    </div>
  );
}
