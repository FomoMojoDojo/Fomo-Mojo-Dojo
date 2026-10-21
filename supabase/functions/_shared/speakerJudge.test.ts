// R32 — the speaker judge: ledger BEFORE parse; fail toward judge_failed; the prompt names the vocabulary.
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { authorshipContext, buildSpeakerUser, judgeSpeaker, SPEAKER_SYSTEM, type SpeakerInput } from "./aggregatorAuthorship.ts";

const PARA = "Dr. A. Alexander, Co-Founder and CEO of CoreViva, spoke to the Journal. “Our goal is to catch cancer earlier,” Alexander told the Business Journal.";
const input: SpeakerInput = { subjectName: "Coreviva", subjectHost: "coreviva.com", url: "https://www.ocbj.com/x", candidate: "“Our goal is to catch cancer earlier,” Alexander told the Business Journal.", attributionForm: "quoted_with_attribution", attributionSpan: "“Our goal is to catch cancer earlier,” Alexander told the Business Journal.", speakerString: "Alexander", context: PARA,
  // R55e: the page context is required — built from the paragraph at the candidate's offset
  pageContext: authorshipContext(PARA, "“Our goal is to catch cancer earlier,” Alexander told the Business Journal.", PARA.indexOf("“Our goal")) };
const mem = () => { const rows: Array<{ usage: { provider: string; model: string; prompt_tokens: number | null; completion_tokens: number | null; usd: number | null }; promptSha: string }> = []; return { rows, ledger: (e: typeof rows[number]) => { rows.push(e); return Promise.resolve(true); } }; };

Deno.test("R32: a well-formed answer parses; the ledger row (provider ollama, token counts, usd null, 64-hex sha) is written before parse", async () => {
  const m = mem();
  const j = await judgeSpeaker(input, { transport: () => Promise.resolve({ content: JSON.stringify({ speaker_name: "Dr. A. Alexander", speaker_role: "Co-Founder and CEO", speaker_class: "subject_company_officer", reason: "the paragraph names him as Co-Founder and CEO of CoreViva" }), prompt_tokens: 410, completion_tokens: 52 }), ledger: m.ledger, model: "qwen-test" });
  assertEquals(j.speaker_class, "subject_company_officer"); assertEquals(j.speaker_name, "Dr. A. Alexander"); assertEquals(j.speaker_role, "Co-Founder and CEO"); assertEquals(j.model, "qwen-test");
  assertEquals(m.rows.length, 1); assertEquals(m.rows[0].usage, { provider: "ollama", model: "qwen-test", prompt_tokens: 410, completion_tokens: 52, usd: null }); assert(/^[0-9a-f]{64}$/.test(m.rows[0].promptSha));
});

Deno.test("R32: fail toward judge_failed — unparseable output, a malformed class, a missing reason, a thrown transport — and every one still ledgers one row", async () => {
  const cases: Array<[string, () => Promise<{ content: string; prompt_tokens: number | null; completion_tokens: number | null }>]> = [
    ["unparseable", () => Promise.resolve({ content: "nope", prompt_tokens: 5, completion_tokens: 1 })],
    ["malformed class", () => Promise.resolve({ content: JSON.stringify({ speaker_class: "officer", reason: "x" }), prompt_tokens: 5, completion_tokens: 1 })],
    ["missing reason", () => Promise.resolve({ content: JSON.stringify({ speaker_class: "third_party" }), prompt_tokens: 5, completion_tokens: 1 })],
    ["thrown transport", () => Promise.reject(new Error("ollama HTTP 500"))],
  ];
  for (const [name, transport] of cases) {
    const m = mem();
    const j = await judgeSpeaker(input, { transport, ledger: m.ledger, model: "m" });
    assertEquals(j.speaker_class, "judge_failed", name); assert(j.reason.length > 0);
    assertEquals(m.rows.length, 1, `${name}: ledgered before parse`);
  }
  const thrown = mem(); await judgeSpeaker(input, { transport: () => Promise.reject(new Error("x")), ledger: thrown.ledger, model: "m" });
  assertEquals(thrown.rows[0].usage.prompt_tokens, null, "a failed call ledgers null counts, never 0");
});

Deno.test("R32: the prompt names the four classes and the rules; the user prompt carries the sentence, the attribution, the speaker string and the paragraph", () => {
  for (const w of ["subject_company_officer", "subject_company_text", "third_party", "unknown", "Never infer a role from the name alone", "A pronoun speaker"]) assert(SPEAKER_SYSTEM.includes(w), w);
  const u = buildSpeakerUser(input);
  for (const w of ["SUBJECT COMPANY: Coreviva (coreviva.com)", "SENTENCE: “Our goal", "ATTRIBUTION (quoted_with_attribution)", "SPEAKER STRING AS THE PAGE GIVES IT: Alexander", "PARAGRAPH:\nDr. A. Alexander"]) assert(u.includes(w), w);
});
