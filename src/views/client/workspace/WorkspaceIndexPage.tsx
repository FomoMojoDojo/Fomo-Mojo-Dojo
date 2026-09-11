// Workspace home (Hero frame): the score now + the compass bar from mojo_scores (body: brief 2 — the
// comp's seven page cards). An empty read renders the Absent box.
import { useCompany } from "@/hooks/useCompany";
import { useMojoScore } from "@/hooks/useMojoScore";
import { ScoreNow } from "@/views/client/firstReadPreview/primitives";
import { HorizontalScale } from "@/views/client/firstReadPreview/primitives-editorial";
import { SCORE_BANDS } from "@/views/client/firstReadPreview/scoreBands";
import { WorkspaceAbsent } from "./absent";
import { WorkspaceHeroPage } from "./WorkspaceHeroPage";
import { WORKSPACE_STRINGS } from "./workspaceNav";

function bandName(score: number): string | undefined {
  return SCORE_BANDS.find((b) => score >= b.min && score < b.max)?.name ?? SCORE_BANDS[SCORE_BANDS.length - 1]?.name;
}

export default function WorkspaceIndexPage() {
  const { activeCompany } = useCompany();
  const { score, loading } = useMojoScore(activeCompany?.id);
  return (
    <WorkspaceHeroPage eyebrow={WORKSPACE_STRINGS.indexSection} title={WORKSPACE_STRINGS.heroHome} accent={WORKSPACE_STRINGS.heroHomeAccent}>
      {loading ? null : score ? (
        <div className="fr-stagger">
          <ScoreNow now={Math.round(score.total_score)} band={bandName(score.total_score)} />
          <div className="mt-10">
            <HorizontalScale marks={[]} filledPct={score.total_score} reachablePct={score.total_score} unlockablePct={100} />
          </div>
        </div>
      ) : (
        <WorkspaceAbsent what="score" />
      )}
    </WorkspaceHeroPage>
  );
}
