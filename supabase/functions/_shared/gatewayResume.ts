// GATEWAY RESUME — a SELF-CHAINING STEPPER (Gate D, 2026-09-09).
//
// WHAT CAME BEFORE, AND WHY IT HAD TO CHANGE. Gate B made a gateway cut "unknown, never failed" by
// polling the worker's integrity row inside the CALLER's isolate. On Brand AI that worked and then
// cost everything after it: the own-words resume spent ~150s of the fill isolate's wall clock, the
// isolate was terminated 19s later, and gap-pairs, relevance, open-questions, finding-beats,
// recurrence and the score never ran at all. A wait that lives inside a caller is a wait charged to
// everything that caller still has to do.
//
// THE SHAPE NOW. One invocation performs ONE check and then returns. If the worker has not finished,
// the stepper banks its state on a `long_runner_runs` row and schedules its own re-invoke — the same
// mechanism market-discovery-step and recurrence-step already use. No invocation ever waits longer
// than a single check interval, so no isolate is held open across the wait, and the caller's chain
// continues the moment the resume-pending row exists.
//
// This module is the PURE core: the decision and the ledger shape. The edge function
// `gateway-resume-step` is the thin runtime around it.

/** The gateway's own cut codes. Anything else from the gateway is a real failure. */
export const GATEWAY_CUT_STATUSES = [504, 502, 408] as const;

export function isGatewayCut(status: number): boolean {
  return (GATEWAY_CUT_STATUSES as readonly number[]).includes(status);
}

/** Default bound: 10 minutes of checks, one every 15s (40 checks + the immediate first). */
export const RESUME_INTERVAL_MS = 15_000;
export const RESUME_BUDGET_MS = 10 * 60_000;
export const RESUME_MAX_CHECKS = Math.floor(RESUME_BUDGET_MS / RESUME_INTERVAL_MS) + 1; // 41

export type FetchLikeError = {
  message?: string | null; details?: string | null; name?: string | null;
  code?: string | number | null; status?: number | null;
} | null | undefined;

const TRANSIENT_STATUS = new Set([408, 425, 429, 499, 500, 502, 503, 504]);
const TRANSIENT_TEXT = [
  "failed to fetch", "networkerror", "network error", "load failed", "fetch failed",
  "connection closed", "socket hang up", "econnreset", "network request failed", "timeout", "timed out",
];

/** Is this the connection failing rather than the server answering? (Used by the browser retry too.) */
export function isTransientFetchError(error: FetchLikeError): boolean {
  if (!error) return false;
  const status = typeof error.status === "number" ? error.status : null;
  if (status !== null && TRANSIENT_STATUS.has(status)) return true;
  const code = typeof error.code === "number" ? error.code : Number(error.code);
  if (Number.isFinite(code) && TRANSIENT_STATUS.has(code)) return true;
  const text = `${String(error.message ?? "")} ${String(error.details ?? "")}`.toLowerCase();
  if (text.includes("abort")) return false;
  if (TRANSIENT_TEXT.some((t) => text.includes(t))) return true;
  return String(error.name ?? "").toLowerCase() === "typeerror";
}

/** Banked on the resume row's chain_state — everything a fresh isolate needs to continue. */
export type ResumeChainState = {
  /** integrity_runs.component the worker owns. */
  component: string;
  /** Statuses that mean the worker finished its phase. */
  terminalStatuses: string[];
  /** The edge function to POST when the terminal appears, and its body. */
  followUp: { fn: string; body: Record<string, unknown> } | null;
  /** Fired after the follow-up succeeds, so dependent stages can un-gate. */
  onDone: Array<{ fn: string; body: Record<string, unknown> }>;
  checks: number;
  maxChecks: number;
  intervalMs: number;
  /** Absolute wall for the whole resume. */
  deadlineIso: string;
  /** Applied when the terminal is observed — used to close a caller's own run row that the
   *  gateway cut left stranded (agent_flow_runs, 2026-09-09). */
  closeRow?: { table: string; id: string; patch: Record<string, unknown> } | null;
  /** Set once the follow-up has run, so a duplicate re-invoke can never fire it twice. */
  followUpFired: boolean;
};

