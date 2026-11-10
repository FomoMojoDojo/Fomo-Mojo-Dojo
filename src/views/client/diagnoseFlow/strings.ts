// DIAGNOSE · SLICE 1 — SIGNED STRINGS (S1–I3 Nov 6; rulings G1–G8 Nov 7). ONE HOME, byte-exact,
// never inlined at a render site. Same discipline as firstReadPreview/operatorStrings.ts.
//
// THE LAW THIS FILE EXISTS FOR: docs/diagnose-slice1-spec.md is the design of record, and
// diagnoseStrings.census.test.ts asserts that EVERY string here appears in that file — with
// {company} resolved to "Edgewood" (the name the spec was written against, G1) and the computed
// tokens {n} / {a} / {b} / {list} / {date} left as the rulings write them. A screen that needs a
// string not in the spec cannot get one: the companion test also proves the screen files hold no
// human-readable literal of their own.
//
// G1: every "Edgewood" in a signed string is companies.name. The possessive is ALWAYS `'s`,
// including names ending in s ("Sonos's") — signed, so no orthographic branch exists here.

/** G1 — the possessive, with no exception for a trailing s. */
export function poss(company: string): string {
  return `${company}'s`;
}

/** G2 — a computed count with a signed singular form. */
function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : many;
}

/** G6 — "a, b and c" from the kind list, in the signed order. */
export function joinList(parts: readonly string[]): string {
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0];
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

export const SHARED = {
  brand: "MojoMap™",
  phaseSend: "Diagnose · before the first visit",
  phaseVisit: "Diagnose · first visit",
  phaseApp: "Diagnose · about two weeks",
  scoreLabel: "MojoScore™",
} as const;

export const WALK = {
  whereTheseComeFrom: "Where these come from",
  writeItAs: "Write it as",
  example: "Example:",
  onTheMap: "On the map",
  back: "← Back",
  add: "Add",
  save: "Save",
  cancel: "Cancel",
  blankIsAnAnswer: "Leaving something blank is an answer.",
  /** The spec writes this as "Fixing item n"; n is the item's 1-based index. */
  fixingItem: (n: number) => `Fixing item ${n}`,
  addedAtTheVisit: "Added at the visit",
  fixedAtTheVisit: " · fixed at the visit",
  /** "01 / 09" — both computed, zero-padded. */
  counter: (index: number, total: number) =>
    `${String(index).padStart(2, "0")} / ${String(total).padStart(2, "0")}`,
} as const;

export const SEND = {
  eyebrow: "Diagnose · step one",
  h: (c: string) => `Send what ${c} already has.`,
  lede: (c: string) =>
    `The First Read is how the world sees ${c} from the outside. Diagnose adds the inside: the plans, numbers and decks ${c} already uses. They go on the map before the first visit, so that visit is spent comparing, not collecting.`,
  dropHere: "Drop files here",
  dropActive: "Let go to add",
  dropHint: "or click to choose · any format, as many as there are",
  sentSoFar: "Sent so far",
  stayHere: (c: string) => `${poss(c)} documents stay here. Nothing leaves.`,
  received: "Received",
  // G8: the "Rather email?" sentence is omitted until an address exists. No literal brackets on a
  // live screen, so the string is not carried here at all.
  whatHappensNext: "What happens next",
  whatHappensNextBody: (c: string) =>
    `One line comes back when they land: how many came in and how many are on the map. At the visit, ${poss(c)} documents sit beside the outside read. ${c} decides who should be heard and notes anything else that's needed.`,
  whatHappensNextEmphasis: "Nothing to solve that day.",
  next: "That's all of them →",
} as const;

