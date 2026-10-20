// R38 probe (R51, 2026-10-20) — the WRITE path on the test fixtures with a fake transport, the REAL ledgered band judge
// (judgeSyndicationBand) over a fake Ollama transport, and the client corpus read from the fake db. The generator returns
// three candidates: the company's own copy verbatim (syndicated at 1.0), a reworded copy in the uncertain band (the band
// judge answers YES), and a short name-only line (clean, no call). Measured: the three classes and authorities, the band
// judge's calls, the syndication ledger rows and the tally — rows must equal calls (P4 plant: the ledger call skipped in
// judgeSyndicationBand → rows 0 while calls 1, tally 0 ≠ 1). No network, no db, no model.
import { runOutsideRegen } from "../../supabase/functions/_shared/outsideRegenHandler.ts";
import type { RegenTransport } from "../../supabase/functions/_shared/outsideRegenModel.ts";
import { judgeSyndicationBand } from "../../supabase/functions/_shared/syndication.ts";
import { fakeDb, seedR17, deps, CO, RUN2, U1 } from "../../supabase/functions/_shared/outsideRegenHandler.test.ts";

const COPY = "We roast every bean in Burbank and supply 40 cafes across Los Angeles with fresh coffee every week.";
const BAND = "Acme Coffee roasts every bean in Burbank and supplies 40 cafes across Los Angeles with fresh coffee.";
const SHORT = "Acme Coffee roasts in Burbank.";
const db = fakeDb(seedR17());
db.tables.signals.push({ id: "sig-own", company_id: CO, source_url: "https://www.acmecoffee.com/about", signal_band: "client", voice_class: "client_voice", superseded_at: null, held_at: null, claim_text: COPY, evidence_excerpt: COPY, raw_payload: {} });
for (const r of db.tables.outside_page_snapshots) if (r.source_url === U1) r.clean_text = `Directory listing.\n${COPY}\n${BAND}\n${SHORT}\nEnd.`;
const t: RegenTransport = ({ system }) => Promise.resolve(system === "GEN"
  ? { content: JSON.stringify({ statements: [{ text: COPY, reason: "the listing's about text" }, { text: BAND, reason: "the listing's summary" }, { text: SHORT, reason: "the listing's one-liner" }] }), usage: { prompt_tokens: 1, completion_tokens: 1 } }
  : { content: JSON.stringify({ verdicts: [{ quote: COPY, keep: true, reason: "about Acme" }, { quote: BAND, keep: true, reason: "about Acme" }, { quote: SHORT, keep: true, reason: "about Acme" }] }), usage: { prompt_tokens: 1, completion_tokens: 1 } });
const { d, ledgerRows } = deps(db, t, null);
let bandCalls = 0;
d.makeSyndicationJudge = (ledger) => (i) => { bandCalls++; return judgeSyndicationBand(i, { ledger, model: "fake-70b", transport: () => Promise.resolve({ content: "YES", prompt_tokens: 50, completion_tokens: 1 }) }); };
const r = await runOutsideRegen({ company_id: CO, run_id: RUN2, write: true, urls: [U1] }, d);
const minted = (db.inserts.signals ?? []) as Array<{ evidence_excerpt: string; voice_class: string; raw_payload: { voice_authority: Record<string, unknown>; syndication?: Record<string, unknown> } }>;
const by = new Map(minted.map((m) => [m.evidence_excerpt, m]));
const tally = (r.body.model_calls as Record<string, number>) ?? {};
console.log(JSON.stringify({ status: r.status, minted: minted.length, copy_class: by.get(COPY)?.voice_class ?? "(refused)", copy_authority: by.get(COPY)?.raw_payload.voice_authority.authority ?? null, copy_method: by.get(COPY)?.raw_payload.syndication?.method ?? null, band_class: by.get(BAND)?.voice_class ?? "(refused)", band_method: by.get(BAND)?.raw_payload.syndication?.method ?? null, short_class: by.get(SHORT)?.voice_class ?? "(refused)", short_method: by.get(SHORT)?.raw_payload.syndication?.method ?? null, stamped_rows: minted.filter((m) => m.raw_payload.syndication).length, band_judge_calls: bandCalls, syndication_ledger_rows: ledgerRows.filter((e) => e.role === "syndication").length, tally_syndication: tally.syndication ?? null, corpus_texts: (r.body.voice as Record<string, unknown>)?.corpus_texts ?? null }));
