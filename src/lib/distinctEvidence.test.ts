// SP-426 (2026-11-19) — the distinct-evidence identity, and the one property that matters most:
// a row with NO identity is NEVER folded with another.
import { describe, expect, it } from "vitest";
import { countDistinctEvidence, dedupeByContentIdentity, evidenceKey } from "./distinctEvidence";
import {
  signalContentIdentity,
  withContentIdentity,
  normalizeForHash,
} from "../../supabase/functions/_shared/contentIdentity.ts";
import { foldIdenticalSignals } from "../views/client/firstReadPreview/mapping";

describe("SP-426 — signalContentIdentity", () => {
  it("is normalizeForHash of the excerpt", () => {
    expect(signalContentIdentity({ evidence_excerpt: "  The Service   Went DOWN\n again " }))
      .toBe("the service went down again");
    expect(signalContentIdentity({ evidence_excerpt: "x" })).toBe(normalizeForHash("x"));
  });
  it("folds whitespace and case variants of one sentence to one identity", () => {
    const a = signalContentIdentity({ evidence_excerpt: "Outage again." });
    const b = signalContentIdentity({ evidence_excerpt: "outage   AGAIN." });
    const c = signalContentIdentity({ evidence_excerpt: "\tOutage\nagain.  " });
    expect(new Set([a, b, c]).size).toBe(1);
  });
  it("is NULL for a blank, whitespace-only, missing or non-string excerpt", () => {
    for (const row of [{ evidence_excerpt: "" }, { evidence_excerpt: "   \n\t " }, {}, { evidence_excerpt: 42 }, null, undefined]) {
      expect(signalContentIdentity(row as never)).toBeNull();
    }
  });
  it("does NOT fall back to claim_text — a different field must not create a false identity", () => {
    expect(signalContentIdentity({ evidence_excerpt: "", claim_text: "the lane sentence" } as never)).toBeNull();
  });
});

describe("SP-426 — withContentIdentity stamps a mint batch", () => {
  it("stamps every row and leaves an explicit value alone", () => {
    const out = withContentIdentity([
      { evidence_excerpt: "A  B" },
      { evidence_excerpt: "" },
      { evidence_excerpt: "ignored", content_identity: "set by the caller" },
    ]);
    expect(out[0].content_identity).toBe("a b");
    expect(out[1].content_identity).toBeNull();
    expect(out[2].content_identity).toBe("set by the caller");
  });
  it("does not mutate its input", () => {
    const rows = [{ evidence_excerpt: "A" }];
    withContentIdentity(rows);
    expect("content_identity" in rows[0]).toBe(false);
  });
});

describe("SP-426 — a NULL identity is never folded", () => {
  const rows = [
    { id: "r1", content_identity: "same sentence" },
    { id: "r2", content_identity: "same sentence" },
    { id: "r3", content_identity: null },
    { id: "r4", content_identity: null },
    { id: "r5", content_identity: "   " },
  ];
  it("keys a row with no identity on its own id", () => {
    expect(evidenceKey(rows[2])).toBe("id:r3");
    expect(evidenceKey(rows[4])).toBe("id:r5");
    expect(evidenceKey(rows[0])).toBe("ci:same sentence");
  });
  it("counts two identical sentences once, and three identity-less rows three times", () => {
    expect(countDistinctEvidence(rows)).toBe(4); // 1 folded pair + r3 + r4 + r5
  });
  it("is the pre-SP-426 row count when NOTHING carries an identity (CB1's state)", () => {
    const cb1 = [{ id: "a" }, { id: "b" }, { id: "c" }].map((r) => ({ ...r, content_identity: null }));
    expect(countDistinctEvidence(cb1)).toBe(cb1.length);
  });
  it("dedupe keeps the FIRST of each sentence, in order, and every identity-less row", () => {
    expect(dedupeByContentIdentity(rows).map((r) => r.id)).toEqual(["r1", "r3", "r4", "r5"]);
  });
});

describe("SP-426 — foldIdenticalSignals folds on the stored identity, host kept", () => {
  const mk = (id: string, text: string, host: string) => ({
    signal: { id, text, sourceTag: { label: "" }, eventDate: null, strength: "moderate" as const, provablyVerbatim: false, mentionCount: 1 },
    readDate: "2026-11-19", host,
  });
  it("folds a whitespace/case variant of the same sentence on the same host", () => {
    const out = foldIdenticalSignals([mk("a", "Outage again.", "x.com"), mk("b", "outage   AGAIN.", "x.com")] as never);
    expect(out).toHaveLength(1);
    expect(out[0].signal.mentionCount).toBe(2);
  });
  it("NEVER folds the same sentence across two hosts — recurrence across sources is the point", () => {
    const out = foldIdenticalSignals([mk("a", "Outage again.", "x.com"), mk("b", "Outage again.", "y.com")] as never);
    expect(out).toHaveLength(2);
  });
});
