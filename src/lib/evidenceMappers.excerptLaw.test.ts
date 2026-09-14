// EXCERPT LAW (operator brief 2026-09-14): an excerpt is the document's words or it is absent. No code path
// substitutes an interpretation (claim, summary, hypothesis, question, bucket label) for a quote. The census
// of every evidence_excerpt writer in the mapper is exhausted here, and the source itself is asserted free of
// the fallback shape so a re-introduction fails this file before it can mint.
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { mapDifyFileOutputToSignals, mapPublicBaselineOutputToSignals } from "./evidenceMappers";
import { applyUploadExcerptGuard } from "./evidenceExcerptGuard";

const base = { companyId: "co", sourceId: "prop-1", sourceType: "uploaded_file", sourceTitle: "doc.pdf", origin: { authorship: "client" as const, subject: "this_company" as const } };
const QUOTE = "We strive to be a beacon in mental health care, setting the standard for innovative, compassionate, and lasting impact.";

describe("excerpt law — Dify file mapper", () => {
  it("a. a finding with EMPTY evidence mints an empty excerpt; its interpretation stays in claim_text and raw_payload", () => {
    const [s] = mapDifyFileOutputToSignals({ ...base, frameworkResults: [{ framework: "teresa_torres", findings: [{ claim: "There is an opportunity to explore new methods.", evidence: "", confidence: "medium", mojo_area: "opportunities" }] }] });
    expect(s.claim_text).toBe("There is an opportunity to explore new methods.");
    expect(s.evidence_excerpt).toBe("");
    expect(s.raw_payload).toMatchObject({ claim: "There is an opportunity to explore new methods.", evidence: "" });
    expect(s.structure_level).toBe("interpreted");
  });
  it("b. a finding with real evidence mints it verbatim, unchanged", () => {
    const [s] = mapDifyFileOutputToSignals({ ...base, frameworkResults: [{ framework: "april_dunford", findings: [{ claim: "Edgewood strives to be a beacon.", evidence: QUOTE, confidence: "high", mojo_area: "positioning" }] }] });
    expect(s.evidence_excerpt).toBe(QUOTE);
    expect(s.claim_text).toBe("Edgewood strives to be a beacon.");
  });
  it("a missing evidence key (undefined / array / non-string) is empty, never the claim", () => {
    for (const evidence of [undefined, null, ["x"], 42]) {
      const [s] = mapDifyFileOutputToSignals({ ...base, frameworkResults: [{ framework: "jtbd", findings: [{ claim: "Claim only.", evidence, confidence: "low", mojo_area: "job_map" }] }] });
      expect(s.evidence_excerpt).toBe("");
      expect(s.claim_text).toBe("Claim only.");
    }
  });
  it("d. contradictions: empty evidence ⇒ empty excerpt (record and bare-string forms)", () => {
    const [rec, bare] = mapDifyFileOutputToSignals({ ...base, contradictions: [{ claim: "Claimed adoption high, but lacks direct evidence.", conflicts_with: "" }, "Bare contradiction text"] });
    expect(rec.claim_text).toBe("Claimed adoption high, but lacks direct evidence.");
    expect(rec.evidence_excerpt).toBe("");
    expect(bare.claim_text).toBe("Bare contradiction text");
    expect(bare.evidence_excerpt).toBe("");
    const [withEv] = mapDifyFileOutputToSignals({ ...base, contradictions: [{ claim: "c", evidence: QUOTE }] });
    expect(withEv.evidence_excerpt).toBe(QUOTE);
  });
  it("d. the summary signal: no evidence items ⇒ empty excerpt; the summary stays claim_text", () => {
    const [s] = mapDifyFileOutputToSignals({ ...base, summary: "The document emphasizes commitment.", evidence: [] });
    expect(s.framework).toBe("dify_summary");
    expect(s.claim_text).toBe("The document emphasizes commitment.");
    expect(s.evidence_excerpt).toBe("");
    const [withEv] = mapDifyFileOutputToSignals({ ...base, summary: "The document emphasizes commitment.", evidence: [QUOTE] });
    expect(withEv.evidence_excerpt).toBe(QUOTE);
  });
  it("d. questions_to_verify: a question is never an excerpt", () => {
    const [q] = mapDifyFileOutputToSignals({ ...base, questionsToVerify: ["What is the wait time?"] });
    expect(q.claim_text).toBe("What is the wait time?");
    expect(q.evidence_excerpt).toBe("");
    expect(q.framework).toBe("dify_question");
  });
  it("evidence[] items: the item IS the extractor's evidence text (by construction, then guarded by traceability)", () => {
    const [e] = mapDifyFileOutputToSignals({ ...base, evidence: [QUOTE] });
    expect(e.structure_level).toBe("extracted");
    expect(e.evidence_excerpt).toBe(QUOTE);
  });
  it("c. the upload guard leaves an empty excerpt untouched and keeps the interpretation; traceable passes; untraceable blanks", () => {
    const [gap] = mapDifyFileOutputToSignals({ ...base, frameworkResults: [{ framework: "teresa_torres", findings: [{ claim: "Gap-motivated opportunity.", evidence: "" }] }] });
    const g = applyUploadExcerptGuard(gap, QUOTE);
    expect(g.dropped).toBe(false); expect(g.evidence_excerpt).toBe(""); expect(gap.claim_text).toBe("Gap-motivated opportunity.");
    const [ok] = mapDifyFileOutputToSignals({ ...base, frameworkResults: [{ framework: "odi", findings: [{ claim: "c", evidence: QUOTE }] }] });
    expect(applyUploadExcerptGuard(ok, QUOTE).dropped).toBe(false);
    const [bad] = mapDifyFileOutputToSignals({ ...base, frameworkResults: [{ framework: "odi", findings: [{ claim: "Interpretation.", evidence: "words the document never said" }] }] });
    const b = applyUploadExcerptGuard(bad, QUOTE);
    expect(b.dropped).toBe(true); expect(b.evidence_excerpt).toBe(""); expect(bad.claim_text).toBe("Interpretation.");
  });
});

