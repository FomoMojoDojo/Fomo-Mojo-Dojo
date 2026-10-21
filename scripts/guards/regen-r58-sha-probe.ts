// R58 probe (2026-10-21) — every judge WRITER stores the prompt sha beside its verdict, equal to the sha its own
// model_calls row carries. The REAL judges (judgeSpeaker, judgeAggregatorAuthorship, judgeSyndicationBand, and the durable
// store's local-LLM check) over FAKE transports — no network, no model, no db:
//   v22 regen mint (runOutsideRegen on the test fixtures): raw_payload.speaker / authorship_judge / syndication each carry
//       prompt_sha == the sha of the ledger row of that role;
//   v23 the other writers: the public-baseline seam (demoteAggregatorSelfVoiceInResult → the baseline mapper's raw_payload),
//       the restamp audit row (planRestamp → applyRestamp → insertAudit.judge_prompt_sha), and the durable syndication
//       verdict (resolveSyndicationDurable's upsert: model + prompt_sha on a local_llm verdict, null on a deterministic one).
// Plants: P22 the regen speaker copy drops prompt_sha (outsideRegenHandler.ts) ⇒ v22 speaker_sha_ok true → false;
//         P23a judgeAggregatorAuthorship's success return drops prompt_sha ⇒ v23 baseline_sha_ok true → false;
//         P23b the durable upsert drops prompt_sha ⇒ v23 durable.prompt_sha_ok true → false;
//         P23c applyRestamp's audit insert drops judge_prompt_sha ⇒ v23 restamp_sha_ok true → false.
import { runOutsideRegen } from "../../supabase/functions/_shared/outsideRegenHandler.ts";
import type { RegenTransport } from "../../supabase/functions/_shared/outsideRegenModel.ts";
import {
  applyRestamp, demoteAggregatorSelfVoiceInResult, judgeAggregatorAuthorship, judgeSpeaker, planRestamp,
  type AuditRow, type AuthorshipLedger, type AuthorshipTransport, type PlanRow, type RestampStore,
} from "../../supabase/functions/_shared/aggregatorAuthorship.ts";
import { buildCorpusFromTexts, judgeSyndicationBand, resolveSyndicationDurable } from "../../supabase/functions/_shared/syndication.ts";
import { mapPublicBaselineOutputToSignals } from "../../src/lib/evidenceMappers.ts";
import { fakeDb, seedR17, deps, r17Transport, r32Transport, CO, RUN2, U1, P32, FIX32 } from "../../supabase/functions/_shared/outsideRegenHandler.test.ts";

type Minted = { evidence_excerpt: string; raw_payload: Record<string, Record<string, unknown> | undefined> };
type LedgerRow = { role: string; promptSha?: string };
const isSha = (s: unknown) => typeof s === "string" && /^[0-9a-f]{64}$/.test(s);
const shasOf = (rows: LedgerRow[], role: string) => rows.filter((e) => e.role === role).map((e) => e.promptSha);

// ── v22 regen: speaker ──
const dbS = fakeDb(seedR17());
for (const r of dbS.tables.outside_page_snapshots) if (r.source_url === U1) r.clean_text = P32;
const sp = deps(dbS, r32Transport(), null);
sp.d.makeSpeakerJudge = (ledger) => (i) => judgeSpeaker(i, { ledger, model: "fake-qwen", transport: () => Promise.resolve({ content: JSON.stringify({ speaker_name: "Jane Roe", speaker_role: "CEO", speaker_class: "subject_company_officer", reason: "guard r58: the page names the CEO" }), prompt_tokens: 9, completion_tokens: 3 }) });
await runOutsideRegen({ company_id: CO, run_id: RUN2, write: true, urls: [U1] }, sp.d);
const spStamped = ((dbS.inserts.signals ?? []) as Minted[]).filter((m) => m.raw_payload.speaker);
const spMinted = spStamped.find((m) => m.evidence_excerpt === FIX32.ceo_quote);
const spSha = spMinted?.raw_payload.speaker?.prompt_sha;
const spLedger = shasOf(sp.ledgerRows as LedgerRow[], "speaker");

// ── v22 regen: authorship ──
const UGATED = "https://www.crunchbase.com/organization/acme-coffee";
const dbA = fakeDb(seedR17());
const au = deps(dbA, r17Transport(), null);
const SUBJECT: AuthorshipTransport = () => Promise.resolve({ content: JSON.stringify({ verdict: "subject_company", entity: null, reason: "guard r58: the profile's about text is the company's own" }), prompt_tokens: 300, completion_tokens: 20 });
au.d.makeJudge = (ledger) => (i) => judgeAggregatorAuthorship(i, { transport: SUBJECT, ledger, model: "fake-qwen" });
await runOutsideRegen({ company_id: CO, run_id: RUN2, write: true, urls: [UGATED] }, au.d);
const auMinted = ((dbA.inserts.signals ?? []) as Minted[]).filter((m) => m.raw_payload.authorship_judge);
const auLedger = shasOf(au.ledgerRows as LedgerRow[], "authorship");

