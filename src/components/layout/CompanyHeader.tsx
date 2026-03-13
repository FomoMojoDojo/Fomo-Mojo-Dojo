interface Props {
  company_name: string;
  quarter: string;
  archetype: string;
  last_updated: string;
  tier: number;
}

const tierBadge: Record<number, { label: string; className: string }> = {
  2: { label: 'Paid Session', className: 'bg-[#2a1a08] text-rust border-[#4a3018]' },
  3: { label: 'Retainer', className: 'bg-[#1a2a10] text-forest border-[#2a4020]' },
};

export default function CompanyHeader({
  company_name,
  quarter,
  archetype,
  last_updated,
  tier,
}: Props) {
  const badge = tierBadge[tier];

  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-cream-dark pb-5 mb-7 gap-2">
      <div>
        <h1 className="font-serif text-[20px] sm:text-[22px] text-t-primary tracking-[-0.01em]">
          {company_name}
        </h1>
        <p className="font-mono text-[10px] sm:text-[11px] text-t-faint uppercase tracking-[0.1em] mt-[3px]">
          Strategy Map · {quarter} · {archetype}
        </p>
      </div>
      <div className="flex items-center gap-3">
        <span className="font-mono text-[10px] text-t-faint">
          Last updated {last_updated}
        </span>
        {badge && (
          <span
            className={`font-mono text-[9px] uppercase px-2 py-[3px] rounded-[3px] border ${badge.className}`}
          >
            {badge.label}
          </span>
        )}
      </div>
    </div>
  );
}
