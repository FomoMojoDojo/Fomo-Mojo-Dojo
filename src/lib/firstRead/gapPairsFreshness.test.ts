// GAP-PAIRS FRESHNESS (2026-09-09) — a stale artifact must not be its own reason not to refresh.
//
// Riverlane's public-vs-public deltas were computed at 17:25:56 against ZERO own-words claims, so the
// step fell back to the weaker `inference` declared side. The 7 own-words claims landed at 20:55:06.
// Nothing recomputed, because `alreadyPresent` returned true on the mere existence of those deltas —
// the stale set blocked its own replacement, and the cold open has reported on one inferred claim
// ever since while seven verbatim self-descriptions sat unpaired.
import { describe, expect, it } from "vitest";
import {
  gapPairsAlreadyPresent, gapPairsStaleness,
} from "../../../supabase/functions/_shared/gapPairsFreshness.ts";

const CLAIMS_AT = "2026-09-09T20:55:06.828Z";  // Riverlane's own-words write
const DELTAS_AT = "2026-09-09T17:25:56.064Z";  // Riverlane's delta computation, 3.5h earlier

describe("freshness — claims NEWER than deltas ⇒ stale ⇒ the step runs", () => {
  it("Riverlane's exact timestamps are stale", () => {
    const f = gapPairsStaleness({ newestOwnWordsAt: CLAIMS_AT, newestDeltaAt: DELTAS_AT });
    expect(f).toMatchObject({ stale: true, reason: "claims_newer" });
    expect(f.newestOwnWordsAt).toBe(CLAIMS_AT); // the note shows its working
    expect(f.newestDeltaAt).toBe(DELTAS_AT);
    expect(gapPairsAlreadyPresent(true, f)).toBe(false); // present, but NOT skipped
  });

  it("one second newer is still newer", () => {
    const f = gapPairsStaleness({ newestOwnWordsAt: "2026-09-09T17:25:57.000Z", newestDeltaAt: DELTAS_AT });
    expect(f.stale).toBe(true);
    expect(gapPairsAlreadyPresent(true, f)).toBe(false);
  });
});

describe("freshness — claims OLDER than deltas ⇒ fresh ⇒ skipped, exactly as before", () => {
  it("deltas computed after the claims are current", () => {
    const f = gapPairsStaleness({ newestOwnWordsAt: DELTAS_AT, newestDeltaAt: CLAIMS_AT });
    expect(f).toMatchObject({ stale: false, reason: "deltas_current" });
    expect(gapPairsAlreadyPresent(true, f)).toBe(true); // present and fresh ⇒ skip
  });

  it("equal timestamps are NOT stale — only strictly newer claims re-run", () => {
    const f = gapPairsStaleness({ newestOwnWordsAt: DELTAS_AT, newestDeltaAt: DELTAS_AT });
    expect(f.stale).toBe(false);
    expect(gapPairsAlreadyPresent(true, f)).toBe(true);
  });

  it("this is one-directional: time passing never makes deltas stale, only a newer declared side", () => {
    // Deltas from months ago with claims older still — untouched.
    const f = gapPairsStaleness({ newestOwnWordsAt: "2026-01-01T00:00:00.000Z", newestDeltaAt: "2026-02-01T00:00:00.000Z" });
    expect(f.stale).toBe(false);
    expect(gapPairsAlreadyPresent(true, f)).toBe(true);
  });
});

describe("freshness — no claims / no deltas leave the existing guard's answer alone", () => {
  it("NO own-words claims ⇒ never stale (nothing to be out of date with)", () => {
    const f = gapPairsStaleness({ newestOwnWordsAt: null, newestDeltaAt: DELTAS_AT });
    expect(f).toMatchObject({ stale: false, reason: "no_claims" });
    expect(gapPairsAlreadyPresent(true, f)).toBe(true);   // unchanged behaviour
  });

  it("2a — claims but NO deltas ⇒ STALE even with a completed integrity row present", () => {
    // The hole this closes: presence can come from a `first_read_gap_pairs` integrity row rather than
    // from deltas. A company whose gap pairs ran early and found nothing to pair, then later gained
    // own-words claims, was skipped forever — the row said we looked, not that the looking is current.
    const f = gapPairsStaleness({ newestOwnWordsAt: CLAIMS_AT, newestDeltaAt: null });
    expect(f.stale).toBe(true);
    expect(f.reason).toBe("no_deltas_with_claims");
    expect(gapPairsAlreadyPresent(true, f)).toBe(false);  // completed row present → STILL runs
    expect(gapPairsAlreadyPresent(false, f)).toBe(false); // no row at all       → runs
  });

  it("neither ⇒ not stale", () => {
    expect(gapPairsStaleness({ newestOwnWordsAt: null, newestDeltaAt: null }).stale).toBe(false);
  });

  it("an unparseable timestamp never forces a recompute", () => {
    expect(gapPairsStaleness({ newestOwnWordsAt: "not-a-date", newestDeltaAt: DELTAS_AT }).stale).toBe(false);
  });
});

