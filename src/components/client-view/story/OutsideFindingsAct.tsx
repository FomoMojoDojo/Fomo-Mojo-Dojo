import { useCompany } from "@/hooks/useCompany";
import { admitForSurface } from "@/lib/registerGuard";
import { useStandingFindings, type Finding } from "@/hooks/useStandingFindings";
import { useReadState } from "@/hooks/useAsyncRead";
import { ActData } from "@/components/client-view/story/ActData";
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

// The "what else stands out" selection, extracted as the single source so the
// Gate 5 export leave-behind orders and caps its Mirror findings IDENTICALLY.
// Register guard (outside) → exclude the Act 1 primary → kind rank → top three.
export function orderOtherFindings(findings: Finding[], primaryId: string | null): Finding[] {
  return findings
    .filter((f) => admitForSurface(f, "outside"))
    .filter((f) => f.id !== primaryId)
    .slice() // stable sort on a copy
    .sort((a, b) => KIND_RANK[a.kind] - KIND_RANK[b.kind])
    .slice(0, 3);
}

// Same light formatting rule as CV-1: never adds or strengthens a claim.
function formatStatement(raw: string): string {
  const t = raw.trim();
  if (!t) return t;
  const cased = t.charAt(0).toUpperCase() + t.slice(1);
  return /[.!?…]$/.test(cased) ? cased : `${cased}.`;
}

export default function OutsideFindingsAct({ preferredRun }: { preferredRun?: unknown }) {
  const { activeCompany } = useCompany();
  // GATE C-2 — useStandingFindings now exposes `error` (react-query's, previously discarded);
  // useReadState adds the 10s deadline. A failed / never-returning read renders the signed
  // error via <ActData> instead of "Nothing else is standing out from the outside read yet."
  // (reachable ONLY on a successful zero-finding read — byte-identical to before).
  const { data, isLoading, error } = useStandingFindings(activeCompany?.id);
  const findingsState = useReadState<typeof data>(isLoading, error, data, activeCompany?.id);
  const ledgerDates = buildLedgerDateMap(preferredRun);

  return (
    <section className="cvs-act" aria-label="Outside · Act 2 — What else stands out">
      <p className="cvs-act-eyebrow">{EYEBROW}</p>
      <ActData state={findingsState} loading={<p className="cvs-hero-empty">Reading the outside signals…</p>}>
        {(data) => {
          const companyDomain = data?.companyDomain ?? null;
          // RG-2: register guard, primary exclusion, kind rank and top-three cap all live
          // in orderOtherFindings — the same selection the Gate 5 export reuses.
          const candidates = orderOtherFindings(data?.findings ?? [], data?.primaryId ?? null);
          return (
            <>
              {/* Content-gated: no findings → no definition. */}
              <ActDefinition definition={DEFINITION} hasContent={candidates.length > 0} />
              {candidates.length === 0 ? (
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
            </>
          );
        }}
      </ActData>
    </section>
  );
}
