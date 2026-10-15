// PER-KIND ISOLATION + REJECT VISIBILITY for generate-public-read (2026-09-09).
//
// WHY: the four public-read kinds (positioning / strategy / promise / offering) were generated,
// guarded and judged as ONE run, and every whole-run reject path returned before writing anything.
// A single bad citation on one kind therefore took all four down together, wrote no row, logged no
// line and left no integrity record — the Riverlane diagnostic (company 49435388…, 2026-09-09
// 17:23:25) could not name the guard that fired, because nothing was persisted or printed.
//
// WHAT THIS CHANGES: isolation and visibility ONLY. Every guard is the SAME function applied to the
// SAME payload with the same thresholds — `framingViolations`, `offeringStructureViolations`,
// `citationsLivePublic` and the caller's `citedRefs` are all injected/imported unchanged, and the
// accept expression is supplied by the caller. What changes is the SCOPE each guard runs at (one
// kind, not four) and the fact that a reject now emits a log line and an integrity row before the
// next kind runs.
//
// WHAT THIS DOES NOT CHANGE: no guard is added, removed, reordered or re-thresholded; no prompt is
// edited; nothing that was rejected before is accepted now on the same payload.
//
// ONE ADMISSION CONSEQUENCE, STATED HONESTLY: judging per kind means the judge no longer sees the
// other kinds in the same call, so criterion (c) CONSISTENCY can no longer compare kinds against
// each other — the judge prompt's own single-kind rule ("If only one kind is in this read, judge its
// internal consistency and set consistency_ok:true when coherent") takes over, and (b) PLAIN-SANITY
// self-reports true for the non-positioning kinds. That is inherent to per-kind judging, not a
// threshold edit. Cross-kind consistency is the one check isolation costs.

import {
  citationsLivePublic,
  framingViolations,
  offeringStructureViolations,
} from "./publicReadGuards.ts";
// C1-R: the guard string has ONE definition, in the module that throws it. stageContinuity does not
// import this file, so there is no cycle.
import { CONTINUITY_GUARD } from "./stageContinuity.ts";

/** The guard that rejected a kind. Mirrors the `rejected` strings the function already returned. */
export type PerKindGuard =
  | "generation_error"
  | "citation_outside_ledger"
  | "offering_structure"
  | "framing_vocab"
  | "citation_not_live_public"
  | "judge"
  | "write_error"
  // V3 (operator ruling, 2026-10-13): the two stage-time checks name their own refusals. They run
  // inside `commit`, and a bare throw from there was recorded as `write_error` with the real reason
  // demoted into `detail` — so a refusal produced TWO rows (the check's own, and this wrapper's
  // mislabelled one) and a reader scanning guards saw a write failure that never happened.
  | "continuity_line_dropped"
  // S1 (operator ruling, 2026-10-14): a record- or you-classed line asserting a specific that none of
  // its own cited rows carries verbatim. Deterministic, refused and never re-asked.
  | "record_specific_unsourced"
  | "specific_softened"
  // V1 (2026-10-13): a carried span's source text moved under it. Fail closed — the line is no
  // longer a carry, and must not be persisted on offsets into text that no longer says that.
  | "carried_span_drift";

/** V3 — a REFUSAL from inside `commit`, as opposed to a write that failed.
 *
 *  runKindsIsolated passes the guard through unchanged and records the row itself, so the check does
 *  NOT write its own integrity row: one refusal, one row, with the name the ruling gave it. Any other
 *  throw from commit stays `write_error`, because a genuine write failure is not a refusal and must
 *  not borrow a refusal's name. */
export class StageRefusal extends Error {
  constructor(
    readonly guard: Extract<PerKindGuard, "continuity_line_dropped" | "specific_softened" | "carried_span_drift">,
    /** The FULL refusal detail (V2): never a slice. `detailOf` caps the LOG line and the `error`
     *  column at 200 chars, but excluded_by_rule.detail stores this verbatim. */
    readonly detail: string,
  ) {
    super(`${guard}: ${detail}`);
    this.name = "StageRefusal";
  }
}

