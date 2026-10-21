// R58 — every judge answer carries the prompt sha it answered, equal to the sha its own ledger row holds: a stored verdict
// can then replay only on its OWN prompt. judge_failed carries the sha of the call it failed on; no_page_words (no call)
// carries null.
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { authorshipContext, judgeAggregatorAuthorship, judgeSpeaker, type AuthorshipInput, type SpeakerInput } from "./aggregatorAuthorship.ts";
import { judgeSyndicationBand } from "./syndication.ts";

const mem = () => { const rows: Array<{ promptSha: string }> = []; return { rows, ledger: (e: { promptSha: string }) => { rows.push(e); return Promise.resolve(true); } }; };
const ok = (content: string) => () => Promise.resolve({ content, prompt_tokens: 10, completion_tokens: 2 });
const boom = () => Promise.reject(new Error("transport down"));
const isSha = (s: unknown) => typeof s === "string" && /^[0-9a-f]{64}$/.test(s);

const PAGE = "About\nAcme Coffee is a specialty roaster supplying 40 cafes.";
const TEXT = "Acme Coffee is a specialty roaster supplying 40 cafes.";
const aIn: AuthorshipInput = { subjectName: "Acme Coffee", subjectHost: "acmecoffee.com", url: "https://www.crunchbase.com/organization/acme", text: TEXT, context: authorshipContext(PAGE, TEXT, PAGE.indexOf(TEXT)) };
const PARA = "“We roast every bean ourselves,” said Jane Roe, CEO of Acme Coffee.";
const sIn: SpeakerInput = { subjectName: "Acme Coffee", subjectHost: "acmecoffee.com", url: "https://news.example/x", candidate: PARA, attributionForm: "quoted_with_attribution", attributionSpan: PARA, speakerString: "Jane Roe, CEO of Acme Coffee", context: PARA, pageContext: authorshipContext(PARA, PARA, 0) };

Deno.test("R58: the authorship judge's verdict carries the ledgered prompt sha — on a verdict and on judge_failed", async () => {
  const m = mem();
  const j = await judgeAggregatorAuthorship(aIn, { transport: ok(JSON.stringify({ verdict: "third_party", entity: null, reason: "the platform's text" })), ledger: m.ledger, model: "qwen-test" });
  assertEquals(j.verdict, "third_party"); assert(isSha(j.prompt_sha)); assertEquals(j.prompt_sha, m.rows[0].promptSha);
  for (const t of [ok("not json"), ok(JSON.stringify({ verdict: "bogus", reason: "x" })), boom]) {
    const f = mem();
    const r = await judgeAggregatorAuthorship(aIn, { transport: t, ledger: f.ledger, model: "qwen-test" });
    assertEquals(r.verdict, "judge_failed"); assertEquals(f.rows.length, 1); assertEquals(r.prompt_sha, f.rows[0].promptSha, "judge_failed names the call it failed on");
  }
  // the same input asks the same prompt: equal shas (the replay key is stable)
  const again = mem();
  const j2 = await judgeAggregatorAuthorship(aIn, { transport: ok(JSON.stringify({ verdict: "subject_company", entity: null, reason: "x" })), ledger: again.ledger, model: "qwen-test" });
  assertEquals(j2.prompt_sha, j.prompt_sha);
});

Deno.test("R58: no_page_words is not a call — prompt_sha null, no ledger row", async () => {
  const m = mem();
  const j = await judgeAggregatorAuthorship({ ...aIn, context: authorshipContext(null, TEXT, null) }, { transport: ok("{}"), ledger: m.ledger, model: "qwen-test" });
  assertEquals(j.verdict, "no_page_words"); assertEquals(j.prompt_sha, null); assertEquals(m.rows.length, 0);
});

Deno.test("R58: the speaker judge's answer carries the ledgered prompt sha — on a class and on judge_failed", async () => {
  const m = mem();
  const j = await judgeSpeaker(sIn, { transport: ok(JSON.stringify({ speaker_name: "Jane Roe", speaker_role: "CEO", speaker_class: "subject_company_officer", reason: "the CEO" })), ledger: m.ledger, model: "qwen-test" });
  assertEquals(j.speaker_class, "subject_company_officer"); assert(isSha(j.prompt_sha)); assertEquals(j.prompt_sha, m.rows[0].promptSha);
  for (const t of [ok("nope"), boom]) {
    const f = mem();
    const r = await judgeSpeaker(sIn, { transport: t, ledger: f.ledger, model: "qwen-test" });
    assertEquals(r.speaker_class, "judge_failed"); assertEquals(r.prompt_sha, f.rows[0].promptSha);
  }
});

Deno.test("R58: the band judge's answer carries the ledgered prompt sha — YES, NO, unresolved and a failed call", async () => {
  for (const [t, want] of [[ok("YES"), true], [ok("NO"), false], [ok("maybe"), null], [boom, null]] as const) {
    const m = mem();
    const r = await judgeSyndicationBand({ itemText: TEXT, clientSample: TEXT }, { transport: t, ledger: m.ledger, model: "fake-70b" });
    assertEquals(r.syndicated, want); assert(isSha(r.prompt_sha)); assertEquals(r.prompt_sha, m.rows[0].promptSha);
  }
});
