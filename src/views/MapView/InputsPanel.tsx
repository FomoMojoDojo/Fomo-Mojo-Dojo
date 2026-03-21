import { useEffect, useMemo, useState } from 'react';
import type { InputItem } from '@/lib/types';
import InputSidePanel from '@/views/Inputs/InputSidePanel';
import { useInputs } from '@/hooks/useInputs';
import { useAuth } from '@/hooks/useAuth';
import { useCompany } from '@/hooks/useCompany';
import { MetaBadge, ScoreChip, StateBadge } from '@/components/ui/semantic-badges';

interface Props {
  open: boolean;
  onClose: () => void;
}

const statusLabels: Record<string, string> = {
  complete: 'Complete',
  partial: 'In Progress',
  gap: 'Missing',
  not_started: 'Not Started',
};

export default function InputsPanel({ open, onClose }: Props) {
  const [selectedInput, setSelectedInput] = useState<InputItem | null>(null);
  const { user } = useAuth();
  const { activeCompany } = useCompany();
  const { query: inputsQuery } = useInputs();
  const dbInputs = inputsQuery.data;

  // Use DB inputs if user is logged in and has data, otherwise fall back to mock
  const inputs = useMemo(
    () => ((user && dbInputs && dbInputs.length > 0) ? dbInputs : []),
    [user, dbInputs]
  );

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    if (open) document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) {
      setTimeout(() => setSelectedInput(null), 300);
    }
  }, [open]);

  // Keep selectedInput in sync with refreshed data
  useEffect(() => {
    if (selectedInput && inputs) {
      const updated = inputs.find((i) => i.id === selectedInput.id);
      if (updated) setSelectedInput(updated);
    }
  }, [inputs, selectedInput]);

  const complete = inputs.filter((i) => i.status === 'complete').length;
  const total = inputs.length;
  const gaps = inputs.filter((i) => i.status === 'gap' || i.status === 'not_started').length;
  const pct = total > 0 ? Math.round((complete / total) * 100) : 0;

  const grouped = {
    foundation: inputs.filter((i) => i.group_key === 'foundation'),
    execution: inputs.filter((i) => i.group_key === 'execution'),
    market_evidence: inputs.filter((i) => i.group_key === 'market_evidence'),
  };

  const groups = [
    { key: 'foundation', label: 'Foundation', badge: 'Positioning + Strategy Cascade', items: grouped.foundation },
    { key: 'execution', label: 'Execution', badge: 'GTM + Messaging', items: grouped.execution },
    { key: 'market_evidence', label: 'Market Evidence', badge: 'ODI + Validation', items: grouped.market_evidence },
  ];

  // If an input is selected, show the detail panel
  if (selectedInput) {
    return (
      <>
        <div
          className={`fixed inset-0 z-40 transition-opacity duration-300 ${
            open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
          }`}
          style={{ background: 'rgba(35,60,75,0.18)', top: 52, backdropFilter: 'blur(2px)' }}
          onClick={onClose}
        />
        <div
          className="fixed right-0 z-50 flex flex-col dark-scrollbar"
          style={{
            top: 52,
            width: 500,
            height: 'calc(100vh - 52px)',
            transform: open ? 'translateX(0)' : 'translateX(100%)',
            transition: 'transform 0.28s cubic-bezier(0.4, 0, 0.2, 1)',
            background: '#faf7f6',
            borderLeft: '1px solid #dde6d1',
            borderTopLeftRadius: 28,
            borderBottomLeftRadius: 28,
            boxShadow: '0 20px 60px rgba(35,60,75,0.16)',
          }}
        >
          <div className="px-6 py-3 border-b border-[#dde6d1]">
            <button
              onClick={() => setSelectedInput(null)}
              className="font-mono text-[11px] uppercase tracking-[0.08em] transition-colors cursor-pointer"
              style={{ color: '#46606d' }}
            >
              ← Back to Inputs List
            </button>
          </div>
          <div className="flex-1 overflow-y-auto">
            <InputSidePanel
              input={selectedInput}
              mojoScore={Math.max(0, Number(activeCompany?.mojo_score ?? 0))}
              potentialScore={Math.max(0, Number(activeCompany?.potential_score ?? 0))}
              onClose={() => setSelectedInput(null)}
            />
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-40 transition-opacity duration-300 ${
          open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
        style={{ background: 'rgba(35,60,75,0.18)', top: 52, backdropFilter: 'blur(2px)' }}
        onClick={onClose}
      />

      {/* Panel */}
      <div
        className="fixed right-0 z-50 flex flex-col dark-scrollbar"
        style={{
          top: 52,
          width: 500,
          height: 'calc(100vh - 52px)',
          transform: open ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform 0.28s cubic-bezier(0.4, 0, 0.2, 1)',
          background: '#faf7f6',
          borderLeft: '1px solid #dde6d1',
          borderTopLeftRadius: 28,
          borderBottomLeftRadius: 28,
          boxShadow: '0 20px 60px rgba(35,60,75,0.16)',
        }}
      >
        {/* Header */}
        <div className="px-6 py-[18px] relative border-b border-[#dde6d1]" style={{ minHeight: 72 }}>
          <p className="font-mono text-[10px] uppercase tracking-wide" style={{ color: '#6e847f' }}>
            Map View &gt; Diagnostic Inputs
          </p>
          <h2 className="font-sans text-[28px] mt-1 leading-[1.1] font-semibold tracking-tight" style={{ color: '#233c4b' }}>Your Inputs</h2>
          <button
            onClick={onClose}
            className="absolute top-4 right-4 w-7 h-7 rounded-full flex items-center justify-center transition-colors cursor-pointer text-sm"
            style={{ border: '1px solid #dde6d1', color: '#46606d', background: '#ffffff' }}
          >
            ✕
          </button>
        </div>

        {/* Completeness bar */}
        <div className="px-6 py-4 border-b border-[#dde6d1]">
          <div className="flex items-center gap-3 mb-2">
            <span className="font-mono text-[10px] uppercase tracking-[0.1em]" style={{ color: '#6e847f' }}>Overall</span>
            <div className="flex-1 h-[6px] rounded relative overflow-hidden" style={{ background: '#dde6d1' }}>
              <div
                className="absolute left-0 top-0 h-[6px] rounded transition-all duration-[800ms]"
                style={{
                  width: `${pct}%`,
                  background: 'linear-gradient(to right, #5f9b8c, #233c4b)',
                }}
              />
            </div>
            <span className="font-mono text-[14px] font-medium" style={{ color: '#233c4b' }}>{pct}%</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <ScoreChip label="Done" value={complete} />
            <ScoreChip label="Total" value={total} />
            <StateBadge tone={gaps > 0 ? 'gap' : 'designed'}>{gaps} critical gaps</StateBadge>
          </div>
        </div>

        {/* Input list */}
        <div className="flex-1 overflow-y-auto px-6 py-[18px] dark-scrollbar">
          {groups.map((group) => {
            if (group.items.length === 0) return null;
            const groupComplete = group.items.filter((i) => i.status === 'complete').length;
            const groupPct = Math.round((groupComplete / group.items.length) * 100);
            return (
              <div key={group.key} className="mb-6">
                <div className="flex items-center gap-2 border-b border-[#dde6d1] pb-2 mb-3">
                  <span className="font-sans text-[15px] font-semibold" style={{ color: '#233c4b' }}>{group.label}</span>
                  <MetaBadge>{group.badge}</MetaBadge>
                </div>

                {group.items.map((input) => {
                  const tier = input.impact_tier;
                  return (
                    <button
                      key={input.id}
                      onClick={() => setSelectedInput(input)}
                      className="w-full text-left flex items-center gap-3 py-[10px] px-3 rounded-lg transition-colors cursor-pointer border-b border-[#edf2e8] last:border-0 group"
                      style={{ background: 'transparent' }}
                    >
                      {/* Status dot */}
                      <StateBadge
                        tone={
                          input.status === 'complete'
                            ? 'designed'
                            : input.status === 'gap' || input.status === 'not_started'
                              ? 'gap'
                              : 'served'
                        }
                      >
                        {statusLabels[input.status]}
                      </StateBadge>

                      {/* Label & sub-group */}
                      <div className="flex-1 min-w-0">
                        <p className="font-sans text-[13px] leading-[1.3] truncate transition-colors" style={{ color: '#233c4b' }}>
                          {input.input_label}
                        </p>
                        <p className="font-mono text-[10px] uppercase tracking-[0.08em] mt-[2px]" style={{ color: '#6e847f' }}>
                          {input.completeness}% complete
                        </p>
                      </div>

                      <ScoreChip label="Pts" value={tier === 'done' ? 0 : input.score_impact} />

                      <span className="text-[11px] transition-colors" style={{ color: '#6e847f' }}>→</span>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="px-6 py-[14px] border-t border-[#dde6d1]">
          <button
            onClick={onClose}
            className="w-full font-mono text-[12px] transition-colors cursor-pointer py-1"
            style={{ color: '#46606d' }}
          >
            ← Back to Map View
          </button>
        </div>
      </div>
    </>
  );
}
