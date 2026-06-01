import { describe, expect, it } from "vitest";
import {
  captureSnapshot,
  compareSnapshots,
  deriveMovementLine,
  type StrategicMovementSnapshot,
  type SnapshotInput,
} from "./strategicMovementMemory";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeInput(overrides: Partial<SnapshotInput> = {}): SnapshotInput {
  return {
    companyId: "co-1",
    centerStateKey: "stable_center",
    confidencePosture: "stable",
    canCommit: false,
    safeToCommit: [],
    blocked: [],
    portfolioState: "validation_heavy",
    tensions: [],
    validationUrgency: null,
    hasContradiction: false,
    customerProofPresent: false,
    unresolvedAssumptionsCount: 2,
    contradictedAssumptionsCount: 0,
    reframedAssumptionsCount: 0,
    mojoScore: 55,
    ...overrides,
  };
}

function makeSnapshot(overrides: Partial<SnapshotInput> = {}): StrategicMovementSnapshot {
  return captureSnapshot(makeInput(overrides));
}

// ─── captureSnapshot ─────────────────────────────────────────────────────────

describe("captureSnapshot", () => {
  it("produces a snapshot with correct shape", () => {
    const snap = makeSnapshot();
    expect(snap.companyId).toBe("co-1");
    expect(snap.confidencePosture).toBe("stable");
    expect(snap.canCommit).toBe(false);
    expect(snap.primaryTensions).toEqual([]);
    expect(snap.timestamp).toBeTruthy();
  });

  it("maps safeToCommit to safeRouteCount", () => {
    const snap = makeSnapshot({ safeToCommit: ["Route A", "Route B"] });
    expect(snap.safeRouteCount).toBe(2);
  });
});

// ─── No movement (first read) — handled by the hook, not compareSnapshots ────

// ─── No material movement ────────────────────────────────────────────────────

describe("no material movement", () => {
  it("identical snapshots → no material movement", () => {
    const prev = makeSnapshot();
    const curr = makeSnapshot();
    const result = compareSnapshots(prev, curr);
    expect(result.firstRead).toBe(false);
    if (result.firstRead) return;
    expect(result.hasMaterialMovement).toBe(false);
    expect(result.summaryLine).toContain("No material movement");
  });

  it("summaryLine is a non-empty string", () => {
    const prev = makeSnapshot();
    const curr = makeSnapshot();
    const result = compareSnapshots(prev, curr);
    expect(typeof result.summaryLine).toBe("string");
    expect(result.summaryLine.length).toBeGreaterThan(0);
  });
});

// ─── Confidence movement ─────────────────────────────────────────────────────

describe("confidence strengthened", () => {
  it("contradicted → stable = confidence strengthened", () => {
    const prev = makeSnapshot({ confidencePosture: "contradicted" });
    const curr = makeSnapshot({ confidencePosture: "stable" });
    const result = compareSnapshots(prev, curr);
    if (result.firstRead) throw new Error("unexpected firstRead");
    expect(result.hasMaterialMovement).toBe(true);
    const statements = result.items.map((i) => i.statement);
    expect(statements.some((s) => s.toLowerCase().includes("strengthened"))).toBe(true);
  });

  it("fragmented → strengthening = confidence strengthened", () => {
    const prev = makeSnapshot({ confidencePosture: "fragmented" });
    const curr = makeSnapshot({ confidencePosture: "strengthening" });
    const result = compareSnapshots(prev, curr);
    if (result.firstRead) throw new Error("unexpected firstRead");
    expect(result.items.some((i) => i.direction === "strengthened")).toBe(true);
  });
});

describe("confidence weakened", () => {
  it("stable → contradicted = confidence weakened", () => {
    const prev = makeSnapshot({ confidencePosture: "stable" });
    const curr = makeSnapshot({ confidencePosture: "contradicted" });
    const result = compareSnapshots(prev, curr);
    if (result.firstRead) throw new Error("unexpected firstRead");
    expect(result.hasMaterialMovement).toBe(true);
    expect(result.items.some((i) => i.direction === "weakened")).toBe(true);
  });

  it("stable → fragmented = confidence weakened", () => {
    const prev = makeSnapshot({ confidencePosture: "stable" });
    const curr = makeSnapshot({ confidencePosture: "fragmented" });
    const result = compareSnapshots(prev, curr);
    if (result.firstRead) throw new Error("unexpected firstRead");
    expect(result.items.some((i) => i.direction === "weakened")).toBe(true);
  });
});

