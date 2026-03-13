import { useMemo, useState } from 'react';
import type { ClientSummary } from '@/lib/types';

interface Props {
  summary: ClientSummary;

  // Optional overrides (e.g., stored scores from `companies`)
  mojoScore?: number;
  potentialScore?: number;
}

function renderInsightHeadline(text: string): string {
  return text.replace(
    /\*(.*?)\*/g,
    '<em class="not-italic" style="color: hsl(47 87% 73%)">$1</em>'
  );
}

function safeNumber(n: unknown, fallback = 0) {
  return typeof n === 'number' && Number.isFinite(n) ? n : fallback;
}

export default function HeroSection({
  summary,
  mojoScore,
  potentialScore,
}: Props) {
  const [activeIndex, setActiveIndex] = useState(0);

  const score = useMemo(() => {
    const v = mojoScore ?? summary.mojo_score;
    return Math.round(safeNumber(v, 0));
  }, [mojoScore, summary.mojo_score]);

  const potential = useMemo(() => {
    const v = potentialScore ?? summary.potential_score;
    return Math.round(safeNumber(v, 0));
  }, [potentialScore, summary.potential_score]);

  const insights = Array.isArray(summary.key_insights) ? summary.key_insights : [];
  const safeIndex = insights.length ? Math.min(activeIndex, insights.length - 1) : 0;

  const scoreDelta = safeNumber((summary as any).score_delta, 0);
  const showDelta = scoreDelta !== 0;

  return (
    <div className="bg-ink rounded-2xl relative overflow-hidden p-5 sm:p-7">
      {/* Subtle radial glow */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage:
            'radial-gradient(circle 300px at top right, rgba(240,216,96,0.06), transparent)',
        }}
      />

      {/* Layout: stacks on mobile, 3-col on md+ */}
      <div
        className="relative flex flex-col md:grid md:items-center gap-6 md:gap-0"
        style={{ gridTemplateColumns: '128px 1fr 120px' }}
      >
        {/* Column 1: Current Reality */}
        <div className="flex flex-col items-center">
          <span
            className="font-serif text-gold leading-none"
            style={{ fontSize: 72, letterSpacing: '-0.03em' }}
          >
            {score}
          </span>
          <span className="font-mono text-[10px] text-t-dm uppercase tracking-[0.1em] mt-1">
            CURRENT REALITY
          </span>

          {showDelta && (
            <span className="font-mono text-[11px] text-forest mt-2">
              ↑ +{scoreDelta} this quarter
            </span>
          )}

        </div>

        {/* Divider — horizontal on mobile, vertical on desktop */}
        <div className="h-px w-full bg-[#2a2618] md:hidden" />

        <div className="flex flex-col md:flex-row md:h-full">
          <div className="hidden md:block w-px bg-[#2a2618] self-stretch" />

          {/* Column 2: Key Insight */}
          <div className="flex-1 md:px-8 flex flex-col justify-center">
            {insights.length > 1 && (
              <div className="flex items-center gap-2 mb-3">
                {insights.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setActiveIndex(i)}
                    className={`h-[6px] rounded-full transition-all duration-300 cursor-pointer ${
                      i === safeIndex
                        ? 'w-5 bg-gold'
                        : 'w-[6px] bg-[#2a2618] hover:bg-t-dm'
                    }`}
                    aria-label={`View insight ${i + 1}`}
                    type="button"
                  />
                ))}
              </div>
            )}

            {insights.length === 0 ? (
              <div>
                <h2 className="font-serif text-[20px] font-medium text-t-dp leading-[1.35]">
                  Your strategic evaluation is just getting started.
                </h2>
                <p className="font-serif text-[14px] text-t-dt leading-[1.75] mt-3 max-w-xl">
                  Run Web Baseline and AI Research to populate routes, inputs, and opportunities.
                </p>
              </div>
            ) : (
              <div key={safeIndex} className="animate-fade-in-up">
                <h2
                  className="font-serif text-[20px] font-medium text-t-dp leading-[1.35]"
                  dangerouslySetInnerHTML={{
                    __html: renderInsightHeadline(insights[safeIndex].headline),
                  }}
                />
                <p className="font-serif text-[14px] text-t-dt leading-[1.75] mt-3 max-w-xl line-clamp-3">
                  {insights[safeIndex].detail}
                </p>
              </div>
            )}
          </div>

          <div className="hidden md:block w-px bg-[#2a2618] self-stretch" />
        </div>

        {/* Divider — horizontal on mobile */}
        <div className="h-px w-full bg-[#2a2618] md:hidden" />

        {/* Column 3: Projected Outcome */}
        <div className="flex flex-col items-center">
          <span className="font-mono text-[10px] text-t-dm uppercase tracking-[0.14em]">
            PROJECTED OUTCOME
          </span>
          <span className="font-serif text-forest leading-none mt-1" style={{ fontSize: 44 }}>
            {potential}
          </span>
          <span className="font-mono text-[11px] text-forest-mid mt-1">
            if key gaps are closed
          </span>
        </div>
      </div>
    </div>
  );
}
