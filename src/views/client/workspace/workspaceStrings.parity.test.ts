// Register parity — the workspace's signed strings are byte-identical to what was signed. Same idiom as
// chosenJobStepSet.test.ts "(gE1) the signed strings": one assertion per string, the literal spelled out
// here so a drift in workspaceNav.ts fails the run and names the string.
import { describe, expect, it } from "vitest";
import {
  WORKSPACE_STRINGS, countedQuotesSitesLine, moreMaskedLine, pendingFromFilesLine, pendingOutsideVoiceLine,
  questionsFootLine, voiceLabel, withheldLine, workspaceDocumentTitle,
} from "./workspaceNav";

describe("Job Map register — Tier 1 (signed by use, 2026-09-11)", () => {
  it("switcher", () => {
    expect(WORKSPACE_STRINGS.showAllMarkets).toBe("Show all markets");
    expect(WORKSPACE_STRINGS.switchMarketViewingOnly).toBe("Switch market — viewing only");
  });
  it("choose / conditions / working", () => {
    expect(WORKSPACE_STRINGS.chooseSet).toBe("Choose this as the on-strategy set");
    expect(WORKSPACE_STRINGS.generateConditions).toBe("Generate conditions");
    expect(WORKSPACE_STRINGS.regenerateConditions).toBe("Regenerate conditions");
    expect(WORKSPACE_STRINGS.working).toBe("Working…");
  });
});

describe("Ingest queue — the re-queue control (signed 2026-11-13, SP-178 as corrected by SP-215)", () => {
  it("byte-identical, in the American spelling SP-215 signed", () => {
    // SP-178 first wrote "Analyse again"; SP-215 corrected it to match "Analyzing…" beside it.
    expect(WORKSPACE_STRINGS.analyzeAgain).toBe("Analyze again");
  });
  it("the fallback wording it sits beside is unchanged — I-1 replaced nothing (SP-194)", () => {
    expect(WORKSPACE_STRINGS.runAnalysis).toBe("Run analysis");
    expect(WORKSPACE_STRINGS.analysisReady).toBe("Analysis ready");
  });
  it("there is exactly ONE re-queue spelling in the register — a stray 'Analyse again' would fail here", () => {
    const values = Object.values(WORKSPACE_STRINGS) as string[];
    expect(values.filter((v) => /analy[sz]e\s+again/i.test(v))).toEqual(["Analyze again"]);
  });
});

describe("Job Map register — market door (signed 2026-09-15, item 2, R2)", () => {
  it("the three new strings, byte-identical", () => {
    expect(WORKSPACE_STRINGS.generateJobMap).toBe("Generate job map");
    expect(WORKSPACE_STRINGS.notMapped).toBe("Not mapped");
    expect(WORKSPACE_STRINGS.jobMapGenerationFailed).toBe("Generation did not complete — no steps were written for this market.");
  });
  it("the working state REUSES Working… — no second spelling exists in the register", () => {
    const values = Object.values(WORKSPACE_STRINGS) as string[];
    expect(values.filter((v) => /^working(\.\.\.|…)?$/i.test(v))).toEqual(["Working…"]);
  });
  it("the empty state stays wordless (absent.tsx renders no text)", () => {
    expect(Object.values(WORKSPACE_STRINGS)).not.toContain("No steps");
  });
});

describe("Market — S-MKT-1 (signed 2026-11-14, SP-300)", () => {
  it("byte-identical", () => {
    expect(WORKSPACE_STRINGS.marketNotEnoughEvidence).toBe(
      "Not enough evidence yet to say what this market is hiring for.");
  });
  it("the Market page renders it from the register and carries no copy of its own", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const page = readFileSync(join(__dirname, "MarketPage.tsx"), "utf8");
    expect(page).toContain("WORKSPACE_STRINGS.marketNotEnoughEvidence");
    expect(page).toContain("isGenericJtbdStatement(jtbd)");
    expect(page).not.toContain("Not enough evidence yet to say");
  });
});

