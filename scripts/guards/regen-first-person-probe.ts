// R28 probe: the regen WRITE path on the test fixtures (fake db, fake transport, a judge SPY — no network) where the
// generator returns the pilot-3 tagline on a judge-gated profile URL. Prints the measured values: the minted class,
// the authority and rule stamped, and the judge call count. Plant (drop "first_person" from REGEN_TEXT_GATES):
// class client_voice → outside_voice_about_client and judge_calls 0 → 1.
import { runOutsideRegen, type RegenJudge } from "../../supabase/functions/_shared/outsideRegenHandler.ts";
import type { RegenTransport } from "../../supabase/functions/_shared/outsideRegenModel.ts";
import { fakeDb, seedR17, deps, CO, RUN2, TAGLINE28 } from "../../supabase/functions/_shared/outsideRegenHandler.test.ts";

const UGATED = "https://www.crunchbase.com/organization/acme-coffee";
const db = fakeDb(seedR17());
for (const r of db.tables.outside_page_snapshots) if (r.source_url === UGATED) r.clean_text = `Acme Coffee profile. ${TAGLINE28} Founded 2011.`;
let judgeCalls = 0;
const judge: RegenJudge = () => { judgeCalls++; return Promise.resolve({ verdict: "third_party", entity: null, reason: "platform", model: "m" }); };
const t: RegenTransport = ({ system }) => Promise.resolve(system === "GEN"
  ? { content: JSON.stringify({ statements: [{ text: TAGLINE28, reason: "offering" }] }), usage: { prompt_tokens: 1, completion_tokens: 1 } }
  : { content: JSON.stringify({ verdicts: [{ quote: TAGLINE28, keep: true, reason: "about" }] }), usage: { prompt_tokens: 1, completion_tokens: 1 } });
const { d } = deps(db, t, judge);
const r = await runOutsideRegen({ company_id: CO, run_id: RUN2, write: true, urls: [UGATED] }, d);
const m = ((db.inserts.signals ?? [])[0] ?? null) as { voice_class: string; raw_payload: { voice_authority: Record<string, unknown> } } | null;
console.log(JSON.stringify({ status: r.status, minted: m ? 1 : 0, voice_class: m?.voice_class ?? null, authority: m?.raw_payload.voice_authority.authority ?? null, rule: m?.raw_payload.voice_authority.rule ?? null, judge_calls: judgeCalls }));