// ─── Tension movement ─────────────────────────────────────────────────────────

describe("tension emerged", () => {
  it("new tension in current not in previous = emerged", () => {
    const prev = makeSnapshot({ tensions: [] });
    const curr = makeSnapshot({
      tensions: [{ id: "t-1", statement: "Capability gap persists.", pressure: "high", isCommitmentBlocker: false }],
    });
    const result = compareSnapshots(prev, curr);
    if (result.firstRead) throw new Error("unexpected firstRead");
    expect(result.hasMaterialMovement).toBe(true);
    expect(result.items.some((i) => i.direction === "emerged")).toBe(true);
    expect(result.annotatedTensions.some((a) => a.movementStatus === "emerging")).toBe(true);
  });

  it("new blocking tension = A new blocking tension emerged", () => {
    const prev = makeSnapshot({ tensions: [] });
    const curr = makeSnapshot({
      tensions: [{ id: "t-2", statement: "Commitment is blocked.", pressure: "critical", isCommitmentBlocker: true }],
    });
    const result = compareSnapshots(prev, curr);
    if (result.firstRead) throw new Error("unexpected firstRead");
    const item = result.items.find((i) => i.direction === "emerged");
    expect(item?.statement).toContain("blocking");
    expect(item?.weight).toBe(1);
  });
});

describe("tension cooled", () => {
  it("tension in previous but absent in current = cooled", () => {
    const prev = makeSnapshot({
      tensions: [{ id: "t-1", statement: "Old tension.", pressure: "medium", isCommitmentBlocker: false }],
    });
    const curr = makeSnapshot({ tensions: [] });
    const result = compareSnapshots(prev, curr);
    if (result.firstRead) throw new Error("unexpected firstRead");
    expect(result.items.some((i) => i.direction === "cooled" || i.direction === "resolved")).toBe(true);
    expect(result.annotatedTensions.some((a) => a.movementStatus === "cooling")).toBe(true);
  });

  it("tension pressure decreased = weakened annotation", () => {
    const prev = makeSnapshot({
      tensions: [{ id: "t-1", statement: "Tension X.", pressure: "high", isCommitmentBlocker: false }],
    });
    const curr = makeSnapshot({
      tensions: [{ id: "t-1", statement: "Tension X.", pressure: "low", isCommitmentBlocker: false }],
    });
    const result = compareSnapshots(prev, curr);
    if (result.firstRead) throw new Error("unexpected firstRead");
    expect(result.annotatedTensions.some((a) => a.movementStatus === "weakened")).toBe(true);
  });
});

describe("blocker persisted", () => {
  it("commitment blocker in both snapshots = persisted", () => {
    const tension = { id: "t-block", statement: "Capability gap.", pressure: "critical" as const, isCommitmentBlocker: true };
    const prev = makeSnapshot({ tensions: [tension] });
    const curr = makeSnapshot({ tensions: [tension] });
    const result = compareSnapshots(prev, curr);
    if (result.firstRead) throw new Error("unexpected firstRead");
    expect(result.items.some((i) => i.direction === "persisted" && i.weight <= 2)).toBe(true);
    expect(result.annotatedTensions.some((a) => a.movementStatus === "persistent")).toBe(true);
    const item = result.items.find((i) => i.direction === "persisted");
    expect(item?.statement).toContain("blocker");
  });
});

// ─── Route / commitment movement ─────────────────────────────────────────────

describe("route advanced", () => {
  it("safeRouteCount increased = route advanced to commitment", () => {
    const prev = makeSnapshot({ safeToCommit: [] });
    const curr = makeSnapshot({ safeToCommit: ["Route A"] });
    const result = compareSnapshots(prev, curr);
    if (result.firstRead) throw new Error("unexpected firstRead");
    expect(result.items.some((i) => i.direction === "advanced")).toBe(true);
  });
});

