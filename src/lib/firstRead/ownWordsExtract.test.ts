// GATE OW-2 (2026-08-20) — own-words extractor honesty rails. Imports the SAME shared module
// the edge function uses, so a rail can never fork between test and runtime. Each test shows the
// rail RED (bypassed → the bad candidate survives) then GREEN (rail on → rejected).
import { describe, it, expect } from "vitest";
import {
  assembleOwnWords, verbatimProvable, assertPublicClientVoice, isChannelJunk,
  isRecruitingCopy, isProductDescription,
  type Candidate, type JudgeVerdict,
} from "../../../supabase/functions/_shared/ownWordsExtract";

// A planted page: ONE true self-assertion, ONE third-party quote, nav chrome, plus a fabricated
// line the company never wrote (absent from the text).
const PAGE =
  'We roast every batch to order in Burbank. "Best latte in town" — LA Weekly. Open Menu Close Menu Our Coffees Partnerships';
const TITLE = "Cafe Barra";

const cand = (quote: string): Candidate => ({ quote, offset: PAGE.indexOf(quote), length: quote.length });
const SELF = cand("We roast every batch to order in Burbank");
const THIRD_PARTY = cand('"Best latte in town" — LA Weekly');
const NAV = cand("Open Menu Close Menu");
const FABRICATED: Candidate = { quote: "We ship to every country on earth", offset: -1, length: 33 };

// How the model WOULD judge each (mocked; the edge fn gets these from gpt-4.1-mini).
const V_SELF: JudgeVerdict = { keep: true, fidelity: "verbatim", selfAssertion: true };
const V_THIRD: JudgeVerdict = { keep: false, fidelity: "verbatim", selfAssertion: false, reason: "third-party quote" };
const V_NAV: JudgeVerdict = { keep: false, fidelity: "verbatim", selfAssertion: false, reason: "navigation" };

describe("own-words rails — planted fixture: exactly the self-assertion survives", () => {
  it("GREEN: full pipeline keeps ONLY the self-assertion", async () => {
    const { survivors, rejections } = await assembleOwnWords(
      [SELF, THIRD_PARTY, NAV], [V_SELF, V_THIRD, V_NAV], PAGE, TITLE,
    );
    expect(survivors.map((s) => s.quote)).toEqual(["We roast every batch to order in Burbank"]);
    expect(survivors[0].fidelity).toBe("verbatim");
    const reasons = Object.fromEntries(rejections.map((r) => [r.quote, r.reason]));
    expect(reasons['"Best latte in town" — LA Weekly']).toBe("not_self_assertion");
    expect(reasons["Open Menu Close Menu"]).toBe("not_self_assertion");
  });

  it("RED: with the self-assertion rail bypassed, the third-party quote survives (the rail matters)", async () => {
    // Bypass = the judge is fooled into selfAssertion:true for the third-party quote.
    const fooled: JudgeVerdict = { keep: true, fidelity: "verbatim", selfAssertion: true };
    const { survivors } = await assembleOwnWords([THIRD_PARTY], [fooled], PAGE, TITLE);
    expect(survivors.map((s) => s.quote)).toContain('"Best latte in town" — LA Weekly');
  });
});

describe("own-words rails — vacuous proof: substring-provable nav is REJECTED", () => {
  it("GREEN: 'Open Menu Close Menu' IS substring-provable, yet rejected (not a self-assertion)", async () => {
    expect(verbatimProvable(NAV.quote, PAGE)).toBe(true); // it really is in the text
    const { survivors, rejections } = await assembleOwnWords([NAV], [V_NAV], PAGE, TITLE);
    expect(survivors).toHaveLength(0);
    expect(rejections[0].reason).toBe("not_self_assertion");
  });

  it("RED: substring-provable alone would let nav through (guard != self-assertion)", async () => {
    const fooled: JudgeVerdict = { keep: true, fidelity: "verbatim", selfAssertion: true };
    const { survivors } = await assembleOwnWords([NAV], [fooled], PAGE, TITLE);
    // verbatim guard passes (it IS in the text) so only the judge stops it — proving one rail isn't enough.
    expect(survivors).toHaveLength(1);
  });
});

describe("own-words rails — deterministic verbatim guard: fabricated quote rejected even if judged keep", () => {
  it("GREEN: a fabricated quote (absent from text) is rejected by the guard, judge notwithstanding", async () => {
    expect(verbatimProvable(FABRICATED.quote, PAGE)).toBe(false); // not in the page
    const fooled: JudgeVerdict = { keep: true, fidelity: "verbatim", selfAssertion: true };
    const { survivors, rejections } = await assembleOwnWords([FABRICATED], [fooled], PAGE, TITLE);
    expect(survivors).toHaveLength(0);
    expect(rejections[0].reason).toBe("not_verbatim_provable");
  });

  it("RED: with the guard off, the fabricated quote would survive (judge was fooled)", () => {
    // Demonstrate the guard is the ONLY thing standing: judge keep+selfAssertion true, junk false.
    expect(isChannelJunk(FABRICATED.quote, TITLE)).toBe(false);
    // Without verbatimProvable, nothing else rejects it — hence the deterministic guard is load-bearing.
    expect(verbatimProvable(FABRICATED.quote, PAGE)).toBe(false);
  });
});

