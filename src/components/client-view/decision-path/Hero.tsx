import ScoreTrajectory from "@/components/client-view/decision-path/ScoreTrajectory";
import { Minus, ThumbsDown, ThumbsUp } from "lucide-react";

type HeroProps = {
  score: number;
  statusLabel: string;
  scoreToneClass: string;
  problemLine: string;
  nextMoveTitle: string;
  causeLine: string;
  impactLine: string;
  selectedBeliefValue: "yes" | "not_quite" | "no";
  onBeliefChange: (value: "yes" | "not_quite" | "no") => void;
  teamAlignmentLine: string;
  currentScore: number;
  nextScore: number;
  potentialScore: number;
  ownershipLift: number;
  executionLift: number;
};

export default function Hero({
  score,
  statusLabel,
  scoreToneClass,
  problemLine,
  nextMoveTitle,
  causeLine,
  impactLine,
  selectedBeliefValue,
  onBeliefChange,
  teamAlignmentLine,
  currentScore,
  nextScore,
  potentialScore,
  ownershipLift,
  executionLift,
}: HeroProps) {
  return (
    <section className="decision-path-hero decision-reveal" style={{ ["--reveal-index" as string]: 0 }} aria-label="Hero">
      <div className="decision-hero-inner">
        <p className="decision-path-kicker">Mojo</p>
        <p className="decision-path-state">
          <span className={`decision-path-score ${scoreToneClass}`}>{score}</span>
          <span className={`decision-path-state-label ${scoreToneClass}`}>{statusLabel}</span>
        </p>
        <p className="decision-path-subline">{problemLine}</p>

        <div className="decision-hero-chain" aria-label="Cause impact next move chain">
          <div className="decision-hero-step">
            <p className="decision-action-kicker is-risk">Cause</p>
            <p className="decision-path-subline">{causeLine}</p>
          </div>
          <span className="decision-hero-arrow" aria-hidden>
            →
          </span>
          <div className="decision-hero-step">
            <p className="decision-action-kicker is-warning">Impact</p>
            <p className="decision-path-subline">{impactLine}</p>
          </div>
          <span className="decision-hero-arrow" aria-hidden>
            →
          </span>
          <div className="decision-hero-step">
            <p className="decision-action-kicker is-success">Next Move</p>
            <p className="decision-path-subline">{nextMoveTitle}</p>
          </div>
        </div>

        <ScoreTrajectory
          current={currentScore}
          next={nextScore}
          potential={potentialScore}
          ownershipLift={ownershipLift}
          executionLift={executionLift}
        />

        <div className="decision-hero-vote-wrap">
          <p className="decision-path-kicker">Do you agree with this assessment?</p>
          <div className="decision-hero-votes" role="group" aria-label="Constraint belief">
            <button
              type="button"
              className={`decision-vote-btn ${selectedBeliefValue === "yes" ? "is-active" : ""}`}
              onClick={() => onBeliefChange("yes")}
              aria-label="Agree"
            >
              <ThumbsUp size={16} />
            </button>
            <button
              type="button"
              className={`decision-vote-btn ${selectedBeliefValue === "not_quite" ? "is-active" : ""}`}
              onClick={() => onBeliefChange("not_quite")}
              aria-label="Not quite"
            >
              <Minus size={16} />
            </button>
            <button
              type="button"
              className={`decision-vote-btn ${selectedBeliefValue === "no" ? "is-active" : ""}`}
              onClick={() => onBeliefChange("no")}
              aria-label="Disagree"
            >
              <ThumbsDown size={16} />
            </button>
          </div>
          <p className="decision-path-subline">{teamAlignmentLine}</p>
        </div>
      </div>
    </section>
  );
}
