import { useCompany } from "@/hooks/useCompany";
import { admitForSurface } from "@/lib/registerGuard";
import { useMojoScore } from "@/hooks/useMojoScore";
import { useStandingFindings, type Finding } from "@/hooks/useStandingFindings";
import { buildLedgerDateMap, resolveDateBadge } from "@/components/client-view/story/dateBadge";

/*
 * Outside · Act 1 — Hero + Mojo Score card (CV-1). Read-only: renders the
 * company's primary standing finding (find_primary_finding via
 * useStandingFindings) and its latest Mojo Score (useMojoScore). No DB writes,
 * no generator calls, no fabricated copy — empty states are honest.
 *
 * Company scoping = the same active-company mechanism the other client-view
 * hooks use (useCompany().activeCompany.id). Never hardwired to a fixture.
 */

// ── Client-facing copy — SIGNED AS-IS at CV-1 acceptance (2026-07-14) ──────────
// Kind labels: keep an observation from wearing frontier-level confidence.
// Exported: CV-2 Act 2 reuses the same signed vocabulary.
export const KIND_LABEL: Record<Finding["kind"], string> = {
  frontier: "Your bet",
  observation: "What we noticed",
  watch_out: "A watch-out",
};
// Score caveats: MUST be score-agnostic (true at any value).
const SCORE_CAVEAT_1 = "This is an early likelihood read, not a settled answer.";
const SCORE_CAVEAT_2 = "It moves only on evidence — every lens added moves it honestly.";
// Empty states.
// Exported: Gate 5 export leave-behind reuses the same signed honest-empty line
// for The Mirror's bet slot (single source — no parallel literal in exportHtml).
export const HERO_EMPTY = "The outside read hasn't surfaced a lead finding for this company yet.";
const SCORE_EMPTY = "No score has been computed yet.";
const SCORE_EMPTY_SUB = "It appears once the first analysis runs.";
// ──────────────────────────────────────────────────────────────────────────────

// Light formatting only: capitalize the first letter and ensure terminal
// punctuation. Never adds, strengthens, or reshapes the claim.
function formatStatement(raw: string): string {
  const t = raw.trim();
  if (!t) return t;
  const cased = t.charAt(0).toUpperCase() + t.slice(1);
  return /[.!?…]$/.test(cased) ? cased : `${cased}.`;
}

export default function OutsideHeroAct({ preferredRun }: { preferredRun?: unknown }) {
  const { activeCompany } = useCompany();
  const companyId = activeCompany?.id;

  const { score, loading: scoreLoading } = useMojoScore(companyId);
  const { data, isLoading: findingsLoading } = useStandingFindings(companyId);

  // find_primary_finding() is the sole selector (operator ruling). No kind filter.
  // RG-2: the hero finding renders only if the register guard admits it on the
  // client Outside surface. A primary whose register is NULL or internal is
  // blocked → null → the hero falls back to its empty state, never internal text.
  const primary = data?.primaryId
    ? (() => {
        const p = data.findings.find((f) => f.id === data.primaryId) ?? null;
        return p && admitForSurface(p, "outside") ? p : null;
      })()
    : null;
  const companyDomain = data?.companyDomain ?? null;

  const statement = primary ? primary.beats?.observe ?? primary.body : null;
  // Show a source host only when it's a genuine third-party source — suppress the
  // company's own domain (synthesis reads are stamped with the company website).
  const showHost = primary?.host && primary.host !== companyDomain ? primary.host : null;

  // CV-2c date badge: source date where real (third-party only), else capture time.
  const badge = primary
    ? resolveDateBadge({
        sourceUrl: primary.sourceUrl,
        signalRawDate: primary.signalRawDate,
        signalCapturedAt: primary.signalCapturedAt,
        findingCreatedAt: primary.created_at,
        companyDomain,
        ledgerDates: buildLedgerDateMap(preferredRun),
      })
    : null;

  const scoreValue = score ? Math.round(score.total_score) : null;

  return (
    <section className="cvs-act" aria-label="Outside · Act 1 — Hero and Mojo Score">
      <p className="cvs-act-eyebrow">Outside View · Before you told us anything</p>

      <div className="cvs-hero">
        <div className="cvs-hero-copy">
          {findingsLoading ? (
            <p className="cvs-hero-empty">Reading the outside signals…</p>
          ) : primary && statement ? (
            <>
              <p className="cvs-kind">{KIND_LABEL[primary.kind]}</p>
              <h1 className="cvs-statement">{formatStatement(statement)}</h1>
              {showHost || badge ? (
                <p className="cvs-source">
                  {showHost ? <>Source · {showHost}</> : null}
                  {showHost && badge ? " · " : null}
                  {badge ? <span className="cvs-datebadge">{badge.label}</span> : null}
                </p>
              ) : null}
            </>
          ) : (
            <p className="cvs-hero-empty">{HERO_EMPTY}</p>
          )}
        </div>

        <aside className="cvs-score-card" aria-label="Mojo Score">
          <p className="cvs-score-label">Mojo Score</p>

          {scoreLoading ? (
            <p className="cvs-score-empty">Loading…</p>
          ) : scoreValue != null ? (
            <>
              {/* No status word: the score row carries no honest confidence field,
                  so none is invented (operator ruling / display honesty). */}
              <div className="cvs-score-row">
                <span className="cvs-score-num">{scoreValue}</span>
              </div>
              <p className="cvs-score-cap">/ 100</p>

              <div className="cvs-score-sentences">
                <p className="cvs-score-line">{SCORE_CAVEAT_1}</p>
                <p className="cvs-score-line is-muted">{SCORE_CAVEAT_2}</p>
              </div>

              <div className="cvs-score-divider" />
              <div className="cvs-score-current">
                <span className="cvs-score-current-label">Current</span>
                <span className="cvs-score-current-val">{scoreValue}</span>
              </div>
            </>
          ) : (
            <div className="cvs-score-empty">
              <p style={{ margin: 0 }}>{SCORE_EMPTY}</p>
              <p className="cvs-score-empty-sub">{SCORE_EMPTY_SUB}</p>
            </div>
          )}
        </aside>
      </div>
    </section>
  );
}
