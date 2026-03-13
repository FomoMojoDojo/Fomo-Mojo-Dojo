import { scoreColor } from '@/lib/scoring';

interface ScoreBarProps {
  score: number;
  ceiling?: number | null;
  height?: number;
  darkTrack?: boolean;
  className?: string;
}

export default function ScoreBar({ score, ceiling, height = 8, darkTrack, className = '' }: ScoreBarProps) {
  return (
    <div className={`relative w-full ${className}`} style={{ height }}>
      {/* Track */}
      <div
        className="absolute inset-0 rounded-full"
        style={{ height, background: darkTrack ? '#2a2618' : 'hsl(var(--cream-dark))' }}
      />
      {/* Fill */}
      <div
        className="absolute left-0 top-0 rounded-full"
        style={{
          width: `${Math.min(score, 100)}%`,
          height,
          background: scoreColor(score),
          animationName: 'score-fill',
          animationDuration: '0.7s',
          animationTimingFunction: 'cubic-bezier(0.4, 0, 0.2, 1)',
        }}
      />
      {/* Ceiling marker */}
      {ceiling != null && (
        <div
          className="absolute top-1/2 -translate-y-1/2 rounded-sm"
          style={{
            left: `${Math.min(ceiling, 100)}%`,
            width: 3,
            height: height + 6,
            background: '#a07838',
            opacity: 0.75,
          }}
        />
      )}
    </div>
  );
}
