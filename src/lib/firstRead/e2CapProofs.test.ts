// E2 SINGLE-SENTENCE CAP 160 → 210 (operator ruling 2026-09-04), single-homed at E2_SINGLE_SENTENCE_MAX and read by BOTH
// sites (admission rail + claim-layer canonicalize). Vacuous proofs on the guard:
//   (i)  a 209-char generic filler sentence with no company reference PASSES the length rail and is refused by the judge
//        stub — the junk line is held by the judge, not by length;
//   (ii) a 210-char attribution sentence passes, a 211-char one fails e2_overbroad — the cap moved to 210 and no further;
//   (iii) the two real joe.coffee sentences (verbatim, 176 / 170 chars) pass the rail.
// Mapper: a 205-char outside statement mints a claim; a 211-char one does not. (ii)/(iii) RED at 160, GREEN at 210.
import { describe, expect, it } from "vitest";
import { admitOutsideEvidence } from "../../../supabase/functions/_shared/outsideEvidenceRegen";
import { E2_SINGLE_SENTENCE_MAX, E2_MULTI_SENTENCE_MAX } from "../evidenceCaps";
import { mapSignalsToClaimCandidates } from "../evidenceMappers";
import type { SignalDraft } from "../evidenceDomain";

const pad = (base: string, len: number) => { let s = base; const filler = " and every guest notices the difference in the small details of the room"; while (s.length < len - 1) s += filler; return s.slice(0, len - 1) + "."; };
const JOE1 = "This independent roastery has earned its stellar reputation by serving up exceptional espresso, delicious sandwiches, and irresistible desserts that keep neighbors coming back.";
const JOE2 = "Unlike chain coffee shops, this community favorite sources and roasts their beans with care, creating a warm gathering space where every visit feels personal and special.";
const FILLER_209 = pad("The atmosphere here is pleasant and the seating is comfortable for an afternoon visit with friends", 209);
const ATTR_210 = pad("Cafe Barra roasts every bean for Le French Rooster in Burbank and the partnership shows in each cup served to the neighborhood regulars who return each week", 210);
const ATTR_211 = pad("Cafe Barra roasts every bean for Le French Rooster in Burbank and the partnership shows in each cup served to the neighborhood regulars who return each week", 211);
/** Judge stub for (i): keeps a candidate only when it names a company anchor — the about-the-client rule, not length. */
const judgeStub = (text: string) => /cafe barra|le french rooster|roastery|roasts their beans/i.test(text);

describe("E2 cap constants", () => {
  it("single-sentence 210, multi-sentence 480 unchanged", () => { expect(E2_SINGLE_SENTENCE_MAX).toBe(210); expect(E2_MULTI_SENTENCE_MAX).toBe(480); });
});
describe("(i) junk line is the judge's, not the cap's", () => {
  it("209-char filler passes the length rail; the judge stub refuses it", () => {
    expect(FILLER_209.length).toBe(209);
    const v = admitOutsideEvidence(FILLER_209, `intro. ${FILLER_209} outro.`);
    expect(v.admit).toBe(true);
    expect(judgeStub(FILLER_209)).toBe(false);
  });
});
describe("(ii) the cap moved to 210 and no further", () => {
  it("210 passes, 211 fails e2_overbroad", () => {
    expect(ATTR_210.length).toBe(210); expect(ATTR_211.length).toBe(211);
    expect(admitOutsideEvidence(ATTR_210, `x. ${ATTR_210} y.`).admit).toBe(true);
    expect(admitOutsideEvidence(ATTR_211, `x. ${ATTR_211} y.`)).toEqual({ admit: false, reason: "e2_overbroad" });
  });
});
describe("(iii) the two joe.coffee sentences", () => {
  it("176 and 170 chars, verbatim in the body → admitted", () => {
    expect(JOE1.length).toBe(176); expect(JOE2.length).toBe(170);
    const body = `Welcome to Cafe Barra & Le French Rooster. ${JOE1} ${JOE2} Hours vary.`;
    expect(admitOutsideEvidence(JOE1, body)).toEqual({ admit: true, excerpt: JOE1 });
    expect(admitOutsideEvidence(JOE2, body)).toEqual({ admit: true, excerpt: JOE2 });
  });
});
describe("mapper (claim layer) reads the same constant", () => {
  const sig = (statement: string): SignalDraft & { id?: string } => ({
    company_id: "co", source_id: null, source_type: "outside_recrawl_regen", source_title: null, source_url: "https://joe.coffee/x", signal_band: "outside",
    evidence_type: "market_signal", claim_text: statement, evidence_excerpt: statement, topic: "outside_voice_signal", framework: null, directness: "direct",
    recency: "recent", framing_fit: "partial", structure_level: "extracted", validation_status: "directional", confidence_to_use: "medium",
    voice_class: "outside_voice_about_client", raw_payload: {},
  } as unknown as SignalDraft & { id?: string });
  const S205 = pad("Cafe Barra roasts every bean for Le French Rooster in Burbank and neighbors say the espresso and the pastries keep them returning to the counter each morning before work", 205);
  const S211 = pad("Cafe Barra roasts every bean for Le French Rooster in Burbank and neighbors say the espresso and the pastries keep them returning to the counter each morning before work", 211);
  it("205 mints a claim; 211 does not", () => {
    expect(S205.length).toBe(205); expect(S211.length).toBe(211);
    expect(mapSignalsToClaimCandidates("co", [sig(S205)], [])).toHaveLength(1);
    expect(mapSignalsToClaimCandidates("co", [sig(S211)], [])).toHaveLength(0);
  });
});
