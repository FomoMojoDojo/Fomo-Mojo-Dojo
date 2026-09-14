// Ruling 10 (2026-09-13): the inferred job-map read drops every document that is not the client's voice.
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { inferredReadDroppedFileIds, type CorpusVoiceGateResult } from "./corpusVoiceGate.ts";

const d = (id: string) => ({ input_file_id: id, content_sha: "sha", file_name: `${id}.pdf` });

Deno.test("gate ok: only operator-excluded docs are dropped", () => {
  const gate: CorpusVoiceGateResult = { ok: true, cleared: [d("client")], excluded: [d("ext-override")] };
  assertEquals([...inferredReadDroppedFileIds(gate)].sort(), ["ext-override"]);
});
Deno.test("gate NOT ok: blocked docs (model external / uncertain / unclassified) are dropped too — never fed", () => {
  const gate: CorpusVoiceGateResult = {
    ok: false, cleared: [d("client")], excluded: [d("ext-override")], message: "refused",
    blocked: [{ input_file_id: "sector-study", file_name: "sector-study.pdf", reason: "classified 'external'" }, { input_file_id: "unclassified", file_name: "u.pdf", reason: "not classified" }],
  };
  assertEquals([...inferredReadDroppedFileIds(gate)].sort(), ["ext-override", "sector-study", "unclassified"]);
});
Deno.test("the cleared client doc is never dropped", () => {
  const gate: CorpusVoiceGateResult = { ok: false, cleared: [d("client")], excluded: [], message: "refused", blocked: [{ input_file_id: "x", file_name: "x.pdf", reason: "r" }] };
  assertEquals(inferredReadDroppedFileIds(gate).has("client"), false);
});
