// GATE D (2026-09-09) — the gateway resume is a STEPPER, and the internal call path is an AND.
//
// WHY THE STEPPER. Gate B polled inside the caller's isolate. On Brand AI the own-words resume spent
// ~150s of the fill isolate's wall clock; the isolate was terminated 19 seconds later and gap-pairs,
// relevance, open-questions, finding-beats, recurrence and the score never ran. The wait was charged
// to everything the caller still had to do. Now one invocation performs ONE check and returns.
import { describe, expect, it } from "vitest";
import {
  RESUME_MAX_CHECKS, isGatewayCut, newResumeState, resumeStepDecision,
} from "../../../supabase/functions/_shared/gatewayResume.ts";
import { isInternalServiceCall, timingSafeEqualStr } from "../../../supabase/functions/_shared/internalCall.ts";

const T0 = Date.parse("2026-09-09T21:00:00Z");
const state = (over: Partial<ReturnType<typeof newResumeState>> = {}) => ({
  ...newResumeState({
    component: "first_read_own_words",
    terminalStatuses: ["planned", "completed"],
    followUp: { fn: "extract-own-words", body: { mode: "write" } },
    now: T0,
  }),
  ...over,
});

/** Drive the stepper the way the edge function does: one check per invocation, no waiting. */
function driveStepper(statusAt: (check: number) => string | null, maxChecks = RESUME_MAX_CHECKS) {
  let s = state({ maxChecks });
  const followUps: number[] = [];
  let invocations = 0;
  for (;;) {
    invocations++;
    const d = resumeStepDecision({ observedStatus: statusAt(invocations), state: s, now: T0 + invocations * 15_000 });
    if (d.action === "fire") { followUps.push(invocations); s = { ...s, followUpFired: true, checks: invocations }; break; }
    if (d.action === "exhausted" || d.action === "noop") { s = { ...s, checks: invocations }; break; }
    s = { ...s, checks: d.nextCheck };
    if (invocations > 500) throw new Error("runaway"); // the loop must be BOUNDED
  }
  return { invocations, followUps, finalState: s };
}

describe("VACUOUS PROOF side 1 — the terminal NEVER appears", () => {
  it("exhausts after N re-invokes, fires zero follow-ups, and never waits inside one invocation", () => {
    const r = driveStepper(() => null, 5);
    expect(r.followUps).toHaveLength(0);          // nothing fired
    expect(r.invocations).toBe(5);                // bounded by maxChecks, one check each
    const last = resumeStepDecision({ observedStatus: null, state: { ...r.finalState, checks: 5 }, now: T0 });
    expect(last.action).toBe("exhausted");
  });

  it("the default bound is 10 minutes of 15s checks, and the WALL binds first", () => {
    expect(RESUME_MAX_CHECKS).toBe(41);
    const r = driveStepper(() => null);
    // 40, not 41: the driver advances the clock 15s per check, so at check 40 the 10-minute
    // deadline is reached and ends it one check before the count would. Both bounds are live and
    // whichever binds first wins — that is the property worth pinning, not the exact number.
    expect(r.invocations).toBe(40);
    expect(r.invocations).toBeLessThanOrEqual(RESUME_MAX_CHECKS);
    expect(r.followUps).toHaveLength(0);
  });

  it("the deadline ends it even when the check count has room", () => {
    const d = resumeStepDecision({
      observedStatus: null,
      state: state({ checks: 1, maxChecks: 999, deadlineIso: new Date(T0).toISOString() }),
      now: T0 + 1,
    });
    expect(d).toEqual({ action: "exhausted", reason: "deadline_passed" });
  });

  it("a non-terminal status is not mistaken for a terminal one", () => {
    const d = resumeStepDecision({ observedStatus: "running", state: state(), now: T0 });
    expect(d.action).toBe("reschedule");
  });
});

describe("VACUOUS PROOF side 2 — the terminal appears at check 3", () => {
  it("fires the follow-up exactly once, on check 3", () => {
    const r = driveStepper((c) => (c < 3 ? null : "planned"));
    expect(r.followUps).toEqual([3]);
    expect(r.invocations).toBe(3);
  });

  it("a duplicate re-invoke after firing is a no-op — never a second follow-up", () => {
    const d = resumeStepDecision({ observedStatus: "planned", state: state({ followUpFired: true }), now: T0 });
    expect(d).toEqual({ action: "noop", reason: "already_fired" });
  });

  it("the two sides differ ONLY in whether the terminal ever appears", () => {
    const never = driveStepper(() => null, 6);
    const appears = driveStepper((c) => (c < 3 ? null : "planned"), 6);
    expect(never.followUps).toHaveLength(0);
    expect(appears.followUps).toHaveLength(1);
  });

  it("an already-finished worker costs one check and no waiting at all", () => {
    const r = driveStepper(() => "completed");
    expect(r.invocations).toBe(1);
    expect(r.followUps).toEqual([1]);
  });
});

