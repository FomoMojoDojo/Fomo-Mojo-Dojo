// Struck-preservation law — the R2 signals-gone prune can never select a
// struck claim (a recorded operator decision survives signal loss); active
// and minimized PUBLIC_OBSERVED claims prune normally (minimize is display-only
// de-emphasis, no recorded decision attached); manual claims stay untouched.
// RB-1 (08-04): the prune is scoped to provenance='public_observed' — the rebuild
// derives from public signals and must never reach a declared/attested claim.
import { describe, expect, it } from "vitest";
import { selectPruneVictims, type PruneCandidateRow } from "./prunePolicy";

const noCandidates = new Set<string>();
const noManual = new Set<string>();
const P = "public_observed";

// Pre-RB-1 victim logic (provenance filter ABSENT) — kept ONLY to prove the new
// guard is load-bearing: given identical rows, the old rule TAKES a declared claim
// that the real function now REFUSES. A red/green that would pass regardless is
// vacuous (standing law); this makes the divergence explicit.
function selectPruneVictims_preRB1(
  rows: PruneCandidateRow[],
  candidateIds: Set<string>,
  manualClaimIds: Set<string>,
): string[] {
  return rows
    .filter((r) => !manualClaimIds.has(r.id) && r.status !== "struck" && !candidateIds.has(r.id))
    .map((r) => r.id);
}

describe("struck-preservation — R2 prune victim selection", () => {
  it("a struck claim with ALL signals gone survives the prune", () => {
    const victims = selectPruneVictims(
      [{ id: "c1", status: "struck", provenance: P }],
      noCandidates, // not a candidate anywhere = its signals vanished
      noManual,
    );
    expect(victims).toEqual([]);
  });

  it("an active public_observed claim with vanished signals still prunes", () => {
    const victims = selectPruneVictims([{ id: "c1", status: "active", provenance: P }], noCandidates, noManual);
    expect(victims).toEqual(["c1"]);
  });

  it("a minimized public_observed claim prunes normally (display-only de-emphasis, counts like active)", () => {
    const victims = selectPruneVictims([{ id: "c1", status: "minimized", provenance: P }], noCandidates, noManual);
    expect(victims).toEqual(["c1"]);
  });

  it("claims still in the candidate set never prune; manual claims never prune", () => {
    const victims = selectPruneVictims(
      [
        { id: "kept", status: "active", provenance: P },
        { id: "manual", status: "active", provenance: P },
        { id: "gone", status: "active", provenance: P },
      ],
      new Set(["kept"]),
      new Set(["manual"]),
    );
    expect(victims).toEqual(["gone"]);
  });
});

describe("RB-1 provenance scoping — rebuild prunes public_observed ONLY", () => {
  // Every one of these rows has vanished signals (noCandidates) and is active,
  // so ONLY provenance decides its fate.
  it("internal_declared with vanished signals is REFUSED (a PCL-1 positioning claim is safe)", () => {
    const victims = selectPruneVictims(
      [{ id: "pos1", status: "active", provenance: "internal_declared" }],
      noCandidates,
      noManual,
    );
    expect(victims).toEqual([]);
  });

  it("client_attested with vanished signals is REFUSED", () => {
    const victims = selectPruneVictims(
      [{ id: "att1", status: "active", provenance: "client_attested" }],
      noCandidates,
      noManual,
    );
    expect(victims).toEqual([]);
  });

  it("a minimized internal_declared claim is REFUSED (provenance decides before status)", () => {
    const victims = selectPruneVictims(
      [{ id: "d1", status: "minimized", provenance: "internal_declared" }],
      noCandidates,
      noManual,
    );
    expect(victims).toEqual([]);
  });

  it("a mixed pool: only the public_observed victim is taken; declared/attested survive", () => {
    const rows: PruneCandidateRow[] = [
      { id: "pub_gone", status: "active", provenance: "public_observed" }, // the genuine victim
      { id: "decl_gone", status: "active", provenance: "internal_declared" },
      { id: "att_gone", status: "active", provenance: "client_attested" },
    ];
    const victims = selectPruneVictims(rows, noCandidates, noManual);
    expect(victims).toEqual(["pub_gone"]); // guard did NOT disable pruning
  });

  it("RED/GREEN — the guard is load-bearing: pre-RB-1 logic TAKES a declared claim the real fn REFUSES", () => {
    const row: PruneCandidateRow[] = [{ id: "decl", status: "active", provenance: "internal_declared" }];
    // RED: without the provenance filter, the declared claim is taken (data loss).
    expect(selectPruneVictims_preRB1(row, noCandidates, noManual)).toEqual(["decl"]);
    // GREEN: with the guard, the same row on the same data is refused.
    expect(selectPruneVictims(row, noCandidates, noManual)).toEqual([]);
  });
});
