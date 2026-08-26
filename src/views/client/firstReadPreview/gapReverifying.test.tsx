// Gate 3 (2026-08-26) — beat-4 display honesty: body-blank pairs (evidence held/superseded) are
// hidden not shown-blank; a statement that HAD a public echo but lost its evidence renders the
// REVERIFYING state (not the false "not echoed"); a genuinely publicly_silent statement stays
// unechoed; the STATUS DISPUTED chip is one-per-statement and only where there is visible evidence.
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { groupGapStatements } from "./mapping";
import { ActGap } from "./acts";
import { EMPTY_FIRST_READ, type FirstReadPreviewData, type FRGapPair, type FRGapStatement, type FRStatusConflict } from "./types";

function pair(over: Partial<FRGapPair> & Pick<FRGapPair, "id" | "statementId" | "verdict">): FRGapPair {
  return {
    declared: "We say something.",
    record: "A public source says it too.",
    sourceTag: { label: "example.com" },
    eventDate: "2026-06-01",
    evidenceRank: 3,
    ...over,
  };
}
const readWith = (gapStatements: FRGapStatement[]): FirstReadPreviewData => ({
  ...EMPTY_FIRST_READ,
  gapStatements,
  gapCounts: {
    contradicted: gapStatements.filter((s) => s.verdict === "contradicted").length,
    reverifying: gapStatements.filter((s) => s.verdict === "reverifying").length,
    unechoed: gapStatements.filter((s) => s.verdict === "unechoed").length,
    confirmed: gapStatements.filter((s) => s.verdict === "confirmed").length,
  },
});

