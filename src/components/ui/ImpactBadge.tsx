interface ImpactBadgeProps {
  pts: number;
  tier?: 'high' | 'med' | 'low' | 'done';
  className?: string;
}

const tierStyles = {
  high: 'bg-[#f0d87820] text-[#c8920a] border-[#f0d87840]',
  med: 'bg-[#c0784018] text-rust border-[#c0784038]',
  low: 'bg-[#4a7a4018] text-forest border-[#4a7a4030]',
  done: 'bg-[#2e2a1a] text-[#5a5030] border-transparent',
};

function deriveTier(pts: number): 'high' | 'med' | 'low' {
  if (pts >= 3.0) return 'high';
  if (pts >= 1.0) return 'med';
  return 'low';
}

export default function ImpactBadge({ pts, tier, className = '' }: ImpactBadgeProps) {
  const resolvedTier = tier ?? deriveTier(pts);
  const isDone = resolvedTier === 'done';
  return (
    <span
      className={`inline-flex items-center font-mono text-[10px] font-medium px-2 py-[3px] rounded-[10px] border ${tierStyles[resolvedTier]} ${className}`}
    >
      {isDone ? (
        <em className="not-italic">complete</em>
      ) : (
        `+${pts.toFixed(1)} pts`
      )}
    </span>
  );
}
