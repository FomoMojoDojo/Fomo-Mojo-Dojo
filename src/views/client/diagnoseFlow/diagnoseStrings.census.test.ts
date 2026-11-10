// ── STRING CENSUS (step 7b, 2026-11-07) ─────────────────────────────────────────────────────────
//
// THE PROPERTY: every client-facing string the Diagnose flow can render appears in
// docs/diagnose-slice1-spec.md. Not "most" and not "the ones someone remembered to list" — the
// count assertion at the bottom fails the moment a key is added to strings.ts without being
// censused here, so the census cannot rot into a subset.
//
// HOW A SIGNED STRING WITH A VARIABLE IS CHECKED. Ruling G1 made {company} a variable inside signed
// strings, and the spec was written against Edgewood, so every function is resolved with
// company = "Edgewood". Computed numbers are normalised on BOTH sides: a digit run, the spec's bare
// `n` placeholder and its {a}/{b} become the same token, so "5 documents", "{n} documents" and
// "1 document" all check against the spec's own wording rather than against a guess.
//
// The companion test (diagnoseNoLiterals.census.test.ts) proves the screens hold no string of their
// own, which is what makes this file exhaustive rather than decorative.
import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { SHARED, WALK, SEND, WELCOME, W1, W2, W4, W5, W6, W7, W8, W9, HOME, SEEALL, poss, joinList, sentence } from "./strings";

const SPEC = path.resolve(__dirname, "../../../../docs/diagnose-slice1-spec.md");
const spec = fs.readFileSync(SPEC, "utf8");
const CO = "Edgewood"; // the name the spec is written against (G1)

/** Digits, the spec's bare `n`, its {a}/{b}, and the company name all collapse to one token on both
 *  sides. The company name matters because the spec BODY writes "Edgewood" while the G-rulings write
 *  "{company}" — the same signed string in two notations (G1), so both must reduce to one form. */
function norm(s: string): string {
  return s
    .replace(/Edgewood/g, "{company}")
    .replace(/\d+/g, "{n}")
    // Every single-letter placeholder the rulings use — {a} {b} {g} {h} {m} {u} — is one computed
    // number. N2 and N7 brought four more of them, so the rule is the shape, not a list.
    .replace(/\{[a-z]\}/g, "{n}")
    .replace(/(^|[\s·])n(?![A-Za-z0-9])/g, "$1{n}");
}
const specNorm = norm(spec);

