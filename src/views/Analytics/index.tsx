import PageShell from '@/components/layout/PageShell';
import { useCompany } from '@/hooks/useCompany';
import { useInputs } from '@/hooks/useInputs';
import { useOpportunities } from '@/hooks/useOpportunities';
import GenericAuditTraceNote from '@/components/diagnostics/GenericAuditTraceNote';
import { isGenericAuditCompany } from '@/lib/genericAudit';

const c = {
  charcoal: '#233c4b',
  secondary: '#46606d',
  muted: '#6e847f',
  line: '#dde6d1',
  lineFaint: '#edf2e8',
};

export default function AnalyticsView() {
  const { activeCompany } = useCompany();
  const auditMode = isGenericAuditCompany(activeCompany);
  const { query: inputsQuery } = useInputs();
  const { items: opps } = useOpportunities(activeCompany?.id);

  const inputs = inputsQuery.data ?? [];

  const mojo = activeCompany?.mojo_score ?? 0;
  const potential = activeCompany?.potential_score ?? 0;
  const projected = activeCompany?.projected_score ?? 0;
  const delta = Math.max(0, Math.round(Number(potential) - Number(mojo)));
  const last = activeCompany?.last_scored_at
    ? new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(activeCompany.last_scored_at))
    : null;

  const scoreParts: string[] = [
    `Mojo ${mojo}`,
    `Reachable ${potential}`,
    `Unlockable ${projected}`,
    delta > 0 ? `+${delta} delta` : null,
    `${inputs.length} inputs`,
    `${opps.length} opportunities`,
    last ? `Updated ${last}` : null,
  ].filter(Boolean) as string[];

  return (
    <PageShell bare>
      <div className="max-w-content mx-auto pt-6 px-4 sm:px-6 md:px-9 pb-12">
        <div className="mb-4">
          <p className="font-mono text-[10px] uppercase tracking-[0.14em]" style={{ color: '#9298B5' }}>
            Score snapshot — current persisted values
          </p>
          <h1 className="mt-1 font-sans text-[30px] font-semibold leading-[1.2] tracking-tight" style={{ color: c.charcoal }}>
            Analytics
          </h1>
          {activeCompany?.name && (
            <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.08em]" style={{ color: c.muted }}>
              {activeCompany.name}
            </p>
          )}
        </div>

        <GenericAuditTraceNote
          active={auditMode}
          className="mb-6 max-w-4xl"
          source="company stored scores plus current counts from inputs and opportunities."
          evaluation="Snapshot surfaces the current persisted state without extra synthesis."
          scoring="Mojo/Reachable/Unlockable are read directly from company score fields."
          why="This makes the analytics panel explicit about what is computed versus simply displayed."
        />

        {!activeCompany?.id ? (
          <p className="font-sans text-[13px]" style={{ color: c.secondary }}>
            Select a company to view score data.
          </p>
        ) : (
          <div
            style={{
              borderTop: `1px solid ${c.line}`,
              borderBottom: `1px solid ${c.line}`,
              padding: '14px 0',
            }}
          >
            <p
              style={{
                fontFamily: 'monospace',
                fontSize: 11,
                color: c.secondary,
                letterSpacing: '0.05em',
                lineHeight: 1,
                margin: 0,
              }}
            >
              {scoreParts.join(' · ')}
            </p>
          </div>
        )}
      </div>
    </PageShell>
  );
}
