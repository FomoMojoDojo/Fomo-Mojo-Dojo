import {
  LOVABLE_DRIVER_IDS,
  type LovableDriver,
} from "@/components/client-view/decision-path/types";

type DriverChipRowProps = {
  drivers: LovableDriver[];
  activeDriverId: LovableDriver["id"];
  onSelect: (driverId: LovableDriver["id"]) => void;
};

export default function DriverChipRow({
  drivers,
  activeDriverId,
  onSelect,
}: DriverChipRowProps) {
  const toneForState = (state: LovableDriver["state"]) => {
    if (state === "Breaking") return "is-risk";
    if (state === "Weak") return "is-caution";
    if (state === "Strong") return "is-progress";
    return "is-structure";
  };

  const orderedDrivers = LOVABLE_DRIVER_IDS
    .map((id) => drivers.find((driver) => driver.id === id))
    .filter((driver): driver is LovableDriver => Boolean(driver));

  return (
    <div className="dp-driver-chip-row" role="tablist" aria-label="Driver row">
      {orderedDrivers.map((driver) => (
        <button
          key={`driver-${driver.id}`}
          type="button"
          role="tab"
          aria-selected={driver.id === activeDriverId}
          aria-controls="dp-primary-constraint-card"
          className={`dp-driver-chip ${driver.id === activeDriverId ? "is-active" : "is-idle"} ${toneForState(driver.state)}`}
          onClick={() => onSelect(driver.id)}
        >
          <span className="dp-driver-chip-label">{driver.label}</span>
          {driver.id === activeDriverId ? (
            <span className={`dp-driver-chip-state is-${driver.state.toLowerCase()}`}>{driver.state}</span>
          ) : null}
        </button>
      ))}
    </div>
  );
}
