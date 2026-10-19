// R14 / R17 (2026-10-18) — the one voice-class authority. Fixtures, no network, no model.
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { decideVoiceClassBeforeJudge, voiceClassForMintedExcerpt, type VoiceClassInput, firstPersonSelfDescription } from "./voiceClassAtMint.ts";
import { classifyRegistryRow, GUIDESTAR_SELF_REPORTED_MARKER } from "./registryClassifier.ts";
import type { AuthorshipJudgment } from "./aggregatorAuthorship.ts";

const ACME = { name: "Acme Coffee", host: "acmecoffee.com" };
const WIRE = "https://www.prnewswire.com/news-releases/acme-coffee-opens-second-roastery-300000001.html";
const PROFILE = "https://www.crunchbase.com/organization/acme-coffee";
const THIRD = "https://reviews.example/acme-coffee";
const OWN = "https://www.acmecoffee.com/wholesale";
const NOW = () => "2026-10-18T12:00:00.000Z";
const base = (over: Partial<VoiceClassInput>): VoiceClassInput => ({
  url: THIRD, item: null, labeledClass: "outside_voice_about_client", pageText: "Acme Coffee roasts in Burbank.", judgedText: "Acme Coffee roasts in Burbank.",
  company: ACME, registry: null, judge: null, gate: "profile_wire_boilerplate", onJudgeFailure: "refuse_mint", now: NOW, ...over,
});
const subjectJudge = (): Promise<AuthorshipJudgment> => Promise.resolve({ verdict: "subject_company", entity: null, reason: "company-supplied About field", model: "fake" });
const failedJudge = (): Promise<AuthorshipJudgment> => Promise.resolve({ verdict: "judge_failed", entity: null, reason: "timeout", model: "fake" });
const otherJudge = (): Promise<AuthorshipJudgment> => Promise.resolve({ verdict: "other_entity", entity: "Beta Roasters", reason: "Beta's own page", model: "fake" });

Deno.test("own domain ⇒ client_voice, prose, before any gate", async () => {
  const d = await voiceClassForMintedExcerpt(base({ url: OWN }));
  assert(d.ok); assertEquals(d.voice_class, "client_voice"); assertEquals(d.evidence_class, "prose"); assertEquals(d.authority, "own_domain");
  const sub = await voiceClassForMintedExcerpt(base({ url: "https://shop.acmecoffee.com/x" }));
  assert(sub.ok); assertEquals(sub.authority, "own_domain");
});

Deno.test("an analysis label wins over everything, even an own-domain URL", async () => {
  const d = await voiceClassForMintedExcerpt(base({ url: OWN, item: { voice_class: "analysis" }, labeledClass: "analysis" }));
  assert(d.ok); assertEquals(d.voice_class, "analysis"); assertEquals(d.authority, "analysis_label");
});

Deno.test("GuideStar self-reported section ⇒ client_voice / filing; a rating section ⇒ outside / prose; registry items are never judged", async () => {
  const url = "https://www.guidestar.org/profile/94-0000000";
  const page = `Acme Coffee\nMission\nWe roast every bean in Burbank for 40 cafes.\n${GUIDESTAR_SELF_REPORTED_MARKER}\nFinancials\nRevenue $1,000,000`;
  const own = classifyRegistryRow({ url, text: "We roast every bean in Burbank for 40 cafes.", snapshot: { clean_text: page, text_sha256: "sha-gs", structured: null } });
  assert(own, "guidestar is a registry url");
  const d = await voiceClassForMintedExcerpt(base({ url, registry: own, judge: subjectJudge }));
  assert(d.ok); assertEquals(d.authority, "registry");
  assertEquals([d.voice_class, d.evidence_class], ["client_voice", "filing"], `section ${own.section} class ${own.class}`);
  assertEquals(d.authorship_judge, undefined, "a registry item never reaches the judge");
  // journalism: the label stands, no judge
  const art = classifyRegistryRow({ url: "https://www.propublica.org/article/acme-coffee-contract", text: "Workers said pay was low.", snapshot: { clean_text: "Workers said pay was low.", text_sha256: "sha-art", structured: null } });
  assert(art && art.class === "journalism");
  const j = await voiceClassForMintedExcerpt(base({ url: "https://www.propublica.org/article/acme-coffee-contract", registry: art, judge: subjectJudge }));
  assert(j.ok); assertEquals(j.voice_class, "outside_voice_about_client"); assertEquals(j.authority, "extractor_label"); assertEquals(j.authorship_judge, undefined);
});

Deno.test("wire URL + judge subject_company ⇒ client_voice with the stamp; other_entity ⇒ competitor_voice", async () => {
  const d = await voiceClassForMintedExcerpt(base({ url: WIRE, judge: subjectJudge }));
  assert(d.ok); assertEquals(d.voice_class, "client_voice"); assertEquals(d.authority, "authorship_judge");
  assertEquals(d.gate, { host: "prnewswire.com", via: "wire" });
  assertEquals(d.authorship_judge?.applied, "client_voice"); assertEquals(d.authorship_judge?.url_rule, "prnewswire.com"); assertEquals(d.authorship_judge?.judged_at, NOW());
  const o = await voiceClassForMintedExcerpt(base({ url: PROFILE, judge: otherJudge }));
  assert(o.ok); assertEquals(o.voice_class, "competitor_voice");
});