describe("VACUOUS PROOF — presence alone (the pre-fix guard) skips the stale set", () => {
  it("the old predicate would have skipped Riverlane; the new one does not", () => {
    const presenceOnly = (present: boolean) => present;               // the pre-fix shape
    const f = gapPairsStaleness({ newestOwnWordsAt: CLAIMS_AT, newestDeltaAt: DELTAS_AT });
    expect(presenceOnly(true)).toBe(true);                            // old: skip
    expect(gapPairsAlreadyPresent(true, f)).toBe(false);              // new: run
  });
});

// ── 2a — no-deltas-with-claims, and the ledger notes ─────────────────────────────────────────────
import { gapPairsFreshnessNote } from "../../../supabase/functions/_shared/gapPairsFreshness.ts";

describe("2a — presence from an integrity row alone never counts as fresh", () => {
  const CLAIMS = "2026-09-10T09:00:00.000Z";

  it("claims > 0, deltas = 0, COMPLETED row → runs", () => {
    const f = gapPairsStaleness({ newestOwnWordsAt: CLAIMS, newestDeltaAt: null });
    expect(gapPairsAlreadyPresent(true, f)).toBe(false);
  });

  it("claims > 0, deltas = 0, NO row → runs", () => {
    const f = gapPairsStaleness({ newestOwnWordsAt: CLAIMS, newestDeltaAt: null });
    expect(gapPairsAlreadyPresent(false, f)).toBe(false);
  });

  it("claims = 0, deltas = 0, skipped_empty_input row → SKIPPED (nothing to pair)", () => {
    const f = gapPairsStaleness({ newestOwnWordsAt: null, newestDeltaAt: null });
    expect(f.stale).toBe(false);
    expect(f.reason).toBe("no_claims");
    expect(gapPairsAlreadyPresent(true, f)).toBe(true);
  });

  it("VACUOUS PROOF — the pre-2a verdict treated no-deltas-with-claims as fresh", () => {
    const preFix = (newestDeltaAt: string | null) => newestDeltaAt === null; // old: "no_deltas" ⇒ fresh
    expect(preFix(null)).toBe(true);                                        // old: skip
    expect(gapPairsStaleness({ newestOwnWordsAt: CLAIMS, newestDeltaAt: null }).stale).toBe(true); // new: run
  });
});

describe("ledger notes show their working", () => {
  const C = "2026-09-09T20:55:06.828Z";
  const D = "2026-09-09T17:25:56.064Z";

  it("fresh — both timestamps, with the ≤ that decided it", () => {
    const f = gapPairsStaleness({ newestOwnWordsAt: D, newestDeltaAt: C });
    expect(gapPairsFreshnessNote(f)).toBe(
      `fresh — newest claim ${D} ≤ newest delta ${C}`,
    );
  });

  it("stale on a newer declared side — 'recomputed' plus both timestamps", () => {
    const f = gapPairsStaleness({ newestOwnWordsAt: C, newestDeltaAt: D });
    expect(gapPairsFreshnessNote(f)).toBe(
      `stale — recomputed · newest claim ${C} > newest delta ${D}`,
    );
  });

  it("stale on no-deltas-with-claims — names why a row is not evidence", () => {
    const f = gapPairsStaleness({ newestOwnWordsAt: C, newestDeltaAt: null });
    expect(gapPairsFreshnessNote(f)).toBe(
      `stale — recomputed · newest claim ${C}, no deltas yet (an integrity row is not evidence)`,
    );
  });

  it("no claims — fresh, and says so without pretending there was a comparison", () => {
    const f = gapPairsStaleness({ newestOwnWordsAt: null, newestDeltaAt: D });
    expect(gapPairsFreshnessNote(f)).toBe(`fresh — no own-words claims to pair (newest delta ${D})`);
  });
});

// ── re-entry on the own-words WRITE terminal ─────────────────────────────────────────────────────
// The declared side changing is what must re-open the question. The guard is the note: only a real
// write carries "wrote ", so a re-entry (whose own-words is always the already-present skip) cannot
// fire another one. Exactly one hop.
describe("re-entry fires on a write terminal, once, and never loops", () => {
  const shouldReEnter = (kind: string, note: string | undefined) =>
    kind === "own_words" && (note ?? "").includes("wrote ");

  it("a normal write terminal re-enters", () => {
    expect(shouldReEnter("own_words", "plan 7 · wrote 7")).toBe(true);
  });

  it("a gateway-resume write terminal re-enters", () => {
    expect(shouldReEnter("own_words", "resumed after gateway cut · plan 0 · wrote 201")).toBe(true);
  });

  it("a DUPLICATE terminal — the re-entry's own skip — does NOT re-enter again", () => {
    expect(shouldReEnter("own_words", "already present — first-fill no-op")).toBe(false);
  });

  it("a handed-off resume does not re-enter (nothing was written yet)", () => {
    expect(shouldReEnter("own_words", "gateway 504; resume handed to the stepper (first_read_own_words) — chain continues")).toBe(false);
  });

  it("an earned-empty write still re-enters — the run happened, the predicate decides", () => {
    expect(shouldReEnter("own_words", "plan 3 · wrote 0")).toBe(true);
  });

  it("no other kind re-enters", () => {
    for (const k of ["public_gap_pairs", "relevance_backstop", "open_questions", "signal_recurrence"]) {
      expect(shouldReEnter(k, "plan 7 · wrote 7")).toBe(false);
    }
  });
});
