import type { Opportunity } from '@/lib/types';
import { opportunityActionTone } from '@/lib/opportunityLabels';

interface Props {
  opportunities: Opportunity[];
  onOpportunityClick: (areaKey: string) => void;
}

function ptsColor(pts: number) {
  if (pts >= 8) return '#2F7A66';
  if (pts >= 5) return '#355EA8';
  return '#46606D';
}

function typeBadge(type: string, effort: string) {
  const label = `${type} · ${effort} effort`;
  const normalized = type === 'Fix' || type === 'Improve' || type === 'Create' ? type : 'Improve';
  const tone = opportunityActionTone(normalized);
  return (
    <span
      className="font-mono text-[10px] border rounded-[3px] px-2 py-[2px] uppercase"
      style={{ color: tone.fg, borderColor: tone.border, background: tone.bg }}
    >
      {label}
    </span>
  );
}

export default function BiggestOpportunities({ opportunities, onOpportunityClick }: Props) {
  return (
    <div className="rounded-xl overflow-hidden border" style={{ background: "#FFFFFF", borderColor: "#DDE6D1" }}>
      <div className="px-5 py-[14px] border-b flex items-center justify-between" style={{ borderColor: "#DDE6D1" }}>
        <span className="font-sans text-[12px] font-bold uppercase tracking-[0.06em]" style={{ color: "#46606D" }}>
          Biggest Opportunities
        </span>
        <span className="font-mono text-[10px] uppercase cursor-pointer transition-colors hover:opacity-70" style={{ color: "#6E847F" }}>
          All opportunities →
        </span>
      </div>

      <div className="p-5">
        {opportunities.length === 0 ? (
          <p className="font-serif text-[13px] italic text-center py-6" style={{ color: "#46606D" }}>
            Opportunities will appear here once your strategy inputs are analyzed.
          </p>
        ) : opportunities.map((opp, i) => (
          <div key={opp.id}>
            <button
              onClick={() => onOpportunityClick(opp.area_key)}
              className={`w-full text-left cursor-pointer py-[13px] transition-colors hover:bg-[rgba(53,94,168,0.06)] ${
                i < opportunities.length - 1 ? 'border-b' : ''
              }`}
              style={i < opportunities.length - 1 ? { borderColor: "#DDE6D1" } : undefined}
            >
              <div className="flex items-start justify-between gap-2">
                <p className="font-serif text-[14px] leading-[1.3] flex-1" style={{ color: "#233C4B" }}>
                  {opp.title}
                </p>
                <span className="font-mono text-[13px] font-medium whitespace-nowrap" style={{ color: ptsColor(opp.pts_value) }}>
                  +{opp.pts_value} pts
                </span>
              </div>
              <p className="font-serif text-[13px] italic leading-[1.65] mt-[5px]" style={{ color: "#46606D" }}>
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
