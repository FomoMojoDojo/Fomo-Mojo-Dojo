// Mojo Score bands — operator-signed names + descriptions (Set B, ported
// verbatim from the mojomap-redesign first-read build @ 0ac0d0c).
// Single source: every render site inherits from here.

export type ScoreBand = {
  min: number;
  max: number;
  name: string;
  description: string;
};

export const SCORE_BANDS: ScoreBand[] = [
  {
    min: 0,
    max: 20,
    name: "Running on guesses",
    description:
      "Base not aligned; definitions unclear; decisions made without support.",
  },
  {
    min: 20,
    max: 40,
    name: "Running on instinct",
    description:
      "Real work underway and some clarity, but choices still rest on gut, not shared definitions.",
  },
  {
    min: 40,
    max: 60,
    name: "Running on signals",
    description:
      "Base aligned, common definitions hold; decisions start drawing on real signals.",
  },
  {
    min: 60,
    max: 80,
    name: "Running on evidence",
    description:
      "Validated against customer voice; decisions are backed and strategy compounds.",
  },
  {
    min: 80,
    max: 100,
    name: "Running validated",
    description:
      "Continuously validated and market-confirmed. No one holds 100 — markets move, and the score moves with them.",
  },
];

export function bandForScore(score: number): ScoreBand {
  return (
    SCORE_BANDS.find((band) => score >= band.min && score < band.max) ??
    SCORE_BANDS[SCORE_BANDS.length - 1]
  );
}