export type PerKindOutcome = {
  kind: string;
  status: "written" | "rejected";
  /** null on a written kind. */
  guard: PerKindGuard | null;
  /** Human-readable reason, already truncated to 200 chars by `detailOf`. */
  detail: string;
  payload: Record<string, unknown> | null;
  verdict: Record<string, unknown> | null;
};

export type PerKindDeps = {
  /** The caller's OWN citation-ref walker, injected so the guard is byte-identical to before. */
  citedRefs: (payload: unknown) => string[];
  /** Valid ledger ref tokens (uuidByRef keys). */
  validRefs: Set<string>;
  uuidByRef: Map<string, string>;
  provenances: Record<string, string>;
  liveness: Record<string, string>;
  generate: (kind: string) => Promise<Record<string, unknown>>;
  /** F1 (operator ruling, 2026-10-15): STAMP THE PAYLOAD IN FRONT OF THE GATES.
   *
   *  The class stamp — each citing field's class, refs and text, and the sourcing decision built on
   *  it — used to be computed inside `generate`, which runs ONCE, before the attempt loop. A re-ask
   *  replaces the payload, so every gate downstream then read a stamp computed for a DIFFERENT
   *  answer: C1/C1-S and C2 compared the predecessor against the refused attempt's lines, and the
   *  judge was handed the refused attempt's FIELD CLASSES. Wasabi's 8ef4dc7b staged that way — it
   *  dropped two still-sourced differentiators while C1 reported 6 of 6 continued, because the
   *  lines C1 was shown were attempt 1's (audit 10415 → 10416, discarded 10417).
   *
   *  THE STANDING RULE: one function stamps a payload; every gate reads that payload's stamp. This
   *  dep is that one function, and it is called HERE, at the head of the attempt loop, so no gate in
   *  any attempt can read a stamp computed for another payload. It may mutate the payload (the live
   *  record pass admits sourcing rows and appends their citations) — that is why it runs before the
   *  citation guards and not after. */
  stampPayload?: (kind: string, payload: Record<string, unknown>) => Promise<void> | void;
  judge: (kind: string, payload: Record<string, unknown>) => Promise<Record<string, unknown>>;
  /** The caller's existing accept expression, unchanged. */
  accepts: (kind: string, verdict: Record<string, unknown>) => boolean;
  /** Persist an accepted kind. Omit for dry-run/plan (accepted kinds are reported, nothing written). */
  commit?: (kind: string, payload: Record<string, unknown>, verdict: Record<string, unknown>) => Promise<void>;
  /** S1 (2026-10-14): the record/you sourcing gate, over the payload about to be judged. Returns
   *  the refusal detail, or null to pass. Deterministic: no model call, so a line the record does
   *  not support costs no judgment and cannot be cleared by one. */
  s1Refusal?: (kind: string, payload: Record<string, unknown>) => { detail: string } | null;
  /** N1c (operator ruling, 2026-10-14): ONE bounded re-ask on an S1/N1 refusal. The caller hands the
   *  model the refused specifics and names together with the ids of live pool rows that state each
   *  one verbatim, and returns a fresh payload — or null to let the refusal stand. CODE NEVER
   *  REWRITES A LINE: the model answers again, and the answer faces every gate from the top. */
  reaskOnSourcingRefusal?: (
    kind: string,
    payload: Record<string, unknown>,
    detail: string,
    /** C1-R (2026-10-15): WHICH refusal is being answered. `sourcing` is the S1/N1 gate before the
     *  judge; `continuity` is the C1-S drop raised inside commit. One re-ask serves both, because
     *  the budget is one per stage however the first attempt was refused. */
    because: "sourcing" | "continuity",
  ) => Promise<Record<string, unknown> | null>;
  /** V4 (2026-10-14): one integrity_runs row per kind, carrying the full refused payload and its
   *  citations. Component first_read_public_read_<kind>. Never throws. */
  recordIntegrity?: (kind: string, row: {
    status: "completed" | "rejected"; guard?: string; detail?: string;
    payload?: Record<string, unknown> | null;
  }) => Promise<void>;
  /** The reject log line. Called once per rejected kind, before the next kind runs. */
  onReject?: (kind: string, guard: PerKindGuard, detail: string) => void;
  /** BOUNDED RE-ASK (operator ruling, signed 2026-10-08). When `accepts` refuses and the caller
   *  judges the refusal to be the CLASS gate alone, it may return one rewritten payload carrying the
   *  refused specifics back to the model. The FULL gate then runs again in order — citations, offering
   *  structure, framing, live-public, judge, accepts — exactly as the slots layer re-asks on
   *  entailment. Returning null declines the re-ask, and the kind is rejected as before.
   *  ONE re-ask per kind, ever: the second answer is final. */
  reaskOnClassRefusal?: (
    kind: string,
    payload: Record<string, unknown>,
    verdict: Record<string, unknown>,
  ) => Promise<Record<string, unknown> | null>;
};

