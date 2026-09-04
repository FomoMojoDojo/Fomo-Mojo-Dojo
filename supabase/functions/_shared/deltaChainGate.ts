// ── FIRST-RUN GATE — public-only outside runs never fail on an absent declared side ──────────────
//
// Product law: a first "Run outside signals" run is PUBLIC-ONLY and must NOT require internal
// material. The delta (public vs declared) is meaningful only once BOTH sides exist. On a first
// run only the public side exists, so the absence of the declared side is an EARNED empty state
// ("we looked — there's nothing to hold it against yet"), NEVER a failure.
//
// Two pure decisions live here so the guard can exercise them with no I/O, and so the same rule is
// applied identically at both defense layers:
//
//   shouldChainDeltas   — CAUSE A. The baseline tail asks this BEFORE firing the delta stepper.
//                         No declared side ⇒ do not chain stage 2 at all; the full_refresh parent
//                         closes completed (public-only run finished). The declared-claim COUNT is
//                         queried locally, on the local side of the privacy boundary — this function
//                         only decides given that count.
//
//   classifyDeltaOutcome — CAUSE B (defense-in-depth). Even if some other caller reaches the
//                         stepper without a declared side, the worker now emits a machine-readable
//                         empty marker (skipped:"no_declared_claims") instead of a bare 404. This
//                         classifier maps that marker to "completed_empty" so the ledger reads
//                         completed-empty, never failed.

// The marker generate-claim-deltas now carries on the no-declared-side outcome. It rides the RESPONSE
// BODY (not just an HTTP status) so the empty signal survives the server-to-server hop that a bare
// 404 destroyed — a 404 is indistinguishable from a genuine worker failure.
export const NO_DECLARED_SIDE_MARKER = "no_declared_claims" as const;

// The completed-empty ledger text, written on BOTH the claim_deltas child and the full_refresh
// parent so a reader sees an earned empty state, not silence and not an error.
export const NO_DECLARED_SIDE_LEDGER_TEXT = "no declared side — nothing to compare yet" as const;

// CAUSE A. Chain stage 2 only when a delta is meaningful — i.e. a declared side exists to compare
// the public read against. `chain` is the caller's intent (client sends chain:true on every click);
// this gate is what makes that intent conditional on there being something to compare.
export function shouldChainDeltas(a: { chain: boolean; declaredClaimCount: number }): boolean {
  return a.chain && a.declaredClaimCount > 0;
}

// The no-declared-side outcome, however it is shaped, is detectable from the worker's response body.
// (Post-fix the worker returns it success-shaped with the marker; this also tolerates the marker
// appearing on a non-2xx body, so a partial rollout can never re-read the empty case as a failure.)
export function isNoDeclaredSide(data: { skipped?: unknown; empty?: unknown } | null | undefined): boolean {
  if (!data) return false;
  return data.skipped === NO_DECLARED_SIDE_MARKER || data.empty === true;
}

export type DeltaWorkerResponse = {
  ok: boolean;
  status: number;
  data: { ok?: unknown; skipped?: unknown; empty?: unknown } | null;
};

export type DeltaOutcome = "ok" | "completed_empty" | "deterministic_failure" | "transient";

// CAUSE B. Classify a generate-claim-deltas response into a terminal disposition for the stepper.
// "completed_empty" is checked FIRST so the earned empty state can never be mis-read as a failure,
// regardless of the HTTP status the worker attached to it. The 4xx set below mirrors the stepper's
// historic isDeterministicWorkerError (403 frozen / 404 no-claims-legacy / 422 empty-scope / 400)
// — those remain hard, non-retryable failures; only the empty marker is carved out.
export function classifyDeltaOutcome(res: DeltaWorkerResponse): DeltaOutcome {
  if (isNoDeclaredSide(res.data)) return "completed_empty";
  if (res.ok) return "ok";
  if (res.status === 403 || res.status === 404 || res.status === 422 || res.status === 400) {
    return "deterministic_failure";
  }
  return "transient";
}

// ── STEPPER GUARDS (operator rulings 2026-09-04) — pure, vitest-proven ──────────────────────────────────
/** The stepper attaches to a running row younger than this; older unfinished rows are abandoned (ruling 5). */
export const CHAIN_WINDOW_MS = 25 * 60_000;
/** Livelock guard (ruling 3): this many consecutive passes with `done` not advancing fails the row and stops. */
export const LIVELOCK_PASSES = 3;
export const LIVELOCK_LEDGER_TEXT = "livelock: plan yields work write refuses" as const;
export const ABANDON_LEDGER_TEXT = "abandoned: no finish within attach window" as const;

export type ChainState = { last_done: number; no_advance_passes: number };
/** Fold one pass into the chain state. `no_advance_passes` counts consecutive passes that observed the SAME `done`
 *  (the first observation counts as 1); an advancing `done` restarts the count at 1. LIVELOCK_PASSES consecutive
 *  observations of one value trip the guard — a stub that never advances fails on its 3rd pass, never a 4th. */
export function nextChainState(prev: ChainState | null | undefined, done: number): { state: ChainState; tripped: boolean } {
  if (!prev || done > prev.last_done) return { state: { last_done: done, no_advance_passes: 1 }, tripped: false };
  const passes = prev.no_advance_passes + 1;
  return { state: { last_done: done, no_advance_passes: passes }, tripped: passes >= LIVELOCK_PASSES };
}
/** The finalize-retry re-entry body — the pairing kind travels with it (ruling 4). */
export function finalizeRetryBody(company_id: string, parent_run_id: string | null, pairing_kind: "internal_vs_public" | "public_vs_public") {
  return { company_id, parent_run_id, pairing_kind };
}
/** Running, unfinished rows whose updated_at is older than the attach window (ruling 5). */
export function abandonedRunIds(rows: Array<{ id: string; status: string; finished_at: string | null; updated_at: string | null }>, nowMs: number): string[] {
  const cutoff = nowMs - CHAIN_WINDOW_MS;
  return rows.filter((r) => r.status === "running" && !r.finished_at && r.updated_at != null && Date.parse(r.updated_at) < cutoff).map((r) => r.id);
}

