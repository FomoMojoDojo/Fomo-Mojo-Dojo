export type CardStatus = "agreed" | "outside" | "split" | "none";

export const home = {
  client: "Edgewood",
  day: 9,
  days: 14,
  scoreFirst: 21,
  scoreNow: 28,
  goal: 61,
  ifNothingChanges: 44,
  whatChanged: 3,
  past: [
    { date: "2022", title: "Direct mail", note: "Tried, dropped", x: 70, dropped: true },
    { date: "Sep 11", title: "Outside read", x: 300 },
    { date: "Sep 24", title: "First Read, reviewed with you", x: 500 },
    { date: "Sep 27", title: "Working session", x: 620 },
  ],
  settled: [
    "Strategy, agreed",
    "Positioning, read from outside and your documents",
    "Promise, outside only",
  ],
  cards: [
    {
      kicker: "Solidify your base",
      line: "Confirm what you stand on",
      why: "One of four parts of your base is confirmed. Your strategy differs from what the outside read shows.",
      bars: [
        { label: "Promise", value: 30, note: "Outside only" },
        { label: "Positioning", value: 50, note: "Voices split" },
        { label: "Strategy", value: 100, note: "Agreed" },
        { label: "Who you serve", value: 0, note: "Not chosen" },
      ],
      cta: "Review your base",
    },
    {
      kicker: "Choose your goal",
      line: "Pick the future you're aiming at",
      why: "Your goal sharpens once the interviews land. Three people have been heard so far.",
      outcomes: [
        { label: "Solidify your base", state: "part" },
        { label: "Choose your goal", state: "none" },
        { label: "Choose your market", state: "none" },
      ],
      cta: "Name who to hear",
    },
    {
      kicker: "Choose your market",
      line: "Decide who you serve first",
      why: "Voices gap on who to serve first. Two gaps are open.",
      outcomes: [
        { label: "Solidify your base", state: "part" },
        { label: "Choose your goal", state: "none" },
        { label: "Choose your market", state: "none" },
      ],
      cta: "See the gaps",
    },
  ],
  strategies: [
    { name: "Major gifts push", status: "underway", note: "Started Q2 · two staff · bets that a few large donors close the gap faster than many small ones", end: 0.35 },
    { name: "Spring gala", status: "underway", note: "Every year · bets that people give because they know a kid we helped", end: 0.1 },
    { name: "School-partnership program", status: "planned", note: "In the March board update · no evidence yet, so it sits in possible, not in your goal", end: -0.75 },
    { name: "Outcomes dashboard", status: "stalled", note: "Started, paused · bets that foundations give when they can see outcomes", end: -0.25 },
  ],
  focus: [
    { title: "Add your documents", meta: "12 in · 9 read", state: "on" },
    { title: "Interviews · your turn", meta: "3 heard · 1 invited · 2 still to name", state: "you" },
    { title: "Your base", meta: "1 of 4 confirmed · strategy differs from the read", state: "on" },
    { title: "Voices", meta: "2 gaps · on who to serve first", state: "you" },
    { title: "Choose your goal & market", meta: "As the evidence lands · after interviews", state: "later" },
  ],
  seeAll: [
    { group: "Now", items: [
      { t: "Where you stand", d: "What to do today, the three outcomes, the rail.", m: "Day 9", now: true },
      { t: "What changed", d: "Everything that landed since your last visit.", m: "3 new" },
    ]},
    { group: "Your base", items: [
      { t: "Your base", d: "Promise · positioning · strategy · who you serve.", m: "1 of 4 confirmed" },
      { t: "Voices", d: "Where the people we heard and your documents agree, and where they gap.", m: "2 gaps" },
      { t: "Problem · goal · market, reframed", d: "What you came with, tested, and a sharper version.", m: "Ready to review" },
    ]},
    { group: "Your choices", items: [
      { t: "Your goal", d: "Your focus, plus any challenger the evidence raised.", m: "After interviews" },
      { t: "Your market", d: "The groups inside your word for it, each with its job.", m: "After interviews" },
      { t: "Their needs", d: "What each group needs to accomplish.", m: "34 heard" },
      { t: "The long map", d: "Past, today, and the cone ahead.", m: "Open" },
    ]},
    { group: "Add & learn", items: [
      { t: "Your documents", d: "Plans, decks, research, numbers.", m: "12 in · 9 read" },
      { t: "Interviews", d: "Who should be heard, and who has been.", m: "3 heard · 1 invited" },
      { t: "The Dojo", d: "Short walks through how each part works.", m: "8 walks" },
      { t: "How MojoMap works", d: "The phases, the map, and what moves the score.", m: "5 min" },
    ]},
  ],
  add: [
    { t: "A document", d: "Plans, decks, research, numbers. We read it and show what it changed." },
    { t: "A person to hear", d: "Team, board, stakeholder, anyone with a say." },
    { t: "A thought", d: "A goal, a worry, a question. It lands on What changed." },
  ],
};
