// ── First-read fill (pure enumeration + orchestration) ──────────────────────────────────────────
//
// FIRST-FILL AUTO-CHAIN (operator-signed 2026-09-01): after a successful public_baseline inside a
// full_refresh, this stage generates ONLY what has no current row — the 4 public-read kinds
// (positioning/strategy/promise/offering via generate-public-read, external+judged) and market
// discovery (self-chaining stepper, local). FIRST-FILL BY CONSTRUCTION: it enumerates MISSING kinds
// from the beats' own emptiness predicates and passes only those, so it can never supersede a current
// row — a company with current reads is a no-op (completed_empty). A kind's generation failure (or a
// judge/citation REJECT) is that kind's honest terminal, recorded per-kind; the parent full_refresh
// completes regardless.
//
// The fill stage ALSO fills two first-read chain COMPONENTS that the baseline→mojo-analysis chain
// does NOT produce on a fresh create — own-words (extract-own-words, two-phase plan→write) and the
// public gap-pairs (generate-claim-deltas, pairing_kind='public_vs_public'). They run AFTER the
// public reads, in dependency order (own-words → gap-pairs), each first-fill-only and failure-
// isolated (runChainKinds below). Findings are auto-captured upstream in the baseline ingest
// (evidencePhase1); questions/relevance keep their own stages. (Corrects a prior comment that
// claimed own-words/gap-pairs were produced by the baseline chain — they were not.)
//
// Pure seam: every side effect is injected so the first-fill-only, failure-isolation, and no-op proofs
// run with fakes and no live models.

export const PUBLIC_READ_KINDS = ["positioning", "strategy", "promise", "offering"] as const;
export type PublicReadKind = (typeof PUBLIC_READ_KINDS)[number];

/** EMPTINESS PREDICATE (public reads): the kinds with NO current row — exactly what the beats read
 *  (useFirstReadPreviewData prByKind, is_current per kind). First-fill generates only these. */
export function missingPublicReadKinds(currentKinds: readonly string[]): PublicReadKind[] {
  const cur = new Set(currentKinds);
  return PUBLIC_READ_KINDS.filter((k) => !cur.has(k));
}

/** EMPTINESS PREDICATE (Who you serve): derived from the beat's observedMarkets query — a market def
 *  renders ONLY when market_register ∈ (public_inferred, publicly_declared) AND job_executor is
 *  non-empty. An internal_inferred-only company is EMPTY (matches Sonos's 1 internal def rendering
 *  empty). Never assume — this mirrors useFirstReadPreviewData's filter exactly. */
export function marketReadIsEmpty(
  defs: ReadonlyArray<{ market_register?: string | null; job_executor?: string | null }>,
): boolean {
  return !defs.some(
    (d) =>
      (d.market_register === "public_inferred" || d.market_register === "publicly_declared") &&
      !!String(d.job_executor ?? "").trim(),
  );
}

export type KindStatus = "completed" | "failed" | "completed_empty";
export type GenPerKind = Record<string, "written" | "rejected" | "error">;

export type FirstReadFillConfig = {
  missingKinds: PublicReadKind[]; // from missingPublicReadKinds(current)
  marketEmpty: boolean;           // from marketReadIsEmpty(defs)
  /** Generate ONLY the missing kinds through the normal judged path; returns per-kind written/rejected. */
  generatePublicRead: (kinds: PublicReadKind[]) => Promise<{ perKind: GenPerKind }>;
  /** Record one per-kind child ledger row (completed / failed / completed_empty when nothing missing). */
  recordKindLedger: (kind: string, status: KindStatus) => Promise<void>;
  /** Fire the market-discovery stepper (its own child ledger; outlives the parent). */
  fireMarketDiscovery: () => Promise<void>;
  /** Close the full_refresh parent completed (ownership: only when the delta stepper did NOT run). */
  closeParent?: () => Promise<void>;
};

