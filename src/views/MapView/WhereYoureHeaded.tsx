import type { Milestone } from '@/lib/types';

interface Props {
  milestones: Milestone[];
}

const dotStyles = {
  done: 'border-forest text-forest',
  current: 'border-rust bg-[#f5ead0] shadow-[0_0_0_4px_rgba(192,120,64,0.15)]',
  upcoming: 'border-cream-dark text-t-faint',
};

function connectorColor(from: string, to: string) {
  if (from === 'done' && to === 'done') return 'hsl(var(--forest))';
  if (from === 'done' && to === 'current') return 'linear-gradient(to bottom, hsl(var(--forest)), hsl(var(--cream-dark)))';
  if (from === 'current' && to === 'upcoming') return 'linear-gradient(to bottom, hsl(var(--rust)), hsl(var(--cream-dark)))';
  return 'hsl(var(--cream-dark))';
}

export default function WhereYoureHeaded({ milestones }: Props) {
  return (
    <div className="bg-cream-mid border border-cream-dark rounded-xl overflow-hidden">
      <div className="px-5 py-[14px] border-b border-cream-dark flex items-center justify-between">
        <span className="font-sans text-[12px] font-bold text-t-tertiary uppercase tracking-[0.06em]">
          Where You're Headed
        </span>
        <span className="font-mono text-[10px] text-t-faint uppercase cursor-pointer hover:text-t-muted transition-colors">
          Full roadmap →
        </span>
      </div>

      <div className="p-5">
        {milestones.length === 0 ? (
          <p className="font-serif text-[13px] italic text-t-tertiary text-center py-6">
            Milestones will appear here as your strategist maps your roadmap.
          </p>
        ) : milestones.map((m, i) => (
          <div
            key={m.id}
            className="flex gap-[14px] animate-fade-in-up"
            style={{ animationDelay: `${i * 0.08}s` }}
          >
            {/* Timeline column */}
            <div className="flex flex-col items-center">
              <div
                className={`w-[30px] h-[30px] rounded-full border-2 flex items-center justify-center text-[13px] shrink-0 ${dotStyles[m.status]}`}
              >
                {m.status === 'done' && '✓'}
                {m.status === 'current' && <span className="text-rust text-[12px]">◉</span>}
                {m.status === 'upcoming' && <span className="font-mono text-[11px]">{i + 1}</span>}
              </div>
              {i < milestones.length - 1 && (
                <div
                  className="w-[2px] flex-1 min-h-[20px]"
                  style={{ background: connectorColor(m.status, milestones[i + 1].status) }}
                />
              )}
            </div>

            {/* Content */}
            <div className="pb-5 pt-0.5">
              <p className={`font-serif text-[14px] leading-tight ${
                m.status === 'upcoming' ? 'text-t-muted' : 'text-t-primary'
              }`}>
                {m.title}
              </p>
              <p className="font-serif text-[13px] italic text-t-tertiary leading-[1.65] mt-[3px]">
                {m.description}
              </p>
              {m.status === 'current' && (
                <span className="inline-block font-mono text-[7px] text-rust border border-[rgba(192,120,64,0.35)] rounded-[3px] px-[7px] py-[2px] mt-[6px] uppercase">
                  you are here
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
