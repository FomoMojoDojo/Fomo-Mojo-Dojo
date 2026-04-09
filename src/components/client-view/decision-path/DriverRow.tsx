import type { DecisionDriver, DecisionDriverTone } from "@/components/client-view/decision-path/types";

type DriverRowProps = {
  drivers: DecisionDriver[];
  activeDriverId: DecisionDriver["id"];
  onSelect: (driverId: DecisionDriver["id"]) => void;
  getTone: (score: number) => DecisionDriverTone;
};

function toneLabel(tone: DecisionDriverTone) {
  if (tone === "risk") return "Weak";
  if (tone === "uncertain") return "Stable";
  return "Strong";
}

export default function DriverRow({
  drivers,
  activeDriverId,
  onSelect,
  getTone,
}: DriverRowProps) {
  return (
    <div className="decision-driver-pill-row" role="tablist" aria-label="Driver signals">
      {drivers.map((driver) => {
        const tone = getTone(driver.score);
        const isActive = activeDriverId === driver.id;
        return (
          <button
            key={`driver-${driver.id}`}
            type="button"
            onClick={() => onSelect(driver.id)}
            className={`decision-driver-pill ${isActive ? "is-active" : ""}`}
            role="tab"
            aria-selected={isActive}
          >
            <span className="decision-driver-pill-label">{driver.label}</span>
            <span className={`decision-driver-pill-state is-${tone}`}>
              {toneLabel(tone)}
            </span>
            {isActive ? <span className="decision-driver-pill-badge">Constraint</span> : null}
          </button>
        );
      })}
    </div>
  );
}