// ── v22 regen: syndication band ──
const COPY = "We roast every bean in Burbank and supply 40 cafes across Los Angeles with fresh coffee every week.";
const BAND = "Acme Coffee roasts every bean in Burbank and supplies 40 cafes across Los Angeles with fresh coffee.";
const dbY = fakeDb(seedR17());
dbY.tables.signals.push({ id: "sig-own", company_id: CO, source_url: "https://www.acmecoffee.com/about", signal_band: "client", voice_class: "client_voice", superseded_at: null, held_at: null, claim_text: COPY, evidence_excerpt: COPY, raw_payload: {} });
for (const r of dbY.tables.outside_page_snapshots) if (r.source_url === U1) r.clean_text = `Directory listing.\n${COPY}\n${BAND}\nEnd.`;
const gen: RegenTransport = ({ system }) => Promise.resolve(system === "GEN"
  ? { content: JSON.stringify({ statements: [{ text: BAND, reason: "the listing's summary" }] }), usage: { prompt_tokens: 1, completion_tokens: 1 } }
  : { content: JSON.stringify({ verdicts: [{ quote: BAND, keep: true, reason: "about Acme" }] }), usage: { prompt_tokens: 1, completion_tokens: 1 } });
const sy = deps(dbY, gen, null);
sy.d.makeSyndicationJudge = (ledger) => (i) => judgeSyndicationBand(i, { ledger, model: "fake-70b", transport: () => Promise.resolve({ content: "YES", prompt_tokens: 50, completion_tokens: 1 }) });
await runOutsideRegen({ company_id: CO, run_id: RUN2, write: true, urls: [U1] }, sy.d);
const syMinted = ((dbY.inserts.signals ?? []) as Minted[]).find((m) => m.evidence_excerpt === BAND);
const sySha = syMinted?.raw_payload.syndication?.prompt_sha;
const syLedger = shasOf(sy.ledgerRows as LedgerRow[], "syndication");

// ── v23 public-baseline seam → the mapper's raw_payload ──
const PAGE = "About\nAcme Coffee is a specialty roaster supplying 40 cafes.";
const baseRows: Array<{ promptSha: string }> = [];
const baseLedger: AuthorshipLedger = (e) => { baseRows.push(e); return Promise.resolve(true); };
const demoted = await demoteAggregatorSelfVoiceInResult(
  { outside_voice_signals: [{ url: UGATED, voice_class: "outside_voice_about_client", signal: "Acme Coffee is a specialty roaster supplying 40 cafes." }] },
  { subjectName: "Acme Coffee", subjectHost: "acmecoffee.com", pageFor: () => PAGE, judge: (i) => judgeAggregatorAuthorship(i, { transport: SUBJECT, ledger: baseLedger, model: "fake-qwen" }) },
);
const mapped = mapPublicBaselineOutputToSignals({ companyId: CO, resultJson: demoted.result });
const baseStamp = mapped.map((m) => (m.raw_payload as Record<string, Record<string, unknown> | undefined> | null)?.authorship_judge).find(Boolean);

// ── v23 restamp: dry-run plan → apply → the audit row ──
const SIG = { id: "sig-r58", company_id: CO, source_url: UGATED, voice_class: "outside_voice_about_client", claim_text: "Acme Coffee is a specialty roaster supplying 40 cafes.", evidence_excerpt: "Acme Coffee is a specialty roaster supplying 40 cafes.", held_at: null, superseded_at: null, raw_payload: {} };
const audits: AuditRow[] = []; const restampRows: Array<{ promptSha: string }> = [];
const store = {
  loadCompanies: () => Promise.resolve([{ id: CO, name: "Acme Coffee", website: "https://acmecoffee.com", frozen: false }]),
  loadCandidateSignals: () => Promise.resolve([SIG]), loadSignalsById: () => Promise.resolve([SIG]),
  loadDeltaBacking: () => Promise.resolve(new Map()), loadPageTexts: () => Promise.resolve(new Map([[UGATED, PAGE]])),
  openLedger: () => Promise.resolve("ledger-r58"), closeLedger: () => Promise.resolve(),
  insertAudit: (row: AuditRow) => { audits.push(row); return Promise.resolve(); }, writeVoiceClass: () => Promise.resolve(),
  loadAudit: () => Promise.resolve([]), markReverted: () => Promise.resolve(),
} as unknown as RestampStore;
const planned = await planRestamp(store, { judge: (i) => judgeAggregatorAuthorship(i, { transport: SUBJECT, model: "fake-qwen", ledger: (e) => { restampRows.push(e); return Promise.resolve(true); } }) });
// the dry run's plan payload, built as restamp-aggregator-self-voice/index.ts builds it
const plan: PlanRow[] = planned.proposals.filter((p) => p.to !== null).map((p) => ({ signal_id: p.signal_id, from: p.from, to: p.to as "client_voice" | "competitor_voice",
  judge_verdict: p.judge.verdict, judge_entity: p.judge.entity, judge_reason: p.judge.reason, judge_model: p.judge.model, judge_prompt_sha: p.judge.prompt_sha ?? null } as PlanRow));
