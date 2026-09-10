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
    expect(f).toEqual({ stale: true, reason: "claims_newer" });
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
    expect(f).toEqual({ stale: false, reason: "deltas_current" });
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
    expect(f).toEqual({ stale: false, reason: "no_claims" });
    expect(gapPairsAlreadyPresent(true, f)).toBe(true);   // unchanged behaviour
  });

  it("NO deltas ⇒ not stale, and presence already says run", () => {
    const f = gapPairsStaleness({ newestOwnWordsAt: CLAIMS_AT, newestDeltaAt: null });
    expect(f).toEqual({ stale: false, reason: "no_deltas" });
    expect(gapPairsAlreadyPresent(false, f)).toBe(false); // not present ⇒ run
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
