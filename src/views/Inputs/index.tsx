import { useState } from 'react';
import { Link } from 'react-router-dom';
import TopNav from '@/components/layout/TopNav';
import type { InputItem } from '@/lib/types';
import InputCircle from './InputCircle';
import InputSidePanel from './InputSidePanel';
import { useInputs } from '@/hooks/useInputs';
import { useAuth } from '@/hooks/useAuth';
import { useCompany } from '@/hooks/useCompany';
import FileUploadDialog from '@/components/FileUploadDialog';
import { useSourceConfidence } from '@/hooks/useSourceConfidence';
import PageContextStatus from '@/components/layout/PageContextStatus';
import GenericAuditTraceNote from '@/components/diagnostics/GenericAuditTraceNote';
import { isGenericAuditCompany } from '@/lib/genericAudit';

const c = {
  bg: '#faf7f6',
  line: '#dde6d1',
  lineFaint: '#edf2e8',
  charcoal: '#233c4b',
  secondary: '#46606d',
  muted: '#6e847f',
  coral: '#FF7D2D',
  teal: '#5F9B8C',
};

const MONO = '"JetBrains Mono", ui-monospace, monospace';

export default function InputsView() {
  const [selectedInput, setSelectedInput] = useState<InputItem | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const { user } = useAuth();
  const { activeCompany } = useCompany();
  const auditMode = isGenericAuditCompany(activeCompany);
  const { query: inputsQuery } = useInputs();
  const { signals: sourceSignals } = useSourceConfidence({
    companyId: activeCompany?.id,
    areaScoresJson: activeCompany?.area_scores_json,
    inputsOverride: inputsQuery.data ?? [],
  });
  const dbInputs = inputsQuery.data;

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
    { key: 'foundation',      label: 'Foundation',       note: 'Positioning and strategy cascade',        items: grouped.foundation },
    { key: 'execution',       label: 'Execution',        note: 'GTM and messaging',                       items: grouped.execution },
    { key: 'market_evidence', label: 'Market Evidence',  note: 'Research and validation',                 items: grouped.market_evidence },
  ];

  return (
    <div className="min-h-screen strategic-surface" style={{
      background: c.bg,
      backgroundImage: 'url("data:image/svg+xml,%3Csvg width=\'6\' height=\'6\' viewBox=\'0 0 6 6\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cg fill=\'%23000\' fill-opacity=\'0.025\'%3E%3Cpath d=\'M5 0h1L0 5V4zM6 5v1H5z\'/%3E%3C/g%3E%3C/svg%3E")',
    }}>
      <TopNav />
      <div className="flex" style={{ height: 'calc(100vh - 52px)' }}>

        {/* Main field */}
        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-[1440px] px-4 pb-12 pt-4 sm:px-6 md:px-8">
            <PageContextStatus lastScoredAt={activeCompany?.last_scored_at} sourceSignals={sourceSignals} />

            <div className="mb-2">
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
                <p className="font-mono text-[10px] uppercase tracking-[0.12em]" style={{ color: '#9298B5' }}>
                  Evidence · {activeCompany?.name || 'No company selected'} · Evidence basis
                </p>
                <Link
                  to="/routes"
                  className="font-mono text-[10px] uppercase tracking-[0.1em]"
                  style={{ color: '#6a9e94', textDecoration: 'underline', opacity: 0.7 }}
                >
                  ← Commitment Review
                </Link>
              </div>
              <GenericAuditTraceNote
                active={auditMode}
                className="mt-3 max-w-4xl"
                source="inputs, input_subitems, input_files tags, and company source-confidence signals."
                evaluation="AI and rule-based normalization map each input to an area, infer confidence, and rewrite weak legacy phrasing."
                scoring="Completeness, impact tier, and score impact are recalculated from status, evidence, and file coverage."
                why="This shows why each input card is scored and labeled the way it is, so generic defaults can be tuned."
              />
            </div>

            {/* Evidence state — field typography, no box */}
            {total > 0 && (
              <section style={{ paddingBottom: 24, marginBottom: 8, borderBottom: `1px solid ${c.line}` }}>
                <p style={{ fontFamily: MONO, fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.14em', color: c.muted }}>
                  Evidence basis
                </p>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 20, marginTop: 10, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 44, fontWeight: 300, color: c.charcoal, letterSpacing: '-0.04em', lineHeight: 1 }}>
                    {pct}<span style={{ fontSize: 18, letterSpacing: 0, fontWeight: 400 }}>%</span>
                  </span>
                  <span className="font-sans text-[14px]" style={{ color: c.secondary }}>
                    {complete} of {total} inputs confirmed
                  </span>
                  {gaps > 0 && (
                    <span style={{ fontFamily: MONO, fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.1em', color: c.coral }}>
                      {gaps} structural {gaps === 1 ? 'gap' : 'gaps'}
                    </span>
                  )}
                </div>
                <div style={{ marginTop: 12, height: 2, background: c.lineFaint, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${pct}%`, background: 'linear-gradient(to right, #5f9b8c, #233c4b)', transition: 'width 0.8s' }} />
                </div>
              </section>
            )}

            {/* Evidence groups — field regions, no card boxes */}
            {inputs.length === 0 ? (
              <p className="font-sans text-[14px] py-8" style={{ color: c.secondary }}>
                {user
                  ? 'No diagnostic inputs yet. Run AI Research in Admin → Companies or add input data first.'
                  : 'Sign in to view company inputs.'}
              </p>
            ) : (
              <>
                {groups.map((group, groupIndex) => (
                  <section key={group.key} style={{ paddingTop: groupIndex === 0 ? 14 : 24, paddingBottom: 8, borderBottom: `1px solid ${c.lineFaint}` }}>
                    <div style={{ marginBottom: 16 }}>
                      <span style={{ fontFamily: MONO, fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.14em', color: c.charcoal }}>
                        {group.label}
                      </span>
                      <span style={{ marginLeft: 12, fontFamily: MONO, fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.08em', color: c.muted, opacity: 0.6 }}>
                        {group.note}
                      </span>
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24, paddingBottom: 16 }}>
                      {group.items.map((input) => (
                        <InputCircle
                          key={input.id}
                          input={input}
                          onClick={() => openPanel(input)}
                          isSelected={selectedInput?.id === input.id}
                        />
                      ))}
                      {group.items.length === 0 && (
                        <p style={{ fontFamily: MONO, fontSize: 10, color: c.muted, opacity: 0.6 }}>No inputs in this group.</p>
                      )}
                    </div>
                  </section>
                ))}

                {/* Upload — quiet inline trigger */}
                <div style={{ paddingTop: 20, paddingBottom: 8 }}>
                  <button
                    type="button"
                    onClick={() => setUploadOpen(true)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                  >
                    <span style={{ fontFamily: MONO, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em', color: c.teal, textDecoration: 'underline' }}>
                      Add evidence file →
                    </span>
                  </button>
                  <span style={{ marginLeft: 12, fontFamily: MONO, fontSize: 9, color: c.muted, opacity: 0.6 }}>
                    PDF · DOCX · XLSX · MP4 · Max 50MB
                  </span>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Side panel */}
        <div
          className="overflow-hidden transition-all duration-[250ms] shrink-0"
          style={{ width: panelOpen ? 380 : 0, background: '#faf7f6' }}
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
