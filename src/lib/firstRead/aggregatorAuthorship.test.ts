// AUTHORSHIP GATE guards (operator ruling 2026-09-03, A+B) — CHANNEL ≠ VOICE on the outside
// ingest path. The module lives under supabase/functions/_shared (edge-mounted); this test lives
// under src/** so the vitest suite runs it (clientVoiceGuard.test.ts precedent). Each proof fails
// if its branch is removed:
//   · URL pattern GATES the judge (a /Reviews/ row never reaches the model);
//   · AUTHORSHIP decides (subject company speaking → client_voice; another named entity → competitor_voice;
//     third-party / uncertain / judge failure → label untouched);
//   · the backfill REFUSES a frozen company (CB1) before any write, in plan and in apply.
import { describe, expect, it, vi } from "vitest";
import {
  applyAuthorshipToEntries,
  applyRestamp,
  judgeAggregatorAuthorship,
  matchAggregatorProfileUrl,
  ollamaAuthorshipTransport,
  planRestamp,
  RestampRefusedError,
  type AuthorshipJudge,
  type AuthorshipJudgment,
  type RestampStore,
  matchGatedUrl,
  subjectBoilerplateClose,
  isReleasePathShaped,
  PRESS_RELEASE_PATTERNS,
} from "../../../supabase/functions/_shared/aggregatorAuthorship.ts";

const CB1 = "58b2b15b-bada-4bcd-9c12-b7e66a37d0bc";
const GENIANT = "0238d0d8-5b07-4968-bf85-964fded58d0f";
const SUBJECT = { subjectName: "Geniant", subjectHost: "geniant.com" };

const OVERVIEW_URL = "https://www.glassdoor.com/Overview/Working-at-geniant-EI_IE32093.11,18.htm";
const REVIEWS_URL = "https://www.glassdoor.com/Reviews/geniant-Reviews-E32093.htm";
const OTHER_LINKEDIN_URL = "https://www.linkedin.com/company/vegastudio";

// REAL stored text of Geniant 1e590a73 (the 7-false-echo row) — including the appended E4-class
// analysis fragment, which is exactly what the first judge tripped on.
const COMPANY_COPY =
  "Working with a wide range of organizations - from high-growth startups to Fortune 500 companies - geniant excels at delivering exceptional experiences for your employees and customers. Only 3 employee reviews publicly visible.";
const EMPLOYEE_REVIEW = "Great colleagues but leadership changes direction every quarter; work-life balance is poor.";
const RATING_ROW = "geniant employees attributed a compensation and benefits rating of 4.6/5 stars to their company.";
// REAL stored text of Geniant 808eff85 (Vega's own LinkedIn company page).
const OTHER_ENTITY_COPY = "Vega is now a part of geniant. Vega is a digital product studio based out of Dallas, Texas.";

const judgment = (verdict: AuthorshipJudgment["verdict"], entity: string | null = null): AuthorshipJudgment => ({
  verdict, entity, reason: `stub: ${verdict}`, model: "stub-model",
});

// A stub judge keyed by statement text — the URL gate is proven by which statements it is ASKED about.
const stubJudge = (table: Record<string, AuthorshipJudgment>) =>
  vi.fn<AuthorshipJudge>(async (input) => table[input.text] ?? judgment("uncertain"));

