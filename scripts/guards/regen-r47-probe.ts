// R47 probe (R51, 2026-10-20) — the WRITE path on the test fixtures (fake db, fake transport, authorship-judge spy, fake speaker
// judge) where the generator returns two mid-sentence first-person candidates: the provider's own profile text (judged
// subject_company_text) and a customer review (judged third_party). Measured: the two classes, the rule, speaker_calls (2),
// authorship calls (0). R56 (2026-10-21): both are now asked the FIELD question by the authorship judge — speaker_calls 0,
// authorship calls 2, rule first_person. Plant P1 (the sentence-start anchor restored on FIRST_PERSON_SUBJECT): speaker_calls → 0, subject class → outside.
import { runOutsideRegen, type RegenJudge } from "../../supabase/functions/_shared/outsideRegenHandler.ts";
import type { RegenTransport } from "../../supabase/functions/_shared/outsideRegenModel.ts";
import { fakeDb, seedR17, deps, CO, RUN2, U1 } from "../../supabase/functions/_shared/outsideRegenHandler.test.ts";

const SUBJECT = "Within our Acute Intensive Service programs, we serve youth ages 6-18.";
const REVIEW = "Max and his team were responsive, always on time, careful with our home, and very professional.";
const db = fakeDb(seedR17());
db.tables.companies[0].name = "Edgewood"; db.tables.companies[0].website = "https://edgewood.org";
for (const r of db.tables.outside_page_snapshots) if (r.source_url === U1) r.clean_text = `Profile.\n${SUBJECT}\nReviews.\n${REVIEW}\nEnd.`;
let judgeCalls = 0, speakerCalls = 0;
// R56 (2026-10-21): speakerless first person off the subject's domain is the AUTHORSHIP judge's field question — it decides both
const judge: RegenJudge = (i) => { judgeCalls++; return Promise.resolve(/Acute Intensive/.test(i.text)
  ? { verdict: "subject_company", entity: null, reason: "the provider's own profile text", model: "m" }
  : { verdict: "third_party", entity: null, reason: "a customer review body", model: "m" }); };
const t: RegenTransport = ({ system }) => Promise.resolve(system === "GEN"
  ? { content: JSON.stringify({ statements: [{ text: SUBJECT, reason: "the provider describes its program" }, { text: REVIEW, reason: "a reviewer on the provider" }] }), usage: { prompt_tokens: 1, completion_tokens: 1 } }
  : { content: JSON.stringify({ verdicts: [{ quote: SUBJECT, keep: true, reason: "about Edgewood" }, { quote: REVIEW, keep: true, reason: "about Edgewood" }] }), usage: { prompt_tokens: 1, completion_tokens: 1 } });
const { d } = deps(db, t, judge);
d.makeSpeakerJudge = () => (i) => { speakerCalls++; return Promise.resolve(/Acute Intensive/.test(i.candidate)
  ? { speaker_class: "subject_company_text", speaker_name: null, speaker_role: null, reason: "the provider's own profile text", model: "fake" }
  : { speaker_class: "third_party", speaker_name: "a reviewer", speaker_role: "customer", reason: "a customer's home", model: "fake" }); };
const r = await runOutsideRegen({ company_id: CO, run_id: RUN2, write: true, urls: [U1] }, d);
const minted = (db.inserts.signals ?? []) as Array<{ evidence_excerpt: string; voice_class: string; raw_payload: { voice_authority: Record<string, unknown>; speaker?: Record<string, unknown> } }>;
const by = new Map(minted.map((m) => [m.evidence_excerpt, m]));
console.log(JSON.stringify({ status: r.status, minted: minted.length, subject_class: by.get(SUBJECT)?.voice_class ?? "(refused)", subject_rule: by.get(SUBJECT)?.raw_payload.voice_authority.rule ?? null, subject_authority: by.get(SUBJECT)?.raw_payload.voice_authority.authority ?? null, review_class: by.get(REVIEW)?.voice_class ?? "(refused)", review_speaker: by.get(REVIEW)?.raw_payload.speaker?.speaker_class ?? null, speaker_calls: speakerCalls, judge_calls: judgeCalls }));
