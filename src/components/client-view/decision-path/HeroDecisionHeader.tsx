import ScoreTrajectory from "@/components/client-view/decision-path/ScoreTrajectory";

type HeroDecisionHeaderProps = {
  phaseId: "outside" | "diagnosis" | "focus" | "execution";
  phaseLabel: string;
  score: number;
  statusLabel: string;
  scoreToneClass: string;
  diagnosisLine: string;
  causeLine: string;
  impactLine: string;
  nextMoveLine: string;
  currentScore: number;
  nextScore: number;
  potentialScore: number;
  ownershipLift: number;
  executionLift: number;
  outsideSignalStateLine?: string;
  outsideSignalNoteLine?: string;
};

export default function HeroDecisionHeader({
  phaseId,
  phaseLabel,
  score,
  statusLabel,
  scoreToneClass,
  diagnosisLine,
  causeLine,
  impactLine,
  nextMoveLine,
  currentScore,
  nextScore,
  potentialScore,
  ownershipLift,
  executionLift,
  outsideSignalStateLine,
  outsideSignalNoteLine,
}: HeroDecisionHeaderProps) {
  const isOutsideView = phaseId === "outside";

  return (
    <section className="dp-hero decision-reveal" style={{ ["--reveal-index" as string]: 0 }}>
      <div className="dp-hero-inner">
        <p className="dp-hero-kicker">MOJO SCORE</p>
        <p className="dp-hero-phase-line">
          <span className="dp-hero-phase-key">Phase:</span> {phaseLabel}
        </p>

        <div className="dp-hero-score-row">
          <span className={`dp-hero-score ${scoreToneClass}`}>{score}</span>
          <span className={`dp-hero-status ${scoreToneClass}`}>{statusLabel}</span>
        </div>

        {isOutsideView ? (
          <div className="dp-hero-signal-row">
            <span className="dp-hero-signal-state">
              {outsideSignalStateLine || "Low confidence - based on external signals only"}
            </span>
            <span className="dp-hero-signal-note">
              {outsideSignalNoteLine || "Likelihood of success cannot yet be determined"}
            </span>
          </div>
        ) : null}

        <p className="dp-hero-diagnosis">{diagnosisLine}</p>

        <div className="dp-hero-narrative" aria-label="Cause impact next move">
          <div className="dp-hero-narrative-cell is-cause">
            <p className="dp-hero-cell-kicker is-risk">Cause</p>
            <p className="dp-hero-cell-line">{causeLine}</p>
          </div>
          <div className="dp-hero-divider" aria-hidden>→</div>
          <div className="dp-hero-narrative-cell is-impact">
            <p className="dp-hero-cell-kicker is-warning">Impact</p>
            <p className="dp-hero-cell-line">{impactLine}</p>
          </div>
          <div className="dp-hero-divider" aria-hidden>→</div>
          <div className="dp-hero-narrative-cell is-next">
            <p className="dp-hero-cell-kicker is-success">Next Move</p>
            <p className="dp-hero-cell-line">{nextMoveLine}</p>
          </div>
        </div>

        <ScoreTrajectory
          current={currentScore}
          next={nextScore}
          potential={potentialScore}
          ownershipLift={ownershipLift}
          executionLift={executionLift}
          outsideMode={isOutsideView}
        />
      </div>
    </section>
  );
}
