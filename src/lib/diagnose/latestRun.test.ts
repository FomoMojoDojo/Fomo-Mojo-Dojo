// DF7 + CV4 — run selection and the outage line, on fixtures. No database, no network.
import { describe, expect, it } from "vitest";
import { otherStatuses, selectLatestRuns, type BaselineRun } from "./latestRun";
import { diagnoseOutageLine } from "./outageLine";
import { WORKSPACE_STRINGS, searchUnavailableLine } from "@/views/client/workspace/workspaceNav";

const run = (id: string, created_at: string, status: string | null): BaselineRun => ({ id, created_at, status });

describe("selectLatestRuns — newest by date, never a quality pick", () => {
  it("picks the NEWEST ok run even when an older one would score better (the Edgewood case)", () => {
    // Edgewood: 2026-09-11 is newest; preferredRun's heuristic prefers 2026-07-24 (quality 153 vs
    // 143). DF7 binds the newest. This is the whole point of the ruling.
    const runs = [
      run("65", "2026-09-11T01:32:33.287811Z", "ok"),
      run("38", "2026-07-24T21:07:46.811537Z", "ok"),
      run("37", "2026-07-24T19:18:27.379147Z", "ok"),
    ];
    const sel = selectLatestRuns(runs);
    expect(sel.evidenceRun?.id).toBe("65");
    expect(sel.evidenceDate).toBe("2026-09-11T01:32:33.287811Z");
    expect(sel.outageRun).toBeNull();
  });

  it("is order-independent — the input array order cannot change the answer", () => {
    const runs = [
      run("old", "2026-06-01T00:00:00Z", "ok"),
      run("new", "2026-09-01T00:00:00Z", "ok"),
    ];
    expect(selectLatestRuns(runs).evidenceRun?.id).toBe("new");
    expect(selectLatestRuns([...runs].reverse()).evidenceRun?.id).toBe("new");
  });

  it("AN OUTAGE NEWER THAN THE LATEST OK RUN IS RETURNED", () => {
    const sel = selectLatestRuns([
      run("ok1", "2026-09-01T00:00:00Z", "ok"),
      run("out", "2026-09-05T00:00:00Z", "search_unavailable"),
    ]);
    expect(sel.evidenceRun?.id).toBe("ok1");
    expect(sel.outageRun?.id).toBe("out");
  });

  it("AN OUTAGE OLDER THAN THE LATEST OK RUN IS NOT RETURNED (the Sonos case)", () => {
    // Sonos e55ac325: outage 2026-07-17, ok 2026-09-01. The search recovered; nothing to say.
    const sel = selectLatestRuns([
      run("out", "2026-07-17T00:00:00Z", "search_unavailable"),
      run("ok1", "2026-09-01T00:00:00Z", "ok"),
    ]);
    expect(sel.evidenceRun?.id).toBe("ok1");
    expect(sel.outageRun).toBeNull();
  });

  it("SAME CALENDAR DAY is resolved by timestamp, not by date (the Mithun case)", () => {
    // 641d1f62: ok at 01:17:22 and search_unavailable at 00:47:29, both on 2026-09-18. A
    // date-granularity comparison ties; the ok run is actually newer, so there is no outage line.
    const sel = selectLatestRuns([
      run("78", "2026-09-18T01:17:22.302701Z", "ok"),
      run("76", "2026-09-18T01:08:58.293957Z", "insufficient_public_evidence"),
      run("75", "2026-09-18T00:47:29.613699Z", "search_unavailable"),
      run("73", "2026-09-17T16:33:15.161067Z", "search_unavailable"),
    ]);
    expect(sel.evidenceRun?.id).toBe("78");
    expect(sel.outageRun).toBeNull();
  });

  it("an outage at the SAME INSTANT as the evidence run does not override it (strictly newer)", () => {
    const sel = selectLatestRuns([
      run("ok1", "2026-09-01T00:00:00Z", "ok"),
      run("out", "2026-09-01T00:00:00Z", "search_unavailable"),
    ]);
    expect(sel.outageRun).toBeNull();
  });

  it("any other status is NEITHER evidence nor outage", () => {
    const sel = selectLatestRuns([
      run("ipe", "2026-09-20T00:00:00Z", "insufficient_public_evidence"),
      run("ok1", "2026-09-01T00:00:00Z", "ok"),
    ]);
    expect(sel.evidenceRun?.id).toBe("ok1"); // the newer non-ok run does not become evidence
    expect(sel.outageRun).toBeNull();        // nor an outage
  });

  it("a null / missing status is treated as any-other, never as ok", () => {
    const sel = selectLatestRuns([run("x", "2026-09-20T00:00:00Z", null)]);
    expect(sel.evidenceRun).toBeNull();
    expect(sel.evidenceDate).toBeNull();
  });

  it("no runs at all → nothing, and no throw", () => {
    expect(selectLatestRuns([])).toEqual({ evidenceRun: null, evidenceDate: null, outageRun: null });
  });

  it("NO OK RUN EVER + an outage → the outage IS returned (decided here; DF7 does not specify)", () => {
    // Suppressing it would show a company whose only reads failed no evidence and no explanation —
    // the exact silence CV4 exists to prevent.
    const sel = selectLatestRuns([run("out", "2026-09-05T00:00:00Z", "search_unavailable")]);
    expect(sel.evidenceRun).toBeNull();
    expect(sel.outageRun?.id).toBe("out");
  });

  it("an unparseable created_at can never win selection", () => {
    const sel = selectLatestRuns([
      run("bad", "not-a-date", "ok"),
      run("good", "2026-01-01T00:00:00Z", "ok"),
    ]);
    expect(sel.evidenceRun?.id).toBe("good");
  });

  it("otherStatuses reports what is neither ok nor search_unavailable", () => {
    expect(otherStatuses([
      run("a", "2026-09-01T00:00:00Z", "ok"),
      run("b", "2026-09-02T00:00:00Z", "search_unavailable"),
      run("c", "2026-09-03T00:00:00Z", "insufficient_public_evidence"),
      run("d", "2026-09-04T00:00:00Z", null),
    ])).toEqual(["(null/missing)", "insufficient_public_evidence"]);
  });
});

