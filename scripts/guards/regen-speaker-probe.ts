// R32 probe — the WRITE path on the test fixtures with a fake transport and a fake speaker judge (no network, no db).
// Prints the measured values: speaker judge calls, speaker ledger rows, the CEO-quote fixture's class, whether the
// unknown-speaker fixture was minted, whether the apostrophe row was treated as attribution.
// Plants: P1 drop "attributed_speech" from REGEN_TEXT_GATES → ceo_quote_class outside, speaker_calls 0;
//         P2 map unknown → the label → unknown_minted true.
import { runOutsideRegen } from "../../supabase/functions/_shared/outsideRegenHandler.ts";
import { fakeDb, seedR17, deps, CO, RUN2, U1, P32, FIX32, fakeSpeakerJudge, r32Transport } from "../../supabase/functions/_shared/outsideRegenHandler.test.ts";
const db = fakeDb(seedR17());
for (const r of db.tables.outside_page_snapshots) if (r.source_url === U1) r.clean_text = P32;
const calls: string[] = [];
const { d, ledgerRows } = deps(db, r32Transport(), null);
d.makeSpeakerJudge = (ledger) => { const j = fakeSpeakerJudge(calls); return async (i) => { await ledger({ usage: { provider: "ollama", model: "fake", prompt_tokens: 7, completion_tokens: 3, usd: null }, promptSha: "a".repeat(64) }); return j(i); }; };
await runOutsideRegen({ company_id: CO, run_id: RUN2, write: true, urls: [U1] }, d);
const minted = (db.inserts.signals ?? []) as Array<{ evidence_excerpt: string; voice_class: string; raw_payload: Record<string, unknown> }>;
const by = new Map(minted.map((m) => [m.evidence_excerpt, m]));
console.log(JSON.stringify({ speaker_calls: calls.length, speaker_ledger_rows: ledgerRows.filter((e) => e.role === "speaker").length, ceo_quote_class: by.get(FIX32.ceo_quote)?.voice_class ?? "(refused)", third_party_class: by.get(FIX32.interior_third_party)?.voice_class ?? "(refused)", unknown_minted: by.has(FIX32.unknown_speaker), apostrophe_attribution: by.get(FIX32.apostrophes)?.raw_payload.attribution !== undefined, attribution_bearing: 5 }));