describe("beat 4 — gate-3 display honesty (reverifying + chip dedup)", () => {
  it("1. a VISIBLE-evidence disputed pair renders as evidence and sets the statement chip", () => {
    const st = groupGapStatements([
      pair({ id: "v", statementId: "A", verdict: "contradicted", record: "The record disagrees.", sourceTag: { label: "yelp.com" }, statusDisputed: true }),
    ]);
    expect(st[0].verdict).toBe("contradicted");
    expect(st[0].evidence.map((e) => e.id)).toEqual(["v"]); // kept
    expect(st[0].statusDisputed).toBe(true);                 // chip set from the visible pair
  });

  it("2. a BODY-BLANK pair (record+sourceTag null, evidence held) disappears — never a blank scaffold", () => {
    const st = groupGapStatements([
      pair({ id: "blank", statementId: "A", verdict: "contradicted", record: null, sourceTag: null, statusDisputed: true }),
    ]);
    expect(st[0].evidence).toHaveLength(0);   // omitted, not shown-blank
    expect(st[0].statusDisputed).toBe(false); // no chip from an omitted pair
  });

  it("3. an EMPTIED statement (had a public echo, all evidence held) → REVERIFYING, not unechoed", () => {
    const st = groupGapStatements([
      pair({ id: "e1", statementId: "A", verdict: "confirmed", record: null, sourceTag: null }),
      pair({ id: "e2", statementId: "A", verdict: "contradicted", record: null, sourceTag: null }),
    ]);
    expect(st[0].verdict).toBe("reverifying"); // the record is NOT silent — we're re-checking
    expect(st[0].verdict).not.toBe("unechoed");
    expect(st[0].evidence).toHaveLength(0);
  });

  it("4. a genuinely publicly-silent statement → UNECHOED, not reverifying", () => {
    const st = groupGapStatements([
      pair({ id: "s1", statementId: "B", verdict: "unechoed", record: null, sourceTag: null }),
      pair({ id: "s2", statementId: "B", verdict: "unechoed", record: null, sourceTag: null }),
    ]);
    expect(st[0].verdict).toBe("unechoed"); // no public echo ever existed
    expect(st[0].verdict).not.toBe("reverifying");
  });

  it("5. ≤1 STATUS DISPUTED chip per statement (dedup); a reverifying statement contributes NOTHING to the client render", () => {
    // Statement A: 3 visible disputed pairs → exactly ONE chip (was 3 before dedup).
    // Statement B: emptied → reverifying → excluded from the client render entirely (2026-08-27).
    const st = groupGapStatements([
      pair({ id: "a1", statementId: "A", verdict: "contradicted", record: "r1", sourceTag: { label: "yelp.com" }, statusDisputed: true }),
      pair({ id: "a2", statementId: "A", verdict: "contradicted", record: "r2", sourceTag: { label: "yelp.com" }, statusDisputed: true }),
      pair({ id: "a3", statementId: "A", verdict: "contradicted", record: "r3", sourceTag: { label: "yelp.com" }, statusDisputed: true }),
      pair({ id: "b1", statementId: "B", verdict: "contradicted", declared: "Held statement B.", record: null, sourceTag: null, statusDisputed: true }),
    ]);
    expect(st.find((s) => s.statementId === "B")?.verdict).toBe("reverifying"); // DATA state intact
    const { container } = render(<ActGap read={readWith(st)} />);
    const chips = container.textContent?.match(/status disputed/gi) ?? [];
    expect(chips.length).toBe(1);                                      // A dedupes 3 → 1; B renders nothing
    expect(container.textContent?.toLowerCase()).not.toContain("re-verifying"); // B (reverifying) excluded
    expect(container.textContent).not.toContain("Held statement B.");  // B's declared text absent
  });

  const CONFLICT = { location: "Le French Rooster", matchKey: "le french rooster", question: "closed?", closed: [], open: [] };
  const readConflict = (gapStatements: FRGapStatement[]) => ({ ...readWith(gapStatements), statusConflicts: [CONFLICT] } as FirstReadPreviewData);

  it("6. coherence note is SUPPRESSED while reverifying > 0 (its 'nothing contradicted' claim would be false)", () => {
    // 1 reverifying + 1 unechoed; contradicted = 0; a live status conflict present.
    const st = groupGapStatements([
      pair({ id: "e", statementId: "A", verdict: "contradicted", record: null, sourceTag: null }), // → reverifying
      pair({ id: "s", statementId: "B", verdict: "unechoed", record: null, sourceTag: null }),      // → unechoed
    ]);
    const { container } = render(<ActGap read={readConflict(st)} />);
    expect(container.textContent?.toLowerCase()).not.toContain("nothing you've said publicly is contradicted");
  });

  it("6b. coherence note RETURNS when reverifying = 0 and contradicted = 0 (the clean state it was made for)", () => {
    const st = groupGapStatements([
      pair({ id: "s", statementId: "B", verdict: "unechoed", record: null, sourceTag: null }), // only unechoed → reverifying 0
    ]);
    const { container } = render(<ActGap read={readConflict(st)} />);
    expect(container.textContent?.toLowerCase()).toContain("nothing you've said publicly is contradicted");
  });

  it("7. reverifying statements are ABSENT from the client render — no note, no group, no declared text", () => {
    const st = groupGapStatements([
      pair({ id: "r1", statementId: "A", verdict: "contradicted", declared: "Claim one.", record: null, sourceTag: null }),
      pair({ id: "r2", statementId: "B", verdict: "confirmed", declared: "Claim two.", record: null, sourceTag: null }),
      pair({ id: "r3", statementId: "C", verdict: "contradicted", declared: "Claim three.", record: null, sourceTag: null }),
    ]);
    expect(st.every((s) => s.verdict === "reverifying")).toBe(true); // DATA state intact (all reverifying)
    const { container } = render(<ActGap read={readWith(st)} />);
    // Resolved-states-only (2026-08-27): none of these render on the client surface.
    expect(container.textContent?.toLowerCase()).not.toContain("re-verifying");
    for (const d of ["Claim one.", "Claim two.", "Claim three."])
      expect(container.textContent).not.toContain(d);
  });
});