export type ResumeDecision =
  | { action: "fire"; reason: "terminal_observed" }
  | { action: "reschedule"; reason: "not_yet"; nextCheck: number }
  | { action: "exhausted"; reason: "checks_exhausted" | "deadline_passed" }
  | { action: "noop"; reason: "already_fired" };

/**
 * ONE check, no waiting. Pure: the whole stepper's behaviour is decided here, so both sides of the
 * vacuous proof are exercised without a clock, a network or a database.
 */
export function resumeStepDecision(args: {
  observedStatus: string | null;
  state: Pick<ResumeChainState, "terminalStatuses" | "checks" | "maxChecks" | "followUpFired" | "deadlineIso">;
  now: number;
}): ResumeDecision {
  if (args.state.followUpFired) return { action: "noop", reason: "already_fired" };

  if (args.observedStatus !== null && args.state.terminalStatuses.includes(args.observedStatus)) {
    return { action: "fire", reason: "terminal_observed" };
  }
  // Bound by BOTH the check count and the wall — whichever binds first ends it.
  const nextCheck = args.state.checks + 1;
  if (nextCheck >= args.state.maxChecks) return { action: "exhausted", reason: "checks_exhausted" };
  if (args.now >= Date.parse(args.state.deadlineIso)) return { action: "exhausted", reason: "deadline_passed" };
  return { action: "reschedule", reason: "not_yet", nextCheck };
}

/** The note a resume-pending row carries, so the ledger reads honestly while it waits. */
export function resumePendingNote(component: string, checks: number, maxChecks: number): string {
  return `resume-pending: ${component} · check ${checks}/${maxChecks}`;
}

/** The note the caller's own stage row carries when it hands the wait off. */
export function resumeHandoffNote(component: string, status: number): string {
  return `gateway ${status}; resume handed to the stepper (${component}) — chain continues`;
}

/** Build the chain_state a fresh resume row starts from. */
export function newResumeState(args: {
  component: string;
  terminalStatuses: string[];
  followUp: { fn: string; body: Record<string, unknown> } | null;
  onDone?: Array<{ fn: string; body: Record<string, unknown> }>;
  closeRow?: { table: string; id: string; patch: Record<string, unknown> } | null;
  now?: number;
  intervalMs?: number;
  maxChecks?: number;
  budgetMs?: number;
}): ResumeChainState {
  const now = args.now ?? Date.now();
  const intervalMs = args.intervalMs ?? RESUME_INTERVAL_MS;
  return {
    component: args.component,
    terminalStatuses: args.terminalStatuses,
    followUp: args.followUp,
    onDone: args.onDone ?? [],
    closeRow: args.closeRow ?? null,
    checks: 0,
    maxChecks: args.maxChecks ?? RESUME_MAX_CHECKS,
    intervalMs,
    deadlineIso: new Date(now + (args.budgetMs ?? RESUME_BUDGET_MS)).toISOString(),
    followUpFired: false,
  };
}

/**
 * Hand a cut-off wait to the stepper: open the resume-pending row, dispatch ONE invocation, return.
 * The caller does not wait — that is the whole point of Gate D.
 */
export async function handOffToResumeStepper(args: {
  companyId: string;
  parentRunId?: string | null;
  state: ResumeChainState;
  /** Insert the row; returns its id. */
  openRow: (row: Record<string, unknown>) => Promise<string | null>;
  /** Fire-and-forget one gateway-resume-step invocation. */
  dispatch: (rowId: string) => void;
}): Promise<{ rowId: string | null }> {
  const row: Record<string, unknown> = {
    run_kind: "gateway_resume",
    company_id: args.companyId,
    status: "running",
    done_count: 0,
    chain_state: args.state,
    error_text: resumePendingNote(args.state.component, 0, args.state.maxChecks),
  };
  if (args.parentRunId) row.parent_run_id = args.parentRunId;
  const rowId = await args.openRow(row);
  if (rowId) args.dispatch(rowId);
  return { rowId };
}
