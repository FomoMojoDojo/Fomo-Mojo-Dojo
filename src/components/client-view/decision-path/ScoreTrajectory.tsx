type ScoreTrajectoryProps = {
  current: number;
  next: number;
  potential: number;
  ownershipLift: number;
  executionLift: number;
  outsideMode?: boolean;
};

export default function ScoreTrajectory({
  current,
  next,
  potential,
  ownershipLift,
  executionLift,
  outsideMode = false,
}: ScoreTrajectoryProps) {
  return (
    <div className="dp-trajectory">
      <p className="dp-trajectory-line">
        {current} → {next} → {potential}
      </p>
      <p className="dp-trajectory-meta">
        {outsideMode
          ? `Directional upside if validated: +${ownershipLift} ownership • +${executionLift} execution`
          : `If you act: +${ownershipLift} ownership • +${executionLift} execution`}
      </p>
    </div>
  );
}