// HELD-ECHO CARVE-OUT (2026-08-26) — a relevance verdict computed over held/walled evidence is
// PROVISIONAL: it cannot demote a held echo to record-silence. This is the exact defect the R3
// backstop run exposed (the 5 Square-ordering echoes, held on Uber Eats/Postmates, were judged
// orthogonal and fell to 'unechoed'). H1 is the load-bearing red/green; H2–H4 prove the fix is
// scoped (a VISIBLE orthogonal pair stays unechoed; visible evidence still wins; 0-held is inert).
describe("beat 4 — held echo counts as re-verifying regardless of provisional relevance", () => {
  it("H1. a HELD echo judged ORTHOGONAL renders REVERIFYING (FAILS without the carve-out → unechoed)", () => {
    const st = groupGapStatements([
      pair({ id: "h", statementId: "SQ", verdict: "confirmed", record: null, sourceTag: null, relevanceVerdict: "orthogonal", heldEcho: true }),
    ]);
    expect(st[0].verdict).toBe("reverifying");
    expect(st[0].verdict).not.toBe("unechoed");
    expect(st[0].evidence).toHaveLength(0); // held → no visible evidence pushed
  });

  it("H2. a VISIBLE active-backed ORTHOGONAL pair stays UNECHOED (scope: not over-broadened)", () => {
    const st = groupGapStatements([
      pair({ id: "o", statementId: "V", verdict: "confirmed", record: null, sourceTag: null, relevanceVerdict: "orthogonal", heldEcho: false }),
    ]);
    expect(st[0].verdict).toBe("unechoed"); // present-but-irrelevant, NOT held → not re-verifying
  });

  it("H3. MIXED (held-orthogonal + visible-relevant on one statement) → renders evidence, not falsely silent", () => {
    const st = groupGapStatements([
      pair({ id: "held", statementId: "M", verdict: "confirmed", record: null, sourceTag: null, relevanceVerdict: "orthogonal", heldEcho: true }),
      pair({ id: "vis", statementId: "M", verdict: "contradicted", record: "The record disagrees.", sourceTag: { label: "yelp.com" }, relevanceVerdict: "relevant" }),
    ]);
    expect(st[0].verdict).toBe("contradicted");             // visible relevant evidence wins
    expect(st[0].evidence.map((e) => e.id)).toEqual(["vis"]); // the held pair is never pushed as evidence
  });

  it("H4. Edgewood-shape (0 held) → identical to the relevance-only path (carve-out inert)", () => {
    const st = groupGapStatements([
      pair({ id: "c", statementId: "A", verdict: "contradicted", record: "r", sourceTag: { label: "yelp.com" }, relevanceVerdict: "relevant" }),
      pair({ id: "orth", statementId: "B", verdict: "confirmed", record: null, sourceTag: null, relevanceVerdict: "orthogonal" }), // no heldEcho
      pair({ id: "silent", statementId: "C", verdict: "unechoed", record: null, sourceTag: null }),
    ]);
    const byId = Object.fromEntries(st.map((s) => [s.statementId, s.verdict]));
    expect(byId).toEqual({ A: "contradicted", B: "unechoed", C: "unechoed" });
  });
});

// RESOLVED-STATES-ONLY CLIENT RENDER (operator ruling 2026-08-27) — the client gap beat shows only
// verdict rows with visible evidence and not-echoed rows; reverifying (held) rows are operator
// workbench, excluded from the client render, counts, and copy. The DATA state is unchanged.
describe("beat 4 — resolved-states-only client render", () => {
  it("R1. counts/standfirst reflect VISIBLE rows only — reverifying is never named (fails without the change)", () => {
    const st = groupGapStatements([
      pair({ id: "c", statementId: "C", verdict: "contradicted", record: "r", sourceTag: { label: "yelp.com" } }),
      pair({ id: "rv", statementId: "R", verdict: "confirmed", record: null, sourceTag: null, heldEcho: true, relevanceVerdict: "orthogonal" }), // → reverifying
      pair({ id: "u", statementId: "U", verdict: "unechoed", record: null, sourceTag: null }),
    ]);
    expect(st.find((s) => s.statementId === "R")?.verdict).toBe("reverifying"); // data state
    const t = render(<ActGap read={readWith(st)} />).container.textContent ?? "";
    expect(t).toContain("1 contradicted");
    expect(t).toContain("1 not echoed");
    expect(t.toLowerCase()).not.toContain("re-verifying"); // NOT named in the client standfirst
  });

  it("R2. coherence note stays SUPPRESSED while held contradictions exist in DATA (suppressed ≠ resolved)", () => {
    // 0 visible contradicted, but 1 held contradiction (reverifying) in data + a live status conflict.
    const st = groupGapStatements([
      pair({ id: "held", statementId: "H", verdict: "contradicted", record: null, sourceTag: null, heldEcho: true, relevanceVerdict: "orthogonal" }),
      pair({ id: "u", statementId: "U", verdict: "unechoed", record: null, sourceTag: null }),
    ]);
    expect(st.find((s) => s.statementId === "H")?.verdict).toBe("reverifying");
    const conflict = { location: "Le French Rooster", matchKey: "le french rooster", question: "closed?", closed: [], open: [] } as FRStatusConflict;
    const read = { ...readWith(st), statusConflicts: [conflict] } as FirstReadPreviewData;
    const t = render(<ActGap read={read} />).container.textContent?.toLowerCase() ?? "";
    expect(t).not.toContain("nothing you've said publicly is contradicted"); // keyed on DATA reverifying > 0
  });

  it("R3. not-echoed and verdict rows render unaffected", () => {
    const st = groupGapStatements([
      pair({ id: "c", statementId: "C", verdict: "contradicted", declared: "We are open.", record: "Closed since April.", sourceTag: { label: "yelp.com" } }),
      pair({ id: "u", statementId: "U", verdict: "unechoed", declared: "We roast on site.", record: null, sourceTag: null }),
    ]);
    const t = render(<ActGap read={readWith(st)} />).container.textContent ?? "";
    expect(t).toContain("We are open.");      // contradicted row renders
    expect(t).toContain("We roast on site."); // not-echoed row renders
  });

  it("R4. Edgewood-shape (0 reverifying) → every row renders; resolved-states-only is a no-op", () => {
    const st = groupGapStatements([
      pair({ id: "c", statementId: "A", verdict: "contradicted", declared: "Claim A.", record: "r", sourceTag: { label: "yelp.com" } }),
      pair({ id: "u", statementId: "B", verdict: "unechoed", declared: "Claim B.", record: null, sourceTag: null }),
    ]);
    expect(st.some((s) => s.verdict === "reverifying")).toBe(false);
    const t = render(<ActGap read={readWith(st)} />).container.textContent ?? "";
    expect(t).toContain("Claim A.");
    expect(t).toContain("Claim B.");
    expect(t).toContain("1 contradicted");
    expect(t).toContain("1 not echoed");
  });
});