describe("Positioning — S-POS-1 (signed 2026-11-13, BRIEF-17 SP-329)", () => {
  it("byte-identical", () => {
    expect(WORKSPACE_STRINGS.positioningOutsideDisagree).toBe("Where outside voices disagree");
  });
  it("every surface renders it from the register and carries no copy of its own", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    for (const rel of [
      "../workshop/tabs/PositioningOrgPanel.tsx",
      "../workshop/tabs/ComparePanel.tsx",
      "../../Positioning/index.tsx",
    ]) {
      const src = readFileSync(join(__dirname, rel), "utf8");
      expect(src, rel).toContain("WORKSPACE_STRINGS.positioningOutsideDisagree");
      expect(src, rel).not.toContain("Where outside voices disagree");
    }
  });
});

describe("Review group + Brief register (signed 2026-11-19: SP-442, SP-424, SP-445, SP-446, SP-449)", () => {
  it("the review group's strings, byte-identical (SP-446 B-10..B-14)", () => {
    expect(WORKSPACE_STRINGS.proposedNeedsReview).toBe("Proposed needs — review");
    expect(WORKSPACE_STRINGS.proposedNeedsFromFiles).toBe("Proposed needs — from file analyses");
    expect(WORKSPACE_STRINGS.pendingFromFileAnalyses).toBe("{n} pending · from file analyses");
    expect(pendingFromFilesLine(5)).toBe("5 pending · from file analyses");
    expect(WORKSPACE_STRINGS.pendingOutsideVoice).toBe("{n} pending · outside voice");
    expect(WORKSPACE_STRINGS.countedQuotesSites).toBe("{counted} counted quotes · {sites} sites");
    expect(WORKSPACE_STRINGS.dateNotShown).toBe("date not shown");
    expect(WORKSPACE_STRINGS.moreMasked).toBe("+ {n} more · reviewer names masked");
    expect(WORKSPACE_STRINGS.accept).toBe("Accept");
    expect(WORKSPACE_STRINGS.reject).toBe("Reject");
  });

  it("the Brief's tile, title and draft mark (SP-442, SP-424)", () => {
    expect(WORKSPACE_STRINGS.briefLabel).toBe("Brief");
    expect(WORKSPACE_STRINGS.briefKicker).toBe("Prepare the conversation");
    expect(WORKSPACE_STRINGS.briefDraftMark).toBe("draft, not signed");
    expect(workspaceDocumentTitle(WORKSPACE_STRINGS.briefLabel, "Charter Communications")).toBe("Brief — Charter Communications");
  });

  it("B-1 — the one line on the Brief that carries meaning, byte-identical", () => {
    expect(WORKSPACE_STRINGS.briefNote).toBe(
      "Every count below is where customers reported a problem, in their own public words. A high count means the problem is well evidenced — it is not a satisfaction rate, and a low count is not approval. Counting follows the merger rule: an undated Cox review, and any Cox review from before 20 August 2026, is shown but not counted.");
  });

  it("the band labels, as SP-446 amended B-4 and B-6, plus SP-449's band", () => {
    expect(WORKSPACE_STRINGS.bandHotspots).toBe("Hotspots");
    expect(WORKSPACE_STRINGS.bandWhatWorks).toBe("What works");
    expect(WORKSPACE_STRINGS.bandThinSpots).toBe("Thin spots");
    expect(WORKSPACE_STRINGS.bandQuestions).toBe("Open questions from the outside read");
    expect(WORKSPACE_STRINGS.belowTheBar).toBe("Below the bar");
    // The register must not keep the pre-amendment wording of either.
    const values = Object.values(WORKSPACE_STRINGS) as string[];
    expect(values).not.toContain("Questions to ask");
    expect(values).not.toContain("Below 3 from 2");
  });

  it("the bar mark, the polarity key and the thin-spot reasons (SP-445, B-5, B-7, B-8, B-9)", () => {
    expect(WORKSPACE_STRINGS.atTheBar).toBe("At the bar");
    expect(WORKSPACE_STRINGS.polarityKey).toBe("working / not working / mixed");
    expect(WORKSPACE_STRINGS.thinTooFewQuotes).toBe("too few counted quotes");
    expect(WORKSPACE_STRINGS.thinTooFewSites).toBe("too few sites");
    expect(WORKSPACE_STRINGS.thinTooFewBoth).toBe("too few counted quotes and too few sites");
    expect(WORKSPACE_STRINGS.withheldCox).toBe("{undated} undated Cox and {pre} pre-merger Cox not counted");
    expect(WORKSPACE_STRINGS.withheldNone).toBe("nothing withheld by the merger rule");
    expect(WORKSPACE_STRINGS.questionsFoot).toBe("{live} live questions · {superseded} superseded not shown");
  });

  it("every template placeholder is filled by its own helper — no {token} survives a render", () => {
    expect(countedQuotesSitesLine(3, 2)).toBe("3 counted quotes · 2 sites");
    expect(pendingOutsideVoiceLine(5)).toBe("5 pending · outside voice");
    expect(moreMaskedLine(7)).toBe("+ 7 more · reviewer names masked");
    expect(questionsFootLine(52, 13)).toBe("52 live questions · 13 superseded not shown");
    expect(withheldLine(5, 1)).toBe("5 undated Cox and 1 pre-merger Cox not counted");
    // B-8's "nothing withheld" arm: a thin spot never implies a withholding that did not happen.
    expect(withheldLine(0, 0)).toBe("nothing withheld by the merger rule");
    for (const s of [countedQuotesSitesLine(1, 1), pendingOutsideVoiceLine(0), moreMaskedLine(1), questionsFootLine(1, 0), withheldLine(1, 0)]) {
      expect(s).not.toMatch(/\{[a-z]+\}/);
    }
  });

});