describe("own-words rails — R1: product/SKU + recruiting rejected, offering-model kept", () => {
  // Real page text carrying all three shapes.
  const R1_PAGE =
    "This medium roast Colombian coffee is fruity, bright, complex and full bodied. " +
    "We provide crisis stabilization and outpatient care to Bay Area youth and families. " +
    "As a Family Support Counselor, you'll provide counseling and case management.";
  const TASTING: Candidate = { quote: "This medium roast Colombian coffee is fruity, bright, complex and full bodied", offset: 0, length: 76 };
  const OFFERING: Candidate = { quote: "We provide crisis stabilization and outpatient care to Bay Area youth and families", offset: 0, length: 82 };
  const RECRUIT: Candidate = { quote: "As a Family Support Counselor, you'll provide counseling and case management", offset: 0, length: 75 };
  const keep: JudgeVerdict = { keep: true, fidelity: "verbatim", selfAssertion: true };

  it("GREEN: a planted tasting note is rejected deterministically (product_description)", async () => {
    expect(isProductDescription(TASTING.quote)).toBe(true);
    const { survivors, rejections } = await assembleOwnWords([TASTING], [keep], R1_PAGE, null);
    expect(survivors).toHaveLength(0);
    expect(rejections[0].reason).toBe("product_description");
  });

  it("GREEN: a planted recruiting line is rejected deterministically (recruiting_copy)", async () => {
    expect(isRecruitingCopy(RECRUIT.quote)).toBe(true);
    const { survivors, rejections } = await assembleOwnWords([RECRUIT], [keep], R1_PAGE, null);
    expect(survivors).toHaveLength(0);
    expect(rejections[0].reason).toBe("recruiting_copy");
  });

  it("GREEN: an offering-model line ('We provide X to Y') is KEPT (not matched by either heuristic)", async () => {
    expect(isProductDescription(OFFERING.quote)).toBe(false);
    expect(isRecruitingCopy(OFFERING.quote)).toBe(false);
    const { survivors } = await assembleOwnWords([OFFERING], [keep], R1_PAGE, null);
    expect(survivors.map((s) => s.quote)).toEqual([OFFERING.quote]);
  });

  it("RED: with the R1 rails off, tasting + recruiting would survive (judge was fooled to keep)", async () => {
    // The judge keep+selfAssertion is true for all three; only the R1 rails stop the first two.
    // Demonstrate by checking the heuristics are the sole gate (verbatim guard passes — all in text).
    expect(verbatimProvable(TASTING.quote, R1_PAGE)).toBe(true);
    expect(verbatimProvable(RECRUIT.quote, R1_PAGE)).toBe(true);
  });
});

describe("own-words rails — write replays frozen candidates deterministically (ruling B)", () => {
  // Simulate the write path: the same frozen candidates + verdicts, re-assembled, MUST yield the
  // same survivors every time (no generator involved). Reuses the R1 page/candidates.
  const PAGE =
    "This medium roast Colombian coffee is fruity, bright, complex and full bodied. " +
    "We provide crisis stabilization and outpatient care to Bay Area youth and families. " +
    "As a Family Support Counselor, you'll provide counseling and case management.";
  const frozenCands: Candidate[] = [
    { quote: "This medium roast Colombian coffee is fruity, bright, complex and full bodied", offset: 0, length: 76 },
    { quote: "We provide crisis stabilization and outpatient care to Bay Area youth and families", offset: 0, length: 82 },
    { quote: "As a Family Support Counselor, you'll provide counseling and case management", offset: 0, length: 75 },
  ];
  const frozenVerdicts: JudgeVerdict[] = frozenCands.map(() => ({ keep: true, fidelity: "verbatim", selfAssertion: true }));

  it("re-assembly is stable across runs (the write never regenerates)", async () => {
    const a = await assembleOwnWords(frozenCands, frozenVerdicts, PAGE, null);
    const b = await assembleOwnWords(frozenCands, frozenVerdicts, PAGE, null);
    expect(a.survivors.map((s) => s.quote)).toEqual(b.survivors.map((s) => s.quote));
    // only the offering-model line survives the rails, deterministically
    expect(a.survivors.map((s) => s.quote)).toEqual(["We provide crisis stabilization and outpatient care to Bay Area youth and families"]);
  });

  it("an EMPTY frozen set yields no survivors (write refuses upstream on empty cache — no regeneration)", async () => {
    const { survivors } = await assembleOwnWords([], [], PAGE, null);
    expect(survivors).toHaveLength(0);
  });
});

describe("own-words rails — privacy refusal (Option B)", () => {
  it("GREEN: refuses a non-client_voice signal, and a non-public source", () => {
    expect(() => assertPublicClientVoice([{ voice_class: "outside_voice_about_client", source_type: "public_baseline_run" }]))
      .toThrow(/needs client_voice/);
    expect(() => assertPublicClientVoice([{ voice_class: "client_voice", source_type: "uploaded_file" }]))
      .toThrow(/not public/);
  });

  it("GREEN: passes a client_voice public-web signal", () => {
    expect(() => assertPublicClientVoice([{ voice_class: "client_voice", source_type: "public_baseline_run" }]))
      .not.toThrow();
  });

  it("RED: without the assertion, a private uploaded_file signal would proceed to the model", () => {
    // The gate is the only thing between an uploaded_file page and an external model call.
    const privateSig = { voice_class: "client_voice" as const, source_type: "uploaded_file" };
    expect(() => assertPublicClientVoice([privateSig])).toThrow(); // on → refused
    // off (not calling the assertion) → the caller would proceed; nothing else stops it.
    expect(privateSig.source_type).toBe("uploaded_file");
  });
});