describe("URL gate — the pattern decides WHETHER the judge runs, never WHAT it says", () => {
  it("matches aggregator profile/overview/organization pages", () => {
    expect(matchAggregatorProfileUrl(OVERVIEW_URL)?.host).toBe("glassdoor.com");
    expect(matchAggregatorProfileUrl(OTHER_LINKEDIN_URL)?.host).toBe("linkedin.com");
    expect(matchAggregatorProfileUrl("https://www.crunchbase.com/organization/geniant")?.host).toBe("crunchbase.com");
    expect(matchAggregatorProfileUrl("https://www.zoominfo.com/c/geniant-llc/42141974")?.host).toBe("zoominfo.com");
    expect(matchAggregatorProfileUrl("https://www.cbinsights.com/company/indoor-air-quality-management")?.host).toBe("cbinsights.com");
  });
  it("does NOT match review pages, news releases, person profiles, or non-aggregator hosts", () => {
    expect(matchAggregatorProfileUrl(REVIEWS_URL)).toBeNull();
    expect(matchAggregatorProfileUrl("https://www.glassdoor.com/Salary/geniant-Salaries-E32093.htm")).toBeNull();
    expect(matchAggregatorProfileUrl("https://www.indeed.com/cmp/Iaqm/reviews?fcountry=US")).toBeNull();
    expect(matchAggregatorProfileUrl("https://www.globenewswire.com/news-release/2022/07/07/geniant-launches.html")).toBeNull();
    expect(matchAggregatorProfileUrl("https://www.linkedin.com/in/yasminshanker/")).toBeNull();
    expect(matchAggregatorProfileUrl("https://www.crunchbase.com/person/jack-skates-0c2d")).toBeNull();
    expect(matchAggregatorProfileUrl("https://geniant.com/about")).toBeNull();
    expect(matchAggregatorProfileUrl("not a url")).toBeNull();
  });
});

describe("AUTHORSHIP decides the label (ingest branch)", () => {
  it("planted /Overview/ company-copy row → client_voice, judge provenance stamped on the entry", async () => {
    const judge = stubJudge({ [COMPANY_COPY]: judgment("subject_company") });
    const out = await applyAuthorshipToEntries(
      [{ url: OVERVIEW_URL, snippet: COMPANY_COPY, voice_class: "outside_voice_about_client" }],
      { ...SUBJECT, getText: (e) => String(e.snippet ?? ""), judge },
    );
    expect(out.entries[0].voice_class).toBe("client_voice");
    expect(judge).toHaveBeenCalledTimes(1);
    const stamp = (out.entries[0] as { authorship_judge?: { verdict: string; applied: string } }).authorship_judge;
    expect(stamp?.verdict).toBe("subject_company");
    expect(stamp?.applied).toBe("client_voice");
    expect(out.stats.changed).toBe(1);
  });

  it("planted /Reviews/ employee row → unchanged, and the judge is NEVER asked (URL gate)", async () => {
    const judge = stubJudge({ [EMPLOYEE_REVIEW]: judgment("subject_company") }); // would flip if asked
    const out = await applyAuthorshipToEntries(
      [{ url: REVIEWS_URL, snippet: EMPLOYEE_REVIEW, voice_class: "outside_voice_about_client" }],
      { ...SUBJECT, getText: (e) => String(e.snippet ?? ""), judge },
    );
    expect(out.entries[0].voice_class).toBe("outside_voice_about_client");
    expect(judge).not.toHaveBeenCalled();
  });

  it("planted competitor LinkedIn company page → competitor_voice (another named entity speaking), never client_voice", async () => {
    const judge = stubJudge({ [OTHER_ENTITY_COPY]: judgment("other_entity", "Vega") });
    const out = await applyAuthorshipToEntries(
      [{ url: OTHER_LINKEDIN_URL, snippet: OTHER_ENTITY_COPY, voice_class: "outside_voice_about_client" }],
      { ...SUBJECT, getText: (e) => String(e.snippet ?? ""), judge },
    );
    expect(out.entries[0].voice_class).toBe("competitor_voice");
  });

  it("same-URL genuine outside row (4.6/5 rating → third_party) stays outside_voice_about_client", async () => {
    const judge = stubJudge({ [RATING_ROW]: judgment("third_party") });
    const out = await applyAuthorshipToEntries(
      [{ url: OVERVIEW_URL, snippet: RATING_ROW, voice_class: "outside_voice_about_client" }],
      { ...SUBJECT, getText: (e) => String(e.snippet ?? ""), judge },
    );
    expect(out.entries[0].voice_class).toBe("outside_voice_about_client");
    expect(judge).toHaveBeenCalledTimes(1);
  });

  it("judge failure → label untouched (fail-toward-unchanged), failure recorded on the entry", async () => {
    const judge = vi.fn<AuthorshipJudge>(async () => ({ verdict: "judge_failed", entity: null, reason: "HTTP 500", model: "stub-model" }));
    const out = await applyAuthorshipToEntries(
      [{ url: OVERVIEW_URL, snippet: COMPANY_COPY, voice_class: "outside_voice_about_client" }],
      { ...SUBJECT, getText: (e) => String(e.snippet ?? ""), judge },
    );
    expect(out.entries[0].voice_class).toBe("outside_voice_about_client");
    expect((out.entries[0] as { authorship_judge?: { verdict: string } }).authorship_judge?.verdict).toBe("judge_failed");
    expect(out.stats.judge_failed).toBe(1);
  });

  it("'other_entity' that actually names the SUBJECT is inconsistent → unchanged, not competitor_voice", async () => {
    const judge = stubJudge({ [COMPANY_COPY]: judgment("other_entity", "geniant LLC") });
    const out = await applyAuthorshipToEntries(
      [{ url: OVERVIEW_URL, snippet: COMPANY_COPY, voice_class: "outside_voice_about_client" }],
      { ...SUBJECT, getText: (e) => String(e.snippet ?? ""), judge },
    );
    expect(out.entries[0].voice_class).toBe("outside_voice_about_client");
  });
});