describe("the card chips mirror the admin queue's vocabulary (SP-452 item 4)", () => {
  // The signed mock prints "NEED · OUTSIDE VOICES" on a card. Those words are the admin queue's own
  // (CandidateReviewQueue.tsx TYPE_LABEL / VOICE_LABEL), which is not exported and which SP-440
  // forbids changing. So the register MIRRORS them and this test reads that file to prove the two
  // never drift — one vocabulary, no edit to /admin.
  it("byte-identical to the strings in CandidateReviewQueue.tsx", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const src = readFileSync(join(__dirname, "../../../components/admin/CandidateReviewQueue.tsx"), "utf8");
    const pick = (map: string, key: string) => {
      const block = src.slice(src.indexOf(`const ${map}`), src.indexOf("};", src.indexOf(`const ${map}`)));
      return new RegExp(`${key}:\\s*"([^"]*)"`).exec(block)?.[1];
    };
    expect(pick("TYPE_LABEL", "candidate_need")).toBe(WORKSPACE_STRINGS.cardKindNeed);
    expect(pick("VOICE_LABEL", "company")).toBe(WORKSPACE_STRINGS.voiceCompany);
    expect(pick("VOICE_LABEL", "outside")).toBe(WORKSPACE_STRINGS.voiceOutside);
    expect(pick("VOICE_LABEL", "mixed")).toBe(WORKSPACE_STRINGS.voiceMixed);
    expect(pick("VOICE_LABEL", "unlabeled")).toBe(WORKSPACE_STRINGS.voiceUnlabeled);
  });
  it("voiceLabel maps every stored value, and an unknown one reads as unlabeled", () => {
    expect(voiceLabel("outside")).toBe("Outside voices");
    expect(voiceLabel("company")).toBe("Company says");
    expect(voiceLabel("mixed")).toBe("Both voices");
    expect(voiceLabel("unlabeled")).toBe("Voice unlabeled");
    expect(voiceLabel(null)).toBe("Voice unlabeled");
    expect(voiceLabel("something new")).toBe("Voice unlabeled");
  });
});
