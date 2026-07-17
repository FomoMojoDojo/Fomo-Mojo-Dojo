// VOICE-GATE — classifier laws: fail-toward-external on every failure mode, and
// content_sha parity through the single TS authority (no SQL hash).
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { classifyUploadVoice } from "./uploadVoiceClassifier.ts";
import { normalizeForHash, sha256Hex } from "./contentIdentity.ts";

const DOC = { file_name: "brand_deck.pdf", file_type: "application/pdf", excerpt: "Our brand. Our words." };
const OPTS = { ollamaUrl: "http://localhost:11434/v1" };

function withFetch(stub: typeof fetch, run: () => Promise<void>): Promise<void> {
  const original = globalThis.fetch;
  globalThis.fetch = stub;
  return run().finally(() => {
    globalThis.fetch = original;
  });
}

function okResp(content: string): Response {
  return new Response(JSON.stringify({ message: { content } }), { status: 200 });
}

Deno.test("good JSON → the model's verdict is honored", async () => {
  await withFetch(
    () => Promise.resolve(okResp(JSON.stringify({ verdict: "client_voice", basis: "first-person brand copy" }))),
    async () => {
      const r = await classifyUploadVoice(DOC, OPTS);
      assertEquals(r.verdict, "client_voice");
      assertEquals(r.basis, "first-person brand copy");
    },
  );
});

Deno.test("HTTP error → external (fail-toward-external)", async () => {
  await withFetch(
    () => Promise.resolve(new Response("boom", { status: 500 })),
    async () => {
      const r = await classifyUploadVoice(DOC, OPTS);
      assertEquals(r.verdict, "external");
      assert(r.basis.includes("failed"));
    },
  );
});

Deno.test("fetch throws → external", async () => {
  await withFetch(
    () => Promise.reject(new Error("network down")),
    async () => {
      const r = await classifyUploadVoice(DOC, OPTS);
      assertEquals(r.verdict, "external");
      assert(r.basis.includes("network down"));
    },
  );
});

Deno.test("empty content → external", async () => {
  await withFetch(
    () => Promise.resolve(okResp("")),
    async () => assertEquals((await classifyUploadVoice(DOC, OPTS)).verdict, "external"),
  );
});

Deno.test("unparseable model output → external", async () => {
  await withFetch(
    () => Promise.resolve(okResp("not json at all")),
    async () => {
      const r = await classifyUploadVoice(DOC, OPTS);
      assertEquals(r.verdict, "external");
      assert(r.basis.includes("unparseable"));
    },
  );
});

Deno.test("malformed verdict value → external", async () => {
  await withFetch(
    () => Promise.resolve(okResp(JSON.stringify({ verdict: "maybe", basis: "unsure" }))),
    async () => assertEquals((await classifyUploadVoice(DOC, OPTS)).verdict, "external"),
  );
});

Deno.test("verdict present but basis empty → external (verbatim-or-nothing)", async () => {
  await withFetch(
    () => Promise.resolve(okResp(JSON.stringify({ verdict: "client_voice", basis: "" }))),
    async () => assertEquals((await classifyUploadVoice(DOC, OPTS)).verdict, "external"),
  );
});

Deno.test("content_sha is deterministic through the TS authority (normalize collapses case/whitespace)", async () => {
  const a = await sha256Hex(normalizeForHash("  The  Client's\tWORDS \n"));
  const b = await sha256Hex(normalizeForHash("the client's words"));
  assertEquals(a, b); // normalization: lower + collapse whitespace + trim
  // Pinned digest of "the client's words" — proves a fixed, reproducible identity
  // (any SQL reimplementation must match THIS value, not its own POSIX \s result).
  assertEquals(a, "99c440898555b8a86a15a2ae525fad617657f7c77f8fe67758de6d2364571495");
  assert(a.length === 64);
});
