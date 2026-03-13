import PageShell from '@/components/layout/PageShell';
import { useCompany } from '@/hooks/useCompany';
import { useInputs } from '@/hooks/useInputs';
import { useOpportunities } from '@/hooks/useOpportunities';

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-cream-mid border border-cream-dark rounded-xl p-5">
      <p className="font-mono text-[10px] text-t-muted uppercase tracking-wider">{label}</p>
      <p className="font-serif text-[22px] text-t-primary mt-2">{value}</p>
    </div>
  );
}

export default function AnalyticsView() {
  const { activeCompany } = useCompany();
  const { query: inputsQuery } = useInputs();
  const { items: opps } = useOpportunities(activeCompany?.id);

  const inputs = inputsQuery.data ?? [];

  const mojo = activeCompany?.mojo_score ?? 0;
  const potential = activeCompany?.potential_score ?? 0;
  const projected = activeCompany?.projected_score ?? 0;
  const last = activeCompany?.last_scored_at ? new Date(activeCompany.last_scored_at).toLocaleString() : '—';

  return (
    <PageShell bare>
      <div className="max-w-content mx-auto pt-6 px-4 sm:px-6 md:px-9 pb-12">
        <h1 className="font-serif text-[22px] font-medium text-t-primary mb-1">Analytics</h1>
        <p className="font-sans text-[13px] text-t-secondary mb-6">
          Current snapshot. History comes next.
        </p>

        {!activeCompany?.id ? (
          <div className="bg-cream-mid border border-cream-dark rounded-xl p-5">
            <p className="font-sans text-[13px] text-t-secondary">Select a company first.</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Stat label="Mojo Score" value={mojo} />
              <Stat label="Potential" value={potential} />
              <Stat label="Projected" value={projected} />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
              <Stat label="Inputs" value={inputs.length} />
              <Stat label="Opportunities" value={opps.length} />
              <Stat label="Last Scored At" value={last} />
            </div>
          </>
        )}
      </div>
    </PageShell>
  );
}
