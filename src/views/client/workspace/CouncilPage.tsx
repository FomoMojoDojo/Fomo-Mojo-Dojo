// Council (comp port 2b — P:391-397, fr tokens). Reads (useCouncil, the three CouncilPanel reads):
//   01 / Strategic pressure   council_review_runs.summary of the latest run (omitted when empty)
//   articles                  council_recommendations title / recommendation; status Chip = CouncilPanel's
//                             recBadgeLabel; the meta line = CouncilPanel's own "{category} · {confidence}%
//                             confidence" (CouncilPanel.tsx:529) — no High/Medium mapping exists there
import { useCompany } from "@/hooks/useCompany";
import { useCouncil, type CouncilRec } from "@/hooks/useCouncil";
import { Chip, type ChipTone } from "@/views/client/firstReadPreview/primitives";
import { HangingItem, withStop } from "@/views/client/firstReadPreview/primitives-editorial";
import { WorkspaceAbsent } from "./absent";
import { WorkspaceHeroPage } from "./WorkspaceHeroPage";
import { WORKSPACE_STRINGS, pageLabel, statementScale } from "./workspaceNav";

const STATUS_ORDER: Record<string, number> = { pending: 0, accepted: 1, ignored: 2 };
const EXECUTION_CATEGORIES = new Set(["execution", "execution focus", "routes"]);
function parseLegId(decisionNote: string | null | undefined): string | null {
  if (!decisionNote) return null;
  try { const p = JSON.parse(decisionNote) as Record<string, unknown>; return typeof p.leg_id === "string" ? p.leg_id : null; } catch { return null; }
}
function recBadge(rec: CouncilRec): { label: string; tone: ChipTone } {
  if (rec.status === "pending") return { label: WORKSPACE_STRINGS.councilUnresolved, tone: "warn" };
  if (rec.status === "ignored") return { label: WORKSPACE_STRINGS.councilSetAside, tone: "neutral" };
  if (EXECUTION_CATEGORIES.has(String(rec.category ?? "").trim().toLowerCase()) && parseLegId(rec.decision_note) !== null) return { label: WORKSPACE_STRINGS.councilIntegrated, tone: "good" };
  return { label: WORKSPACE_STRINGS.councilAccepted, tone: "good" };
}
const pad = (n: number) => String(n).padStart(2, "0");

export default function CouncilPage() {
  const { activeCompany } = useCompany();
  const { recs, runs, loading } = useCouncil(activeCompany?.id);
  const sorted = [...recs].sort((a, b) => (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9));
  const pressure = runs[0]?.summary?.trim() || null;
  return (
    <WorkspaceHeroPage eyebrow={pageLabel("council")} title={WORKSPACE_STRINGS.heroCouncil} accent={WORKSPACE_STRINGS.heroCouncilAccent}>
      {loading ? null : (
        <>
          {pressure ? (
            <section className="fr-ws-section" data-fr-region="pressure" data-testid="council-pressure">
              <p className="fr-ws-sectionlabel fr-mono">
                <span className="fr-ws-sectionlabel-num">{pad(1)}</span>
                <span className="fr-ws-sectionlabel-slash">/</span>
                <span>{WORKSPACE_STRINGS.strategicPressure}</span>
              </p>
              <div className="fr-ws-pressure">
                {statementScale(pressure) === "display"
                  ? <p className="fr-display fr-ws-pressure-text" data-fr-scale="display">{withStop(pressure)}</p>
                  : <p className="fr-ws-statement--lede" data-fr-scale="lede">{withStop(pressure)}</p>}
              </div>
            </section>
          ) : null}


          <div data-fr-region="recommendations">
            {sorted.length === 0 ? (
              <WorkspaceAbsent what="council" />
            ) : (
              <ol className="fr-hanging-list fr-ws-recs fr-stagger">
                {sorted.map((r) => {
                  const badge = recBadge(r);
                  return (
                    <HangingItem
                      key={r.id}
                      lead={<Chip tone={badge.tone}>{badge.label}</Chip>}
                      title={r.title}
                      muted={r.status === "ignored"}
                      meta={Number.isFinite(r.confidence) ? <>{r.category} · {r.confidence}% {WORKSPACE_STRINGS.confidence}</> : undefined}
                    >
                      <span data-fr-status={r.status} data-fr-priority={r.priority} aria-hidden="true" />
                      {r.recommendation ? <p className="fr-numbered-text fr-ws-rec-body">{r.recommendation}</p> : null}
                    </HangingItem>
                  );
                })}
              </ol>
            )}
          </div>
        </>
      )}
    </WorkspaceHeroPage>
  );
}
