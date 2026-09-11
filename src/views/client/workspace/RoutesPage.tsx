// Routes (Working frame): routes via useRoutes (route level only), each wearing its evidence band
// (BAND_LABELS — derived at render time from the route's own evidence_json / linked needs, the
// evidenceBands law), with the score now from mojo_scores above the list. Body: brief 2.
import { useCompany } from "@/hooks/useCompany";
import { useMojoScore } from "@/hooks/useMojoScore";
import { useRoutes, type RouteRow } from "@/hooks/useRoutes";
import { computeRouteUnlockConditions } from "@/lib/evidenceBands";
import { Chip, ScoreNow } from "@/views/client/firstReadPreview/primitives";
import { HangingItem } from "@/views/client/firstReadPreview/primitives-editorial";
import { SCORE_BANDS } from "@/views/client/firstReadPreview/scoreBands";
import { WorkspaceAbsent } from "./absent";
import { WorkspaceWorkingPage } from "./WorkspaceWorkingPage";
import { WORKSPACE_STRINGS } from "./workspaceNav";

function bandName(score: number): string | undefined {
  return SCORE_BANDS.find((b) => score >= b.min && score < b.max)?.name ?? SCORE_BANDS[SCORE_BANDS.length - 1]?.name;
}

function routeBandLabel(r: RouteRow): { label: string; tone: "good" | "warn" | "neutral" } {
  const ev = Array.isArray(r.evidence_json) ? r.evidence_json : [];
  const supporting = ev.filter((e) => e.status === "complete" || e.status === "in_progress").length;
  const missing = ev.filter((e) => e.status === "missing").length;
  const band = computeRouteUnlockConditions(
    { supportingEvidenceCount: supporting, missingEvidenceCount: missing, customerOppCount: (r.linked_need_ids ?? []).length, isDerived: r.provenance_type === "derived" },
    false,
  );
  const tone = band.currentBand === "hypothesis_only" ? "neutral" : band.currentBand === "directional_not_validated" ? "warn" : "good";
  return { label: band.currentBandLabel, tone };
}

export default function RoutesPage() {
  const { activeCompany } = useCompany();
  const { items, loading } = useRoutes(activeCompany?.id);
  const { score } = useMojoScore(activeCompany?.id);
  const routes = items.filter((r) => (r.level ?? "route") === "route");
  return (
    <WorkspaceWorkingPage eyebrow={WORKSPACE_STRINGS.routePlan} title={WORKSPACE_STRINGS.titleRoutes} count={loading ? null : routes.length} unit={WORKSPACE_STRINGS.unitRoutes}>
      {loading ? null : (
        <>
          {score ? <div className="mb-10"><ScoreNow now={Math.round(score.total_score)} band={bandName(score.total_score)} compact /></div> : null}
          {routes.length === 0 ? (
            <WorkspaceAbsent what="routes" />
          ) : (
            <ol className="fr-hanging-list fr-stagger">
              {routes.map((r) => {
                const band = routeBandLabel(r);
                return (
                  <HangingItem key={r.id} lead={<Chip tone={band.tone}>{band.label}</Chip>} title={r.title} muted={r.relevance_state === "deprioritized"}>
                    {r.short_description ? <p className="fr-numbered-text text-sm font-light leading-relaxed">{r.short_description}</p> : null}
                    <span data-fr-category={r.category} data-fr-alignment={r.strategy_alignment ?? undefined} aria-hidden="true" />
                  </HangingItem>
                );
              })}
            </ol>
          )}
        </>
      )}
    </WorkspaceWorkingPage>
  );
}
