import { useEffect, useState } from 'react';
import { scoreColor, scoreColorClass } from '@/lib/scoring';
import ScoreBar from '@/components/ui/ScoreBar';
import { useDeepDiveAnalyses, useGenerateDeepDive } from '@/hooks/useDeepDive';
import { useAuth } from '@/hooks/useAuth';
import type { DeepDive, ScoreArea } from '@/lib/types';

interface Props {
  open: boolean;
  areaKey: string | null;
  onClose: () => void;
  /** Pass dynamic areas from useDynamicScoring */
  dynamicAreas?: ScoreArea[];
}

const AREA_RELATIONS: Record<string, string[]> = {
  positioning: ['product', 'marketing', 'sales', 'cx'],
  strategy: ['product', 'marketing', 'sales', 'cx'],
  product: ['sales', 'cx'],
  marketing: ['sales', 'cx'],
  sales: ['cx'],
  cx: [],
};

export default function DeepDivePanel({ open, areaKey, onClose, dynamicAreas }: Props) {
  const [activeTab, setActiveTab] = useState(0);
  const { user } = useAuth();
  const { data: dbAnalyses } = useDeepDiveAnalyses();
  const generateMutation = useGenerateDeepDive();

  const areas = dynamicAreas ?? [];
  const area = areas.find((a) => a.area_key === areaKey);

  // Use DB analysis if available; otherwise show a real empty state
  const deepDive: DeepDive | null = areaKey
    ? (dbAnalyses?.[areaKey] ?? null)
    : null;

  const isGenerating = generateMutation.isPending;

  useEffect(() => { setActiveTab(0); }, [areaKey]);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    if (open) document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [open, onClose]);

  function handleRegenerate() {
    if (!areaKey || isGenerating) return;
    generateMutation.mutate(areaKey);
  }

  const hasDbAnalysis = !!(user && dbAnalyses?.[areaKey ?? '']);
  const tabs = ['What We Found', 'What Good Looks Like', 'Your Path Forward'];

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-40 transition-opacity duration-300 ${
          open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
        style={{ background: 'rgba(30,26,18,0.4)', top: 52 }}
        onClick={onClose}
      />

      {/* Panel */}
      <div
        className="fixed right-0 z-50 bg-ink flex flex-col dark-scrollbar"
        style={{
          top: 52,
          width: 500,
          height: 'calc(100vh - 52px)',
          transform: open ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform 0.28s cubic-bezier(0.4, 0, 0.2, 1)',
        }}
      >
        {area ? (
          <>
            {/* Header */}
            <div className="px-6 py-[18px] relative" style={{ minHeight: 72 }}>
              <p className="font-mono text-[10px] text-t-ds uppercase tracking-wide">
                Map View &gt; {area.area_label}
              </p>
              <h2 className="font-serif text-[22px] text-t-dp mt-1 leading-[1.2]">{area.area_label}</h2>
              <button
                onClick={onClose}
                className="absolute top-4 right-4 w-7 h-7 border border-[#3e3828] rounded flex items-center justify-center text-t-ds hover:text-t-dp transition-colors cursor-pointer text-sm"
              >
                ✕
              </button>
            </div>

            {/* Score strip */}
            <div className="px-6 py-4 border-b border-[#2a2618]">
              <div className="flex items-end gap-3 mb-2">
                <span className="font-serif text-[48px] leading-none" style={{ color: scoreColor(area.score) }}>
                  {area.score.toFixed(1)}
                </span>
                <span className={`font-mono text-[11px] mb-2 ${scoreColorClass(area.score)}`}>
                  {area.trend === 'up' ? '↑' : area.trend === 'down' ? '↓' : '→'}
                </span>
              </div>
              <ScoreBar score={area.score} ceiling={area.ceiling} height={10} darkTrack />
              {area.ceiling != null && (
                <p className="font-mono text-[11px] italic text-gold mt-[6px]">
                  Capped at {area.ceiling.toFixed(1)} by Positioning
                </p>
              )}
              <p className="font-mono text-[11px] text-t-ds mt-1">{area.status_note}</p>
            </div>

            {/* Analyze / Refresh button */}
            {user && (
              <div className="px-6 py-3 border-b border-[#2a2618]">
                <button
                  onClick={handleRegenerate}
                  disabled={isGenerating}
                  className="w-full flex items-center justify-center gap-2 bg-[#2e2a1a] border border-[#3e3a28] text-gold rounded-[7px] py-2.5 font-mono text-[11px] uppercase tracking-[0.1em] hover:bg-[#3e3a28] transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {isGenerating ? (
                    <>
                      <div className="w-3 h-3 border-2 border-gold border-t-transparent rounded-full animate-spin" />
                      Analyzing your evidence…
                    </>
                  ) : hasDbAnalysis ? (
                    '↻ Re-analyze with latest evidence'
                  ) : (
                    '✦ Analyze with AI'
                  )}
                </button>
                <p className="mt-2 font-mono text-[10px] text-t-ds leading-relaxed">
                  This analysis uses client-scoped uploaded evidence on your local internal AI path.
                </p>
              </div>
            )}

            {/* Tab bar */}
            <div className="flex border-b border-[#2a2618]">
              {tabs.map((tab, i) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(i)}
                  className={`flex-1 py-3 px-6 font-mono text-[12px] uppercase tracking-[0.08em] border-b-2 transition-colors cursor-pointer ${
                    activeTab === i
                      ? 'text-gold border-gold'
                      : 'text-t-ds border-transparent hover:text-t-dp'
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>

            {/* Tab content */}
            <div className="flex-1 overflow-y-auto px-6 py-[22px] dark-scrollbar">
              {deepDive ? (
                <>
                  {activeTab === 0 && <TabWhatWeFound deepDive={deepDive} />}
                  {activeTab === 1 && <TabWhatGoodLooksLike deepDive={deepDive} area={area} />}
                  {activeTab === 2 && <TabPathForward deepDive={deepDive} areaKey={areaKey!} />}
                </>
              ) : (
                <p className="font-serif text-[14px] italic text-t-ds text-center py-12 px-5 leading-[1.75]">
                  {user
                    ? 'Click "Analyze with AI" above to generate insights from your uploaded evidence.'
                    : 'Your strategist is preparing the detailed analysis for this area. It will appear here after your next session.'}
                </p>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-[14px] border-t border-[#2a2618]">
              <button className="w-full bg-[#2e2a1a] border border-[#3e3a28] text-gold rounded-[7px] py-3 font-mono text-[11px] uppercase tracking-[0.1em] hover:bg-[#3e3a28] transition-colors cursor-pointer">
                Work on This with Your Strategist →
              </button>
              <button
                onClick={onClose}
                className="w-full mt-[10px] font-mono text-[12px] text-t-ds hover:text-t-dp transition-colors cursor-pointer py-1"
              >
                ← Back to Map View
              </button>
            </div>
          </>
        ) : (
          <div className="h-full flex items-center justify-center px-8 text-center">
            <p className="font-serif text-[14px] italic text-t-ds leading-[1.75]">
              No score area is available yet for this panel. Run Web Baseline and AI Research first.
            </p>
          </div>
        )}
      </div>
    </>
  );
}

/* ─── Tab Components ─── */

function TabWhatWeFound({ deepDive }: { deepDive: DeepDive }) {
  return (
    <div>
      <p className="font-mono text-[10px] text-t-ds uppercase tracking-[0.14em] border-b border-[#2a2618] pb-2 mb-[14px]">
        Key Gaps
      </p>
      {deepDive.holding_back.length === 0 ? (
        <div className="bg-ink-sub border border-[#241e10] border-l-[3px] border-l-forest rounded-lg p-[14px] px-4 mb-[10px]">
          <p className="font-serif text-[14px] text-forest">No critical gaps identified — evidence looks solid.</p>
        </div>
      ) : (
        deepDive.holding_back.map((gap, i) => (
          <div key={i} className="bg-ink-sub border border-[#241e10] border-l-[3px] border-l-rust rounded-lg p-[14px] px-4 mb-[10px]">
            <p className="font-serif text-[14px] font-medium text-gold-light leading-[1.3]">{gap.gap}</p>
            <p className="font-serif text-[13px] italic text-t-ds leading-[1.7] mt-[5px]">{gap.description}</p>
          </div>
        ))
      )}

      <p className="font-mono text-[10px] text-t-ds uppercase tracking-[0.14em] border-b border-[#2a2618] pb-2 mb-[14px] mt-5">
        What We Observed
      </p>
      {deepDive.what_we_found.split('\n\n').map((para, i) => (
        <p
          key={i}
          className="font-serif text-[14px] text-t-ds leading-[1.75] mb-[14px]"
          dangerouslySetInnerHTML={{
            __html: para
              .replace(/\*\*(.*?)\*\*/g, '<strong class="text-gold-light">$1</strong>')
              .replace(/\*(.*?)\*/g, '<em>$1</em>'),
          }}
        />
      ))}

      <div className="bg-ink-sub rounded-md p-[11px] px-[14px] mt-2">
        <p className="font-serif text-[13px] italic text-t-ds leading-[1.65]">
          Analysis generated from your uploaded evidence and input completeness.
        </p>
      </div>
    </div>
  );
}

function TabWhatGoodLooksLike({
  deepDive,
  area,
}: {
  deepDive: DeepDive;
  area: { score: number };
}) {
  return (
    <div>
      <div className="bg-ink-sub border border-[#241e10] border-l-[3px] border-l-gold rounded-[10px] p-[18px] px-5">
        <p className="font-mono text-[10px] text-gold uppercase tracking-[0.14em] mb-[10px]">
          THE BENCHMARK
        </p>
        <p className="font-serif text-[14px] text-t-ds leading-[1.75]">
          {deepDive.what_good_looks_like}
        </p>
      </div>

      <div className="mt-5">
        <p className="font-mono text-[10px] text-t-ds uppercase mb-2">Your current gap</p>
        <div className="relative h-2 rounded-full bg-ink-sub">
          <div
            className="absolute left-0 top-0 h-2 rounded-full"
            style={{ width: `${area.score}%`, background: scoreColor(area.score) }}
          />
          <div
            className="absolute top-[-3px] w-[2px] h-[14px] rounded-sm"
            style={{ left: '85%', background: 'hsl(var(--gold))' }}
          />
        </div>
        <div className="flex justify-between mt-[6px]">
          <span className="font-mono text-[11px]" style={{ color: scoreColor(area.score) }}>
            Current: {area.score.toFixed(1)}
          </span>
          <span className="font-mono text-[11px] text-gold">Benchmark: ~85</span>
        </div>
      </div>
    </div>
  );
}

function TabPathForward({
  deepDive,
  areaKey,
}: {
  deepDive: DeepDive;
  areaKey: string;
}) {
  const related = AREA_RELATIONS[areaKey] || [];

  return (
    <div>
      {deepDive.path_forward.map((step, i) => (
        <div key={i} className="bg-ink-sub border border-[#241e10] rounded-lg p-[14px] px-4 mb-[10px]">
          <div className="flex items-start gap-3">
            <div className="w-[22px] h-[22px] rounded-full bg-[#2a2618] text-gold font-mono text-[10px] flex items-center justify-center shrink-0 mt-0.5">
              {i + 1}
            </div>
            <p className="font-serif text-[14px] text-gold-light leading-[1.4] flex-1">{step.step}</p>
          </div>
          <div className="flex items-center gap-[14px] mt-2 ml-[34px]">
            <span className="font-mono text-[11px] text-t-ds">{step.duration}</span>
            <span className="text-t-ds">·</span>
            <span className="font-mono text-[11px] text-t-ds">{step.owner}</span>
            <span className="text-t-ds">·</span>
            <span className={`font-mono text-[11px] ${step.impact_pts >= 3 ? 'text-forest' : 'text-amber'}`}>
              +{step.impact_pts} pts to score
            </span>
          </div>
          {step.action_label && (
            <button className="ml-[34px] mt-[10px] font-mono text-[10px] text-gold bg-[#2a2618] border border-[#3a3020] rounded px-3 py-[5px] uppercase cursor-pointer hover:bg-[#3a3020] transition-colors">
              {step.action_label} →
            </button>
          )}
        </div>
      ))}

      {related.length > 0 && (
        <div className="border border-[#2a2618] rounded-lg p-[14px] px-4 mt-4">
          <p className="font-mono text-[10px] text-t-ds uppercase tracking-[0.1em] mb-[6px]">
            WHAT THIS UNLOCKS
          </p>
          <p className="font-serif text-[13px] italic text-t-ds leading-[1.7]">
            Fixing {areaKey} will unlock improvements in {related.join(', ')} once resolved.
          </p>
        </div>
      )}
    </div>
  );
}
