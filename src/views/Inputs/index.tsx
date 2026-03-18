import { useState } from 'react';
import TopNav from '@/components/layout/TopNav';
import type { InputItem } from '@/lib/types';
import InputCircle from './InputCircle';
import InputSidePanel from './InputSidePanel';
import ImpactBadge from '@/components/ui/ImpactBadge';
import { useInputs } from '@/hooks/useInputs';
import { useAuth } from '@/hooks/useAuth';
import { useCompany } from '@/hooks/useCompany';
import FileUploadDialog from '@/components/FileUploadDialog';
import { useSourceConfidence } from '@/hooks/useSourceConfidence';
import { MetaBadge, ScoreChip, StateBadge } from '@/components/ui/semantic-badges';
import { SourceLegend } from '@/components/provenance/SourceLegend';

const c = {
  bg: '#eae5db',
  field: '#ddd8cd',
  card: '#ffffff',
  line: '#ebe7e0',
  lineFaint: '#f0ede8',
  charcoal: '#2c2925',
  secondary: '#5c5750',
  muted: '#9a958d',
};

const cardStyle = {
  background: c.card,
  borderRadius: 12,
  boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
  border: `1px solid ${c.line}`,
} as const;

export default function InputsView() {
  const [selectedInput, setSelectedInput] = useState<InputItem | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [reseeding, setReseeding] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const { user } = useAuth();
  const { activeCompany } = useCompany();
  const { query: inputsQuery, reseed } = useInputs();
  const { signals: sourceSignals } = useSourceConfidence({
    companyId: activeCompany?.id,
    areaScoresJson: activeCompany?.area_scores_json,
    inputsOverride: inputsQuery.data ?? [],
  });
  const dbInputs = inputsQuery.data;

  const handleReseed = async () => {
    setReseeding(true);
    try { await reseed(); } finally { setReseeding(false); }
  };

  const inputs = user ? (dbInputs ?? []) : [];
  const complete = inputs.filter((i) => i.status === 'complete').length;
  const total = inputs.length;
  const gaps = inputs.filter((i) => i.status === 'gap').length;
  const pct = total > 0 ? Math.round(inputs.reduce((sum, i) => sum + i.completeness, 0) / total) : 0;

  const grouped = {
    foundation: inputs.filter((i) => i.group_key === 'foundation'),
    execution: inputs.filter((i) => i.group_key === 'execution'),
    market_evidence: inputs.filter((i) => i.group_key === 'market_evidence'),
  };

  function openPanel(input: InputItem) {
    setSelectedInput(input);
    setPanelOpen(true);
  }

  function closePanel() {
    setPanelOpen(false);
    setTimeout(() => setSelectedInput(null), 280);
  }

  const groups = [
    { key: 'foundation', label: 'Foundation', badge: 'Positioning & Strategy', items: grouped.foundation, accent: '#e8613a' },
    { key: 'execution', label: 'Execution', badge: 'Product & Marketing', items: grouped.execution, accent: '#3a9a8c' },
    { key: 'market_evidence', label: 'Market Evidence', badge: 'Sales & Customer Data', items: grouped.market_evidence, accent: '#c48a2a' },
  ];

  return (
    <div
      className="min-h-screen"
      style={{
        background: c.bg,
        backgroundImage: `url("data:image/svg+xml,%3Csvg width='6' height='6' viewBox='0 0 6 6' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='%23000' fill-opacity='0.025'%3E%3Cpath d='M5 0h1L0 5V4zM6 5v1H5z'/%3E%3C/g%3E%3C/svg%3E")`,
      }}
    >
      <TopNav />
      <div className="flex" style={{ height: 'calc(100vh - 52px)' }}>
        {/* Main area */}
        <div className="flex-1 overflow-y-auto" style={{ padding: '0 36px 48px 36px' }}>
          <div className="max-w-content mx-auto pt-6 px-4 sm:px-0">

            {/* Page header — matching map view */}
            <div className="flex items-center justify-between mb-8">
              <div>
                <h1 className="font-sans text-[20px] font-bold tracking-tight" style={{ color: c.charcoal }}>
                  Diagnostic Inputs
                </h1>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <ScoreChip label="Done" value={complete} />
                  <ScoreChip label="Total" value={total} />
                  <StateBadge tone={gaps > 0 ? 'gap' : 'designed'}>
                    {gaps} critical gaps
                  </StateBadge>
                </div>
              </div>
              <div className="flex flex-col items-end gap-2">
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <MetaBadge>
                    {activeCompany?.last_scored_at
                      ? `Updated ${new Date(activeCompany.last_scored_at).toLocaleDateString()}`
                      : "Awaiting research"}
                  </MetaBadge>
                  <SourceLegend signals={sourceSignals} />
                </div>
                {user && (
                  <button
                    onClick={handleReseed}
                    disabled={reseeding}
                    className="font-mono text-[10px] uppercase tracking-wider hover:opacity-70 transition-opacity cursor-pointer disabled:opacity-50"
                    style={{ color: c.muted }}
                  >
                    {reseeding ? 'Resetting…' : '↻ Reset'}
                  </button>
                )}
              </div>
            </div>

            {/* Recessed field */}
            <div
              className="rounded-2xl p-5 sm:p-6"
              style={{
                background: c.field,
                boxShadow: 'inset 0 2px 6px rgba(0,0,0,0.07), inset 0 0 0 1px rgba(0,0,0,0.04)',
              }}
            >

            {/* Hero completeness bar */}
            <div className="overflow-hidden mb-5" style={{ ...cardStyle, boxShadow: '0 2px 8px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)' }}>
              <div className="p-5 px-6 flex items-center gap-5">
                <span className="font-mono text-[10px] uppercase tracking-[0.12em] whitespace-nowrap" style={{ color: c.muted }}>
                  OVERALL COMPLETENESS
                </span>
                <div className="flex-1 h-3 rounded-full relative overflow-hidden" style={{ background: '#e8e3da' }}>
                  <div
                    className="absolute left-0 top-0 h-3 rounded-full transition-all duration-[800ms]"
                    style={{
                      width: `${pct}%`,
                      background: 'linear-gradient(to right, hsl(108, 42%, 38%), hsl(108, 50%, 45%))',
                      boxShadow: '0 1px 4px rgba(76, 135, 76, 0.3)',
                    }}
                  />
                </div>
                <span
                  className="font-sans leading-none tracking-tighter"
                  style={{ fontSize: 36, fontWeight: 900, color: 'hsl(108, 42%, 38%)' }}
                >
                  {pct}%
                </span>
                <div className="border-l pl-5 ml-1" style={{ borderColor: c.lineFaint }}>
                  <span className="font-sans text-[13px] font-bold block" style={{ color: c.charcoal }}>
                    {complete} of {total} complete
                  </span>
                  <div className="mt-2">
                    <StateBadge tone={gaps > 0 ? 'gap' : 'designed'}>
                      {gaps} critical gaps
                    </StateBadge>
                  </div>
                </div>
              </div>
            </div>

            {/* Legend row */}
            <div className="flex items-center justify-between mb-5 px-1">
              <div className="flex items-center gap-[18px]">
                {[
                  { label: 'Complete', color: 'hsl(108, 42%, 40%)' },
                  { label: 'In Progress', color: 'hsl(26, 65%, 50%)' },
                  { label: 'Missing', color: 'hsl(7, 72%, 48%)' },
                  { label: 'Not started', color: '#b5b0a8' },
                ].map((item) => (
                  <div key={item.label} className="flex items-center gap-2">
                    <div className="w-[10px] h-[10px] rounded-full" style={{ background: item.color, boxShadow: `0 1px 3px ${item.color}40` }} />
                    <span className="font-mono text-[10px] font-medium" style={{ color: c.muted }}>{item.label}</span>
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-[9px] uppercase tracking-[0.1em]" style={{ color: c.muted }}>
                  SCORE IMPACT:
                </span>
                <ImpactBadge pts={3.5} />
                <ImpactBadge pts={1.5} />
                <ImpactBadge pts={0.5} />
              </div>
            </div>

            {/* Input groups — each in its own white card */}
            {inputs.length === 0 ? (
              <div
                className="rounded-xl border px-6 py-12 text-center"
                style={{ ...cardStyle }}
              >
                <p className="font-sans text-[15px]" style={{ color: c.secondary }}>
                  {user
                    ? 'No diagnostic inputs yet. Run AI Research in Admin → Companies or add input data first.'
                    : 'Sign in to view company inputs.'}
                </p>
              </div>
            ) : groups.map((group) => {
              const groupPct = group.items.length > 0
                ? Math.round(group.items.reduce((sum, i) => sum + i.completeness, 0) / group.items.length)
                : 0;
              return (
                <div
                  key={group.key}
                  className="mb-5 overflow-hidden"
                  style={{ ...cardStyle, boxShadow: '0 2px 8px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)' }}
                >
                  {/* Group header */}
                  <div className="px-5 pt-4 pb-3 flex items-center gap-3">
                    <div className="w-1 h-6 rounded-full" style={{ background: group.accent }} />
                    <span className="font-sans text-[14px] font-bold tracking-tight" style={{ color: c.charcoal }}>
                      {group.label}
                    </span>
                    <MetaBadge>{group.badge}</MetaBadge>
                    <div className="ml-auto flex items-center gap-2">
                      <div className="w-14 h-[4px] rounded-full overflow-hidden" style={{ background: c.lineFaint }}>
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${groupPct}%`,
                            background: group.accent,
                          }}
                        />
                      </div>
                      <ScoreChip label="Avg" value={groupPct} />
                    </div>
                  </div>
                  <div className="mx-5 h-px" style={{ background: c.lineFaint }} />
                  {/* Circles */}
                  <div className="flex flex-wrap gap-6 p-6 pt-5">
                    {group.items.map((input) => (
                      <InputCircle
                        key={input.id}
                        input={input}
                        onClick={() => openPanel(input)}
                        isSelected={selectedInput?.id === input.id}
                      />
                    ))}
                  </div>
                </div>
              );
            })}

            {/* Upload zone */}
            <div
              className="border-[2px] border-dashed rounded-xl p-7 text-center cursor-pointer hover:border-ink transition-colors"
              style={{ borderColor: '#ccc7bc', background: 'rgba(255,255,255,0.35)' }}
              onClick={() => setUploadOpen(true)}
            >
              <div className="text-[34px] mb-2">📁</div>
              <p className="font-sans text-[14px] font-medium" style={{ color: c.secondary }}>
                Upload a file with area assignment and tags
              </p>
              <p className="font-mono text-[11px] mt-1" style={{ color: c.muted }}>
                PDF · DOCX · XLSX · MP4 · Max 50MB
              </p>
              <button
                className="mt-4 px-5 py-[9px] rounded-[16px] font-mono text-[11px] uppercase cursor-pointer transition-colors border"
                style={{
                  background: '#233c4b',
                  color: '#faf7f6',
                  borderColor: '#233c4b',
                  boxShadow: '0 10px 30px rgba(35,60,75,0.14)',
                }}
              >
                Choose File
              </button>
            </div>

            </div>{/* close recessed field */}
          </div>
        </div>

        {/* Side panel */}
        <div
          className="overflow-hidden transition-all duration-[250ms] shrink-0"
          style={{ width: panelOpen ? 380 : 0, background: '#4a4a4a' }}
        >
          {selectedInput && (
            <InputSidePanel
              input={selectedInput}
              mojoScore={activeCompany?.mojo_score ?? 0}
              potentialScore={activeCompany?.potential_score ?? 0}
              onClose={closePanel}
            />
          )}
        </div>
      </div>

      <FileUploadDialog
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        companyId={activeCompany?.id}
        companyName={activeCompany?.name}
      />
    </div>
  );
}