export type FirstReadFillResult = {
  generated: PublicReadKind[];
  skipped: PublicReadKind[]; // already had a current row — never regenerated
  failed: PublicReadKind[];  // generation error or judge/citation reject
  marketFired: boolean;
  stageEmpty: boolean;       // true ⇒ nothing was missing (the completed_empty no-op)
};

/**
 * Run the first-read fill. Generates only missing kinds (never supersedes), records each kind's
 * terminal, fires market discovery when empty, and completes the parent regardless of kind failures.
 */
export async function runFirstReadFill(cfg: FirstReadFillConfig): Promise<FirstReadFillResult> {
  const generated: PublicReadKind[] = [];
  const skipped: PublicReadKind[] = [];
  const failed: PublicReadKind[] = [];

  // Kinds that already have a current row — recorded completed_empty (first-fill-only: never generated).
  const skippedKinds = PUBLIC_READ_KINDS.filter((k) => !cfg.missingKinds.includes(k));
  for (const k of skippedKinds) {
    await cfg.recordKindLedger(k, "completed_empty");
    skipped.push(k);
  }

  // Generate ONLY the missing kinds (one judged call), record each kind's terminal.
  if (cfg.missingKinds.length > 0) {
    let perKind: GenPerKind = {};
    let threw = false;
    try {
      const r = await cfg.generatePublicRead(cfg.missingKinds);
      perKind = r.perKind ?? {};
    } catch {
      threw = true; // the whole call failed — every missing kind is failed (isolated from the parent)
    }
    for (const k of cfg.missingKinds) {
      const st = threw ? undefined : perKind[k];
      if (st === "written") {
        await cfg.recordKindLedger(k, "completed");
        generated.push(k);
      } else {
        // rejected / error / absent (never retried — a reject is the kind's honest terminal)
        await cfg.recordKindLedger(k, "failed");
        failed.push(k);
      }
    }
  }

  // Market discovery — fired only when the beat is empty; a fire error is isolated (parent still completes).
  let marketFired = false;
  if (cfg.marketEmpty) {
    try {
      await cfg.fireMarketDiscovery();
      marketFired = true;
    } catch {
      /* isolated — never fails the parent */
    }
  }

  // The parent full_refresh completes regardless of any kind failure.
  if (cfg.closeParent) await cfg.closeParent();

  const stageEmpty = cfg.missingKinds.length === 0 && !cfg.marketEmpty;
  return { generated, skipped, failed, marketFired, stageEmpty };
}

// ── Chain kinds (own-words → public gap-pairs) ──────────────────────────────────────────────────
// The first-read COMPONENTS the fill stage now also fills, run AFTER the public reads. NOT
// generate-public-read kinds — each is its own producer (own-words is two-phase plan→write; the
// gap-pairs producer self-writes its integrity row). SEQUENTIAL BY CONSTRUCTION: the array order IS
// the dependency order — a step's run() is awaited before the next step begins, so public gap-pairs
// never starts while own-words is unstarted/running, and the deltas declared side is own-words when
// it exists rather than the weaker inference fallback.

// 'unconfirmed' is the honest fourth terminal for the public-delta 504 case: the worker isolate can
// outrun the gateway response and finish server-side (it owns its first_read_gap_pairs integrity row),
// so a gateway cut is NOT a failure. The edge maps 'unconfirmed' to a completed-status ledger row with
// an explicit note — never 'failed' — and the next re-invoke's first-fill check reads the real state
// from the integrity row / existing deltas, not this ledger.
export type ChainKindTerminal = "completed" | "completed_empty" | "failed" | "unconfirmed";

/**
 * After a gateway timeout (504/502/408) on the public-delta call, the worker may already have finished
 * server-side. Classify the fill terminal from the most-recent observed first_read_gap_pairs integrity
 * status. A conclusive row wins (completed/skipped → completed; failed → failed); an ABSENT/unknown row
 * is 'unconfirmed', NEVER 'failed' — the isolate may still be completing, and first-fill resolves truth
 * on the next re-invoke. Pure so the three timeout guards exercise it directly.
 */
