// SELF-ECHO GATE — reader guards (operator ruling 2026-09-03): "if it is them saying it on their own site
// that cannot be corroboration." A verdict pair whose observed side is backed by the company's own host
// (claim_deltas.observed_own_host, stamped at pairing) is omitted by the ONE shared admissibility
// predicate on every reader — no reader re-derives hosts. Proves, each failing if its branch is removed:
//   (a) isPairAdmissible: own-host ⇒ inadmissible regardless of relevance; clean ⇒ admissible; a relevance
//       strike is still inadmissible (the two rules compose);
//   (b) groupGapStatements: an own-host echoed pair never enters evidence, never earns 'echoed', and never
//       counts as a held echo ('reverifying'); the same pair with the marker false renders as evidence;
//   (c) assembleDeltaItems (Check act + export): an own-host echoed delta produces no item; clean ⇒ one item.
import { describe, expect, it } from "vitest";
import { isPairAdmissible } from "@/lib/firstRead/relevanceActive";
import { assembleDeltaItems, type DeltaInput } from "@/lib/firstRead/deltaItems";
import { groupGapStatements } from "./mapping";
import type { FRGapPair } from "./types";

const pair = (over: Partial<FRGapPair>): FRGapPair => ({
  id: "p", statementId: "s1", verdict: "confirmed",
  declared: "In this way our business relationships are mutually beneficial.",
  record: "In this way our business relationships are mutually beneficial.",
  sourceTag: { label: "cafebarra.com/partnerships · read August 7, 2026" }, eventDate: "2024-01-01",
  evidenceRank: 2, relevanceVerdict: "relevant", ...over,
});

describe("(a) isPairAdmissible — the one predicate", () => {
  it("own-host ⇒ inadmissible even when relevant; clean ⇒ admissible; relevance strike ⇒ inadmissible", () => {
    expect(isPairAdmissible({ relevanceVerdict: "relevant", observedOwnHost: true })).toBe(false);
    expect(isPairAdmissible({ relevanceVerdict: null, observedOwnHost: true })).toBe(false);
    expect(isPairAdmissible({ relevanceVerdict: "relevant", observedOwnHost: false })).toBe(true);
    expect(isPairAdmissible({ relevanceVerdict: null })).toBe(true);
    expect(isPairAdmissible({ relevanceVerdict: "orthogonal", observedOwnHost: false })).toBe(false);
  });
});

describe("(b) groupGapStatements — an own-host echo is not an echo", () => {
  it("own-host echoed pair: no evidence, statement reads 'unechoed' (not 'confirmed', not 'reverifying')", () => {
    const [st] = groupGapStatements([pair({ id: "own", observedOwnHost: true, heldEcho: true })]);
    expect(st.evidence).toHaveLength(0);
    expect(st.verdict).toBe("unechoed");
  });
  it("RED-half: the SAME pair with the marker false is evidence and earns 'confirmed'", () => {
    const [st] = groupGapStatements([pair({ id: "clean", observedOwnHost: false })]);
    expect(st.evidence.map((e) => e.id)).toEqual(["clean"]);
    expect(st.verdict).toBe("confirmed");
  });
  it("mixed: one own-host + one outside echo on the same statement ⇒ only the outside pair is evidence", () => {
    const [st] = groupGapStatements([
      pair({ id: "own", observedOwnHost: true }),
      pair({ id: "outside", observedOwnHost: false, sourceTag: { label: "lefrenchrooster.com/about-us · read September 2, 2026" } }),
    ]);
    expect(st.evidence.map((e) => e.id)).toEqual(["outside"]);
    expect(st.verdict).toBe("confirmed");
  });
});

describe("(c) assembleDeltaItems — the Check act and the export share the predicate", () => {
  const d = (over: Partial<DeltaInput>): DeltaInput => ({
    id: "d1", delta_type: "echoed", content_identity: "ci-1",
    declared_statement: "We close gaps in youth mental health care.",
    public_statement: "We close gaps in youth mental health care.",
    public_provenance: "public_observed", quote: null, quote_source_text: null, event_date: null, ...over,
  });
  it("own-host echoed delta ⇒ no item; the same delta with the marker false ⇒ one item", () => {
    expect(assembleDeltaItems([d({ observed_own_host: true })])).toHaveLength(0);
    expect(assembleDeltaItems([d({ observed_own_host: false })])).toHaveLength(1);
    expect(assembleDeltaItems([d({})])).toHaveLength(1); // legacy rows without the column stay admissible
  });
  it("publicly_silent is untouched by the marker (no observed side to be own-host)", () => {
    expect(assembleDeltaItems([d({ delta_type: "publicly_silent", public_statement: null, public_provenance: null, observed_own_host: true })])).toHaveLength(1);
  });
});