export const WELCOME = {
  eyebrow: (c: string) => `Welcome to Diagnose · ${poss(c)} documents are in`,
  h: (c: string) => `${poss(c)} documents are in. Now the inside view sits beside the world's.`,
  lede: (c: string) =>
    `The First Read is built from the outside and can only see what's visible. ${poss(c)} documents say what ${c} is actually doing. This visit puts the two together.`,
  threeThings: (c: string) => `By the end of Diagnose ${c} holds three things`,
  ringBaseTitle: (c: string) => `${poss(c)} base, agreed`,
  ringBaseBody: (c: string) => `Promise, positioning, strategy, and who ${c} serves.`,
  ringGoalTitle: (c: string) => `${poss(c)} goal, chosen`,
  ringGoalBody: (c: string) =>
    `One goal, expressed as a concrete outcome chosen by ${c} from the potential goals on the table.`,
  ringMarketTitle: (c: string) => `${poss(c)} market, selected`,
  ringMarketBody: (c: string) =>
    `The group of people critical to ${poss(c)} success, and what they need to accomplish. Chosen last, from the evidence.`,
  whereYouAre: "Where you are",
  whereYouAreBody: "The First Read is in. Diagnose is the first phase, about two weeks. Focus and Flow follow.",
  whatHappensNow: "What happens now",
  whatHappensNowEmphasis: "Eight short screens. Nothing to solve today.",
  whatHappensNowBody: (c: string) =>
    `Three things: see where ${poss(c)} documents and the outside read agree and where they don't · decide who should be heard · note what else is needed.`,
  prefilled: "Every screen is prefilled from the documents. Confirm, fix, or add.",
  howItWorks: "How MojoMap™ works",
  back: "← First Read",
  next: "Start with the documents →",
} as const;

export const W1 = {
  eyebrow: "1 of 8 · Documents",
  h: (c: string) => `What ${poss(c)} documents add to the map.`,
  why: (c: string) =>
    `The outside read can only see what ${c} shows the world. ${poss(c)} documents say what ${c} is actually doing, and trying to do. Together they decide where the map starts. If a document is missing, that part of the map stays a guess.`,
  source: "Each document lists what it added. Anything not here, add it below.",
  pattern: "[Document name] · [what it is] · [date]",
  example: "Board update · slides shown to the board · March 2026",
  keep: "Keep",
  fix: "Fix",
  composer: "A document we should have",
  noneYet: "That's all of them",
  next: "Base →",
  /** G2 + G3: each segment is dropped when its count is 0; all zero → no line. */
  countDocuments: (n: number) => plural(n, "1 document", `${n} documents`),
  countAdded: (n: number) => `${n} added`,
  countFailed: (n: number) => `${n} could not be opened`,
  /** G5 — a document with no accepted proposals. */
  addedNothingYet: "Added nothing yet.",
  /** G6 — "Added the positioning, the goals and what's underway." */
  addedList: (list: string) => `Added ${list}.`,
  kindPositioning: "the positioning",
  kindGoals: "the goals",
  kindGroups: (c: string) => `what the groups ${c} serves need`,
  kindRoutes: "what's underway",
  notAdded: "Not added",
  couldNotOpen: "Could not be opened, so it added nothing yet. Add it again below, or bring it to the visit.",
} as const;

const W2_WHY_STEM = (c: string) =>
  `${poss(c)} base has four parts: what ${c} promises, how it's positioned, its strategy, and who it serves. Each line is what ${poss(c)} documents say.`;

export const W2 = {
  eyebrow: "2 of 8 · Base",
  h: (c: string) => `Is this ${c}?`,
  /** G7 — the lede is TWO signed fragments, not one string. The spec body's sentence runs on into a
   *  mark clause that slice 1 cannot render (P4), and G7 replaces that clause with a full stop. So the
   *  stem is checked against the body and the ending against G7; `why` composes them. */
  whyStem: W2_WHY_STEM,
  whyEnd: "Under it is what the outside shows.",
  why: (c: string) => `${W2_WHY_STEM(c)} Under it is what the outside shows.`,
  source: (c: string) => `${poss(c)} documents come first. The outside read checks them.`,
  pattern: (c: string) =>
    `Promise: [who] can count on [what]. Positioning: for [who], the [what] that [others do not do]. Strategy: play [where], win by [how]. Who ${c} serves: [a group] trying to [get something done].`,
  example: "Promise: every young person in crisis can count on a safe place within 24 hours.",
  keep: (c: string) => `That's ${c}`,
  fix: "Not quite",
  composer: "Say it another way",
  noneYet: (c: string) => `Not sure what ${poss(c)} base is`,
  next: "Problems →",
  partPromise: "Promise",
  partPositioning: "Positioning",
  partStrategy: "Strategy",
  partServes: (c: string) => `Who ${c} serves`,
} as const;

export const W4 = {
  eyebrow: "3 of 8 · Problems",
  h: "What's the problem, as each person sees it?",
  why: (c: string) =>
    `What hurts now, as each person states it. ${poss(c)} documents name some; the intake form named others. Reframing comes later, with evidence.`,
  source: "These come from the board update and the intake form. Add any version of the problem that isn't here.",
  pattern: "[Who] cannot [do what], because [why].",
  example: "Counselors cannot place a kid the same night, because beds are full by 6pm.",
  keep: "Keep",
  fix: "Fix",
  composer: "Another version of the problem",
  noneYet: "No agreement on the problem",
  next: "Goals →",
} as const;

