import { useCompany } from "@/hooks/useCompany";
import { useStandingFindings, type Finding } from "@/hooks/useStandingFindings";
import { KIND_LABEL } from "@/components/client-view/story/OutsideHeroAct";
import { buildLedgerDateMap, resolveDateBadge } from "@/components/client-view/story/dateBadge";
import ActDefinition from "@/components/client-view/story/ActDefinition";

/*
 * Outside · Act 2 — "What else stands out" (CV-2). Read-only.
 *
 * Renders up to three real open findings, EXCLUDING the Act 1 primary
 * (find_primary_finding). Full text — no word-count cuts (the DX-1
 * compactOutsideSignal path is deliberately not consumed here).
 *
 * Order: the system's existing kind ranking (watch_out → frontier →
 * observation, per StandingFindings.tsx / the resolver's lead heuristic),
 * stable within kind on the hook's created_at ASC query order. No invented
 * ranking.
 */

// ── Client-facing copy — PENDING OPERATOR SIGNATURE (CV-2) ────────────────────
const EYEBROW = "What else stands out";
const EMPTY = "Nothing else is standing out from the outside read yet.";
// ──────────────────────────────────────────────────────────────────────────────

// ── Definitional copy — OPERATOR-SIGNED VERBATIM 2026-07-20 (DEF-1) ──────────
// Suppressed on honest-empty by ActDefinition — see that file's header.
const DEFINITION =
  "A finding is something the outside record actually shows — not an opinion, and not everything we saw. Only what stood up.";
// ─────────────────────────────────────────────────────────────────────────────

const KIND_RANK: Record<Finding["kind"], number> = { watch_out: 0, frontier: 1, observation: 2 };

// Same light formatting rule as CV-1: never adds or strengthens a claim.
function formatStatement(raw: string): string {
  const t = raw.trim();
  if (!t) return t;
  const cased = t.charAt(0).toUpperCase() + t.slice(1);
  return /[.!?…]$/.test(cased) ? cased : `${cased}.`;
}

export default function OutsideFindingsAct({ preferredRun }: { preferredRun?: unknown }) {
  const { activeCompany } = useCompany();
  const { data, isLoading } = useStandingFindings(activeCompany?.id);

  const companyDomain = data?.companyDomain ?? null;
  const ledgerDates = buildLedgerDateMap(preferredRun);
  const candidates = (data?.findings ?? [])
    .filter((f) => f.id !== data?.primaryId) // Act 1 hero excluded
    .slice() // stable sort on a copy
    .sort((a, b) => KIND_RANK[a.kind] - KIND_RANK[b.kind])
    .slice(0, 3);

  return (
    <section className="cvs-act" aria-label="Outside · Act 2 — What else stands out">
      <p className="cvs-act-eyebrow">{EYEBROW}</p>
      {/* Content-gated: no findings (or still loading) → no definition. */}
      <ActDefinition definition={DEFINITION} hasContent={!isLoading && candidates.length > 0} />

      {isLoading ? (
        <p className="cvs-hero-empty">Reading the outside signals…</p>
      ) : candidates.length === 0 ? (
        <p className="cvs-hero-empty">{EMPTY}</p>
      ) : (
        candidates.map((f, i) => {
          const statement = f.beats?.observe ?? f.body;
          const showHost = f.host && f.host !== companyDomain ? f.host : null;
          const badge = resolveDateBadge({
            sourceUrl: f.sourceUrl,
            signalRawDate: f.signalRawDate,
            signalCapturedAt: f.signalCapturedAt,
            findingCreatedAt: f.created_at,
            companyDomain,
            ledgerDates,
          });
          return (
            <div key={f.id}>
              {i > 0 ? <hr className="cvs-finding-rule" /> : null}
              <div className="cvs-finding">
                <p className="cvs-kind">{KIND_LABEL[f.kind]}</p>
                <h2 className="cvs-finding-statement">{formatStatement(statement)}</h2>
                {showHost || badge ? (
                  <p className="cvs-source">
                    {showHost ? <>Source · {showHost}</> : null}
                    {showHost && badge ? " · " : null}
                    {badge ? <span className="cvs-datebadge">{badge.label}</span> : null}
                  </p>
                ) : null}
              </div>
            </div>
          );
        })
      )}
    </section>
  );
}
