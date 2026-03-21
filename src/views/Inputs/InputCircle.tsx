import type { InputItem } from '@/lib/types';
import ImpactBadge from '@/components/ui/ImpactBadge';
import { getInputBaseImpact } from '@/lib/scoring/inputImpact';

interface Props {
  input: InputItem;
  onClick: () => void;
  isSelected: boolean;
}

const statusColors: Record<string, string> = {
  complete: '#5f9b8c',
  partial: '#d4804a',
  gap: '#e8613a',
  not_started: '#9aa9a4',
};

const statusGradients: Record<string, [string, string]> = {
  complete: ['#5f9b8c', '#3a7f72'],
  partial: ['#d4804a', '#c06f3a'],
  gap: ['#e8613a', '#cf4f2d'],
  not_started: ['#a7b5b0', '#92a39d'],
};

export default function InputCircle({ input, onClick, isSelected }: Props) {
  const color = statusColors[input.status];
  const [gradStart, gradEnd] = statusGradients[input.status];
  const isComplete = input.status === 'complete';
  const completedImpact = getInputBaseImpact(input.input_key);
  const radius = 42;
  const strokeWidth = 8;
  const size = 110;
  const center = size / 2;
  const circumference = 2 * Math.PI * radius;
  const filled = (input.completeness / 100) * circumference;
  const gap = circumference - filled;

  // Calculate dot position at end of arc
  const angle = ((input.completeness / 100) * 360 - 90) * (Math.PI / 180);
  const dotX = center + radius * Math.cos(angle);
  const dotY = center + radius * Math.sin(angle);
  const gradId = `grad-${input.input_key}`;
  const formattedCompletedImpact =
    Math.abs(completedImpact - Math.round(completedImpact)) < 0.05
      ? String(Math.round(completedImpact))
      : completedImpact.toFixed(1);

  return (
    <button
      onClick={onClick}
      className={`w-[122px] flex flex-col items-center cursor-pointer group transition-transform duration-200 ${
        isSelected ? 'scale-[1.06]' : 'hover:scale-[1.04]'
      }`}
    >
      {/* Circle container */}
      <div className="relative" style={{ width: size, height: size }}>
        <svg className="w-full h-full" viewBox={`0 0 ${size} ${size}`}>
          <defs>
            <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor={gradStart} />
              <stop offset="100%" stopColor={gradEnd} />
            </linearGradient>
          </defs>
          {/* Outer inset shadow ring */}
          <circle
            cx={center} cy={center} r={radius + 4}
            fill="none"
            stroke="#dce7df"
            strokeWidth="1"
          />
          {/* Track */}
          <circle
            cx={center} cy={center} r={radius}
            fill="none"
            stroke="#edf3ee"
            strokeWidth={strokeWidth}
          />
          {/* Filled arc */}
          {input.completeness > 0 && (
            <circle
              cx={center} cy={center} r={radius}
              fill="none"
              stroke={`url(#${gradId})`}
              strokeWidth={strokeWidth}
              strokeDasharray={`${filled} ${gap}`}
              strokeLinecap="round"
              transform={`rotate(-90 ${center} ${center})`}
              className="transition-all duration-700"
            />
          )}
          {/* Dot at end of arc */}
          {input.completeness > 0 && input.completeness < 100 && (
            <circle
              cx={dotX} cy={dotY}
              r={6}
              fill={gradEnd}
              className="transition-all duration-700"
            />
          )}
        </svg>

        {/* Inner face */}
        <div
          className="absolute rounded-full flex flex-col items-center justify-center"
          style={{
            top: strokeWidth + 6,
            left: strokeWidth + 6,
            right: strokeWidth + 6,
            bottom: strokeWidth + 6,
            background: '#ffffff',
            boxShadow: 'inset 0 1px 6px rgba(35,60,75,0.08), inset 0 0 0 1px rgba(35,60,75,0.04)',
          }}
        >
          <span
            className="font-sans leading-none tracking-tighter"
            style={{ fontSize: 28, fontWeight: 900, color }}
          >
            {isComplete ? `+${formattedCompletedImpact}` : input.completeness}
          </span>
          <span
            className="font-mono leading-none mt-[4px]"
            style={{
              fontSize: 10,
              fontWeight: 500,
              color: isComplete ? '#3a7f72' : '#46606d',
              opacity: 0.9,
              letterSpacing: '0.02em',
            }}
          >
            {isComplete ? 'pts added' : input.status === 'not_started' ? '—' : input.status}
          </span>
        </div>
      </div>

      <div className="mt-[6px]">
        <ImpactBadge pts={input.score_impact} tier={input.impact_tier} />
      </div>

      <p className="font-sans text-[12px] text-center leading-[1.3] mt-[5px] max-w-[110px] font-semibold" style={{ color: '#233c4b' }}>
        {input.input_label}
      </p>
      <p className="font-mono text-[9px] text-center mt-[2px]" style={{ color: '#6e847f' }}>{input.sub_group}</p>
    </button>
  );
}
