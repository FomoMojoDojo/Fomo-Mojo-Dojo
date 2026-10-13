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
  | "specific_softened";

/** V3 — a REFUSAL from inside `commit`, as opposed to a write that failed.
 *
 *  runKindsIsolated passes the guard through unchanged and records the row itself, so the check does
 *  NOT write its own integrity row: one refusal, one row, with the name the ruling gave it. Any other
 *  throw from commit stays `write_error`, because a genuine write failure is not a refusal and must
 *  not borrow a refusal's name. */
export class StageRefusal extends Error {
  constructor(
    readonly guard: Extract<PerKindGuard, "continuity_line_dropped" | "specific_softened">,
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
  judge: (kind: string, payload: Record<string, unknown>) => Promise<Record<string, unknown>>;
  /** The caller's existing accept expression, unchanged. */
  accepts: (kind: string, verdict: Record<string, unknown>) => boolean;
  /** Persist an accepted kind. Omit for dry-run/plan (accepted kinds are reported, nothing written). */
  commit?: (kind: string, payload: Record<string, unknown>, verdict: Record<string, unknown>) => Promise<void>;
  /** One integrity_runs row per kind: component first_read_public_read_<kind>. Never throws. */
  recordIntegrity?: (kind: string, row: { status: "completed" | "rejected"; guard?: string; detail?: string }) => Promise<void>;
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
    await deps.recordIntegrity?.(kind, { status: "rejected", guard, detail: full });
    outcomes.push({ kind, status: "rejected", guard, detail, payload, verdict });
  };

  // ── THE GATE SEQUENCE for one candidate payload, in the ruled order ─────────────────────────────
  // Extracted so the bounded re-ask can run it a second time WITHOUT any guard being skipped or
  // reordered: the re-ask is a second pass of the same gate, never a shortcut past it.
  type GateResult =
    | { outcome: "rejected"; guard: PerKindGuard; detail: unknown; payload: Record<string, unknown>; verdict: Record<string, unknown> | null }
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
      const g = await runGates(kind, payload);

      if (g.outcome === "rejected") {
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