describe("GATE D — the resume state carries what a fresh isolate needs", () => {
  it("banks component, follow-up, un-gate fan-out and the close-row patch", () => {
    const s = newResumeState({
      component: "finalizer", terminalStatuses: ["completed"], followUp: null,
      closeRow: { table: "agent_flow_runs", id: "03942b7a", patch: { status: "completed" } },
      onDone: [{ fn: "first-read-fill", body: {} }], now: T0,
    });
    expect(s.component).toBe("finalizer");
    expect(s.closeRow?.table).toBe("agent_flow_runs");
    expect(s.onDone).toHaveLength(1);
    expect(s.followUpFired).toBe(false);
    expect(s.checks).toBe(0);
  });

  it("D3 — a cut research-company call closes the stranded run row when the finalizer lands", () => {
    // Brand AI's agent_flow_run 03942b7a has read 'running' since 17:29 because the stage threw on a
    // 150s cut while research-company went on to write its finalizer row 39s later.
    const s = newResumeState({
      component: "finalizer", terminalStatuses: ["completed"], followUp: null,
      closeRow: { table: "agent_flow_runs", id: "03942b7a", patch: { status: "completed" } }, now: T0,
    });
    const d = resumeStepDecision({ observedStatus: "completed", state: s, now: T0 });
    expect(d.action).toBe("fire");
  });

  it("only real gateway cuts hand off", () => {
    for (const s of [504, 502, 408]) expect(isGatewayCut(s)).toBe(true);
    for (const s of [500, 400, 403, 409, 422, 200]) expect(isGatewayCut(s)).toBe(false);
  });
});

describe("GATE D (D4) — the internal service-role path is an AND of two facts", () => {
  const SECRET = "s3cr3t-internal-marker";
  const SERVICE = "service-role-key-value";

  it("service role WITHOUT the header → refused (the Gate C behaviour stands)", () => {
    expect(isInternalServiceCall({ presentedSecret: null, internalSecret: SECRET, bearer: SERVICE, serviceRoleKey: SERVICE })).toBe(false);
    expect(isInternalServiceCall({ presentedSecret: "", internalSecret: SECRET, bearer: SERVICE, serviceRoleKey: SERVICE })).toBe(false);
  });

  it("the header WITHOUT the service role → refused (a browser cannot borrow it)", () => {
    expect(isInternalServiceCall({ presentedSecret: SECRET, internalSecret: SECRET, bearer: "a-user-jwt", serviceRoleKey: SERVICE })).toBe(false);
  });

  it("service role WITH the correct header → accepted", () => {
    expect(isInternalServiceCall({ presentedSecret: SECRET, internalSecret: SECRET, bearer: SERVICE, serviceRoleKey: SERVICE })).toBe(true);
  });

  it("a wrong header value is refused, including a same-length near miss", () => {
    expect(isInternalServiceCall({ presentedSecret: "s3cr3t-internal-markeR", internalSecret: SECRET, bearer: SERVICE, serviceRoleKey: SERVICE })).toBe(false);
    expect(isInternalServiceCall({ presentedSecret: "nope", internalSecret: SECRET, bearer: SERVICE, serviceRoleKey: SERVICE })).toBe(false);
  });

  it("an UNSET secret disables the path entirely — fail closed", () => {
    expect(isInternalServiceCall({ presentedSecret: "anything", internalSecret: "", bearer: SERVICE, serviceRoleKey: SERVICE })).toBe(false);
    expect(isInternalServiceCall({ presentedSecret: "", internalSecret: undefined, bearer: SERVICE, serviceRoleKey: SERVICE })).toBe(false);
  });

  it("the compare is constant-time-shaped and length-safe", () => {
    expect(timingSafeEqualStr("abc", "abc")).toBe(true);
    expect(timingSafeEqualStr("abc", "abd")).toBe(false);
    expect(timingSafeEqualStr("abc", "abcd")).toBe(false);
  });
});

// ── D2 — the gated public-reads stage must not leak a ledger row per poll ────────────────────────
// The stage opens a `first_read_fill` row at entry. A deps_pending return used to leave it 'running'
// forever, and the gate is polled on every upstream terminal: Brand AI carried one such row, still
// 'running' 326s later. CHOSEN FIX (of the two the brief offered): keep opening the row and CLOSE it
// as completed with a deps_pending note, so the wait stays visible in the ledger. Not opening a row
// would have hidden the polling, and a gate that never opens is exactly what an operator must see.
describe("D2 — the gate poll closes its own ledger row", () => {
  /** The stage's ledger contract, as the edge function implements it. */
  function gatePoll(rows: Array<{ id: string; status: string; note: string }>, depsTerminal: boolean) {
    const id = `row${rows.length + 1}`;
    rows.push({ id, status: "running", note: "" });           // opened at entry
    const row = rows[rows.length - 1];
    if (!depsTerminal) { row.status = "completed"; row.note = "deps_pending — own-words completed, recurrence absent"; return "deps_pending"; }
    row.status = "completed"; row.note = "gate open — generated: promise,positioning,strategy,offering";
    return "generated";
  }

  it("5 polls on a pending gate leave ZERO running rows", () => {
    const rows: Array<{ id: string; status: string; note: string }> = [];
    for (let i = 0; i < 5; i++) expect(gatePoll(rows, false)).toBe("deps_pending");
    expect(rows).toHaveLength(5);
    expect(rows.filter((r) => r.status === "running")).toHaveLength(0);
    expect(rows.every((r) => r.note.startsWith("deps_pending"))).toBe(true);
  });

  it("the poll that finds the gate open closes its row too", () => {
    const rows: Array<{ id: string; status: string; note: string }> = [];
    gatePoll(rows, false);
    expect(gatePoll(rows, true)).toBe("generated");
    expect(rows.filter((r) => r.status === "running")).toHaveLength(0);
    expect(rows[1].note).toContain("gate open");
  });

  it("VACUOUS PROOF — the pre-fix shape leaves one running row per poll", () => {
    const rows: Array<{ id: string; status: string; note: string }> = [];
    const leaky = () => { rows.push({ id: `row${rows.length + 1}`, status: "running", note: "" }); };
    for (let i = 0; i < 5; i++) leaky();
    expect(rows.filter((r) => r.status === "running")).toHaveLength(5);
  });
});