export const W5 = {
  eyebrow: "4 of 8 · Goals",
  h: (c: string) => `What is ${c} trying to achieve?`,
  why: (c: string) =>
    `${c} picks the goal. Each goal needs where it starts today and where it should end, so the map can draw the distance between them. A goal from a plan is intent until something confirms it.`,
  source: "These come from the strategic plan, the intake form and the FY25 numbers. Add any goal that's on the table, agreed or not. What's fixed bounds every goal.",
  pattern: "[What] from [today] to [target] by [date].",
  example: "Unrestricted giving from $1.2M to $2M by 2028.",
  keep: "Keep",
  fix: "Fix",
  composer: "Another goal, or something that is fixed",
  noneYet: "No agreed goal yet",
  next: "Market →",
  knowItWorked: (c: string) => `How will ${c} know it worked?`,
  knowItWorkedPlaceholder: "Plain words. Example: “We stop turning kids away in spring.”",
  today: "Today:",
  fixedLabel: "Fixed:",
  whatsFixed: "What's fixed",
} as const;

export const W6 = {
  eyebrow: "5 of 8 · Market",
  h: (c: string) => `Who is critical to ${poss(c)} success?`,
  why: (c: string) =>
    `The market is the group of people critical to ${poss(c)} success, and what they need to accomplish. Every group named anywhere is here: in the intake form, in the documents, and in the outside read. Choosing one comes at the end of Diagnose, from the evidence. Here the job is to make sure no group is missing.`,
  source: "These come from the intake form, the strategic plan and the outside read, in the five roles the outside read uses: recipients, referrers, funders, partners, users. Add any group that isn't here.",
  pattern: "[A group of people] trying to [get something done].",
  example: "Local donors trying to make their giving do the most good for kids in crisis.",
  keep: "Keep",
  fix: "Fix",
  composer: "Another group",
  noneYet: "Not sure who the market is",
  next: "Initiatives →",
  tryingTo: "Trying to:",
  roleRecipients: "Recipients",
  roleReferrers: "Referrers",
  roleFunders: "Funders",
  rolePartners: "Partners",
  roleUsers: "Users",
  sourceOutside: "Outside read",
  sourceDocuments: (c: string) => `${poss(c)} documents`,
} as const;

export const W7 = {
  eyebrow: "6 of 8 · Initiatives",
  h: (c: string) => `What's underway, and what has ${c} tried?`,
  why: (c: string) =>
    `Routes ${c} is already on are the cheapest evidence there is. They go on the map from day one, each with the bet it carries.`,
  source: "These come from the board update and the strategic plan. Add anything else that's in motion, planned, stalled, or was tried before.",
  pattern: "[Name] · [underway, planned, stalled, or tried before] · bets that [belief].",
  example: "Spring gala · underway · bets that people give because they know a kid we helped.",
  keep: "Keep",
  fix: "Fix",
  composer: "Something else in motion or tried",
  noneYet: "Nothing underway right now",
  next: "Hypotheses →",
  betsThat: "This bets that:",
} as const;

export const W8 = {
  eyebrow: "7 of 8 · Hypotheses",
  h: (c: string) => `What does ${c} believe is true?`,
  why: (c: string) =>
    `Why people choose ${c}, why they don't, and what would fix it. ${poss(c)} documents state some. One comes from the outside read and is marked so. Written down before the evidence arrives, so the evidence can move them.`,
  source: "These come from the strategic plan. One comes from the outside read. None of them says what would prove it wrong yet; that part is the ask.",
  pattern: "We believe [this], because [that]. We would be wrong if [sign].",
  example: "We believe foundations pass on us because we have no outcomes data. We would be wrong if a funder said the data was fine.",
  keep: "Keep",
  fix: "Fix",
  composer: "Another belief",
  noneYet: "None written down yet",
  next: "Who to hear →",
  wrongIf: "Wrong if:",
  wrongIfBody: "Not stated yet. What would show this belief is wrong?",
} as const;

