import PageShell from '@/components/layout/PageShell';
import { useCompany } from '@/hooks/useCompany';
import { useRoutes } from '@/hooks/useRoutes';

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full border border-cream-dark bg-cream px-2 py-1 font-mono text-[10px] text-t-muted">
      {children}
    </span>
  );
}

export default function RoutesView() {
  const { activeCompany } = useCompany();
  const { loading, items, error } = useRoutes(activeCompany?.id);

  const hasCompany = !!activeCompany?.id;

  const fix = items.filter((r) => (r.category ?? '').toLowerCase() === 'fix');
  const improve = items.filter((r) => (r.category ?? '').toLowerCase() === 'improve');
  const create = items.filter((r) => (r.category ?? '').toLowerCase() === 'create');

  return (
    <PageShell bare>
      <div className="max-w-content mx-auto pt-6 px-4 sm:px-6 md:px-9 pb-12">
        <h1 className="font-serif text-[22px] font-medium text-t-primary mb-1">Routes</h1>
        <p className="font-sans text-[13px] text-t-secondary mb-6">
          Prioritized strategic routes organized by Fix, Improve, and Create.
        </p>

        {!hasCompany ? (
          <div className="bg-cream-mid border border-cream-dark rounded-xl p-5">
            <p className="font-sans text-[13px] text-t-secondary">No active company selected.</p>
          </div>
        ) : loading ? (
          <div className="bg-cream-mid border border-cream-dark rounded-xl p-5">
            <p className="font-mono text-[12px] text-t-muted">Loading…</p>
          </div>
        ) : error ? (
          <div className="bg-cream-mid border border-cream-dark rounded-xl p-5">
            <p className="font-mono text-[12px] text-red-600">Failed to load: {error}</p>
          </div>
        ) : items.length === 0 ? (
          <div className="bg-cream-mid border border-cream-dark rounded-xl p-5">
            <p className="font-serif text-[16px] text-t-secondary">
              No routes yet for {activeCompany?.name}.
            </p>
            <p className="font-sans text-[13px] text-t-tertiary mt-2">
              Run <span className="font-semibold">AI Research</span> to generate strategic data.
            </p>
          </div>
        ) : (
          <div className="space-y-8">
            {[
              { label: 'Fix', desc: 'Address critical gaps', list: fix },
              { label: 'Improve', desc: 'Strengthen existing capabilities', list: improve },
              { label: 'Create', desc: 'Build new strategic assets', list: create },
            ].map((g) =>
              g.list.length ? (
                <div key={g.label} className="space-y-3">
                  <div className="flex items-baseline gap-2">
                    <p className="font-mono text-[12px] text-t-muted uppercase tracking-wider font-bold">
                      {g.label}
                    </p>
                    <p className="font-sans text-[11px] text-t-tertiary">{g.desc}</p>
                    <div className="ml-auto">
                      <Pill>{g.list.length} items</Pill>
                    </div>
                  </div>

                  <div className="space-y-3">
                    {g.list.slice(0, 60).map((r) => (
                      <div key={r.id} className="bg-cream-mid border border-cream-dark rounded-xl p-5">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-sans text-[14px] font-medium text-t-primary">
                              {r.title || 'Untitled route'}
                            </p>
                            {r.description && (
                              <p className="font-sans text-[12px] text-t-secondary mt-1 leading-[1.6]">
                                {r.description}
                              </p>
                            )}
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            {typeof r.pts_value === 'number' && <Pill>{r.pts_value.toFixed(1)} pts</Pill>}
                            {r.effort && <Pill>{String(r.effort)}</Pill>}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null
            )}
          </div>
        )}
      </div>
    </PageShell>
  );
}