// H4 (2026-09-09) — the birth terminal owns the outside baseline, and owns it EXACTLY ONCE.
//
// Brand AI proved the old shape's cost: the baseline was fired only from the browser, unawaited, so
// when that call never went out the company got no outside read and left no server-side trace —
// zero long_runner_runs, meaning public-baseline was never even entered.
//
// The risk the fix introduces is the mirror image: run-agent-flow reaches its terminal on EVERY
// re-invoke, including the "already born" spine pre-check path that does no work. An unguarded fire
// would start a fresh baseline every time anyone re-ran the flow. These tests pin both directions.
import { describe, expect, it } from "vitest";
import { maybeStartBaselineAfterBirth } from "../../../supabase/functions/_shared/birthBaseline.ts";

/** A ledger that starts empty and records the row public-baseline would open at entry. */
function ledger(seeded = false) {
  let hasRow = seeded;
  const fires: number[] = [];
  return {
    hasBaselineRun: () => Promise.resolve(hasRow),
    fire: () => { fires.push(Date.now()); hasRow = true; return Promise.resolve(); },
    fires,
    get rowExists() { return hasRow; },
  };
}

describe("H4 — the birth terminal fires the baseline exactly once", () => {
  it("a birth terminal with no prior baseline fires it", async () => {
    const l = ledger();
    const out = await maybeStartBaselineAfterBirth({
      birthReachedTerminal: true, hasBaselineRun: l.hasBaselineRun, fire: l.fire,
    });
    expect(out).toEqual({ fired: true, reason: "fired" });
    expect(l.fires).toHaveLength(1);
  });

  it("a SECOND terminal for the same company does NOT fire again", async () => {
    const l = ledger();
    const first = await maybeStartBaselineAfterBirth({
      birthReachedTerminal: true, hasBaselineRun: l.hasBaselineRun, fire: l.fire,
    });
    // the re-invoke: run-agent-flow reaches its terminal again via the "already born" path
    const second = await maybeStartBaselineAfterBirth({
      birthReachedTerminal: true, hasBaselineRun: l.hasBaselineRun, fire: l.fire,
    });

    expect(first.fired).toBe(true);
    expect(second.fired).toBe(false);
    expect(second.reason).toBe("baseline_already_started");
    expect(l.fires).toHaveLength(1); // EXACTLY ONCE across both terminals
  });

  it("ten re-invokes after the first still fire exactly once", async () => {
    const l = ledger();
    for (let i = 0; i < 11; i++) {
      await maybeStartBaselineAfterBirth({
        birthReachedTerminal: true, hasBaselineRun: l.hasBaselineRun, fire: l.fire,
      });
    }
    expect(l.fires).toHaveLength(1);
  });

  it("a company with NO birth terminal never fires", async () => {
    const l = ledger();
    const out = await maybeStartBaselineAfterBirth({
      birthReachedTerminal: false, hasBaselineRun: l.hasBaselineRun, fire: l.fire,
    });
    expect(out).toEqual({ fired: false, reason: "no_birth_terminal" });
    expect(l.fires).toHaveLength(0);
    expect(l.rowExists).toBe(false);
    // Brand AI is exactly this case: its birth step FAILED at 150,032ms ("upstream server is timing
    // out") and its agent_flow_run is still 'running' with no completed_at, so it never reached a
    // terminal. The terminal hook alone would not have covered it — the idempotent trigger has to be
    // invocable directly for a company already in that hole.
  });

  it("a company whose baseline already exists never fires, terminal or not", async () => {
    const seeded = ledger(true);
    const out = await maybeStartBaselineAfterBirth({
      birthReachedTerminal: true, hasBaselineRun: seeded.hasBaselineRun, fire: seeded.fire,
    });
    expect(out.fired).toBe(false);
    expect(out.reason).toBe("baseline_already_started");
    expect(seeded.fires).toHaveLength(0);
  });

  it("a 401 from public-baseline is reported, not swallowed (the service-role trap)", async () => {
    // public-baseline is user-scoped: it builds an anon client from the caller's Authorization header
    // and calls auth.getUser(), 401ing when there is no user. A service-role JWT carries no user, so
    // firing with it always 401s — verified against the running stack. run-agent-flow therefore
    // passes the CALLER's JWT through, the same way its other nested invokes do.
    const out = await maybeStartBaselineAfterBirth({
      birthReachedTerminal: true,
      hasBaselineRun: () => Promise.resolve(false),
      fire: () => Promise.reject(new Error("public-baseline responded 401")),
    });
    expect(out.fired).toBe(false);
    expect(out.reason).toBe("fire_failed");
    expect(out.detail).toContain("401");
  });

  it("a fire failure is isolated — reported, never thrown at the birth response", async () => {
    const out = await maybeStartBaselineAfterBirth({
      birthReachedTerminal: true,
      hasBaselineRun: () => Promise.resolve(false),
      fire: () => Promise.reject(new Error("public-baseline responded 503")),
    });
    expect(out.fired).toBe(false);
    expect(out.reason).toBe("fire_failed");
    expect(out.detail).toContain("503");
  });

  it("VACUOUS PROOF — remove the ledger guard and the re-invoke fires a second time", async () => {
    // The guard is what makes 'exactly once' true. With hasBaselineRun pinned false (the unguarded
    // shape), the same two terminals fire twice — so the test above is testing the guard, not the
    // harness.
    const fires: number[] = [];
    const unguarded = { birthReachedTerminal: true, hasBaselineRun: () => Promise.resolve(false), fire: () => { fires.push(1); return Promise.resolve(); } };
    await maybeStartBaselineAfterBirth(unguarded);
    await maybeStartBaselineAfterBirth(unguarded);
    expect(fires).toHaveLength(2);
  });
});