describe("local judge transport — verbatim-or-nothing, fail toward judge_failed", () => {
  const INPUT = { ...SUBJECT, url: OVERVIEW_URL, text: COMPANY_COPY };
  // R53: the judge takes the transport and a REQUIRED ledger; each test asserts one ledger row per call.
  let ledgerRows: Array<{ usage: { provider: string; prompt_tokens: number | null }; promptSha: string }> = [];
  const OPTS = {
    transport: ollamaAuthorshipTransport("http://localhost:11434/v1"),
    ledger: async (e: { usage: { provider: string; prompt_tokens: number | null }; promptSha: string }) => { ledgerRows.push(e); return true; },
  };
  const withFetch = async (stub: typeof fetch, run: () => Promise<void>) => {
    vi.stubGlobal("fetch", stub);
    ledgerRows = [];
    try { await run(); } finally { vi.unstubAllGlobals(); }
  };
  const okResp = (content: string) => new Response(JSON.stringify({ message: { content } }), { status: 200 });

  it("good JSON → the model's verdict, entity, and reason are honored verbatim", async () => {
    await withFetch(
      (() => Promise.resolve(okResp(JSON.stringify({ verdict: "subject_company", entity: null, reason: "first-person company boilerplate" })))) as typeof fetch,
      async () => {
        const r = await judgeAggregatorAuthorship(INPUT, OPTS);
        expect(r.verdict).toBe("subject_company");
        expect(r.reason).toBe("first-person company boilerplate");
        expect(ledgerRows.length).toBe(1);
        expect(ledgerRows[0].usage.provider).toBe("ollama");
        expect(ledgerRows[0].promptSha).toMatch(/^[0-9a-f]{64}$/);
      },
    );
  });
  it("unparseable output → judge_failed", async () => {
    await withFetch((() => Promise.resolve(okResp("not json"))) as typeof fetch, async () => {
      expect((await judgeAggregatorAuthorship(INPUT, OPTS)).verdict).toBe("judge_failed");
      expect(ledgerRows.length, "ledgered before parse: an unparseable answer still cost").toBe(1);
    });
  });
  it("verdict without a reason → judge_failed (verbatim-or-nothing)", async () => {
    await withFetch((() => Promise.resolve(okResp(JSON.stringify({ verdict: "subject_company", reason: "" })))) as typeof fetch, async () => {
      expect((await judgeAggregatorAuthorship(INPUT, OPTS)).verdict).toBe("judge_failed");
    });
  });
  it("HTTP failure → judge_failed", async () => {
    await withFetch((() => Promise.resolve(new Response("boom", { status: 500 }))) as typeof fetch, async () => {
      expect((await judgeAggregatorAuthorship(INPUT, OPTS)).verdict).toBe("judge_failed");
      expect(ledgerRows.length, "a failed call is ledgered with null usage").toBe(1);
      expect(ledgerRows[0].usage.prompt_tokens).toBeNull();
      // R53: no ledger ⇒ the judge throws before any call (the type forbids it; the cast proves the runtime check)
      const before = ledgerRows.length;
      await expect(judgeAggregatorAuthorship(INPUT, { transport: OPTS.transport } as unknown as typeof OPTS)).rejects.toThrow(/ledger is required/);
      expect(ledgerRows.length).toBe(before);
    });
  });
});

