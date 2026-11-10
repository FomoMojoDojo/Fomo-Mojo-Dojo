// All copy for the Diagnose flow. Placeholders in [BRACKETS] are intentional (strings still to sign).

export const STEPS = [
  { slug: "send", label: "Send what you have", tone: "base" },
  { slug: "welcome", label: "Welcome to Diagnose", tone: "base" },
  { slug: "base", label: "Your base", tone: "base" },
  { slug: "goal", label: "Your goal", tone: "goal" },
  { slug: "reframe", label: "The reframe", tone: "goal" },
  { slug: "market", label: "Your market", tone: "market" },
  { slug: "needs", label: "Their needs", tone: "market" },
  { slug: "mojomap", label: "Your first MojoMap", tone: "base" },
] as const;

export type StepSlug = (typeof STEPS)[number]["slug"];
export type Tone = "base" | "goal" | "market";

export const diagnose = {
  client: "Edgewood",
  email: "documents@fomomojodojo.com",
  sentFiles: ["Strategic plan 2024–2027.pdf", "Board update March 2026.pptx", "FY25 numbers.xlsx"],

  welcome: {
    three: [
      { t: "Your base, agreed", d: "Promise, positioning, strategy, who you serve. The outside read, checked against your documents and the people heard, in your words.", tone: "base" as Tone },
      { t: "Your goal, chosen", d: "One goal, expressed as a concrete outcome you choose from the potential goals on the table.", tone: "goal" as Tone },
      { t: "Your market, selected", d: "The group of people critical to your success, and what they need to accomplish. Chosen last, from the evidence.", tone: "market" as Tone },
    ],
  },

  base: [
    { name: "Strategy", sub: "Where you play and how you win", world: "Where you play and how you win, as the public record shows it.", you: "The same, in your own words, from the strategic plan.", status: "Same", action: "Confirmed", state: "agreed" },
    { name: "Positioning", sub: "The place you intend to own", world: "The place the record sees you in.", you: "A narrower place, from the Brand Playbook. 3 voices say this. 2 voices say the record's version.", status: "Voices split", action: "See the gap", state: "split" },
    { name: "Promise", sub: "What you promise the people you serve", world: "The promise as the record shows it.", you: "Nothing in your documents states it. 2 voices described it in different words.", status: "Outside only", action: "Write it in your words", state: "outside" },
    { name: "Market", sub: "Who you aim at · what they need to accomplish", world: "Seven groups seen from outside.", you: "“Donors.” Inside that: local donors, foundations, major gifts. Not chosen yet.", status: "Not chosen", action: "See their needs", state: "none" },
  ],

  goal: {
    came: [{ k: "Goal", v: "Close the donor gap" }, { k: "Market", v: "Donors" }],
    sharpen: [
      { t: "Give the goal a number", d: "[CURRENT] to [TARGET] by [DATE]. Without a number, no route can reach it." },
      { t: "Ask what it is for", d: "Your strategy work says the gap matters because it keeps the under-12 unit open. Is closing the gap the goal, or the way to it?" },
    ],
    split: { t: "Donors is several markets", d: "Local individual donors · foundations · major-gift donors. Each goes through different steps and needs different things. Each is its own map." },
    challengers: [
      { t: "Goal · Keep the under-12 unit open", d: "Raised by your strategy work and 3 of 5 voices. May be the real goal behind the gap." },
      { t: "Market · Families of the youth you serve", d: "Raised by 2 voices. Not donors, but they decide who refers and returns." },
    ],
    endings: [
      { t: "Your focus holds, sharper", d: "Most likely. You leave with a measured goal and one donor market.", likely: true },
      { t: "A challenger wins", d: "Only if the evidence says so. You decide, in the meeting.", likely: false },
    ],
  },

  reframe: [
    {
      key: "Problem", came: "Our teams don’t agree on what matters to donors.", source: "Intake form · working session, one voice",
      checks: [
        { t: "Says who has the problem, outside your walls", d: "Yours names your teams. The people whose behavior has to change are donors.", ok: false },
        { t: "Names what is in their way", d: "“Don’t agree” is your symptom, not their obstacle.", ok: false },
        { t: "Is something you can observe", d: "Disagreement is real and visible.", ok: true },
        { t: "Could be wrong, and you could find out", d: "As written it cannot be tested against donors.", ok: false },
      ],
      like: { from: "Our sales team doesn’t agree on the pitch.", to: "Buyers can’t tell what we do differently in the first minute.", why: "The first is about the team. The second is about the people who decide, and it can be tested." },
      reframed: "Local donors who don’t give today have no reason to believe a gift here does the most good.",
      reframedSource: "From your documents, the people heard, and the outside read",
      now: [
        { t: "Who has it", d: "Local donors who don’t give today." },
        { t: "What is in their way", d: "No reason to believe a gift here does the most good." },
        { t: "A way to check it", d: "Ask them. Focus does." },
        { t: "A link to your goal", d: "If they believed it, the unit stays open." },
      ],
      matters: "A problem written about yourselves leads to internal fixes. A problem written about the people you need leads to routes they will actually take.",
    },
    {
      key: "Goal", came: "Close the donor gap.", source: "Intake form · how you first said it",
      checks: [
        { t: "A destination, not a way to get somewhere", d: "Closing the gap is how you keep a unit open. It is the road, not the place.", ok: false },
        { t: "A number and a date", d: "“The gap” has no size and no deadline in your material.", ok: false },
        { t: "Something your organization needs", d: "Yes. It is real and it is yours.", ok: true },
        { t: "Something you would judge yourselves against", d: "A gap can close by cutting costs. Is that success?", ok: false },
      ],
      like: { from: "Grow revenue 20%.", to: "Be the default choice for first-time home buyers in the county by 2028, measured by share of first mortgages.", why: "The first could be reached a hundred ways, some of which hurt you. The second says where, for whom, by when, and how you will know." },
      reframed: "Keep the under-12 unit open without a waitlist: unrestricted giving from [CURRENT] to [TARGET] by [DATE].",
      reframedSource: "From Exec Team Strategy Work and 4 of 6 people heard",
      now: [
        { t: "A destination", d: "The unit open, no waitlist. You would know it when you see it." },
        { t: "A number", d: "Unrestricted giving, from here to there." },
        { t: "A date", d: "By [DATE]. Routes can be paced against it." },
        { t: "A test", d: "Any route either moves that number or it does not." },
      ],
      matters: "A goal with a destination, a number and a date lets the map score every route against the same thing. Without them every route looks equally good, and nothing is defensible.",
    },
    {
      key: "Market", came: "Donors.", source: "Intake form · who you said you wanted to go after",
      checks: [
        { t: "A group of people", d: "“Donors” is a role in your books, not people with a life. It holds at least three different groups.", ok: false },
        { t: "A job they are trying to get done", d: "Nothing in “donors” says what they are trying to accomplish.", ok: false },
        { t: "Free of your solution", d: "“Donor” already assumes the answer is a gift to you.", ok: false },
        { t: "Critical to your goal", d: "Yes. No donors, no unit.", ok: true },
      ],
      like: { from: "People who buy CD players.", to: "People who want to enjoy music wherever they are.", why: "The first dies with the CD. The second is still true, and it is where every winning route came from." },
      reframed: "People in San Francisco and San Mateo who give to local causes, trying to make their giving do the most good for young people in crisis.",
      reframedSource: "One of three groups inside “donors” · the one you pick at the end of Diagnose",
      now: [
        { t: "A group of people", d: "Local, give to local causes. You could find them." },
        { t: "A job to get done", d: "Make my giving do the most good. It exists whether or not you do." },
        { t: "No solution in it", d: "They could do it through you, a rival, or a GoFundMe." },
        { t: "Needs you can hear and measure", d: "Each step of that job has needs. Focus scores them." },
      ],
      matters: "A market defined as a group and a job stays true when your product changes. It tells you what to measure, and it keeps you from building the best CD player.",
    },
  ],

  groups: [
    { id: "local", short: "Local donors", name: "People in San Francisco and San Mateo who give to local causes", job: "Make my giving do the most good for young people in crisis.", heard: 14, serves: 9, open: 5, positioning: "would narrow to “the local program that proves it”", mustBeTrue: "local donors who don’t give today would, for the right reason." },
    { id: "foundations", short: "Foundations", name: "Foundations and grantmakers funding youth services in the Bay Area", job: "Fund outcomes our board can defend.", heard: 9, serves: 6, open: 8, positioning: "would shift to evidence and reporting", mustBeTrue: "your outcomes are ones a board can defend in writing." },
    { id: "major", short: "Major gifts", name: "Major-gift donors with a family tie to youth services", job: "Leave something that lasts, in my name.", heard: 6, serves: 4, open: 10, positioning: "would shift to legacy and relationship", mustBeTrue: "a few people can move the whole number." },
  ],
  internalNeeds: 14,

  jobSteps: ["Decide to give", "Find who to give to", "Get ready to give", "Check it is right", "Give", "See what it did", "Adjust", "Renew or stop"],
  // per group: [stepIndex, row 0..2, source, need]
  needs: {
    local: [
      [0, 0, "interview", "Know a need is urgent, close to home."],
      [1, 1, "document", "Find a local group I can trust without research."],
      [1, 2, "interview", "Hear about it from someone I know."],
      [2, 0, "interview", "Know how much makes a difference."],
      [3, 1, "document", "See that others like me already give here."],
      [4, 0, "interview", "Give in under a minute, on my phone."],
      [5, 0, "interview", "See what my gift did, in a story not a report."],
      [5, 2, "document", "Hear back without being asked for more."],
      [6, 0, "interview", "Change my amount without a phone call."],
      [7, 0, "interview", "Feel it was worth it before I'm asked again."],
    ],
    foundations: [
      [0, 0, "document", "Fit our strategy for the funding cycle."],
      [2, 1, "interview", "Have outcomes we can write into our docket."],
      [3, 0, "interview", "Check the numbers hold up."],
      [4, 1, "document", "Fund in tranches, tied to milestones."],
      [5, 0, "interview", "Get a report our board will read."],
      [7, 2, "market", "Know early if a renewal is likely."],
    ],
    major: [
      [0, 1, "interview", "Feel personally connected to the cause."],
      [2, 0, "interview", "Talk it through with the director."],
      [4, 1, "document", "Give in a way that carries my name."],
      [5, 0, "market", "See the lasting thing being built."],
      [7, 1, "interview", "Be asked into the next chapter, not for a cheque."],
    ],
  } as Record<string, [number, number, "interview" | "document" | "market", string][]>,

  mojomap: {
    problem: { v: "Local donors who don’t give today have no reason to believe a gift here does the most good.", n: "Reframed from “our teams don’t agree on what matters to donors” · from your documents and 6 voices" },
    goal: { v: "Keep the under-12 unit open without a waitlist.", n: "Measured by unrestricted giving · [CURRENT] to [TARGET] by [DATE] · chosen over 2 others" },
    market: { v: "People in San Francisco and San Mateo who give to local causes, trying to make their giving do the most good for young people in crisis.", n: "The group, and the job they are trying to get done · chosen over foundations and major-gift donors · 14 needs heard so far, scored in Focus" },
    base: [["Strategy", "agreed"], ["Positioning", "agreed, re-read for local donors in Focus"], ["Promise", "in your words, tested in Focus"]],
    aside: [["Be known as evidence-led", "needs a measure"], ["Open a second unit", "2 voices"], ["Foundations", "a map you could build next"], ["Major gifts", "a map you could build next"]],
    next: "Local donors are heard, the underserved needs measured, and the routes to your goal drawn.",
  },
};