/** Reject detail, capped at the 200 chars the log line and the integrity row both carry. */
export function detailOf(value: unknown): string {
  const s = typeof value === "string" ? value : JSON.stringify(value ?? null);
  return String(s ?? "").slice(0, 200);
}

/** The reject log line, one shape for every guard and every caller. */
export function rejectLogLine(companyId: string, kind: string, guard: string, detail: string): string {
  return `[generate-public-read] reject company=${companyId} kind=${kind} guard=${guard} detail=${detailOf(detail)}`;
}

/**
 * Run generate → guards → judge → commit for each kind INDEPENDENTLY, in the order given.
 * A reject on one kind records that kind's rejected row and CONTINUES to the next kind; it never
 * short-circuits the others. Returns one outcome per kind, in the same order.
 */
export async function runKindsIsolated(
  kinds: readonly string[],
  deps: PerKindDeps,
): Promise<PerKindOutcome[]> {
  // F1: a gate that READS the stamp must not run unstamped. S1 used to take its own stamp, so it
  // worked whether or not the caller supplied one; now it reads fieldClasses, and a caller that
  // wires s1Refusal without stampPayload would hand it an empty stamp — S1 would find no fields and
  // pass every payload. That is a vacuous gate, which is worse than a missing one, so it refuses the
  // whole run here instead of silently clearing it.
  if (deps.s1Refusal && !deps.stampPayload) {
    throw new Error("runKindsIsolated: s1Refusal reads the class stamp, so stampPayload is required (F1)");
  }
  const outcomes: PerKindOutcome[] = [];

  const reject = async (
    kind: string,
    guard: PerKindGuard,
    detailValue: unknown,
    payload: Record<string, unknown> | null,
    verdict: Record<string, unknown> | null,
  ): Promise<void> => {
    // V2 (operator ruling, 2026-10-13): the INTEGRITY ROW carries the full detail; the log line and
    // the returned outcome keep the 200-char cap they have always had. A refusal that records a
    // slice of what it refused cannot be audited — the Oct 13 specific_softened row preserved only
    // the first 60 characters of the line it rejected, and the rest was unrecoverable because the
    // refusal happens before the payload is built.
    const detail = detailOf(detailValue);
    const full = typeof detailValue === "string" ? detailValue : detailOf(detailValue);
    deps.onReject?.(kind, guard, detail);
    // V4 (2026-10-14): the PAYLOAD travels to the audit row. It was already in hand here and went
    // only to the returned outcome, so a refused read's text died with the HTTP response — which is
    // why audit 10153 and 10190 record what was refused but not the words that were refused.
    await deps.recordIntegrity?.(kind, { status: "rejected", guard, detail: full, payload });
    outcomes.push({ kind, status: "rejected", guard, detail, payload, verdict });
  };

  // ── THE GATE SEQUENCE for one candidate payload, in the ruled order ─────────────────────────────
  // Extracted so the bounded re-ask can run it a second time WITHOUT any guard being skipped or
  // reordered: the re-ask is a second pass of the same gate, never a shortcut past it.
  type GateResult =
    | { outcome: "rejected"; guard: PerKindGuard; detail: unknown; payload: Record<string, unknown>; verdict: Record<string, unknown> | null;
        /** N1c: set only by the S1/N1 gate, so the loop knows this refusal is the re-askable one. */
        sourcingDetail?: string }
    | { outcome: "not_accepted"; verdict: Record<string, unknown> }
    | { outcome: "accepted"; verdict: Record<string, unknown> };

  const runGates = async (kind: string, payload: Record<string, unknown>): Promise<GateResult> => {
    // ── GUARD 1: every cited token resolves to a ledger ref ─────────────────────────────────────
    const bad = deps.citedRefs(payload).filter((ref) => !deps.validRefs.has(ref));
    if (bad.length) return { outcome: "rejected", guard: "citation_outside_ledger", detail: `bad_ids=${bad.join(",")}`, payload, verdict: null };

    // ── GUARD 2: offering structure (offering kind only) ────────────────────────────────────────
    if (kind === "offering") {
      const offViol = offeringStructureViolations(payload, deps.validRefs);
      if (offViol.length) return { outcome: "rejected", guard: "offering_structure", detail: JSON.stringify(offViol), payload, verdict: null };
    }

    // ── GUARD 3: framing vocabulary (a posit is a hypothesis, never a verdict) ──────────────────
    const framing = framingViolations({ [kind]: payload });
    if (framing.length) return { outcome: "rejected", guard: "framing_vocab", detail: JSON.stringify(framing), payload, verdict: null };

    // ── GUARD 4: every cited id is LIVE + PUBLIC in the ledger ─────────────────────────────────
    const citedUuids = [...new Set(
      deps.citedRefs(payload).map((ref) => deps.uuidByRef.get(ref)).filter((x): x is string => !!x),
    )];
    const livePublic = citationsLivePublic(citedUuids, deps.provenances, deps.liveness);
    if (!livePublic.ok) return { outcome: "rejected", guard: "citation_not_live_public", detail: `bad_ids=${livePublic.bad.join(",")}`, payload, verdict: null };

    // ── GUARD 5 (S1, 2026-10-14): record/you lines say only what their cited rows say ───────────
    // ORDER. After guards 1 and 4 because S1's question is "does this line's OWN cited row carry
    // the specific" — a citation that does not resolve, or is not live and public, must be refused
    // as that, not mis-reported as an unsourced specific. BEFORE the judge because the check is
    // deterministic and free: an unsourced specific then costs no model call, and a judge that
    // clears everything cannot clear a line it was never asked about. The carried lines are already
    // spliced into `payload` by this point, so they are tested here like any other line.
    const s1 = deps.s1Refusal?.(kind, payload) ?? null;
    if (s1) return { outcome: "rejected", guard: "record_specific_unsourced", detail: s1.detail, payload, verdict: null, sourcingDetail: s1.detail };

    // ── JUDGE (this kind alone) ────────────────────────────────────────────────────────────────
    let verdict: Record<string, unknown>;
    try {
      verdict = await deps.judge(kind, payload);
    } catch (e) {
      return { outcome: "rejected", guard: "judge", detail: `judge call failed: ${(e as Error).message}`, payload, verdict: null };
    }
    return deps.accepts(kind, verdict) ? { outcome: "accepted", verdict } : { outcome: "not_accepted", verdict };
  };

  for (const kind of kinds) {
    // ── GENERATE ───────────────────────────────────────────────────────────────────────────────
    let payload: Record<string, unknown>;
    try {
      payload = await deps.generate(kind);
    } catch (e) {
      await reject(kind, "generation_error", (e as Error).message, null, null);
      continue;
    }

    // AT MOST TWO attempts: the answer, and one re-ask when the class gate alone refused it.
    let reasked = false;
    for (;;) {
      // F1: THE STAMP, at the head of every attempt, on the payload this attempt will be judged on.
      // Nothing between here and the gates may re-stamp, and no gate may stamp for itself.
      await deps.stampPayload?.(kind, payload);
      const g = await runGates(kind, payload);

      if (g.outcome === "rejected") {
        // ── N1c: ONE bounded re-ask, and only on the S1/N1 refusal ──────────────────────────────
        // The same `reasked` flag the class re-ask uses, so a kind gets at most ONE second attempt
        // in total however it was refused — a second refusal stands. The fresh payload re-enters
        // runGates at the top, so citations, offering structure, framing, live-public, S1/N1 and the
        // judge all run again on it; nothing is skipped because the first answer had been seen.
        if (g.sourcingDetail !== undefined && !reasked && deps.reaskOnSourcingRefusal) {
          // The refusal is AUDITED before the retry, so both attempts leave a record.
          await deps.recordIntegrity?.(kind, { status: "rejected", guard: g.guard, detail: `${g.sourcingDetail} (attempt 1 of 2; re-asked)`, payload: g.payload });
          deps.onReject?.(kind, g.guard, detailOf(g.sourcingDetail));
          const next = await deps.reaskOnSourcingRefusal(kind, g.payload, g.sourcingDetail, "sourcing");
          if (next) { payload = next; reasked = true; continue; }
        }
        await reject(kind, g.guard, g.detail, g.payload, g.verdict);
        break;
      }

      if (g.outcome === "not_accepted") {
        if (!reasked && deps.reaskOnClassRefusal) {
          const next = await deps.reaskOnClassRefusal(kind, payload, g.verdict);
          if (next) { payload = next; reasked = true; continue; }   // second and FINAL attempt
        }
        await reject(kind, "judge", String(g.verdict.reason ?? JSON.stringify(g.verdict)), payload, g.verdict);
        break;
      }

      // ── COMMIT (absent on dry-run) ───────────────────────────────────────────────────────────
      if (deps.commit) {
        try {
          await deps.commit(kind, payload, g.verdict);
        } catch (e) {
          // V3: a REFUSAL keeps its own guard and its full detail; anything else is a write failure.
          const refusal = e instanceof StageRefusal ? e : null;
          // ── C1-R (operator ruling, 2026-10-15): A C1-S DROP GETS THE SAME SINGLE RE-ASK ───────
          // Audit 10378 refused Wasabi for dropping the still-sourced AI-products line while BOTH
          // its sourcing rows sat in the pool — and no re-ask fired, because N1c covered the S1/N1
          // gate only and C1 is raised here, inside commit, after the judge. Under C1 law that drop
          // is substitution and the refusal is right; what was missing was the second attempt. The
          // budget is unchanged: ONE re-ask per stage, the same `reasked` flag, so a stage refused
          // first by N1 and then by C1-S gets one attempt in total, not two.
          if (refusal?.guard === CONTINUITY_GUARD && !reasked && deps.reaskOnSourcingRefusal) {
            await deps.recordIntegrity?.(kind, { status: "rejected", guard: refusal.guard, detail: `${refusal.detail} (attempt 1 of 2, re-asked)`, payload });
            deps.onReject?.(kind, refusal.guard, detailOf(refusal.detail));
            const next = await deps.reaskOnSourcingRefusal(kind, payload, refusal.detail, "continuity");
            if (next) { payload = next; reasked = true; continue; }
          }
          await reject(
            kind,
            refusal ? refusal.guard : "write_error",
            refusal ? refusal.detail : (e as Error).message,
            payload, g.verdict,
          );
          break;
        }
      }
      await deps.recordIntegrity?.(kind, { status: "completed" });
      outcomes.push({ kind, status: "written", guard: null, detail: "", payload, verdict: g.verdict });
      break;
    }
  }

  return outcomes;
}
