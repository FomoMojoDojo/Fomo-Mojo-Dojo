import type { ScoreArea, ClientSummary } from '@/lib/types';
import { scoreColorClass } from '@/lib/scoring';
import ScoreBar from '@/components/ui/ScoreBar';

interface Props {
  areas: ScoreArea[];
  summary: ClientSummary;
  onAreaClick: (areaKey: string) => void;
}

function TrendArrow({ trend }: { trend: string }) {
  if (trend === 'up') return <span className="text-forest text-[11px]">↑</span>;
  if (trend === 'down') return <span className="text-danger text-[11px]">↓</span>;
  return <span className="text-[#94a3b8] text-[11px]">→</span>;
}

export default function WhereWeStand({ areas, summary, onAreaClick }: Props) {
  return (
    <div className="bg-cream-mid border border-cream-dark rounded-xl overflow-hidden">
      {/* Header */}
      <div className="px-5 py-[14px] border-b border-cream-dark flex items-center justify-between">
        <span className="font-sans text-[12px] font-bold text-t-tertiary uppercase tracking-[0.06em]">
          Where We Stand
        </span>
        <button
          onClick={() => onAreaClick('positioning')}
          className="font-mono text-[10px] text-t-faint uppercase cursor-pointer hover:text-t-muted transition-colors"
        >
          Detail →
        </button>
      </div>

      {/* Area rows */}
      <div className="p-5">
        {areas.map((area, i) => (
          <button
            key={area.area_key}
            onClick={() => onAreaClick(area.area_key)}
            className={`w-full text-left cursor-pointer py-[11px] transition-colors hover:bg-[rgba(30,26,18,0.03)] ${
              i < areas.length - 1 ? 'border-b border-cream-dark' : ''
            }`}
          >
            <div className="flex items-center justify-between mb-[6px]">
              <span className="font-serif text-[14px] text-t-primary">{area.area_label}</span>
              <div className="flex items-center gap-2">
                <span className={`font-mono text-[14px] font-medium ${scoreColorClass(area.score)}`}>
                  {area.score.toFixed(1)}
                </span>
                <TrendArrow trend={area.trend} />
              </div>
            </div>
            <ScoreBar score={area.score} ceiling={area.ceiling} height={8} />
            <p className="font-mono text-[11px] text-t-faint mt-1 leading-[1.4]">{area.status_note}</p>
          </button>
        ))}

        {/* Constraint callout */}
        <div className="bg-[#e8e0cc] border-l-[3px] border-amber rounded-[7px] p-[11px] px-[14px] mt-[14px]">
          <span className="font-mono text-[10px] text-amber uppercase tracking-[0.1em] block mb-[5px]">
            WHY EXECUTION IS CONSTRAINED
          </span>
          <p className="font-serif text-[13px] text-t-secondary leading-[1.7]">
            {summary.constraint_explanation}
          </p>
        </div>
      </div>
    </div>
  );
}