export const W9 = {
  eyebrow: "8 of 8 · Who to hear",
  h: "Who should be heard?",
  why: (c: string) =>
    `The one thing only ${c} can supply. Staff, board, stakeholders, a counselor who refers to ${c}: anyone with a say or a view. The documents name roles; ${c} names the people.`,
  source: (c: string) => `Invites go out from ${poss(c)} own calendar, with FomoMojoDojo as a guest. Names stay here.`,
  pattern: "[Name] · [role] · knows [what].",
  example: "Priya Nair · development lead · knows which donors lapsed and why.",
  keep: "Keep",
  fix: "Fix",
  composer: "Add a person",
  noneYet: "Decide later",
  next: "Home →",
  nameNeeded: "Name needed",
  /** The DATA MAPPING's W9 source line. [date] is the record's own interviewed_at. */
  interviewSource: (date: string) => `Interview · ${date}`,
} as const;

export const HOME = {
  walkThrough: "Walk through Diagnose →",
  theFirstRead: "The First Read",
  seeAll: "☰ See all",
  now: "Now",
  dojo: "Dojo",
  addNav: "+ Add",
  addToTheMap: "Add to the map",
  addDocument: "A document",
  addDocumentBody: "Plans, decks, research, numbers. The map shows what it changed.",
  addPerson: "A person to hear",
  addPersonBody: "Staff, board, stakeholder, anyone with a say.",
  // The spec's nav item is "What changed [n]" with an amber square badge holding n. Slice 1 has no
  // store for n (P12) and G8 forbids a literal bracket on a live screen, so the badge is omitted and
  // the label renders alone — the same treatment G3 gives a zero segment.
  whatChanged: "What changed",
  title: (c: string) => `${poss(c)} map.`,
  lede: "Today sits in the middle. Drag left for what came before, right for what could come.",
  segBefore: "← Before",
  segToday: "Today",
  segAhead: "Ahead →",
  before: "Before",
  ahead: "Ahead",
  firstReadCard: "First Read",
  firstReadNote: "The outside view",
  documentsInCard: "Documents in",
  documentsInNote: (sent: number, added: number) => `${sent} sent · ${added} added`,
  todayHere: (c: string) => `Today · ${c} is here`,
  todayColumn: "Today",
  pager: (index: number, total: number) => `${index} of ${total}`,
  card1Title: "Next step",
  card1H: "Name who should be heard.",
  /** G4 — derived, with the signed singular. */
  card1Body: (n: number, c: string) =>
    n === 1
      ? `One person on ${poss(c)} list still needs a name.`
      : `${n} people on ${poss(c)} list still need a name.`,
  card1Cta: "Name them →",
  card3Title: (c: string) => `Where ${c} stands`,
  card3H: "Three things end Diagnose.",
  card3Body: "None is settled yet. Each fills in as the documents and interviews land.",
  card3Cta: "Open the base →",
  rowBase: "Base agreed",
  rowBaseState: "In progress",
  rowBaseNote: (a: number, b: number) => `${a} of ${b} lines both say it`,
  rowGoal: "Goal chosen",
  rowNotYet: "Not yet",
  rowGoalNote: (n: number) => plural(n, "1 on the table", `${n} on the table`),
  rowMarket: "Market chosen",
  rowMarketNote: "chosen last",
  card4Title: "Diagnose ends with",
  card4H: "One base, one goal, one market.",
  card4Body: (c: string) =>
    `${c} chooses the goal and the market once the documents and interviews are in. The tool decides nothing.`,
  card4Cta: "See how it ends →",
  inFocus: "In focus",
  focusDocuments: "Documents",
  focusInterviews: "Interviews",
  focusBase: "Base",
  focusGoals: "Goals",
  focusMarket: "Market",
  needsClient: (c: string) => `Needs ${c}`,
  focusInterviewsNamed: (n: number) => plural(n, "1 named", `${n} named`),
  focusInterviewsUnnamed: (n: number) =>
    plural(n, "1 still needs a name", `${n} still need a name`),
  focusGoalsNote: (c: string) => `${c} chooses at the end of Diagnose`,
  focusMarketNote: (n: number) => plural(n, "1 group named", `${n} groups named`),
  /** N7 — the In focus rows are one sentence each, assembled from these signed SEGMENTS by
   *  `sentence()`. The segments are what G2 signs and G3 drops; the stops are punctuation. */
  focusDocsIn: (n: number) => `${n} in`,
  focusDocsAdded: (a: number) =>
    plural(a, "1 has added to the map", `${a} have added to the map`),
  focusHeard: (h: number) => `${h} heard`,
  focusBaseNote: (b: number, total: number) =>
    plural(b, `1 of ${total} parts has both sides`, `${b} of ${total} parts have both sides`),
  focusMarketChooses: (c: string) => `${c} chooses one last`,
  /** N8 — the In focus legend is three swatches. "Needs {company}" and "Not yet" are already
   *  signed above; the white swatch's word is the lifecycle word the spec uses in W7. */
  legendUnderway: "Underway",
  aheadFocus: "Focus",
  aheadFlow: "Flow",
  probable: "Probable",
  plausible: "Plausible",
  possible: "Possible",
  goalZone: (c: string) => `${poss(c)} goal · chosen at the end of Diagnose`,
  ghostLines: "Routes Focus will draw",
  betsThatHover: "Bets that …",
  /** N1 — the zone definitions, shown on hover or focus of a zone's label. */
  zonePossible: "Every condition this route depends on is still untested.",
  zonePlausible: "At least one condition has evidence from documents, interviews or the outside read.",
  zoneProbable: (c: string) =>
    `Where ${c} lands if what is underway keeps going and nothing else changes.`,
  /** N1 — P7 has no today-value and no trend, so the Probable zone stands empty and says why. */
  zoneProbableEmpty: "Needs today's number and its trend.",
  /** O2 — one band for a zone whose routes do not differ by evidence count. */
  bandLabel: (n: number) =>
    plural(
      n,
      "1 idea from the outside read · not tested yet",
      `${n} ideas from the outside read · none tested yet`,
    ),
  /** N2 — the per-route rollover, for when the counts DO differ. */
  condEvidence: (n: number, m: number) => `${n} of ${m} conditions have evidence`,
  /** N3 / N8 — the cone's legend is swatches: the dashed line, the amber goal marker, the rings. */
  ideasFromOutside: "Ideas from the outside read",
  goalSwatch: (c: string) => `${poss(c)} goal`,
} as const;

