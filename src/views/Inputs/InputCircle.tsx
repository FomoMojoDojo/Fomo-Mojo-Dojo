import type { InputItem } from '@/lib/types';
import ImpactBadge from '@/components/ui/ImpactBadge';

interface Props {
  input: InputItem;
  onClick: () => void;
  isSelected: boolean;
}

const statusColors: Record<string, string> = {
  complete: 'hsl(150, 60%, 42%)',
  partial: 'hsl(28, 80%, 55%)',
  gap: 'hsl(350, 75%, 55%)',
  not_started: 'hsl(30, 8%, 72%)',
};

const statusGradients: Record<string, [string, string]> = {
  complete: ['hsl(150, 55%, 45%)', 'hsl(170, 60%, 40%)'],
  partial: ['hsl(28, 80%, 55%)', 'hsl(40, 85%, 55%)'],
  gap: ['hsl(350, 75%, 55%)', 'hsl(320, 60%, 50%)'],
  not_started: ['hsl(30, 8%, 72%)', 'hsl(30, 8%, 68%)'],
};

export default function InputCircle({ input, onClick, isSelected }: Props) {
  const color = statusColors[input.status];
  const [gradStart, gradEnd] = statusGradients[input.status];
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

  return (
    <button
      onClick={onClick}
      className={`w-[120px] flex flex-col items-center cursor-pointer group transition-transform duration-200 ${
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
            stroke="hsl(30, 10%, 88%)"
            strokeWidth="1"
          />
          {/* Track */}
          <circle
            cx={center} cy={center} r={radius}
            fill="none"
            stroke="hsl(30, 12%, 91%)"
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
            background: '#faf8f5',
            boxShadow: 'inset 0 2px 8px rgba(0,0,0,0.06), inset 0 0 0 1px rgba(0,0,0,0.03)',
          }}
        >
          <span
            className="font-sans leading-none tracking-tighter"
            style={{ fontSize: 28, fontWeight: 900, color }}
          >
            {input.completeness}
          </span>
          <span
            className="font-mono uppercase leading-none mt-[3px]"
            style={{ fontSize: 8, fontWeight: 600, color, opacity: 0.65 }}
          >
            {input.status === 'complete' ? 'done' : input.status === 'not_started' ? '—' : input.status}
          </span>
        </div>
      </div>

      <div className="mt-[6px]">
        <ImpactBadge pts={input.score_impact} tier={input.impact_tier} />
      </div>

      <p className="font-sans text-[12px] text-t-primary text-center leading-[1.3] mt-[5px] max-w-[110px] font-semibold">
        {input.input_label}
      </p>
      <p className="font-mono text-[9px] text-t-faint text-center mt-[2px]">{input.sub_group}</p>
    </button>
  );
}
