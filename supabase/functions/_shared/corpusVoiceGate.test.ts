// VOICE-GATE — gate bite proof at the logic layer (acceptance a–e). A fake
// supabase returns doc_voice_verdicts rows; the gate must clear/exclude/block per
// the CHANNEL≠VOICE law.
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { assertCorpusVoiceClassified, type GateDoc } from "./corpusVoiceGate.ts";

const COMPANY = "co-1";

// Minimal supabase stub: .from("doc_voice_verdicts").select(...).eq(...).in(...) → rows.
function fakeSupabase(rows: Array<Record<string, unknown>>) {
  return {
    from() {
      const q = {
        select() {
          return q;
        },
        eq() {
          return q;
        },
        in() {
          return Promise.resolve({ data: rows, error: null });
        },
      };
      return q;
    },
  };
}

function modelRow(input_file_id: string, content_sha: string, verdict: string) {
  return { input_file_id, content_sha, verdict, operator_override: null };
}
function overrideRow(input_file_id: string, content_sha: string, override: string) {
  // verdict column mirrors the override on override rows (see migration note).
  return { input_file_id, content_sha, verdict: override, operator_override: override };
}

const docA: GateDoc = { input_file_id: "f-a", content_sha: "sha-a", file_name: "brand_deck.pdf" };
const docB: GateDoc = { input_file_id: "f-b", content_sha: "sha-b", file_name: "analyst_report.pdf" };

Deno.test("(a) all client_voice → runs (cleared, zero blocked)", async () => {
  const sb = fakeSupabase([modelRow("f-a", "sha-a", "client_voice"), modelRow("f-b", "sha-b", "client_voice")]);
  const r = await assertCorpusVoiceClassified(sb as any, COMPANY, [docA, docB]);
  assert(r.ok);
  if (r.ok) {
    assertEquals(r.cleared.length, 2);
    assertEquals(r.excluded.length, 0);
  }
});

Deno.test("(b) one external doc → REFUSES loudly", async () => {
  const sb = fakeSupabase([modelRow("f-a", "sha-a", "client_voice"), modelRow("f-b", "sha-b", "external")]);
  const r = await assertCorpusVoiceClassified(sb as any, COMPANY, [docA, docB]);
  assertEquals(r.ok, false);
  if (!r.ok) {
    assertEquals(r.blocked.length, 1);
    assertEquals(r.blocked[0].file_name, "analyst_report.pdf");
    assert(r.message.includes("Voice gate refused"));
  }
});

Deno.test("(c) unresolved uncertain → REFUSES", async () => {
  const sb = fakeSupabase([modelRow("f-a", "sha-a", "client_voice"), modelRow("f-b", "sha-b", "uncertain")]);
  const r = await assertCorpusVoiceClassified(sb as any, COMPANY, [docA, docB]);
  assertEquals(r.ok, false);
  if (!r.ok) assert(r.blocked[0].reason.includes("uncertain"));
});

Deno.test("(d) operator override client_voice on the external doc → passes", async () => {
  const sb = fakeSupabase([
    modelRow("f-a", "sha-a", "client_voice"),
    modelRow("f-b", "sha-b", "external"),
    overrideRow("f-b", "sha-b", "client_voice"),
  ]);
  const r = await assertCorpusVoiceClassified(sb as any, COMPANY, [docA, docB]);
  assert(r.ok);
  if (r.ok) assertEquals(r.cleared.length, 2);
});

Deno.test("(e) edited doc (new content_sha) → not classified, re-blocks", async () => {
  // Rows exist for the OLD sha; the live doc now has sha-b-EDITED.
  const sb = fakeSupabase([modelRow("f-b", "sha-b", "client_voice")]);
  const editedDocB: GateDoc = { ...docB, content_sha: "sha-b-EDITED" };
  const r = await assertCorpusVoiceClassified(sb as any, COMPANY, [editedDocB]);
  assertEquals(r.ok, false);
  if (!r.ok) assert(r.blocked[0].reason.includes("not classified"));
});

Deno.test("override external → EXCLUDED (dropped, non-blocking)", async () => {
  const sb = fakeSupabase([
    modelRow("f-a", "sha-a", "client_voice"),
    modelRow("f-b", "sha-b", "external"),
    overrideRow("f-b", "sha-b", "external"),
  ]);
  const r = await assertCorpusVoiceClassified(sb as any, COMPANY, [docA, docB]);
  assert(r.ok);
  if (r.ok) {
    assertEquals(r.cleared.map((d) => d.input_file_id), ["f-a"]);
    assertEquals(r.excluded.map((d) => d.input_file_id), ["f-b"]);
  }
});

Deno.test("empty corpus → passes trivially", async () => {
  const sb = fakeSupabase([]);
  const r = await assertCorpusVoiceClassified(sb as any, COMPANY, []);
  assert(r.ok);
});