/** Every string that may render, with the argument the spec itself uses for a placeholder. */
const CENSUS: ReadonlyArray<readonly [string, string]> = [
  // ── shared chrome ──
  ["SHARED.brand", SHARED.brand],
  ["SHARED.phaseSend", SHARED.phaseSend],
  ["SHARED.phaseVisit", SHARED.phaseVisit],
  ["SHARED.phaseApp", SHARED.phaseApp],
  ["SHARED.scoreLabel", SHARED.scoreLabel],
  // ── walk chrome ──
  ["WALK.whereTheseComeFrom", WALK.whereTheseComeFrom],
  ["WALK.writeItAs", WALK.writeItAs],
  ["WALK.example", WALK.example],
  ["WALK.onTheMap", WALK.onTheMap],
  ["WALK.back", WALK.back],
  ["WALK.add", WALK.add],
  ["WALK.save", WALK.save],
  ["WALK.cancel", WALK.cancel],
  ["WALK.blankIsAnAnswer", WALK.blankIsAnAnswer],
  ["WALK.fixingItem", WALK.fixingItem(3)],
  ["WALK.addedAtTheVisit", WALK.addedAtTheVisit],
  ["WALK.fixedAtTheVisit", WALK.fixedAtTheVisit],
  ["WALK.counter", WALK.counter(1, 9)],
  // ── Send ──
  ["SEND.eyebrow", SEND.eyebrow],
  ["SEND.h", SEND.h(CO)],
  ["SEND.lede", SEND.lede(CO)],
  ["SEND.dropHere", SEND.dropHere],
  ["SEND.dropActive", SEND.dropActive],
  ["SEND.dropHint", SEND.dropHint],
  ["SEND.sentSoFar", SEND.sentSoFar],
  ["SEND.stayHere", SEND.stayHere(CO)],
  ["SEND.received", SEND.received],
  ["SEND.whatHappensNext", SEND.whatHappensNext],
  ["SEND.whatHappensNextBody", SEND.whatHappensNextBody(CO)],
  ["SEND.whatHappensNextEmphasis", SEND.whatHappensNextEmphasis],
  ["SEND.next", SEND.next],
  // ── Welcome ──
  ["WELCOME.eyebrow", WELCOME.eyebrow(CO)],
  ["WELCOME.h", WELCOME.h(CO)],
  ["WELCOME.lede", WELCOME.lede(CO)],
  ["WELCOME.threeThings", WELCOME.threeThings(CO)],
  ["WELCOME.ringBaseTitle", WELCOME.ringBaseTitle(CO)],
  ["WELCOME.ringBaseBody", WELCOME.ringBaseBody(CO)],
  ["WELCOME.ringGoalTitle", WELCOME.ringGoalTitle(CO)],
  ["WELCOME.ringGoalBody", WELCOME.ringGoalBody(CO)],
  ["WELCOME.ringMarketTitle", WELCOME.ringMarketTitle(CO)],
  ["WELCOME.ringMarketBody", WELCOME.ringMarketBody(CO)],
  ["WELCOME.whereYouAre", WELCOME.whereYouAre],
  ["WELCOME.whereYouAreBody", WELCOME.whereYouAreBody],
  ["WELCOME.whatHappensNow", WELCOME.whatHappensNow],
  ["WELCOME.whatHappensNowEmphasis", WELCOME.whatHappensNowEmphasis],
  ["WELCOME.whatHappensNowBody", WELCOME.whatHappensNowBody(CO)],
  ["WELCOME.prefilled", WELCOME.prefilled],
  ["WELCOME.howItWorks", WELCOME.howItWorks],
  ["WELCOME.back", WELCOME.back],
  ["WELCOME.next", WELCOME.next],
  // ── W1 Documents ──
  ["W1.eyebrow", W1.eyebrow],
  ["W1.h", W1.h(CO)],
  ["W1.why", W1.why(CO)],
  ["W1.source", W1.source],
  ["W1.pattern", W1.pattern],
  ["W1.example", W1.example],
  ["W1.keep", W1.keep],
  ["W1.fix", W1.fix],
  ["W1.composer", W1.composer],
  ["W1.noneYet", W1.noneYet],
  ["W1.next", W1.next],
  ["W1.countDocuments(1)", W1.countDocuments(1)],
  ["W1.countDocuments(n)", W1.countDocuments(5)],
  ["W1.countAdded", W1.countAdded(4)],
  ["W1.countFailed", W1.countFailed(1)],
  ["W1.addedNothingYet", W1.addedNothingYet],
  ["W1.addedList", W1.addedList("{list}")],
  ["W1.kindPositioning", W1.kindPositioning],
  ["W1.kindGoals", W1.kindGoals],
  ["W1.kindGroups", W1.kindGroups(CO)],
  ["W1.kindRoutes", W1.kindRoutes],
  ["W1.notAdded", W1.notAdded],
  ["W1.couldNotOpen", W1.couldNotOpen],
  // ── W2 Base ──
  ["W2.eyebrow", W2.eyebrow],
  ["W2.h", W2.h(CO)],
  ["W2.whyStem", W2.whyStem(CO)],
  ["W2.whyEnd", W2.whyEnd],
  ["W2.source", W2.source(CO)],
  ["W2.pattern", W2.pattern(CO)],
  ["W2.example", W2.example],
  ["W2.keep", W2.keep(CO)],
  ["W2.fix", W2.fix],
  ["W2.composer", W2.composer],
  ["W2.noneYet", W2.noneYet(CO)],
  ["W2.next", W2.next],
  ["W2.partPromise", W2.partPromise],
  ["W2.partPositioning", W2.partPositioning],
  ["W2.partStrategy", W2.partStrategy],
  ["W2.partServes", W2.partServes(CO)],
  // ── W4 Problems ──
  ["W4.eyebrow", W4.eyebrow],
  ["W4.h", W4.h],
  ["W4.why", W4.why(CO)],
  ["W4.source", W4.source],
  ["W4.pattern", W4.pattern],
  ["W4.example", W4.example],
  ["W4.keep", W4.keep],
  ["W4.fix", W4.fix],
  ["W4.composer", W4.composer],
  ["W4.noneYet", W4.noneYet],
  ["W4.next", W4.next],
  // ── W5 Goals ──
  ["W5.eyebrow", W5.eyebrow],
  ["W5.h", W5.h(CO)],
  ["W5.why", W5.why(CO)],
  ["W5.source", W5.source],
  ["W5.pattern", W5.pattern],
  ["W5.example", W5.example],
  ["W5.keep", W5.keep],
  ["W5.fix", W5.fix],
  ["W5.composer", W5.composer],
  ["W5.noneYet", W5.noneYet],
  ["W5.next", W5.next],
  ["W5.knowItWorked", W5.knowItWorked(CO)],
  ["W5.knowItWorkedPlaceholder", W5.knowItWorkedPlaceholder],
  ["W5.today", W5.today],
  ["W5.fixedLabel", W5.fixedLabel],
  ["W5.whatsFixed", W5.whatsFixed],
  // ── W6 Market ──
  ["W6.eyebrow", W6.eyebrow],
  ["W6.h", W6.h(CO)],
  ["W6.why", W6.why(CO)],
  ["W6.source", W6.source],
  ["W6.pattern", W6.pattern],
  ["W6.example", W6.example],
  ["W6.keep", W6.keep],
  ["W6.fix", W6.fix],
  ["W6.composer", W6.composer],
  ["W6.noneYet", W6.noneYet],
  ["W6.next", W6.next],
  ["W6.tryingTo", W6.tryingTo],
  ["W6.roleRecipients", W6.roleRecipients],
  ["W6.roleReferrers", W6.roleReferrers],
  ["W6.roleFunders", W6.roleFunders],
  ["W6.rolePartners", W6.rolePartners],
  ["W6.roleUsers", W6.roleUsers],
  ["W6.sourceOutside", W6.sourceOutside],
  ["W6.sourceDocuments", W6.sourceDocuments(CO)],
  // ── W7 Initiatives ──
  ["W7.eyebrow", W7.eyebrow],
  ["W7.h", W7.h(CO)],
  ["W7.why", W7.why(CO)],
  ["W7.source", W7.source],
  ["W7.pattern", W7.pattern],
  ["W7.example", W7.example],
  ["W7.keep", W7.keep],
  ["W7.fix", W7.fix],
  ["W7.composer", W7.composer],
  ["W7.noneYet", W7.noneYet],
  ["W7.next", W7.next],
  ["W7.betsThat", W7.betsThat],
  // ── W8 Hypotheses ──
  ["W8.eyebrow", W8.eyebrow],
  ["W8.h", W8.h(CO)],
  ["W8.why", W8.why(CO)],
  ["W8.source", W8.source],
  ["W8.pattern", W8.pattern],
  ["W8.example", W8.example],
  ["W8.keep", W8.keep],
  ["W8.fix", W8.fix],
  ["W8.composer", W8.composer],
  ["W8.noneYet", W8.noneYet],
  ["W8.next", W8.next],
  ["W8.wrongIf", W8.wrongIf],
  ["W8.wrongIfBody", W8.wrongIfBody],
  // ── W9 Who to hear ──
  ["W9.eyebrow", W9.eyebrow],
  ["W9.h", W9.h],
  ["W9.why", W9.why(CO)],
  ["W9.source", W9.source(CO)],
  ["W9.pattern", W9.pattern],
  ["W9.example", W9.example],
  ["W9.keep", W9.keep],
  ["W9.fix", W9.fix],
  ["W9.composer", W9.composer],
  ["W9.noneYet", W9.noneYet],
  ["W9.next", W9.next],
  ["W9.nameNeeded", W9.nameNeeded],
  ["W9.interviewSource", W9.interviewSource("[date]")],
  // ── MH1 Home ──
  ["HOME.walkThrough", HOME.walkThrough],
  ["HOME.theFirstRead", HOME.theFirstRead],
  ["HOME.seeAll", HOME.seeAll],
  ["HOME.now", HOME.now],
  ["HOME.dojo", HOME.dojo],
  ["HOME.addNav", HOME.addNav],
  ["HOME.addToTheMap", HOME.addToTheMap],
  ["HOME.addDocument", HOME.addDocument],
  ["HOME.addDocumentBody", HOME.addDocumentBody],
  ["HOME.addPerson", HOME.addPerson],
  ["HOME.addPersonBody", HOME.addPersonBody],
  ["HOME.whatChanged", HOME.whatChanged],
  ["HOME.title", HOME.title(CO)],
  ["HOME.lede", HOME.lede],
  ["HOME.segBefore", HOME.segBefore],
  ["HOME.segToday", HOME.segToday],
  ["HOME.segAhead", HOME.segAhead],
  ["HOME.before", HOME.before],
  ["HOME.ahead", HOME.ahead],
  ["HOME.firstReadCard", HOME.firstReadCard],
  ["HOME.firstReadNote", HOME.firstReadNote],
  ["HOME.documentsInCard", HOME.documentsInCard],
  ["HOME.documentsInNote", HOME.documentsInNote(5, 4)],
  ["HOME.todayHere", HOME.todayHere(CO)],
  ["HOME.todayColumn", HOME.todayColumn],
  ["HOME.pager", HOME.pager(1, 4)],
  ["HOME.card1Title", HOME.card1Title],
  ["HOME.card1H", HOME.card1H],
  ["HOME.card1Body(1)", HOME.card1Body(1, CO)],
  ["HOME.card1Body(n)", HOME.card1Body(2, CO)],
  ["HOME.card1Cta", HOME.card1Cta],
  ["HOME.card3Title", HOME.card3Title(CO)],
  ["HOME.card3H", HOME.card3H],
  ["HOME.card3Body", HOME.card3Body],
  ["HOME.card3Cta", HOME.card3Cta],
  ["HOME.rowBase", HOME.rowBase],
  ["HOME.rowBaseState", HOME.rowBaseState],
  ["HOME.rowBaseNote", HOME.rowBaseNote(2, 4)],
  ["HOME.rowGoal", HOME.rowGoal],
  ["HOME.rowNotYet", HOME.rowNotYet],
  ["HOME.rowGoalNote(1)", HOME.rowGoalNote(1)],
  ["HOME.rowGoalNote(n)", HOME.rowGoalNote(3)],
  ["HOME.rowMarket", HOME.rowMarket],
  ["HOME.rowMarketNote", HOME.rowMarketNote],
  ["HOME.card4Title", HOME.card4Title],
  ["HOME.card4H", HOME.card4H],
  ["HOME.card4Body", HOME.card4Body(CO)],
  ["HOME.card4Cta", HOME.card4Cta],
  ["HOME.inFocus", HOME.inFocus],
  ["HOME.focusDocuments", HOME.focusDocuments],
  ["HOME.focusInterviews", HOME.focusInterviews],
  ["HOME.focusBase", HOME.focusBase],
  ["HOME.focusGoals", HOME.focusGoals],
  ["HOME.focusMarket", HOME.focusMarket],
  ["HOME.needsClient", HOME.needsClient(CO)],
  ["HOME.focusInterviewsNamed(1)", HOME.focusInterviewsNamed(1)],
  ["HOME.focusInterviewsNamed(n)", HOME.focusInterviewsNamed(2)],
  ["HOME.focusInterviewsUnnamed(1)", HOME.focusInterviewsUnnamed(1)],
  ["HOME.focusInterviewsUnnamed(n)", HOME.focusInterviewsUnnamed(2)],
  ["HOME.focusGoalsNote", HOME.focusGoalsNote(CO)],
  ["HOME.focusMarketNote(1)", HOME.focusMarketNote(1)],
  ["HOME.focusMarketNote(n)", HOME.focusMarketNote(6)],
  // ── N7: the In focus sentence segments ──
  ["HOME.focusDocsIn", HOME.focusDocsIn(5)],
  ["HOME.focusDocsAdded(1)", HOME.focusDocsAdded(1)],
  ["HOME.focusDocsAdded(n)", HOME.focusDocsAdded(4)],
  ["HOME.focusHeard", HOME.focusHeard(2)],
  ["HOME.focusBaseNote(1)", HOME.focusBaseNote(1, 4)],
  ["HOME.focusBaseNote(n)", HOME.focusBaseNote(2, 4)],
  ["HOME.focusMarketChooses", HOME.focusMarketChooses(CO)],
  // ── N8: the swatch legends ──
  ["HOME.legendUnderway", HOME.legendUnderway],
  ["HOME.aheadFocus", HOME.aheadFocus],
  ["HOME.aheadFlow", HOME.aheadFlow],
  ["HOME.probable", HOME.probable],
  ["HOME.plausible", HOME.plausible],
  ["HOME.possible", HOME.possible],
  ["HOME.goalZone", HOME.goalZone(CO)],
  ["HOME.ghostLines", HOME.ghostLines],
  ["HOME.betsThatHover", HOME.betsThatHover],
  // ── N1: the zone definitions ──
  ["HOME.zonePossible", HOME.zonePossible],
  ["HOME.zonePlausible", HOME.zonePlausible],
  ["HOME.zoneProbable", HOME.zoneProbable(CO)],
  ["HOME.zoneProbableEmpty", HOME.zoneProbableEmpty],
  // ── O2 / N2: the band and the per-route count ──
  ["HOME.bandLabel(1)", HOME.bandLabel(1)],
  ["HOME.bandLabel(n)", HOME.bandLabel(7)],
  ["HOME.condEvidence", HOME.condEvidence(1, 5)],
  // ── N3 / N8: the cone's swatch legend ──
  ["HOME.ideasFromOutside", HOME.ideasFromOutside],
  ["HOME.goalSwatch", HOME.goalSwatch(CO)],
  // ── O3: the See all overlay ──
  ["SEEALL.title", SEEALL.title],
  ["SEEALL.lede", SEEALL.lede],
  ["SEEALL.close", SEEALL.close],
  ["SEEALL.groupBase", SEEALL.groupBase(CO)],
  ["SEEALL.groupChoices", SEEALL.groupChoices],
  ["SEEALL.groupAddLearn", SEEALL.groupAddLearn],
  ["SEEALL.stateOpen", SEEALL.stateOpen],
  ["SEEALL.stateNotBuilt", SEEALL.stateNotBuilt],
  ["SEEALL.stateNotDesigned", SEEALL.stateNotDesigned],
  ["SEEALL.stateAfterInterviews", SEEALL.stateAfterInterviews],
  ["SEEALL.todayBody", SEEALL.todayBody],
  ["SEEALL.whatChangedBody", SEEALL.whatChangedBody],
  ["SEEALL.baseBody", SEEALL.baseBody(CO)],
  ["SEEALL.voices", SEEALL.voices],
  ["SEEALL.voicesBody", SEEALL.voicesBody],
  ["SEEALL.reframed", SEEALL.reframed],
  ["SEEALL.reframedBody", SEEALL.reframedBody],
  ["SEEALL.goalsBody", SEEALL.goalsBody],
  ["SEEALL.marketBody", SEEALL.marketBody],
  ["SEEALL.needs", SEEALL.needs],
  ["SEEALL.needsBody", SEEALL.needsBody],
  ["SEEALL.longMap", SEEALL.longMap],
  ["SEEALL.longMapBody", SEEALL.longMapBody],
  ["SEEALL.documentsBody", SEEALL.documentsBody],
  ["SEEALL.interviewsBody", SEEALL.interviewsBody],
  ["SEEALL.howItWorks", SEEALL.howItWorks],
  ["SEEALL.howItWorksBody", SEEALL.howItWorksBody],
  ["SEEALL.theDojo", SEEALL.theDojo],
  ["SEEALL.theDojoBody", SEEALL.theDojoBody],
];