export function classifyGapPairsAfterTimeout(
  integrityStatus: string | null | undefined,
): "completed" | "failed" | "unconfirmed" {
  if (integrityStatus === "completed" || integrityStatus === "skipped_empty_input") return "completed";
  if (integrityStatus === "failed") return "failed";
  return "unconfirmed";
}

/**
 * Map a chain-kind terminal to the long_runner_runs.status the ledger CHECK allows today
 * (running/completed/failed). STANDING LAW — a status the work hasn't earned is not a status:
 *   · 'unconfirmed' has no ledger value yet (a migration adding it is OWED). Until then it is written
 *     as the non-terminal 'running' — NEVER 'completed' (unearned) and NEVER 'failed' (the worker may
 *     have succeeded server-side). The explicit note carries the truth; a re-invoke's first-fill check
 *     resolves it from the integrity row.
 *   · completed_empty → completed (an earned looked-and-empty).
 */
export function chainKindLedgerStatus(terminal: ChainKindTerminal): "running" | "completed" | "failed" {
  if (terminal === "failed") return "failed";
  if (terminal === "unconfirmed") return "running"; // non-terminal placeholder; migration owed
  return "completed"; // completed | completed_empty
}

/** A chain-kind terminal is FINAL (sets finished_at) unless it is the unresolved 'unconfirmed'. */
export function chainKindIsTerminal(terminal: ChainKindTerminal): boolean {
  return terminal !== "unconfirmed";
}

/** One chain kind: a first-fill-only gate + the producer call(s) it guards. */
export type ChainKindStep = {
  kind: string; // ledger run_kind suffix → fr_<kind>
  /** FIRST-FILL-ONLY: true ⇒ the artifact already exists; skip (record completed_empty), never run. */
  alreadyPresent: () => Promise<boolean>;
  /** The producer call(s). Returns the kind's terminal + an optional human ledger note. */
  run: () => Promise<{ status: ChainKindTerminal; note?: string }>;
};

export type ChainKindOutcome = { kind: string; status: ChainKindTerminal | "skipped"; note?: string };

export type RunChainKindsDeps = {
  /** Record one per-kind child ledger row (run_kind fr_<kind>). completed_empty maps to completed. */
  recordChainLedger: (kind: string, status: ChainKindTerminal, note?: string) => Promise<void>;
};

/**
 * Run the chain kinds sequentially in dependency order (array order). Mirrors the public-read loop:
 * first-fill-only (skip an existing artifact) + failure isolation (a throw / failed terminal records
 * `failed` and the NEXT kind still runs). STRUCTURALLY INCAPABLE OF SUPERSEDING: when the presence
 * check itself throws, the step is recorded `failed` and its producer is NOT run — never risk
 * regenerating over an artifact whose absence could not be confirmed.
 */
export async function runChainKinds(steps: ChainKindStep[], deps: RunChainKindsDeps): Promise<ChainKindOutcome[]> {
  const outcomes: ChainKindOutcome[] = [];
  for (const step of steps) {
    // FIRST-FILL-ONLY. A presence-check throw is NOT treated as absent — record failed, do not run.
    let present: boolean;
    try {
      present = await step.alreadyPresent();
    } catch (e) {
      const note = `presence check failed: ${String((e as Error)?.message ?? e)}`.slice(0, 300);
      await deps.recordChainLedger(step.kind, "failed", note);
      outcomes.push({ kind: step.kind, status: "failed", note });
      continue;
    }
    if (present) {
      await deps.recordChainLedger(step.kind, "completed_empty", "already present — first-fill no-op");
      outcomes.push({ kind: step.kind, status: "skipped" });
      continue;
    }
    // RUN (isolated). A throw or a failed terminal is recorded; the next kind still runs.
    let status: ChainKindTerminal = "failed";
    let note: string | undefined;
    try {
      const r = await step.run();
      status = r.status;
      note = r.note;
    } catch (e) {
      note = `threw: ${String((e as Error)?.message ?? e)}`.slice(0, 300);
    }
    await deps.recordChainLedger(step.kind, status, note);
    outcomes.push({ kind: step.kind, status, note });
  }
  return outcomes;
}
