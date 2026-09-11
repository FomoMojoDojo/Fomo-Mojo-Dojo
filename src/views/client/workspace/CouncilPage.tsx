// Council (Hero frame): council_recommendations / council_review_runs / strategic_decisions via
// useCouncil (lifted from CouncilPanel). Recommendations as a hanging list, pending first, each
// wearing CouncilPanel's badge word. Body: brief 2.
import { useCompany } from "@/hooks/useCompany";
import { useCouncil, type CouncilRec } from "@/hooks/useCouncil";
import { Chip, type ChipTone } from "@/views/client/firstReadPreview/primitives";
import { HangingItem } from "@/views/client/firstReadPreview/primitives-editorial";
import { WorkspaceAbsent } from "./absent";
import { WorkspaceHeroPage } from "./WorkspaceHeroPage";
import { WORKSPACE_STRINGS, pageLabel } from "./workspaceNav";

const STATUS_ORDER: Record<string, number> = { pending: 0, accepted: 1, ignored: 2 };

// The recommendation badge — CouncilPanel's recBadgeLabel, byte-exact (existing strings: Unresolved /
// Set aside / Integrated / Accepted), with the same execution-category + leg-id test for "Integrated".
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

export default function CouncilPage() {
  const { activeCompany } = useCompany();
  const { recs, loading } = useCouncil(activeCompany?.id);
  const sorted = [...recs].sort((a, b) => (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9));
  return (
    <WorkspaceHeroPage eyebrow={pageLabel("council")} title={WORKSPACE_STRINGS.heroCouncil} accent={WORKSPACE_STRINGS.heroCouncilAccent}>
      {loading ? null : sorted.length === 0 ? (
        <WorkspaceAbsent what="council" />
      ) : (
        <ol className="fr-hanging-list fr-stagger">
          {sorted.map((r) => {
            const badge = recBadge(r);
            return (
              <HangingItem key={r.id} lead={<Chip tone={badge.tone}>{badge.label}</Chip>} title={r.title} muted={r.status === "ignored"}>
                <span data-fr-status={r.status} data-fr-priority={r.priority} aria-hidden="true" />
                {r.recommendation ? <p className="fr-numbered-text text-sm font-light leading-relaxed">{r.recommendation}</p> : null}
              </HangingItem>
            );
          })}
        </ol>
      )}
    </WorkspaceHeroPage>
  );
}