describe("excerpt law — public-baseline mapper", () => {
  it("d. evidence_ledger: an empty snippet never becomes a bucket-label excerpt", () => {
    const [s] = mapPublicBaselineOutputToSignals({ companyId: "co", sourceId: 1, resultJson: { evidence_ledger: [{ bucket: "Market", snippet: "", url: "https://x.test" }] } });
    expect(s.claim_text).toBe("Market");
    expect(s.evidence_excerpt).toBe("");
    const [withSnippet] = mapPublicBaselineOutputToSignals({ companyId: "co", sourceId: 1, resultJson: { evidence_ledger: [{ bucket: "Market", snippet: QUOTE }] } });
    expect(withSnippet.evidence_excerpt).toBe(QUOTE);
  });
  it("d. top_hypotheses: a hypothesis is never an excerpt", () => {
    const [h] = mapPublicBaselineOutputToSignals({ companyId: "co", sourceId: 1, resultJson: { top_hypotheses: ["The market is consolidating."] } });
    expect(h.claim_text).toBe("The market is consolidating.");
    expect(h.evidence_excerpt).toBe("");
  });
  it("outside_voice_signals: the analyst snippet is the excerpt by construction (E4 verifies it against the retained page)", () => {
    const [o] = mapPublicBaselineOutputToSignals({ companyId: "co", sourceId: 1, resultJson: { outside_voice_signals: [{ signal: "Families wait three weeks.", url: "https://x.test" }] } });
    expect(o.evidence_excerpt).toBe("Families wait three weeks.");
  });
});

describe("excerpt law — the census is exhausted in the source", () => {
  it("no evidence_excerpt assignment in the mapper falls back to a claim, summary, title or text", () => {
    const src = fs.readFileSync(path.resolve(__dirname, "evidenceMappers.ts"), "utf8");
    const lines = src.split("\n").map((l, i) => ({ n: i + 1, l })).filter(({ l }) => /evidence_excerpt:/.test(l));
    // No conditional fallback of any kind (the `||` shape) and no summary/title substitution.
    const offenders = lines.filter(({ l }) => /evidence_excerpt:.*\|\|/.test(l) || /evidence_excerpt:\s*(summary|title)\b/.test(l));
    expect(offenders.map((o) => `${o.n}: ${o.l.trim()}`)).toEqual([]);
    // Exactly two by-construction copies remain, named on purpose: public outside_voice_signals (the extractor's
    // `signal` text, E4-verified against the retained page — the fleet back-verification brief's scope) and Dify
    // evidence[] items (the item is the evidence text, traceability-guarded). A third copy is a regression.
    const copies = lines.filter(({ l }) => /evidence_excerpt:\s*(claimText|text),/.test(l)).map(({ l }) => l.trim());
    expect(copies).toEqual(["evidence_excerpt: claimText,", "evidence_excerpt: text,"]);
    // Every other writer is either an explicit "" or the extractor's own evidence/snippet field.
    const rest = lines.filter(({ l }) => !copies.includes(l.trim()) && !/normalizeStatement\(signal\.evidence_excerpt\)/.test(l));
    for (const { l } of rest) expect(l).toMatch(/evidence_excerpt:\s*(""|asString\((record|findingRecord)\.(snippet|evidence)\)|record \? asString\(record\.evidence\) : ""|normalizeStatement\(asArray\(args\.evidence\)\[0\]\))/);
  });
});
