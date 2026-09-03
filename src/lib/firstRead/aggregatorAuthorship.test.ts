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
  planRestamp,
  RestampRefusedError,
  type AuthorshipJudge,
  type AuthorshipJudgment,
  type RestampStore,
} from "../../../supabase/functions/_shared/aggregatorAuthorship.ts";

const CB1 = "58b2b15b-bada-4bcd-9c12-b7e66a37d0bc";
const GENIANT = "0238d0d8-5b07-4968-bf85-964fded58d0f";
const SUBJECT = { subjectName: "Geniant", subjectHost: "geniant.com" };

const OVERVIEW_URL = "https://www.glassdoor.com/Overview/Working-at-geniant-EI_IE32093.11,18.htm";
const REVIEWS_URL = "https://www.glassdoor.com/Reviews/geniant-Reviews-E32093.htm";
const OTHER_LINKEDIN_URL = "https://www.linkedin.com/company/eastlake-studio";

const COMPANY_COPY =
  "Working with a wide range of organizations - from high-growth startups to Fortune 500 companies - geniant excels at delivering exceptional experiences for your employees and customers.";
const EMPLOYEE_REVIEW = "Great colleagues but leadership changes direction every quarter; work-life balance is poor.";
const RATING_ROW = "geniant employees attributed a compensation and benefits rating of 4.6/5 stars to their company.";
const OTHER_ENTITY_COPY = "Eastlake Studio (acquired by geniant) | 948 followers on LinkedIn. We are a product design studio based in Chicago.";

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
    const judge = stubJudge({ [OTHER_ENTITY_COPY]: judgment("other_entity", "Eastlake Studio") });
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
  const OPTS = { ollamaUrl: "http://localhost:11434/v1" };
  const withFetch = async (stub: typeof fetch, run: () => Promise<void>) => {
    vi.stubGlobal("fetch", stub);
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
      },
    );
  });
  it("unparseable output → judge_failed", async () => {
    await withFetch((() => Promise.resolve(okResp("not json"))) as typeof fetch, async () => {
      expect((await judgeAggregatorAuthorship(INPUT, OPTS)).verdict).toBe("judge_failed");
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
      { signal_id: "b", from: "outside_voice_about_client", to: "competitor_voice" as const, judge_verdict: "other_entity", judge_entity: "Eastlake Studio", judge_reason: "r", judge_model: "m" },
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
