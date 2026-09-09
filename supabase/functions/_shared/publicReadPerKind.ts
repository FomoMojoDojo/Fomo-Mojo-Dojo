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
  | "write_error";

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
    const detail = detailOf(detailValue);
    deps.onReject?.(kind, guard, detail);
    await deps.recordIntegrity?.(kind, { status: "rejected", guard, detail });
    outcomes.push({ kind, status: "rejected", guard, detail, payload, verdict });
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

    // ── GUARD 1: every cited token resolves to a ledger ref (was: whole-read FAIL LOUD) ─────────
    const bad = deps.citedRefs(payload).filter((ref) => !deps.validRefs.has(ref));
    if (bad.length) {
      await reject(kind, "citation_outside_ledger", `bad_ids=${bad.join(",")}`, payload, null);
      continue;
    }

    // ── GUARD 2: offering structure (offering kind only) ───────────────────────────────────────
    if (kind === "offering") {
      const offViol = offeringStructureViolations(payload, deps.validRefs);
      if (offViol.length) {
        await reject(kind, "offering_structure", JSON.stringify(offViol), payload, null);
        continue;
      }
    }

    // ── GUARD 3: framing vocabulary (a posit is a hypothesis, never a verdict) ──────────────────
    const framing = framingViolations({ [kind]: payload });
    if (framing.length) {
      await reject(kind, "framing_vocab", JSON.stringify(framing), payload, null);
      continue;
    }

    // ── GUARD 4: every cited id is LIVE + PUBLIC in the ledger ─────────────────────────────────
    const citedUuids = [...new Set(
      deps.citedRefs(payload).map((ref) => deps.uuidByRef.get(ref)).filter((x): x is string => !!x),
    )];
    const livePublic = citationsLivePublic(citedUuids, deps.provenances, deps.liveness);
    if (!livePublic.ok) {
      await reject(kind, "citation_not_live_public", `bad_ids=${livePublic.bad.join(",")}`, payload, null);
      continue;
    }

    // ── JUDGE (this kind alone) ────────────────────────────────────────────────────────────────
    let verdict: Record<string, unknown>;
    try {
      verdict = await deps.judge(kind, payload);
    } catch (e) {
      await reject(kind, "judge", `judge call failed: ${(e as Error).message}`, payload, null);
      continue;
    }
    if (!deps.accepts(kind, verdict)) {
      await reject(kind, "judge", String(verdict.reason ?? JSON.stringify(verdict)), payload, verdict);
      continue;
    }

    // ── COMMIT (absent on dry-run) ─────────────────────────────────────────────────────────────
    if (deps.commit) {
      try {
        await deps.commit(kind, payload, verdict);
      } catch (e) {
        await reject(kind, "write_error", (e as Error).message, payload, verdict);
        continue;
      }
    }
    await deps.recordIntegrity?.(kind, { status: "completed" });
    outcomes.push({ kind, status: "written", guard: null, detail: "", payload, verdict });
  }

  return outcomes;
}
