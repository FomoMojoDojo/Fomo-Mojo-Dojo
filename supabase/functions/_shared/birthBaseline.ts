// H4 (2026-09-09) — the outside baseline is owned by the SERVER, at the birth step's terminal.
//
// THE DEFECT: `public-baseline {chain:true}` was fired ONLY from the browser, unawaited, from the
// create-client dialog. Brand AI (9b664b66) shows what that costs: the company row, 14 integrity
// rows and 8 job steps all landed, and then nothing — zero baseline runs, zero long_runner_runs.
// `public-baseline` opens its parent ledger row on entry, so zero rows means the function was never
// entered at all. There is no server-side error to find, because nothing reached the server. One
// browser stumble at the wrong moment leaves a company permanently without an outside read.
//
// THE FIX: run-agent-flow (the birth step) fires it at its own terminal, with the service-role key.
// `verify_jwt` stays ON for public-baseline — the service-role JWT satisfies it.
//
// IDEMPOTENCE MATTERS HERE. run-agent-flow reaches its terminal on EVERY re-invoke, including the
// "already born" spine pre-check path that does no work at all. Firing unconditionally would start a
// baseline every time anyone re-ran the flow. The guard is the ledger itself: public-baseline opens
// a `long_runner_runs` row named 'public_baseline' at entry, so an existing row means the baseline
// has already been started for this company and this must not fire again.

export type BirthBaselineOutcome = {
  fired: boolean;
  reason: "fired" | "no_birth_terminal" | "baseline_already_started" | "fire_failed";
  detail?: string;
};

/**
 * Start the outside baseline after the birth step, at most once per company.
 *
 * `birthReachedTerminal` is the caller's own answer to "did the birth actually finish?". A run that
 * was cut, threw, or never got there passes false and nothing fires — a baseline generated from a
 * half-built spine would be worse than none.
 */
export async function maybeStartBaselineAfterBirth(args: {
  birthReachedTerminal: boolean;
  /** True when a `long_runner_runs` row with run_kind 'public_baseline' already exists. */
  hasBaselineRun: () => Promise<boolean>;
  fire: () => Promise<void>;
  log?: (message: string) => void;
}): Promise<BirthBaselineOutcome> {
  const log = args.log ?? (() => {});

  if (!args.birthReachedTerminal) {
    log("[birth-baseline] birth did not reach a terminal — not starting the baseline");
    return { fired: false, reason: "no_birth_terminal" };
  }

  if (await args.hasBaselineRun()) {
    // The re-invoke / already-born path lands here. Not an error — the baseline is already owned.
    log("[birth-baseline] a public_baseline ledger row already exists — skipping (idempotent)");
    return { fired: false, reason: "baseline_already_started" };
  }

  try {
    await args.fire();
    log("[birth-baseline] baseline started server-side from the birth terminal");
    return { fired: true, reason: "fired" };
  } catch (e) {
    // Isolated: the birth step's own response must never fail because the follow-on fire failed.
    const detail = (e as Error).message;
    log(`[birth-baseline] fire failed (isolated, birth response unaffected): ${detail}`);
    return { fired: false, reason: "fire_failed", detail };
  }
}