/** N7 — a row's sentence from its signed segments: the stops are punctuation, not words, and a
 *  segment G3 dropped simply is not passed in. All segments empty ⇒ no sentence (the line is
 *  omitted by the caller). */
export function sentence(parts: readonly string[]): string {
  const kept = parts.filter((p) => p.trim().length > 0);
  return kept.length === 0 ? "" : `${kept.join(". ")}.`;
}

/** O3 — the See all overlay (the N6 canvas). Card titles and the computed states reuse the signed
 *  strings above rather than restating them: HOME.now, HOME.dojo, HOME.todayColumn,
 *  HOME.whatChanged, HOME.focusBase / focusGoals / focusMarket / focusDocuments / focusInterviews,
 *  and the count functions HOME.focusBaseNote / rowGoalNote / focusMarketNote / focusDocsIn /
 *  focusHeard / focusInterviewsUnnamed. */
export const SEEALL = {
  title: "Open anything to see it or work on it.",
  lede: "Each card says where it stands today.",
  close: "×",
  groupBase: (c: string) => `Map · ${poss(c)} base`,
  groupChoices: "Map · the choices",
  groupAddLearn: "Add & learn",
  stateOpen: "Open",
  stateNotBuilt: "Not built yet.",
  stateNotDesigned: "Not designed yet",
  stateAfterInterviews: "After interviews",
  todayBody: "The map at Today: the next step, the three outcomes, what's in focus.",
  whatChangedBody: "Everything that landed since the last visit.",
  baseBody: (c: string) => `Promise · positioning · strategy · who ${c} serves.`,
  voices: "Voices",
  voicesBody:
    "Where the documents, the outside read and the people heard agree, and where there's a gap.",
  reframed: "Problem · goal · market, reframed",
  reframedBody: "What came in, tested, and a sharper version.",
  goalsBody: "Every goal on the table, each with where it starts today.",
  marketBody: "Every group named, each with what it is trying to get done.",
  needs: "Needs",
  needsBody: "What each group needs, step by step.",
  longMap: "The long map",
  longMapBody: "Before, today, and what could come.",
  documentsBody: "Plans, decks, research, numbers.",
  interviewsBody: "Who should be heard, and who has been.",
  howItWorks: "How MojoMap™ works",
  howItWorksBody: "The phases, the map, and what moves the score.",
  theDojo: "The Dojo",
  theDojoBody: "Short walks through how each part works.",
} as const;
