import TeamAgreementControl from "@/components/client-view/decision-path/TeamAgreementControl";
import type { LovableDriver } from "@/components/client-view/decision-path/types";

type PrimaryConstraintCardProps = {
  driver: LovableDriver;
  selectedBeliefValue: "yes" | "not_quite" | "no";
  alignedCount: number;
  totalCount: number;
  onBeliefChange: (value: "yes" | "not_quite" | "no") => void;
};

export default function PrimaryConstraintCard({
  driver,
  selectedBeliefValue,
  alignedCount,
  totalCount,
  onBeliefChange,
}: PrimaryConstraintCardProps) {
  return (
    <article id="dp-primary-constraint-card" className="dp-constraint-card">
      <p className="dp-constraint-label">PRIMARY CONSTRAINT</p>

      <div className="dp-constraint-driver-row">
        <p className="dp-constraint-driver-name">{driver.label}</p>
        <span className="dp-constraint-driver-divider" aria-hidden>
          —
        </span>
        <span className={`dp-constraint-state is-${driver.state.toLowerCase()}`}>{driver.state}</span>
      </div>

      <p className="dp-constraint-problem">{driver.problem}</p>
      <p className="dp-constraint-consequence">{driver.consequence}</p>
      <p className="dp-constraint-action">
        <span>Fix:</span> {driver.fixLine}
      </p>

      <TeamAgreementControl
        compact
        value={selectedBeliefValue}
        alignedCount={alignedCount}
        totalCount={totalCount}
        onChange={onBeliefChange}
      />
    </article>
  );
}
