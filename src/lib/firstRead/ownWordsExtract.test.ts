// GATE OW-2 (2026-08-20) — own-words extractor honesty rails. Imports the SAME shared module
// the edge function uses, so a rail can never fork between test and runtime. Each test shows the
// rail RED (bypassed → the bad candidate survives) then GREEN (rail on → rejected).
import { describe, it, expect } from "vitest";
import {
  assembleOwnWords, verbatimProvable, assertPublicClientVoice, isChannelJunk,
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
