// ── First-read fill (pure enumeration + orchestration) ──────────────────────────────────────────
//
// FIRST-FILL AUTO-CHAIN (operator-signed 2026-09-01): after a successful public_baseline inside a
// full_refresh, this stage generates ONLY what has no current row — the 4 public-read kinds
// (positioning/strategy/promise/offering via generate-public-read, external+judged) and market
// discovery (self-chaining stepper, local). FIRST-FILL BY CONSTRUCTION: it enumerates MISSING kinds
// from the beats' own emptiness predicates and passes only those, so it can never supersede a current
// row — a company with current reads is a no-op (completed_empty). A kind's generation failure (or a
// judge/citation REJECT) is that kind's honest terminal, recorded per-kind; the parent full_refresh
// completes regardless. The first-read chain COMPONENTS (own-words, gap-pairs, questions, findings,
// relevance) are produced by the existing baseline→mojo-analysis chain, not here.
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
