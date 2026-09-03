// AUTHORSHIP GATE — LIVE calibration proof on REAL stored texts (operator ruling 2026-09-03, "tighten").
//
// The first dry-run showed the judge equating neutral tone with third-party authorship: company-supplied
// About/description copy on aggregator profiles (Geniant 1e590a73 Glassdoor Overview, 7 echoes; Edgewood
// e756386d GuideStar, 8 echoes) stayed outside_voice. The Stage-1 planted fixture was marketing-flavored
// and not representative. These cases are the VERBATIM stored texts, judged by the REAL local model
// (qwen2.5:14b-instruct on the operator's Ollama). Each assertion is the operator's ruling for that row.
//
// Runs ONLY when AUTHORSHIP_LIVE=1 and a local Ollama answers — the standing suite never depends on a
// local model. Invoke: AUTHORSHIP_LIVE=1 npx vitest run src/lib/firstRead/aggregatorAuthorship.live.test.ts
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { judgeAggregatorAuthorship, type AuthorshipJudgment } from "../../../supabase/functions/_shared/aggregatorAuthorship.ts";

const OLLAMA = "http://localhost:11434/v1";
const LIVE = process.env.AUTHORSHIP_LIVE === "1";
const T = 180_000;

const GENIANT = { subjectName: "Geniant", subjectHost: "geniant.com" };
const EDGEWOOD = { subjectName: "Edgewood", subjectHost: "edgewood.org" };
const IAQM = { subjectName: "Indoor Air Quality Management", subjectHost: "iaqm.com" };

// ── the real rows (signals.claim_text, verbatim) ──────────────────────────────────
const ROW_1e590a73 = {
  ...GENIANT,
  url: "https://www.glassdoor.com/Overview/Working-at-geniant-EI_IE32093.11,18.htm",
  text: "Working with a wide range of organizations - from high-growth startups to Fortune 500 companies - geniant excels at delivering exceptional experiences for your employees and customers. Only 3 employee reviews publicly visible.",
};
const ROW_c0f33a55 = {
  ...GENIANT,
  url: "https://www.glassdoor.com/Overview/Working-at-geniant-EI_IE32093.11,18.htm",
  text: "geniant employees attributed a compensation and benefits rating of 4.6/5 stars to their company.",
};
const ROW_e756386d = {
  ...EDGEWOOD,
  url: "https://www.guidestar.org/profile/94-1186168",
  text: "Edgewood CSU is the only crisis stabilization unit serving youth under 12 in the Bay Area; opened 2014 in conjunction with SF Department of Public Health.",
};
const ROW_70f42b5e = {
  ...IAQM,
  url: "https://www.cbinsights.com/company/indoor-air-quality-management",
  text: "Indoor Air Quality Management focuses on mold remediation and air quality improvement within the environmental services sector. It was founded in 2002 and is based in Dallas, Texas.",
};
const ROW_808eff85 = {
  ...GENIANT,
  url: "https://www.linkedin.com/company/vegastudio",
  text: "Vega is now a part of geniant. Vega is a digital product studio based out of Dallas, Texas.",
};
const ROW_e1582f37 = {
  ...IAQM,
  url: "https://www.zoominfo.com/c/iaqm-llc/18563401",
  text: "IAQM is a leading provider of mold remediation services in the Dallas-Fort Worth metroplex, boasting over 20 years of experience. SIC Code 17,179; NAICS Code 56,562.",
};
const ROW_b5d8086f = {
  ...IAQM,
  url: "https://www.zoominfo.com/c/iaqm-llc/18563401",
  text: "IAQM is a leading provider of mold remediation services in the Dallas-Fort Worth metroplex, boasting over 20 years of experience. Services include dry ice blasting and support for individuals with environmental illnesses.",
};
const ROW_c62d39b5 = {
  ...GENIANT,
  url: "https://www.globenewswire.com/search/organization/geniant",
  text: "geniant announced the acquisition of 17seconds, a leading product design and innovation studio.",
};

let reachable = false;
// jsdom supplies its own AbortController while fetch is Node's (undici), which rejects a foreign
// AbortSignal before the request leaves. Route the judge's fetch through Node's fetch without the
// signal — the per-call timeout is irrelevant to this proof.
const nodeFetch = globalThis.fetch;
beforeAll(async () => {
  if (!LIVE) return;
  vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) => nodeFetch(input, { ...(init ?? {}), signal: undefined }));
  try {
    const r = await fetch("http://localhost:11434/api/tags");
    reachable = r.ok;
  } catch {
    reachable = false;
  }
});

afterAll(() => vi.unstubAllGlobals());

const judge = (input: typeof ROW_1e590a73): Promise<AuthorshipJudgment> => judgeAggregatorAuthorship(input, { ollamaUrl: OLLAMA });

describe.skipIf(!LIVE)("LIVE judge on real stored texts (AUTHORSHIP_LIVE=1)", () => {
  it("Ollama is reachable for the live proof", () => {
    expect(reachable).toBe(true);
  });

  it("1e590a73 — Glassdoor Overview company-supplied About copy (7 false echoes) → subject_company", async () => {
    const r = await judge(ROW_1e590a73);
    expect(r, r.reason).toMatchObject({ verdict: "subject_company" });
  }, T);

  it("c0f33a55 — same URL, employee rating line → third_party (must NOT flip)", async () => {
    const r = await judge(ROW_c0f33a55);
    expect(r, r.reason).toMatchObject({ verdict: "third_party" });
  }, T);

  it("e756386d — GuideStar self-reported program description (8 echoes) → subject_company", async () => {
    const r = await judge(ROW_e756386d);
    expect(r, r.reason).toMatchObject({ verdict: "subject_company" });
  }, T);

  it("70f42b5e — CB Insights analyst blurb with founding year → third_party", async () => {
    const r = await judge(ROW_70f42b5e);
    expect(r, r.reason).toMatchObject({ verdict: "third_party" });
  }, T);

  it("808eff85 — Vega's own LinkedIn line → other_entity naming Vega", async () => {
    const r = await judge(ROW_808eff85);
    expect(r, r.reason).toMatchObject({ verdict: "other_entity" });
    expect((r.entity ?? "").toLowerCase()).toContain("vega");
  }, T);

  it("e1582f37 vs b5d8086f — identical ZoomInfo description copy must get the SAME verdict (subject_company)", async () => {
    const a = await judge(ROW_e1582f37);
    const b = await judge(ROW_b5d8086f);
    expect(a.verdict, `e1582f37: ${a.reason}`).toBe(b.verdict);
    expect(a.verdict, `e1582f37: ${a.reason}`).toBe("subject_company");
  }, T * 2);

  it("c62d39b5 — press-wire release body → subject_company", async () => {
    const r = await judge(ROW_c62d39b5);
    expect(r, r.reason).toMatchObject({ verdict: "subject_company" });
  }, T);
});