Deno.test("AMENDMENT (b): judge_failed — refuse_mint REFUSES (reason, stamp); keep_label keeps the label (stamp unchanged)", async () => {
  const r = await voiceClassForMintedExcerpt(base({ url: WIRE, judge: failedJudge, onJudgeFailure: "refuse_mint" }));
  assert(!r.ok); assert(/judge failed: timeout/.test(r.reason)); assertEquals(r.gate.via, "wire"); assertEquals(r.authorship_judge?.applied, "unchanged");
  const k = await voiceClassForMintedExcerpt(base({ url: WIRE, judge: failedJudge, onJudgeFailure: "keep_label" }));
  assert(k.ok); assertEquals(k.voice_class, "outside_voice_about_client"); assertEquals(k.authority, "extractor_label"); assertEquals(k.authorship_judge?.verdict, "judge_failed");
});

Deno.test("AMENDMENT (b): a gated URL with NO judge (or an unavailable one) — refuse_mint refuses, keep_label keeps", async () => {
  const r = await voiceClassForMintedExcerpt(base({ url: PROFILE, judge: null }));
  assert(!r.ok); assert(/no judge is wired/.test(r.reason));
  const u = await voiceClassForMintedExcerpt(base({ url: PROFILE, judge: () => Promise.resolve(null) }));
  assert(!u.ok); assert(/unavailable/.test(u.reason));
  const k = await voiceClassForMintedExcerpt(base({ url: PROFILE, judge: null, onJudgeFailure: "keep_label" }));
  assert(k.ok); assertEquals(k.voice_class, "outside_voice_about_client"); assertEquals(k.authorship_judge, undefined);
});

Deno.test("the gate is the caller's: on `profile` a wire URL is not gated (the label stands, no judge call); on the wide gate it is", async () => {
  let calls = 0;
  const counting = () => { calls++; return subjectJudge(); };
  const narrow = await voiceClassForMintedExcerpt(base({ url: WIRE, judge: counting, gate: "profile", onJudgeFailure: "keep_label" }));
  assert(narrow.ok); assertEquals(narrow.authority, "extractor_label"); assertEquals(calls, 0);
  const wide = await voiceClassForMintedExcerpt(base({ url: WIRE, judge: counting, gate: "profile_wire_boilerplate" }));
  assert(wide.ok); assertEquals(wide.voice_class, "client_voice"); assertEquals(calls, 1);
  // boilerplate: a release-shaped page whose close names the subject's own domain
  const rel = "https://trade.example/news/acme-coffee-opens-roastery";
  const close = "Acme Coffee opened a second roastery. For more information, visit www.acmecoffee.com.";
  const pre = decideVoiceClassBeforeJudge(base({ url: rel, pageText: close, judge: null }));
  assert("needs_judge" in pre); assertEquals(pre.gate.via, "boilerplate");
});

Deno.test("plain third party ⇒ the label; an unknown label ⇒ null (never invented)", async () => {
  const d = await voiceClassForMintedExcerpt(base({}));
  assert(d.ok); assertEquals(d.voice_class, "outside_voice_about_client"); assertEquals(d.authority, "extractor_label"); assertEquals(d.gate, null);
  const m = await voiceClassForMintedExcerpt(base({ labeledClass: "market_context" }));
  assert(m.ok); assertEquals(m.voice_class, "market_context");
  const n = await voiceClassForMintedExcerpt(base({ labeledClass: "something_else" }));
  assert(n.ok); assertEquals(n.voice_class, null);
});

