// GATEWAY RESUME (Gate B, 2026-09-09) — generalized from the gap-pairs 504 confirm-poll.
//
// WHY: a worker behind the Kong gateway can outrun its own response. The gateway cuts the CALLER at
// 150s; the worker isolate keeps going and writes its own integrity row when it finishes. Riverlane's
// own-words plan is the case that forced this: the caller was cut at 17:25:55.922 and recorded the
// stage FAILED, while the worker finished and wrote `first_read_own_words` status 'planned' with 7
// admitted at 17:26:24.777, 28.9s later. Because the caller had already given up, the mode:"write"
// call never fired and zero own_words claims were ever created.
//
// THE RULE: a gateway cut is UNKNOWN, never FAILED. On a cut, poll the component's integrity row for
// a terminal status; when one appears, run the follow-up action exactly once. If the bounded window
// closes with nothing observed, the outcome is 'exhausted' — still never 'failed', because the worker
// may yet be running and the next re-invoke's first-fill predicate reads the real artifact.
//
// Parameterized by component, terminal statuses and follow-up action so any stage behind the wall can
// use it: gap-pairs (terminal completed|skipped_empty_input, follow-up = none), own-words (terminal
// 'planned', follow-up = issue mode:"write").

/** The gateway's own cut codes. Anything else from the gateway is a real failure. */
export const GATEWAY_CUT_STATUSES = [504, 502, 408] as const;

export function isGatewayCut(status: number): boolean {
  return (GATEWAY_CUT_STATUSES as readonly number[]).includes(status);
}

export type GatewayResumeArgs<T> = {
  /** Read the most-recent integrity status for the component. Null when no row exists yet. */
  readStatus: () => Promise<string | null>;
  /** Statuses that mean the worker finished its phase server-side. */
  terminalStatuses: readonly string[];
  /** Run ONCE, when a terminal status is observed. Its return value is the resume's result. */
  followUp: (observedStatus: string) => Promise<T>;
  /** Total window. Default 10 minutes (operator-ruled for own-words). */
  budgetMs?: number;
  /** Gap between polls. Default 15s. */
  intervalMs?: number;
  /** Injected for tests — no real clock, no real timers. */
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
};

export type GatewayResumeOutcome<T> =
  | { outcome: "resumed"; polls: number; observedStatus: string; result: T }
  | { outcome: "exhausted"; polls: number; observedStatus: null; result: null };

/**
 * Poll for the worker's terminal, then run the follow-up EXACTLY ONCE.
 *
 * The first read is immediate — the worker has often already finished by the time the gateway cuts
 * the caller, so a resume frequently costs zero waiting. `polls` counts reads performed, so an
 * immediate hit is poll 1.
 */
export async function resumeAfterGatewayCut<T>(args: GatewayResumeArgs<T>): Promise<GatewayResumeOutcome<T>> {
  const budgetMs = args.budgetMs ?? 10 * 60_000;
  const intervalMs = args.intervalMs ?? 15_000;
  const now = args.now ?? (() => Date.now());
  const sleep = args.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const terminal = new Set(args.terminalStatuses);

  const deadline = now() + budgetMs;
  let polls = 0;
  for (;;) {
    polls++;
    const status = await args.readStatus();
    if (status !== null && terminal.has(status)) {
      // EXACTLY ONCE: the loop returns immediately after the single follow-up call.
      const result = await args.followUp(status);
      return { outcome: "resumed", polls, observedStatus: status, result };
    }
    if (now() + intervalMs > deadline) {
      return { outcome: "exhausted", polls, observedStatus: null, result: null };
    }
    await sleep(intervalMs);
  }
}
