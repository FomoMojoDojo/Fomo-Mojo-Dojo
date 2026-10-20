// R28/R45 probe: the regen WRITE path on the test fixtures (fake db, fake transport, authorship-judge SPY, fake SPEAKER judge)
// where the generator returns a first-person sentence posted by a third party (the SIAA agent forum). Measured: the minted
// class (expected outside_voice_about_client — the label kept), the rule (first_person_judged), speaker_calls (1),
// authorship judge calls (0). Plant (the deterministic client_voice decision restored): class → client_voice, speaker_calls → 0.
import { runOutsideRegen, type RegenJudge } from "../../supabase/functions/_shared/outsideRegenHandler.ts";
import type { RegenTransport } from "../../supabase/functions/_shared/outsideRegenModel.ts";
import { fakeDb, seedR17, deps, CO, RUN2, U1 } from "../../supabase/functions/_shared/outsideRegenHandler.test.ts";

const AGENT = "We have an affiliate who successfully transferred from SIAA to PIIB, it took a lot of work.";
const db = fakeDb(seedR17());
db.tables.companies[0].name = "SIAA"; db.tables.companies[0].website = "https://www.siaa.com";
for (const r of db.tables.outside_page_snapshots) if (r.source_url === U1) r.clean_text = `Forum thread. ${AGENT} Reply from another agent.`;
let judgeCalls = 0, speakerCalls = 0;
const judge: RegenJudge = () => { judgeCalls++; return Promise.resolve({ verdict: "third_party", entity: null, reason: "platform", model: "m" }); };
const t: RegenTransport = ({ system }) => Promise.resolve(system === "GEN"
  ? { content: JSON.stringify({ statements: [{ text: AGENT, reason: "an agent's experience with SIAA" }] }), usage: { prompt_tokens: 1, completion_tokens: 1 } }
  : { content: JSON.stringify({ verdicts: [{ quote: AGENT, keep: true, reason: "about SIAA" }] }), usage: { prompt_tokens: 1, completion_tokens: 1 } });
const { d } = deps(db, t, judge);
d.makeSpeakerJudge = () => () => { speakerCalls++; return Promise.resolve({ speaker_class: "third_party", speaker_name: "a forum poster", speaker_role: "insurance agent", reason: "a member agent, not SIAA", model: "fake" }); };
const r = await runOutsideRegen({ company_id: CO, run_id: RUN2, write: true, urls: [U1] }, d);
const m = ((db.inserts.signals ?? [])[0] ?? null) as { voice_class: string; raw_payload: { voice_authority: Record<string, unknown>; speaker?: Record<string, unknown> } } | null;
console.log(JSON.stringify({ status: r.status, minted: m ? 1 : 0, voice_class: m?.voice_class ?? null, authority: m?.raw_payload.voice_authority.authority ?? null, rule: m?.raw_payload.voice_authority.rule ?? null, speaker_class: m?.raw_payload.speaker?.speaker_class ?? null, speaker_calls: speakerCalls, judge_calls: judgeCalls }));
