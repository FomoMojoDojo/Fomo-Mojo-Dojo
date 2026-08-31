// FIRST-RUN EMPTY-DELTA GUARD — the public-only outside run must COMPLETE, never fail.
//
// Scenario under guard: a company with a public side and ZERO declared-side claims (the live
// Gotham Sports case — 10 public_observed claims, 0 internal_declared/client_attested) fires a
// first "Run outside signals" click. The pipeline must land:
//     public_baseline  → completed
//     full_refresh      → completed   (NOT failed)
//     claim_deltas      → completed-empty if it runs at all (NOT failed)
//
// Two layers enforce that, each with a pure decision this suite exercises directly, plus a
// source-level wiring proof that the two edge entry points actually CALL those decisions (the
// pure functions alone can't catch a reverted call site — the cascadeRouting suite sets the
// readFileSync precedent for this). Every assertion below MUST fail if its guard is reverted.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  shouldChainDeltas,
  classifyDeltaOutcome,
  isNoDeclaredSide,
  NO_DECLARED_SIDE_MARKER,
  NO_DECLARED_SIDE_LEDGER_TEXT,
} from "../../../supabase/functions/_shared/deltaChainGate.ts";

const readSrc = (rel: string) => readFileSync(resolve(process.cwd(), rel), "utf8");
// Count occurrences of an identifier — ≥2 proves it is both imported AND used at a call site,
// so the guard fails if the wiring branch is reverted even while the import lingers.
const occurrences = (src: string, token: string) => src.split(token).length - 1;
const LEDGER_CONST = "NO_DECLARED_SIDE_LEDGER_TEXT";

describe("CAUSE A — chain gate: a public-only first run never fires the delta stepper", () => {
  it("does NOT chain when there is no declared side (first run)", () => {
    // 0 declared claims = the Gotham first-run case → stage 2 is not meaningful → do not chain.
    expect(shouldChainDeltas({ chain: true, declaredClaimCount: 0 })).toBe(false);
  });

  it("DOES chain once a declared side exists (later runs — CB2/Edgewood are untouched)", () => {
    expect(shouldChainDeltas({ chain: true, declaredClaimCount: 1 })).toBe(true);
    expect(shouldChainDeltas({ chain: true, declaredClaimCount: 42 })).toBe(true);
  });

  it("never chains when the caller didn't ask to (chain:false)", () => {
    expect(shouldChainDeltas({ chain: false, declaredClaimCount: 99 })).toBe(false);
  });
});

describe("CAUSE B — completable empty terminal: the no-declared-side outcome is a completion", () => {
  it("classifies the worker's success-shaped empty marker as completed_empty", () => {
    // Post-fix worker body: success-shaped, carrying the marker, on a 200.
    expect(
      classifyDeltaOutcome({ ok: true, status: 200, data: { ok: true, skipped: NO_DECLARED_SIDE_MARKER, empty: true } }),
    ).toBe("completed_empty");
  });

  it("still classifies the empty marker as completed_empty even if it rides a non-2xx body", () => {
    // Defense-in-depth: a partial rollout must never re-read the earned empty state as a failure.
    expect(
      classifyDeltaOutcome({ ok: false, status: 404, data: { ok: false, skipped: NO_DECLARED_SIDE_MARKER } }),
    ).toBe("completed_empty");
  });

  it("leaves genuine deterministic failures (frozen/empty-scope) failing", () => {
    expect(classifyDeltaOutcome({ ok: false, status: 403, data: { ok: false } })).toBe("deterministic_failure");
    expect(classifyDeltaOutcome({ ok: false, status: 422, data: { ok: false } })).toBe("deterministic_failure");
  });

  it("leaves transient (5xx / network) failures retryable", () => {
    expect(classifyDeltaOutcome({ ok: false, status: 500, data: null })).toBe("transient");
    expect(classifyDeltaOutcome({ ok: false, status: 0, data: null })).toBe("transient");
  });

  it("a normal populated run stays ok", () => {
    expect(classifyDeltaOutcome({ ok: true, status: 200, data: { ok: true } })).toBe("ok");
  });

  it("isNoDeclaredSide reads either the skipped marker or the empty flag", () => {
    expect(isNoDeclaredSide({ skipped: NO_DECLARED_SIDE_MARKER })).toBe(true);
    expect(isNoDeclaredSide({ empty: true })).toBe(true);
    expect(isNoDeclaredSide({ skipped: "something_else" })).toBe(false);
    expect(isNoDeclaredSide({})).toBe(false);
    expect(isNoDeclaredSide(null)).toBe(false);
  });

  it("the shared ledger text is the earned-empty wording both layers stamp", () => {
    expect(NO_DECLARED_SIDE_LEDGER_TEXT).toBe("no declared side — nothing to compare yet");
  });
});

// ── WIRING PROOFS (source-level) — the two entry points MUST call the gate above ────────────────
// These fail against pre-fix code: today public-baseline chains unconditionally, refresh-deltas-step
// fails the empty outcome, and generate-claim-deltas destroys the empty signal with a bare 404.

describe("WIRING — public-baseline tail gates the chain (CAUSE A)", () => {
  const src = readSrc("supabase/functions/public-baseline/index.ts");
  it("asks shouldChainDeltas before firing the delta stepper", () => {
    expect(src).toContain("shouldChainDeltas");
  });
  it("closes the full_refresh parent as an earned completion when it does not chain", () => {
    // The parent-complete branch must carry the completed-empty ledger text (imported + used).
    expect(occurrences(src, LEDGER_CONST)).toBeGreaterThanOrEqual(2);
    expect(src).toContain('status: "completed"');
  });
});

describe("WIRING — generate-claim-deltas emits a machine-readable empty marker, not a bare 404 (CAUSE B)", () => {
  const src = readSrc("supabase/functions/generate-claim-deltas/index.ts");
  it("no longer destroys the empty signal with a 404 ok:false", () => {
    expect(src).not.toContain(`error: "no declared-side claims for this company" }, 404`);
  });
  it("returns the no-declared-side outcome success-shaped with the marker", () => {
    expect(src).toContain(`skipped: "${NO_DECLARED_SIDE_MARKER}"`);
    expect(src).toContain("empty: true");
  });
});

describe("WIRING — refresh-deltas-step classifies the empty outcome as completed, not failed (CAUSE B)", () => {
  const src = readSrc("supabase/functions/refresh-deltas-step/index.ts");
  it("uses the shared classifier", () => {
    expect(src).toContain("classifyDeltaOutcome");
  });
  it("finishes the empty outcome completed with the earned ledger text", () => {
    // The completed-empty short-circuit must carry the ledger text (imported + used) and finish
    // completed — not route through the deterministic-failure branch.
    expect(occurrences(src, LEDGER_CONST)).toBeGreaterThanOrEqual(2);
    expect(src).toContain(`finish("completed"`);
  });
});