await applyRestamp(store, { plan, runRef: "r58-probe" });

// ── v23 durable syndication verdict: local_llm (a fake Ollama answers YES) and deterministic ──
const realFetch = globalThis.fetch; let durableCalls = 0; let durablePrompt = "";
Deno.env.set("OLLAMA_SYNDICATION_BASE_URL", "http://fake-ollama.invalid");
globalThis.fetch = ((_u: unknown, init?: { body?: string }) => { durableCalls++; durablePrompt = JSON.parse(String(init?.body ?? "{}")).prompt ?? ""; return Promise.resolve(new Response(JSON.stringify({ response: "YES" }), { status: 200 })); }) as typeof fetch;
const upserts: Array<Record<string, unknown>> = [];
const fakeSb = { from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null }) }) }) }) }), upsert: (row: Record<string, unknown>) => { upserts.push(row); return Promise.resolve({ error: null }); } }) };
const corpus = buildCorpusFromTexts([COPY]);
await resolveSyndicationDurable({ supabase: fakeSb, companyId: CO, sourceUrl: U1, itemText: BAND, corpus, clientSampleForLlm: COPY, label: "r58-probe" });
await resolveSyndicationDurable({ supabase: fakeSb, companyId: CO, sourceUrl: U1, itemText: COPY, corpus, clientSampleForLlm: COPY, label: "r58-probe" });
globalThis.fetch = realFetch;
const sha256 = async (t: string) => [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(t)))].map((b) => b.toString(16).padStart(2, "0")).join("");
const llmRow = upserts.find((u) => u.method === "local_llm"), detRow = upserts.find((u) => u.method === "deterministic");

console.log(JSON.stringify({
  v22: {
    speaker: { ceo_minted: !!spMinted, ceo_sha: spSha ?? null, stamped: spStamped.length, ledger_rows: spLedger.length,
      // every minted speaker stamp carries a sha one of its own ledger rows holds (one row per call; the fixture page has 5 attributed candidates)
      speaker_sha_ok: spStamped.length > 0 && spStamped.length <= spLedger.length && spStamped.every((m) => isSha(m.raw_payload.speaker?.prompt_sha) && spLedger.includes(m.raw_payload.speaker?.prompt_sha as string)) },
    authorship: { minted: auMinted.length, ledger: auLedger.length, authorship_sha_ok: auMinted.length > 0 && auMinted.length === auLedger.length && auMinted.every((m, k) => isSha(m.raw_payload.authorship_judge?.prompt_sha) && m.raw_payload.authorship_judge?.prompt_sha === auLedger[k]) },
    syndication: { minted: !!syMinted, method: syMinted?.raw_payload.syndication?.method ?? null, sha: sySha ?? null, ledger: syLedger, syndication_sha_ok: isSha(sySha) && syLedger.length === 1 && syLedger[0] === sySha },
  },
  v23: {
    baseline: { stamp_verdict: baseStamp?.verdict ?? null, sha: baseStamp?.prompt_sha ?? null, ledger_rows: baseRows.length, baseline_sha_ok: isSha(baseStamp?.prompt_sha) && baseRows.length === 1 && baseRows[0].promptSha === baseStamp?.prompt_sha },
    restamp: { audit_rows: audits.length, sha: audits[0]?.judge_prompt_sha ?? null, ledger_rows: restampRows.length, restamp_sha_ok: audits.length === 1 && isSha(audits[0].judge_prompt_sha) && audits[0].judge_prompt_sha === restampRows[0]?.promptSha },
    durable: { llm_calls: durableCalls, local_llm_model: llmRow?.model ?? null, local_llm_sha: llmRow?.prompt_sha ?? null, deterministic_model: detRow ? detRow.model : "absent", deterministic_sha: detRow ? detRow.prompt_sha : "absent",
      prompt_sha_ok: !!llmRow && isSha(llmRow.prompt_sha) && llmRow.prompt_sha === await sha256(durablePrompt) && llmRow.model === "llama3:70b" && !!detRow && detRow.model === null && detRow.prompt_sha === null },
  },
}));