// ── backfill core (B) with an injected store ─────────────────────────────────────
type Sig = { id: string; company_id: string; source_url: string | null; voice_class: string | null; claim_text: string; evidence_excerpt: string; held_at: string | null; raw_payload: Record<string, unknown> };

function fakeStore(args: { companies: Array<{ id: string; name: string; website: string | null; frozen: boolean }>; signals: Sig[] }) {
  const writes: Array<{ kind: string; payload: unknown }> = [];
  const store: RestampStore = {
    loadCompanies: vi.fn(async () => args.companies),
    loadCandidateSignals: vi.fn(async (companyIds: string[]) => args.signals.filter((s) => companyIds.includes(s.company_id))),
    loadDeltaBacking: vi.fn(async () => new Map()),
    loadSignalsById: vi.fn(async (ids: string[]) => args.signals.filter((s) => ids.includes(s.id))),
    openLedger: vi.fn(async (companyId: string) => { writes.push({ kind: "ledger", payload: companyId }); return `ledger-${companyId}`; }),
    closeLedger: vi.fn(async () => {}),
    insertAudit: vi.fn(async (row) => { writes.push({ kind: "audit", payload: row }); }),
    writeVoiceClass: vi.fn(async (signalId, voiceClass) => { writes.push({ kind: "signal", payload: { signalId, voiceClass } }); }),
    loadAudit: vi.fn(async () => []),
    markReverted: vi.fn(async () => {}),
  };
  return { store, writes };
}

const sig = (over: Partial<Sig>): Sig => ({
  id: "sig-1", company_id: GENIANT, source_url: OVERVIEW_URL, voice_class: "outside_voice_about_client",
  claim_text: COMPANY_COPY, evidence_excerpt: COMPANY_COPY, held_at: null, raw_payload: {}, ...over,
});
const COMPANIES = [
  { id: GENIANT, name: "Geniant", website: "https://geniant.com", frozen: false },
  { id: CB1, name: "Cafe Barra", website: "https://cafebarra.com", frozen: true },
];

describe("backfill — frozen guard (CB1 is refused before any write)", () => {
  it("plan for CB1 explicitly → refused; the judge is never called", async () => {
    const { store } = fakeStore({ companies: COMPANIES, signals: [sig({ id: "cb1-sig", company_id: CB1 })] });
    const judge = stubJudge({ [COMPANY_COPY]: judgment("subject_company") });
    await expect(planRestamp(store, { companyId: CB1, judge })).rejects.toBeInstanceOf(RestampRefusedError);
    expect(judge).not.toHaveBeenCalled();
  });
  it("plan across all companies → CB1's rows are skipped (never judged), non-frozen rows are proposed", async () => {
    const { store } = fakeStore({ companies: COMPANIES, signals: [sig({ id: "g-sig" }), sig({ id: "cb1-sig", company_id: CB1 })] });
    const judge = stubJudge({ [COMPANY_COPY]: judgment("subject_company") });
    const plan = await planRestamp(store, { judge });
    expect(plan.skipped_frozen).toEqual([CB1]);
    expect(plan.proposals.map((p) => p.signal_id)).toEqual(["g-sig"]);
    expect(plan.proposals[0].to).toBe("client_voice");
    expect(judge).toHaveBeenCalledTimes(1);
  });
  it("apply with a planted CB1 row in the plan → refused BEFORE any write (no ledger, no audit, no signal write)", async () => {
    const { store, writes } = fakeStore({ companies: COMPANIES, signals: [sig({ id: "g-sig" }), sig({ id: "cb1-sig", company_id: CB1 })] });
    const plan = [
      { signal_id: "g-sig", from: "outside_voice_about_client", to: "client_voice" as const, judge_verdict: "subject_company", judge_entity: null, judge_reason: "r", judge_model: "m" },
      { signal_id: "cb1-sig", from: "outside_voice_about_client", to: "client_voice" as const, judge_verdict: "subject_company", judge_entity: null, judge_reason: "r", judge_model: "m" },
    ];
    await expect(applyRestamp(store, { plan })).rejects.toBeInstanceOf(RestampRefusedError);
    expect(writes).toEqual([]);
  });
});