Deno.test("SOURCE PIN: the regen handler carries no voice_class literal and imports the one authority; public-baseline's overlay, the registry stamp and the authorship demote call it", async () => {
  const h = await Deno.readTextFile(new URL("./outsideRegenHandler.ts", import.meta.url));
  assert(!/voice_class:\s*"/.test(h), "no voice_class literal in the handler");
  assert(h.includes('from "./voiceClassAtMint.ts"'), "handler imports the authority");
  assert(h.includes("voiceClassForMintedExcerpt("), "handler calls it at the mint site");
  assert(/onJudgeFailure:\s*REGEN_JUDGE_FAILURE_POLICY/.test(h) && /REGEN_JUDGE_FAILURE_POLICY: JudgeFailurePolicy = "refuse_mint"/.test(h), "the regen policy is refuse_mint, named");
  const b = await Deno.readTextFile(new URL("../public-baseline/index.ts", import.meta.url));
  assert(b.includes("decideVoiceClassBeforeJudge(") && b.includes('from "../_shared/voiceClassAtMint.ts"'), "the overlay calls the authority");
  assert(!/isCompanyHostUrl\(url\)\s*\?\s*"client_voice"/.test(b), "the overlay's own copy of the rule is gone");
  const r = await Deno.readTextFile(new URL("./registryIngest.ts", import.meta.url));
  assert(r.includes("decideVoiceClassBeforeJudge(") && !r.includes("registryStamp("), "the registry stamp goes through the authority");
  const a = await Deno.readTextFile(new URL("./aggregatorAuthorship.ts", import.meta.url));
  assert(a.includes("voiceClassForMintedExcerpt(") && a.includes('onJudgeFailure: "keep_label"'), "the demote calls the authority with the ingest policy");
});

// ── R28: the first-person gate — regen path only, deterministic, before the judge ─────────────────────────
Deno.test("R28: \"We help people…\" with the first_person gate named ⇒ client_voice by rule, authority first_person_self_description, no judge call; without the gate named (the baseline) ⇒ the label", async () => {
  let judgeCalls = 0;
  const judge = () => { judgeCalls++; return Promise.resolve({ verdict: "third_party" as const, entity: null, reason: "x", model: "m" }); };
  const base = { url: "https://seamless.ai/b/whispering-ai-16131131", item: null, labeledClass: "outside_voice_about_client", pageText: "p", company: { name: "whispering.ai", host: "whispering.ai" }, registry: null, judge, gate: "profile_wire_boilerplate" as const, onJudgeFailure: "refuse_mint" as const };
  const gated = await voiceClassForMintedExcerpt({ ...base, judgedText: "We help people and businesses thrive with the power of AI.", textGates: ["first_person"] });
  assert(gated.ok); assertEquals(gated.voice_class, "client_voice"); assertEquals(gated.authority, "first_person_self_description"); assertEquals(gated.rule, "first_person"); assertEquals(gated.gate, null);
  assertEquals(judgeCalls, 0, "no judge call");
  const baseline = await voiceClassForMintedExcerpt({ ...base, judgedText: "We help people and businesses thrive with the power of AI." });
  assert(baseline.ok); assertEquals(baseline.voice_class, "outside_voice_about_client"); assertEquals(baseline.authority, "extractor_label"); assertEquals(baseline.rule, undefined);
  assertEquals(judgeCalls, 0, "seamless.ai is not a gated host, so the baseline shape does not reach the judge either");
});

Deno.test("R28: a third-person line is unchanged; a quoted first-person line with an attributed outside speaker is NOT gated; 'Contact us' is not a subject", async () => {
  const base = { url: "https://reviews.example/acme", item: null, labeledClass: "outside_voice_about_client", pageText: "p", company: { name: "Acme", host: "acme.test" }, registry: null, judge: null, gate: "profile_wire_boilerplate" as const, textGates: ["first_person"] as const, onJudgeFailure: "refuse_mint" as const };
  for (const t of ["Whispering AI is headquartered at 6929 North Hayden Road, Scottsdale.", "'We love it,' said a customer.", "“We’ll be back,” one reviewer wrote.", "According to the owner, we should expect a second roastery.", "Contact us for pricing and hours."]) {
    const d = await voiceClassForMintedExcerpt({ ...base, judgedText: t });
    assert(d.ok); assertEquals(d.voice_class, "outside_voice_about_client", t); assertEquals(d.authority, "extractor_label", t);
  }
  for (const t of ["We help people and businesses thrive with the power of AI.", "Our coffees are available for wholesale partners.", "Founded in 2011. We roast every bean in Burbank."]) {
    assertEquals(firstPersonSelfDescription(t).hit, true, t);
  }
  assertEquals(firstPersonSelfDescription("'We love it,' said a customer.").hit, false);
});

Deno.test("R28: on a judge-gated profile URL a first-person candidate is decided by the rule BEFORE the judge — zero judge calls (measured); a third-person candidate on the same URL still reaches the judge", async () => {
  let judgeCalls = 0;
  const judge = () => { judgeCalls++; return Promise.resolve({ verdict: "third_party" as const, entity: null, reason: "platform field", model: "m" }); };
  const base = { url: "https://www.crunchbase.com/organization/acme-coffee", item: null, labeledClass: "outside_voice_about_client", pageText: "p", company: { name: "Acme Coffee", host: "acmecoffee.com" }, registry: null, judge, gate: "profile_wire_boilerplate" as const, textGates: ["first_person"] as const, onJudgeFailure: "refuse_mint" as const };
  const fp = await voiceClassForMintedExcerpt({ ...base, judgedText: "We roast every bean in Burbank and supply 40 cafes." });
  assert(fp.ok); assertEquals(fp.voice_class, "client_voice"); assertEquals(fp.authority, "first_person_self_description"); assertEquals(judgeCalls, 0, "the rule decided; the judge was never called");
  const tp = await voiceClassForMintedExcerpt({ ...base, judgedText: "Acme Coffee is a specialty roaster supplying 40 cafes." });
  assert(tp.ok); assertEquals(tp.authority, "extractor_label"); assertEquals(judgeCalls, 1, "a third-person candidate on the gated URL reaches the judge");
});