describe("Diagnose slice 1 — every renderable string is in the signed spec", () => {
  for (const [key, value] of CENSUS) {
    it(`${key} is signed`, () => {
      const literal = spec.includes(value);
      const normalised = specNorm.includes(norm(value));
      expect(
        literal || normalised,
        `UNSIGNED STRING — ${key}\n  rendered:   ${JSON.stringify(value)}\n  normalised: ${JSON.stringify(norm(value))}\n  Not in docs/diagnose-slice1-spec.md. Either it is a transcription slip, or it needs signature.`,
      ).toBe(true);
    });
  }

  it("the census covers EVERY key in strings.ts — a new string cannot escape it", () => {
    // Non-vacuity: this is what stops the census decaying into a subset of the strings.
    const groups: ReadonlyArray<readonly [string, Record<string, unknown>]> = [
      ["SHARED", SHARED], ["WALK", WALK], ["SEND", SEND], ["WELCOME", WELCOME],
      ["W1", W1], ["W2", W2], ["W4", W4], ["W5", W5], ["W6", W6], ["W7", W7],
      ["W8", W8], ["W9", W9], ["HOME", HOME], ["SEEALL", SEEALL],
    ];
    const censused = new Set(CENSUS.map(([k]) => k.replace(/\(.*\)$/, "")));
    censused.add("W2.why"); // rendered as whyStem + " " + whyEnd; both halves are censused above
    const uncensused: string[] = [];
    for (const [name, group] of groups) {
      for (const key of Object.keys(group)) {
        if (!censused.has(`${name}.${key}`)) uncensused.push(`${name}.${key}`);
      }
    }
    expect(uncensused, `strings.ts exports these with no census entry: ${uncensused.join(", ")}`).toEqual([]);
  });
});

describe("N7 — a row's sentence is assembled from signed segments", () => {
  it("joins with a stop and ends with one", () => {
    expect(sentence(["5 in", "4 have added to the map"])).toBe("5 in. 4 have added to the map.");
  });

  it("G3 — a dropped segment leaves a shorter sentence, not a dangling separator", () => {
    expect(sentence(["5 in"])).toBe("5 in.");
    expect(sentence(["", "  "])).toBe("");
  });
});

describe("the two signed-string helpers", () => {
  it("G1 — the possessive is always 's, including a name ending in s", () => {
    expect(poss("Edgewood")).toBe("Edgewood's");
    expect(poss("Sonos")).toBe("Sonos's");
  });

  it("G6 — the kind list joins with commas and 'and'", () => {
    expect(joinList([])).toBe("");
    expect(joinList(["the goals"])).toBe("the goals");
    expect(joinList(["the positioning", "the goals"])).toBe("the positioning and the goals");
    expect(joinList(["the positioning", "the goals", "what's underway"]))
      .toBe("the positioning, the goals and what's underway");
    // The ruling's own worked example, end to end.
    expect(W1.addedList(joinList(["the positioning", "the goals", "what's underway"])))
      .toBe("Added the positioning, the goals and what's underway.");
  });
});
