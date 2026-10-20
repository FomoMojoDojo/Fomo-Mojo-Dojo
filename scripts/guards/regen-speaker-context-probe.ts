// R42 probe — the Brierley fixture (affiliation outside the quote's paragraph) through the handler with a fake judge that
// answers officer only when the context carries the affiliation sentence. Plant: drop the page-sentence search → unknown.
import { runOutsideRegen } from "../../supabase/functions/_shared/outsideRegenHandler.ts";
import type { RegenTransport } from "../../supabase/functions/_shared/outsideRegenModel.ts";
import { fakeDb, seedR17, deps, CO, RUN2, U1, PAGE42, CAND42, contextReadingJudge } from "../../supabase/functions/_shared/outsideRegenHandler.test.ts";
const db = fakeDb(seedR17()); for (const r of db.tables.outside_page_snapshots) if (r.source_url === U1) r.clean_text = PAGE42;
const seen: string[] = [];
const t: RegenTransport = ({ system }) => Promise.resolve(system === "GEN" ? { content: JSON.stringify({ statements: [{ text: CAND42, reason: "r" }] }), usage: { prompt_tokens: 1, completion_tokens: 1 } } : { content: JSON.stringify({ verdicts: [{ quote: CAND42, keep: true, reason: "k" }] }), usage: { prompt_tokens: 1, completion_tokens: 1 } });
const { d } = deps(db, t, null); d.makeSpeakerJudge = () => contextReadingJudge(seen);
const r = await runOutsideRegen({ company_id: CO, run_id: RUN2, write: true, urls: [U1] }, d);
const m = (db.inserts.signals ?? [])[0] as { voice_class: string; raw_payload: { speaker?: { speaker_class: string } } } | undefined;
console.log(JSON.stringify({ status: r.status, context_has_affiliation: !!seen[0]?.includes("founder and CEO"), context_chars: seen[0]?.length ?? 0, minted: m ? 1 : 0, speaker_class: m?.raw_payload.speaker?.speaker_class ?? "(refused)", voice_class: m?.voice_class ?? "(refused)" }));
