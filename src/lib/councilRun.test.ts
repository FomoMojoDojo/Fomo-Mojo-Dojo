// F3′: the browser waits for a background council run, and no reader lists a no-write run.
import { describe, expect, it } from "vitest";
import { isDryRunCouncilRun, visibleCouncilRuns, waitForCouncilRun } from "./councilRun";

function sbReturning(rows: Array<Record<string, unknown> | null>) {
  let i = 0;
  return { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: rows[Math.min(i++, rows.length - 1)], error: null }) }) }) }) };
}
const noSleep = () => Promise.resolve();

describe("F3′ council runs", () => {
  it("hides no-write runs only", () => {
    const runs = [{ id: "a", source_snapshot_json: { dry_run: true } }, { id: "b", source_snapshot_json: {} }, { id: "c", source_snapshot_json: null }];
    expect(visibleCouncilRuns(runs).map((r) => r.id)).toEqual(["b", "c"]);
    expect(isDryRunCouncilRun(runs[0])).toBe(true);
  });
  it("waits until the run leaves running", async () => {
    const r = await waitForCouncilRun(sbReturning([{ status: "running" }, { status: "running" }, { id: "x", status: "completed" }]), "x", { sleep: noSleep });
    expect(r.status).toBe("completed");
  });
  it("rejects a failed run with its reason, and a run still running at the timeout", async () => {
    await expect(waitForCouncilRun(sbReturning([{ status: "failed", summary: "local model timed out" }]), "x", { sleep: noSleep })).rejects.toThrow(/timed out/);
    await expect(waitForCouncilRun(sbReturning([{ status: "running" }]), "x", { sleep: noSleep, intervalMs: 10, timeoutMs: 30 })).rejects.toThrow(/still running/);
  });
});