describe("backfill — apply writes one audit row per changed row, and skips drift", () => {
  it("audit-row count == changed-row count; a row whose current class drifted from the plan is skipped", async () => {
    const { store, writes } = fakeStore({
      companies: COMPANIES,
      signals: [sig({ id: "a" }), sig({ id: "b", source_url: OTHER_LINKEDIN_URL }), sig({ id: "drifted", voice_class: "market_context" })],
    });
    const plan = [
      { signal_id: "a", from: "outside_voice_about_client", to: "client_voice" as const, judge_verdict: "subject_company", judge_entity: null, judge_reason: "r", judge_model: "m" },
      { signal_id: "b", from: "outside_voice_about_client", to: "competitor_voice" as const, judge_verdict: "other_entity", judge_entity: "Vega", judge_reason: "r", judge_model: "m" },
      { signal_id: "drifted", from: "outside_voice_about_client", to: "client_voice" as const, judge_verdict: "subject_company", judge_entity: null, judge_reason: "r", judge_model: "m" },
    ];
    const out = await applyRestamp(store, { plan });
    expect(out.applied).toBe(2);
    expect(out.skipped.map((s) => s.signal_id)).toEqual(["drifted"]);
    expect(writes.filter((w) => w.kind === "audit")).toHaveLength(2);
    expect(writes.filter((w) => w.kind === "signal")).toHaveLength(2);
    const audit = writes.filter((w) => w.kind === "audit").map((w) => w.payload as { signal_id: string; old_voice_class: string; new_voice_class: string });
    expect(audit.map((a) => [a.signal_id, a.old_voice_class, a.new_voice_class])).toEqual([
      ["a", "outside_voice_about_client", "client_voice"],
      ["b", "outside_voice_about_client", "competitor_voice"],
    ]);
  });
});

// ── PRESS RELEASES (operator ruling, 2026-10-16) ────────────────────────────────────────────────
//
// The 2026-09-03 gate excluded news releases: their dominant voice is a journalist's. True of the
// reporting, false of the BOILERPLATE — a release carries an "About <company>" paragraph that is the
// company's own copy, and a third party reprinting it does not make it the third party's words.
// IAQM's staged positioning cited exactly such a sentence from contractorsupplymagazine.com.
//
// Detector (a) is the wire hosts on their release paths. Detector (b) is a boilerplate close naming
// the SUBJECT's own domain, and it NEVER opens alone: it also needs a release-shaped path and a page
// that is not a machine summary. Release-shape is read from the PATH, because prose markers were
// measured against the eight pages (b) finds in the fleet and do not separate them — three true
// releases carry no SOURCE line, no media contact and no dateline at all.
const IAQM_PAGE = [
  "WonderPaint and IAQM team up to co-market Preventex-HDW",
  "WonderPaint's entire product line has been engineered to be green.",
  "For more information, visit www.wonderpaint.com .",
  "IAQM provides remediation and restoration services in both residential and commercial markets.",
  "The company has pioneered many of the most advanced, efficient and cost-effective decontamination services in the industry.",
  "For more information, visit http://www.iaqm.com/ .",
].join("\n");
const IAQM_URL = "https://contractorsupplymagazine.com/pages/News---20180418-WonderPaint-and-IAQM-team-up-to-co-market-Preventex-HDW.php";