describe("diagnoseOutageLine — CV4", () => {
  it("returns the SIGNED line, imported not copied", () => {
    const r = run("out", "2026-09-18T00:47:29Z", "search_unavailable");
    const line = diagnoseOutageLine(r);
    expect(line).toBe(searchUnavailableLine(r.created_at));
    // and it is the signed template, with the date filled
    expect(line).toContain("Search couldn't be reached — nothing was checked");
    expect(WORKSPACE_STRINGS.searchUnavailableState).toContain("{date}");
  });

  it("NEVER returns 'Scanned … none found' or any other empty-state text", () => {
    const line = diagnoseOutageLine(run("out", "2026-09-18T00:47:29Z", "search_unavailable"))!;
    expect(line).not.toContain("none found");
    expect(line).not.toContain("Scanned");
    expect(line).not.toContain("No scan yet");
    expect(line).not.toContain("didn't complete");
  });

  it("returns NULL when there is no pending outage — null means render nothing, not 'all clear'", () => {
    expect(diagnoseOutageLine(null)).toBeNull();
  });

  it("end to end: the Sonos shape says nothing, the pending shape says the signed line", () => {
    const recovered = selectLatestRuns([
      run("out", "2026-07-17T00:00:00Z", "search_unavailable"),
      run("ok1", "2026-09-01T00:00:00Z", "ok"),
    ]);
    expect(diagnoseOutageLine(recovered.outageRun)).toBeNull();

    const pending = selectLatestRuns([
      run("ok1", "2026-09-01T00:00:00Z", "ok"),
      run("out", "2026-09-05T00:00:00Z", "search_unavailable"),
    ]);
    expect(diagnoseOutageLine(pending.outageRun)).toContain("Search couldn't be reached");
  });
});