// R4 (2026-08-27) — "Raised by the record": the reverse arrow renders active-backed record rows only,
// with real source tags and NO verdict chip; absent when the renderable set is empty.
import type { FRReverseRow } from "./types";
const readReverse = (rows: FRReverseRow[]): FirstReadPreviewData => ({ ...EMPTY_FIRST_READ, reverseRows: rows });
describe("beat 4 — Raised by the record (reverse arrow)", () => {
  const ROWS: FRReverseRow[] = [
    { id: "r1", statement: "4.8 Star Rating from 148 reviewers", sourceTag: { label: "chamberofcommerce.com · read Aug 2026" }, eventDate: "2026-01-01" },
    { id: "r2", statement: "a charming bakery and café that offers a delightful experience", sourceTag: { label: "restaurantji.com · read Aug 2026" }, eventDate: "2026-01-01" },
  ];

  it("renders the section with the record rows + source tags, a distinct sub-count, and NO verdict chip", () => {
    const t = render(<ActGap read={readReverse(ROWS)} />).container.textContent ?? "";
    expect(t.toLowerCase()).toContain("raised by the record");
    expect(t).toContain("4.8 Star Rating from 148 reviewers");
    expect(t).toContain("a charming bakery and café that offers a delightful experience");
    expect(t).toContain("chamberofcommerce.com");
    expect(t).toContain("2 raised by the record");                 // distinct sub-count, not merged into say-vs-see
    expect(t.toLowerCase()).not.toMatch(/\b(confirmed|contradicted|echoed|disputed)\b/); // unearned → no verdict chip
  });

  it("renders NOTHING when the renderable set is empty (Edgewood-shape / backstage-only)", () => {
    const t = render(<ActGap read={readReverse([])} />).container.textContent ?? "";
    expect(t.toLowerCase()).not.toContain("raised by the record");
  });

  it("a company with N renderable reverse rows renders all N — the feature is GENERAL, no company exception (Edgewood-shape)", () => {
    // Edgewood has 9 renderable reverse rows (BBB, Birdeye, Charity Navigator, Glassdoor, Niche, Yelp).
    // The feature applies to every company with active-backed internally_silent record — never scoped out.
    const rows: FRReverseRow[] = Array.from({ length: 9 }, (_, i) => ({
      id: `e${i}`, statement: `Edgewood record row ${i}`, sourceTag: { label: `host${i}.com` }, eventDate: "2026-01-01",
    }));
    const t = render(<ActGap read={readReverse(rows)} />).container.textContent ?? "";
    expect(t.toLowerCase()).toContain("raised by the record");
    expect(t).toContain("9 raised by the record");
    for (let i = 0; i < 9; i++) expect(t).toContain(`Edgewood record row ${i}`);
  });
});
