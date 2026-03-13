import type { Opportunity } from '@/lib/types';

interface Props {
  opportunities: Opportunity[];
  onOpportunityClick: (areaKey: string) => void;
}

function ptsColor(pts: number) {
  if (pts >= 8) return 'text-forest';
  if (pts >= 5) return 'text-amber';
  return 'text-slate';
}

function typeBadge(type: string, effort: string) {
  const label = `${type} · ${effort} effort`;
  const styles: Record<string, string> = {
    Fix: 'text-rust border-[rgba(192,120,64,0.22)] bg-[rgba(192,120,64,0.06)]',
    Improve: 'text-amber border-[rgba(200,120,24,0.22)] bg-[rgba(200,120,24,0.06)]',
    Create: 'text-slate border-[rgba(58,88,112,0.2)] bg-[rgba(58,88,112,0.06)]',
  };
  return (
    <span className={`font-mono text-[10px] border rounded-[3px] px-2 py-[2px] uppercase ${styles[type] || ''}`}>
      {label}
    </span>
  );
}

export default function BiggestOpportunities({ opportunities, onOpportunityClick }: Props) {
  return (
    <div className="bg-cream-mid border border-cream-dark rounded-xl overflow-hidden">
      <div className="px-5 py-[14px] border-b border-cream-dark flex items-center justify-between">
        <span className="font-sans text-[12px] font-bold text-t-tertiary uppercase tracking-[0.06em]">
          Biggest Opportunities
        </span>
        <span className="font-mono text-[10px] text-t-faint uppercase cursor-pointer hover:text-t-muted transition-colors">
          All opportunities →
        </span>
      </div>

      <div className="p-5">
        {opportunities.length === 0 ? (
          <p className="font-serif text-[13px] italic text-t-tertiary text-center py-6">
            Opportunities will appear here once your strategy inputs are analyzed.
          </p>
        ) : opportunities.map((opp, i) => (
          <div key={opp.id}>
            <button
              onClick={() => onOpportunityClick(opp.area_key)}
              className={`w-full text-left cursor-pointer py-[13px] transition-colors hover:bg-[rgba(30,26,18,0.03)] ${
                i < opportunities.length - 1 ? 'border-b border-cream-dark' : ''
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <p className="font-serif text-[14px] text-t-primary leading-[1.3] flex-1">
                  {opp.title}
                </p>
                <span className={`font-mono text-[13px] font-medium whitespace-nowrap ${ptsColor(opp.pts_value)}`}>
                  +{opp.pts_value} pts
                </span>
              </div>
              <p className="font-serif text-[13px] italic text-t-tertiary leading-[1.65] mt-[5px]">
                {opp.description}
              </p>
              <div className="mt-[7px]">{typeBadge(opp.type, opp.effort)}</div>
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