describe("route stalled", () => {
  it("safeRouteCount decreased = committed route regressed", () => {
    const prev = makeSnapshot({ safeToCommit: ["Route A", "Route B"] });
    const curr = makeSnapshot({ safeToCommit: ["Route A"] });
    const result = compareSnapshots(prev, curr);
    if (result.firstRead) throw new Error("unexpected firstRead");
    expect(result.items.some((i) => i.direction === "stalled")).toBe(true);
  });

  it("blockedRouteCount increased = route commitment became blocked", () => {
    const prev = makeSnapshot({ blocked: [] });
    const curr = makeSnapshot({ blocked: ["Route B"] });
    const result = compareSnapshots(prev, curr);
    if (result.firstRead) throw new Error("unexpected firstRead");
    expect(result.items.some((i) => i.direction === "stalled")).toBe(true);
  });
});

// ─── Commitment readiness ─────────────────────────────────────────────────────

describe("commitment readiness improved", () => {
  it("canCommit false → true = readiness improved", () => {
    const prev = makeSnapshot({ safeToCommit: [] });
    const curr = makeSnapshot({ safeToCommit: ["Route A"], canCommit: true });
    const result = compareSnapshots(prev, curr);
    if (result.firstRead) throw new Error("unexpected firstRead");
    expect(result.items.some((i) => i.direction === "improved" && i.weight === 1)).toBe(true);
  });
});

describe("commitment readiness degraded", () => {
  it("canCommit true → false = readiness degraded", () => {
    const prev = makeSnapshot({ safeToCommit: ["Route A"], canCommit: true });
    const curr = makeSnapshot({ safeToCommit: [] });
    const result = compareSnapshots(prev, curr);
    if (result.firstRead) throw new Error("unexpected firstRead");
    expect(result.items.some((i) => i.direction === "degraded" && i.weight === 1)).toBe(true);
  });
});

// ─── deriveMovementLine ───────────────────────────────────────────────────────

describe("deriveMovementLine", () => {
  it("no material movement → returns null", () => {
    const prev = makeSnapshot();
    const curr = makeSnapshot();
    const summary = compareSnapshots(prev, curr);
    expect(deriveMovementLine(summary)).toBeNull();
  });

  it("material movement → returns a non-null movement string", () => {
    const prev = makeSnapshot({ confidencePosture: "contradicted" });
    const curr = makeSnapshot({ confidencePosture: "stable" });
    const summary = compareSnapshots(prev, curr);
    const line = deriveMovementLine(summary);
    expect(line).not.toBeNull();
    expect(typeof line).toBe("string");
  });

  it("firstRead summary → returns null", () => {
    const firstReadSummary = {
      firstRead: true as const,
      summaryLine: "First strategic read — movement will appear after the next review.",
      annotatedTensions: [],
    };
    expect(deriveMovementLine(firstReadSummary)).toBeNull();
  });

  it("summary line includes up to 2 items", () => {
    const prev = makeSnapshot({ confidencePosture: "contradicted", safeToCommit: ["Route A"], canCommit: true });
    const curr = makeSnapshot({ confidencePosture: "stable", safeToCommit: [] });
    const summary = compareSnapshots(prev, curr);
    const line = deriveMovementLine(summary);
    if (!line) return;
    // Statements are joined with space, each ending with "."; at most 2 sentences
    const sentences = line.match(/[^.]+\./g) ?? [];
    expect(sentences.length).toBeLessThanOrEqual(2);
  });
});

// ─── Tension statement matching ───────────────────────────────────────────────

describe("tension matching by normalised statement", () => {
  it("same statement text but different ID → treated as same tension", () => {
    const prev = makeSnapshot({
      tensions: [{ id: "old-id", statement: "Positioning claim lacks customer proof.", pressure: "high", isCommitmentBlocker: false }],
    });
    const curr = makeSnapshot({
      tensions: [{ id: "new-id", statement: "Positioning claim lacks customer proof.", pressure: "high", isCommitmentBlocker: false }],
    });
    const result = compareSnapshots(prev, curr);
    if (result.firstRead) throw new Error("unexpected firstRead");
    // Same tension — should be persistent, not emerged+resolved
    const directions = result.items.map((i) => i.direction);
    expect(directions).not.toContain("emerged");
    expect(result.annotatedTensions.some((a) => a.movementStatus === "persistent")).toBe(true);
  });
});