describe("press releases — detector (a), the wire hosts", () => {
  it("opens on a release path and stays shut on the same host's index", () => {
    expect(matchGatedUrl("https://www.prnewswire.com/news-releases/wonderpaint-and-iaqm-x.html", {})?.via).toBe("wire");
    // the AAF row in the fleet: a wire ORGANISATION INDEX listing many releases, not one company's
    // boilerplate. The path is the gate, exactly as it is for the profile list.
    expect(matchGatedUrl("https://www.prnewswire.com/news/american-advertising-federation/", {})).toBeNull();
    expect(matchGatedUrl("https://www.businesswire.com/portal/site/home/news/", {})).toBeNull();
    for (const p of PRESS_RELEASE_PATTERNS) expect(p.path.source).toMatch(/^\^/);   // anchored, not a substring
  });
});

describe("press releases — detector (b), the boilerplate close", () => {
  it("finds the SUBJECT's close among several, and no one else's", () => {
    // a joint release carries one close per company and the subject's is not necessarily first
    expect(subjectBoilerplateClose(IAQM_PAGE, "iaqm.com")).toContain("iaqm.com");
    expect(subjectBoilerplateClose(IAQM_PAGE, "wonderpaint.com")).toContain("wonderpaint.com");
    // a company named in NO close on the page gets nothing — this is the discrimination that keeps
    // one company's boilerplate from opening another company's gate
    expect(subjectBoilerplateClose(IAQM_PAGE, "example-not-here.com")).toBeNull();
    expect(matchGatedUrl(IAQM_URL, { pageText: IAQM_PAGE, subjectHost: "example-not-here.com" })).toBeNull();
    // case-insensitive: the fleet carries "visit www.Coreviva.com ."
    expect(subjectBoilerplateClose("For more information, visit www.Coreviva.com .", "coreviva.com")).toBeTruthy();
  });

  it("NEVER opens alone — it needs a release-shaped path and a page that is not a machine summary", () => {
    expect(matchGatedUrl(IAQM_URL, { pageText: IAQM_PAGE, subjectHost: "iaqm.com" })?.via).toBe("boilerplate");
    // impala.digital: an aggregator profile whose AI summary ends with a boilerplate close. The
    // close is there; the page reprints nothing. TWO independent reasons hold it shut.
    const SUMMARY = "Edgewood runs programs for children. For more information, visit www.edgewood.org. Was this helpful? This summary is AI-generated from ChatGPT.";
    const PROFILE_URL = "https://impala.digital/public/profiles/94-1186168/overview";
    expect(subjectBoilerplateClose(SUMMARY, "edgewood.org")).toBeTruthy();      // the close IS found
    expect(isReleasePathShaped(PROFILE_URL)).toBe(false);                       // reason 1: the path
    expect(matchGatedUrl(PROFILE_URL, { pageText: SUMMARY, subjectHost: "edgewood.org" })).toBeNull();
    // reason 2 on its own: the same text on a release path is still refused as a machine summary
    expect(matchGatedUrl("https://example.com/news/edgewood-update", { pageText: SUMMARY, subjectHost: "edgewood.org" })).toBeNull();
    // and without the page text (b) cannot be decided, so the gate stays shut — fail toward unchanged
    expect(matchGatedUrl(IAQM_URL, { pageText: null, subjectHost: "iaqm.com" })).toBeNull();
  });

  it("the FILED LIMIT: a reprint on a path that names no release stays shut", () => {
    // Coreviva's release is reprinted by a local paper that publishes articles at the ROOT:
    // newportbeachindy.com/coreviva-launches-flagship-clinic-... — a real boilerplate close, a page
    // that is no machine summary, and no news/release segment in the path. The ruling of 2026-10-16
    // accepts this miss and fails closed rather than widen release-shape on a sample of one. The
    // limit is asserted so it stays DELIBERATE: this is the shape that must not quietly start
    // opening, and it is the only thing holding it shut once a release path is absent.
    const CLEAN = "CoreViva Launches Flagship Clinic in Newport Beach. For more information, visit www.Coreviva.com .";
    const ROOT_URL = "https://www.newportbeachindy.com/coreviva-launches-flagship-clinic-in-newport-beach/";
    expect(subjectBoilerplateClose(CLEAN, "coreviva.com")).toBeTruthy();   // the close IS there
    expect(isReleasePathShaped(ROOT_URL)).toBe(false);                     // the path names no release
    expect(matchGatedUrl(ROOT_URL, { pageText: CLEAN, subjectHost: "coreviva.com" })).toBeNull();
  });

  it("release-shape excludes the pages the 2026-09-03 ruling still excludes", () => {
    for (const u of [
      "https://example.com/reviews/acme",
      "https://example.com/news/people/jane-doe",
      "https://example.com/search?q=acme",
      "https://example.com/profiles/acme/overview",
      "https://example.com/jobs/acme",
    ]) expect(isReleasePathShaped(u), u).toBe(false);
    expect(isReleasePathShaped("https://example.com/news/acme-launches-thing")).toBe(true);
  });
});

