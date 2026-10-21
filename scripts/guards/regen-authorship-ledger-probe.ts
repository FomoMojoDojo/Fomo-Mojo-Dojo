// R53 probe (2026-10-20) — the authorship judge obeys R4 on every path that calls it. The REAL judgeAggregatorAuthorship
// over a FAKE local transport (no network, no model, no db), on the three caller seams:
//   regen    — the write path (runOutsideRegen) on the R17 fixtures, one gated URL; the judge built by makeJudge(ledger)
//              exactly as extract-outside-evidence builds it: rows at extract-outside-evidence:authorship and the tally;
//   baseline — the public-baseline seam (demoteAggregatorSelfVoiceInResult) with one gated profile entry;
//   restamp  — the dry-run plan (planRestamp) on a fake store, the ledger keyed to the row's company;
//   no_ledger — a call with no ledger throws before the transport is reached (transport calls stay 0).
// Measured per seam: judge calls, ledger rows, and (regen) the run's tally — rows must equal calls; and, for the
// ledger-before-parse rule, an unparseable answer still writes its row. P5 plant (the success-path ledger write in
// judgeAggregatorAuthorship commented out) ⇒ rows 0 while calls ≥ 1 on every seam.
import { runOutsideRegen } from "../../supabase/functions/_shared/outsideRegenHandler.ts";
import { regenCallSite } from "../../supabase/functions/_shared/outsideRegenModel.ts";
import {
  authorshipContext,
  demoteAggregatorSelfVoiceInResult, judgeAggregatorAuthorship, planRestamp,
  type AuthorshipLedger, type AuthorshipTransport, type RestampStore,
} from "../../supabase/functions/_shared/aggregatorAuthorship.ts";
import { fakeDb, seedR17, deps, r17Transport, CO, RUN2 } from "../../supabase/functions/_shared/outsideRegenHandler.test.ts";

const UGATED = "https://www.crunchbase.com/organization/acme-coffee";
let transportCalls = 0;
const fake = (content: string): AuthorshipTransport => () => { transportCalls++; return Promise.resolve({ content, prompt_tokens: 300, completion_tokens: 20 }); };
const SUBJECT = fake(JSON.stringify({ verdict: "subject_company", entity: null, reason: "the profile's about text is the company's own" }));

// ── regen ──
const db = fakeDb(seedR17());
const { d, ledgerRows } = deps(db, r17Transport(), null);
let regenCalls = 0;
d.makeJudge = (ledger) => (i) => { regenCalls++; return judgeAggregatorAuthorship(i, { transport: SUBJECT, ledger, model: "fake-qwen" }); };
const r = await runOutsideRegen({ company_id: CO, run_id: RUN2, write: true, urls: [UGATED] }, d);
const authRows = ledgerRows.filter((e) => e.role === "authorship");
const tally = (r.body.model_calls as Record<string, number>) ?? {};

// ── baseline seam ──
// R54: the judge reads the text in place on a page; each path is handed the page it would hold
const PROBE_PAGE = "About\nAcme Coffee is a specialty roaster supplying 40 cafes.";
const baseRows: unknown[] = []; let baseCalls = 0;
const baseLedger: AuthorshipLedger = (e) => { baseRows.push(e); return Promise.resolve(true); };
await demoteAggregatorSelfVoiceInResult(
  { outside_voice_signals: [{ url: UGATED, voice_class: "outside_voice_about_client", signal: "Acme Coffee is a specialty roaster supplying 40 cafes." }] },
  { subjectName: "Acme Coffee", subjectHost: "acmecoffee.com", pageFor: () => PROBE_PAGE, judge: (i) => { baseCalls++; return judgeAggregatorAuthorship(i, { transport: SUBJECT, ledger: baseLedger, model: "fake-qwen" }); } },
);

// ── restamp dry-run plan ──
const store: RestampStore = {
  loadCompanies: () => Promise.resolve([{ id: CO, name: "Acme Coffee", website: "https://acmecoffee.com", frozen: false }]),
  loadCandidateSignals: () => Promise.resolve([{ id: "sig-r53", company_id: CO, source_url: UGATED, voice_class: "outside_voice_about_client", claim_text: "Acme Coffee is a specialty roaster supplying 40 cafes.", evidence_excerpt: "Acme Coffee is a specialty roaster supplying 40 cafes.", held_at: null, raw_payload: {} }]),
  loadDeltaBacking: () => Promise.resolve(new Map()),
  loadPageTexts: () => Promise.resolve(new Map([[UGATED, PROBE_PAGE]])),
} as unknown as RestampStore;
const restampRows: Array<{ companyId: string }> = []; let restampCalls = 0;
await planRestamp(store, {
  judge: (i, ctx) => { restampCalls++; return judgeAggregatorAuthorship(i, { transport: SUBJECT, model: "fake-qwen", ledger: () => { restampRows.push({ companyId: ctx.companyId }); return Promise.resolve(true); } }); },
});

// ── ledger before parse: an unparseable answer still writes its row ──
const unparseRows: unknown[] = [];
const up = await judgeAggregatorAuthorship({ subjectName: "Acme Coffee", subjectHost: "acmecoffee.com", url: UGATED, text: "x", context: authorshipContext("About\nx", "x", 6) }, { transport: fake("not json"), ledger: (e) => { unparseRows.push(e); return Promise.resolve(true); }, model: "fake-qwen" });

// ── no ledger: throws before the transport ──
const before = transportCalls; let noLedgerThrew = false;
try { await judgeAggregatorAuthorship({ subjectName: "A", subjectHost: "a.com", url: UGATED, text: "x", context: authorshipContext("About\nx", "x", 6) }, { transport: SUBJECT } as never); } catch { noLedgerThrew = true; }

const row0 = authRows[0];
console.log(JSON.stringify({
  regen: { status: r.status, judge_calls: regenCalls, ledger_rows: authRows.length, tally_authorship: tally.authorship ?? null, call_site: row0?.callSite ?? null, call_site_ok: row0?.callSite === regenCallSite("authorship"), provider: row0?.usage.provider ?? null, usd: row0 ? row0.usage.usd : "absent", sha_hex64: /^[0-9a-f]{64}$/.test(row0?.promptSha ?? "") },
  baseline: { judge_calls: baseCalls, ledger_rows: baseRows.length },
  restamp: { judge_calls: restampCalls, ledger_rows: restampRows.length, keyed_to_company: restampRows.every((x) => x.companyId === CO) },
  unparseable: { verdict: up.verdict, ledger_rows: unparseRows.length },
  no_ledger: { threw: noLedgerThrew, transport_calls: transportCalls - before },
}));
