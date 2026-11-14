// SP-328 (BRIEF-17): the attribute judge is three-valued, and `contradicted` is earned exactly like
// `corroborated` — a verdict with no valid citation downgrades to self_reported.
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { judgeAttributeEvidence } from "./claimProvenance.ts";

const OUTSIDE_URL = "https://reviews.example.org/charter-thread";
const baseline = {
  evidence_ledger: [],
  outside_voice_signals: [
    { signal: "Customers report repeated outages", url: OUTSIDE_URL, perspective: "customer", sentiment: "negative", source_type: "review" },
  ],
};

function fakeJudge(rows: unknown[]) {
  let seen: { schema?: unknown; systemText?: string } = {};
  const callJson = async (args: { schema: unknown; systemText: string }) => {
    seen = args;
    return { attributes: rows };
  };
  return { callJson: callJson as never, seen: () => seen };
}

Deno.test("the schema offers all three values and the prompt carries the shared definition", async () => {
  const j = fakeJudge([]);
  await judgeAttributeEvidence({ apiKey: "x", model: "m", baselineResultJson: baseline, attributes: [{ name: "a" }], companyWebsite: "https://charter.example.com", callJson: j.callJson });
  const schema = j.seen().schema as { properties: { attributes: { items: { properties: { evidence_status: { enum: string[] } } } } } };
  assertEquals(schema.properties.attributes.items.properties.evidence_status.enum, ["corroborated", "self_reported", "contradicted"]);
  assert(String(j.seen().systemText).includes("- contradicted: independent evidence cuts against the attribute's core fact."));
  assert(String(j.seen().systemText).includes("negative pattern about the company"));
});

Deno.test("contradicted with a valid outside citation stands", async () => {
  const j = fakeJudge([{ index: 0, evidence_status: "contradicted", basis_urls: [OUTSIDE_URL] }]);
  const v = await judgeAttributeEvidence({ apiKey: "x", model: "m", baselineResultJson: baseline, attributes: [{ name: "a" }], companyWebsite: "https://charter.example.com", callJson: j.callJson });
  assertEquals(v[0].evidence_status, "contradicted");
  assertEquals(v[0].basis_urls, [OUTSIDE_URL]);
});

Deno.test("contradicted with no valid citation downgrades to self_reported", async () => {
  const j = fakeJudge([
    { index: 0, evidence_status: "contradicted", basis_urls: [] },
    { index: 1, evidence_status: "contradicted", basis_urls: ["https://not-in-the-evidence.example.net/x"] },
  ]);
  const v = await judgeAttributeEvidence({ apiKey: "x", model: "m", baselineResultJson: baseline, attributes: [{ name: "a" }, { name: "b" }], companyWebsite: "https://charter.example.com", callJson: j.callJson });
  assertEquals(v.map((x) => x.evidence_status), ["self_reported", "self_reported"]);
});

Deno.test("an unknown value is read as self_reported", async () => {
  const j = fakeJudge([{ index: 0, evidence_status: "disputed", basis_urls: [OUTSIDE_URL] }]);
  const v = await judgeAttributeEvidence({ apiKey: "x", model: "m", baselineResultJson: baseline, attributes: [{ name: "a" }], companyWebsite: "https://charter.example.com", callJson: j.callJson });
  assertEquals(v[0].evidence_status, "self_reported");
});
