// Struck-preservation law — the R2 signals-gone prune can never select a
// struck claim (a recorded operator decision survives signal loss); active
// and minimized claims prune normally (minimize is display-only de-emphasis,
// no recorded decision attached); manual claims stay untouched throughout.
import { describe, expect, it } from "vitest";
import { selectPruneVictims } from "./prunePolicy";

const noCandidates = new Set<string>();
const noManual = new Set<string>();

describe("struck-preservation — R2 prune victim selection", () => {
  it("a struck claim with ALL signals gone survives the prune", () => {
    const victims = selectPruneVictims(
      [{ id: "c1", status: "struck" }],
      noCandidates, // not a candidate anywhere = its signals vanished
      noManual,
    );
    expect(victims).toEqual([]);
  });

  it("an active claim with vanished signals still prunes", () => {
    const victims = selectPruneVictims([{ id: "c1", status: "active" }], noCandidates, noManual);
    expect(victims).toEqual(["c1"]);
  });

  it("a minimized claim prunes normally (display-only de-emphasis, counts like active)", () => {
    const victims = selectPruneVictims([{ id: "c1", status: "minimized" }], noCandidates, noManual);
    expect(victims).toEqual(["c1"]);
  });

  it("claims still in the candidate set never prune; manual claims never prune", () => {
    const victims = selectPruneVictims(
      [
        { id: "kept", status: "active" },
        { id: "manual", status: "active" },
        { id: "gone", status: "active" },
      ],
      new Set(["kept"]),
      new Set(["manual"]),
    );
    expect(victims).toEqual(["gone"]);
  });
});
