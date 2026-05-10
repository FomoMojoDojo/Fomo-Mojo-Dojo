import { useMemo, useState } from "react";
import { selectConfidenceLandscapeHighlight, type ConfidenceLandscapeDomain } from "@/lib/refinePreviewConfidenceLandscape";
import { filterConfidenceDomainsForPhase, rankConfidenceDomainsForPhase } from "@/lib/refinePreviewPhaseOrchestration";

export default function RefinePreviewConfidenceLandscapeSection({
  domains,
  loading,
  primaryKeys,
  summaryLine,
  phase,
}: {
  domains: ConfidenceLandscapeDomain[];
  loading?: boolean;
  primaryKeys?: ConfidenceLandscapeDomain["key"][];
  summaryLine?: string;
  phase?: string;
}) {
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  const filteredDomains = useMemo(
    () => filterConfidenceDomainsForPhase(domains, phase || "diagnose", primaryKeys),
    [domains, phase, primaryKeys],
  );
  const ordered = useMemo(
    () => rankConfidenceDomainsForPhase(filteredDomains, phase || "diagnose", primaryKeys),
    [filteredDomains, phase, primaryKeys],
  );

  const primaryDomains = useMemo(() => {
    if (!primaryKeys || primaryKeys.length === 0) return ordered.slice(0, 2);
    const index = new Map(ordered.map((domain) => [domain.key, domain]));
    return primaryKeys.map((key) => index.get(key)).filter((domain): domain is ConfidenceLandscapeDomain => Boolean(domain));
  }, [ordered, primaryKeys]);
  const secondaryDomains = useMemo(
    () => ordered.filter((domain) => !primaryDomains.some((primary) => primary.key === domain.key)),
    [ordered, primaryDomains],
  );
  const strongestDomain = useMemo(
    () => selectConfidenceLandscapeHighlight(ordered),
    [ordered],
  );

  if (!loading && ordered.length === 0) {
    return null;
  }

  return (
    <section className="crpv-confidence-section" aria-label="Confidence landscape">
      <div className="crpv-confidence-header">
        <p className="cap">Confidence landscape</p>
        <p className="crpv-confidence-copy">{summaryLine || "Where confidence is strongest and where it still needs proof."}</p>
        {strongestDomain ? (
          <p className="crpv-confidence-note">Strongest right now: {strongestDomain.title}.</p>
        ) : null}
      </div>

      {loading ? (
        <div className="crpv-confidence-empty">Reading where confidence is holding and where it still needs proof…</div>
      ) : (
        <div className="crpv-confidence-list">
          {primaryDomains.map((domain) => {
            const expanded = expandedKey === domain.key;
            return (
              <article key={domain.key} className="crpv-confidence-card is-primary">
                <div className="crpv-confidence-row">
                  <div className="crpv-confidence-topline">
                    <h3>{domain.title}</h3>
                    <span>{domain.state}</span>
                  </div>
                  <p className="crpv-confidence-narrative">{domain.narrative}</p>
                </div>
                <div className="crpv-confidence-actions">
                  <button
                    type="button"
                    className="btn ghost"
                    onClick={() => setExpandedKey((current) => (current === domain.key ? null : domain.key))}
                  >
                    {expanded ? "Hide detail" : "See why"}
                  </button>
                </div>
                {expanded ? (
                  <div className="crpv-confidence-detail">
                    <div>
                      <p className="cap">Confidence builds with</p>
                      <p>{domain.whatIncreasesConfidence}</p>
                    </div>
                    <div>
                      <p className="cap">Still limited by</p>
                      <p>{domain.whatStillWeakensConfidence}</p>
                    </div>
                  </div>
                ) : null}
              </article>
            );
          })}
          {secondaryDomains.length > 0 ? (
            <div className="crpv-confidence-more">
              <button
                type="button"
                className="btn ghost"
                onClick={() => setShowAll((current) => !current)}
              >
                {showAll ? "Show less" : `Show full landscape (${secondaryDomains.length})`}
              </button>
            </div>
          ) : null}
          {showAll ? (
            <div className="crpv-confidence-secondary">
              {secondaryDomains.map((domain) => {
                const expanded = expandedKey === domain.key;
                return (
                  <article key={domain.key} className="crpv-confidence-card">
                    <div className="crpv-confidence-row">
                      <div className="crpv-confidence-topline">
                        <h3>{domain.title}</h3>
                        <span>{domain.state}</span>
                      </div>
                      <p className="crpv-confidence-narrative">{domain.narrative}</p>
                    </div>
                    <div className="crpv-confidence-actions">
                      <button
                        type="button"
                        className="btn ghost"
                        onClick={() => setExpandedKey((current) => (current === domain.key ? null : domain.key))}
                      >
                        {expanded ? "Hide detail" : "See why"}
                      </button>
                    </div>
                    {expanded ? (
                      <div className="crpv-confidence-detail">
                        <div>
                          <p className="cap">Confidence builds with</p>
                          <p>{domain.whatIncreasesConfidence}</p>
                        </div>
                        <div>
                          <p className="cap">Still limited by</p>
                          <p>{domain.whatStillWeakensConfidence}</p>
                        </div>
                      </div>
                    ) : null}
                  </article>
                );
              })}
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}