describe("press releases — the gate is per PAGE; the JUDGE is per row", () => {
  it("every row on a multi-voice page passes the same gate, and the judge sees each row's own text", async () => {
    // The IAQM release carries five rows: the joint lede, the magazine's framing, an announcement
    // with a quote, and IAQM's own boilerplate. The gate takes a URL, so it opens for all of them —
    // that is what "detectors only gate" means. What separates the voices is the judge, which is
    // handed each ROW's text, never the page.
    const CO = "11111111-1111-4111-8111-111111111111";
    const rows = [
      sig({ id: "joint", company_id: CO, source_url: IAQM_URL, claim_text: "WonderPaint Distribution, LLC and IAQM announced an agreement.", evidence_excerpt: "" }),
      sig({ id: "framing", company_id: CO, source_url: IAQM_URL, claim_text: "Contractor Supply Magazine covered the partnership.", evidence_excerpt: "" }),
      sig({ id: "boiler", company_id: CO, source_url: IAQM_URL, claim_text: "IAQM provides remediation and restoration services in both residential and commercial markets.", evidence_excerpt: "" }),
    ];
    const { store } = fakeStore({ companies: [{ id: CO, name: "Indoor Air Quality Management", website: "https://iaqm.com", frozen: false }], signals: rows });
    (store as unknown as { loadPageTexts: unknown }).loadPageTexts = vi.fn(async () => new Map([[IAQM_URL, IAQM_PAGE]]));
    const seen: string[] = [];
    const plan = await planRestamp(store, {
      judge: async ({ text }) => { seen.push(text); return { verdict: "third_party", entity: null, reason: "stub", model: "stub" }; },
    });
    expect(plan.proposals.map((p) => p.signal_id).sort()).toEqual(["boiler", "framing", "joint"]);
    expect(plan.proposals.every((p) => p.via === "boilerplate")).toBe(true);
    // the judge got three DIFFERENT texts — one per row — not the page three times
    expect(new Set(seen).size).toBe(3);
    expect(seen.some((t) => t.includes("IAQM provides remediation"))).toBe(true);
    expect(seen.some((t) => t.includes("Contractor Supply Magazine covered"))).toBe(true);
    expect(seen.every((t) => !t.includes("wonderpaint.com"))).toBe(true);      // never the whole page
  });

  it("a shut gate shows it looked: rows with no stored page are counted per company", async () => {
    const CO = "22222222-2222-4222-8222-222222222222";
    const rows = [sig({ id: "nopage", company_id: CO, source_url: "https://somepaper.example/news/acme-launches", claim_text: "Acme launches a thing.", evidence_excerpt: "" })];
    const { store } = fakeStore({ companies: [{ id: CO, name: "Acme", website: "https://acme.example", frozen: false }], signals: rows });
    (store as unknown as { loadPageTexts: unknown }).loadPageTexts = vi.fn(async () => new Map());
    const plan = await planRestamp(store, { judge: async () => ({ verdict: "third_party", entity: null, reason: "x", model: "stub" }) });
    expect(plan.proposals).toHaveLength(0);
    expect(plan.unreadable_pages).toEqual([{ company_id: CO, company_name: "Acme", rows: 1 }]);
  });
});
