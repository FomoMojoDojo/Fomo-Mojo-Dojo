// Flat base64 (supabase/functions/_shared/base64.ts) — the encoder that replaced std@0.168.0's
// `result +=` rope in dify-analyze-file and analyze-file (2026-09-12).
//   correctness  — byte-identical to the std encoder (its loop reproduced verbatim below) on every
//                  length 0..300 and on random chunkings; the request-body assembly is valid JSON
//                  whose content_base64 decodes to the input
//   memory       — 25 MiB encodes with a small V8-heap delta (the payload never becomes a string);
//                  the std encoder at the same size would need ~1 GB of heap (measured 43 MB/MiB)
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Blob as NodeBlob } from "node:buffer";
import { FlatBase64Encoder, base64Length, encodeBase64, encodeBase64Bytes, encodeBlobBase64, parserRequestBody } from "../../supabase/functions/_shared/base64";

// deno.land/std@0.168.0/encoding/base64.ts `encode`, verbatim (the reference this replaces).
const base64abc = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/".split("");
function stdEncode(uint8: Uint8Array): string {
  let result = "", i;
  const l = uint8.length;
  for (i = 2; i < l; i += 3) {
    result += base64abc[uint8[i - 2] >> 2];
    result += base64abc[((uint8[i - 2] & 0x03) << 4) | (uint8[i - 1] >> 4)];
    result += base64abc[((uint8[i - 1] & 0x0f) << 2) | (uint8[i] >> 6)];
    result += base64abc[uint8[i] & 0x3f];
  }
  if (i === l + 1) {
    result += base64abc[uint8[i - 2] >> 2];
    result += base64abc[(uint8[i - 2] & 0x03) << 4];
    result += "==";
  }
  if (i === l) {
    result += base64abc[uint8[i - 2] >> 2];
    result += base64abc[((uint8[i - 2] & 0x03) << 4) | (uint8[i - 1] >> 4)];
    result += base64abc[(uint8[i - 1] & 0x0f) << 2];
    result += "=";
  }
  return result;
}

let seed = 0x9e3779b9;
const rnd = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed; };
const randomBytes = (n: number) => { const b = new Uint8Array(n); for (let i = 0; i < n; i++) b[i] = rnd() & 255; return b; };

// jsdom's Blob has neither stream() nor text(); the runtime's (Deno) does. Use Node's for these tests.
const jsdomBlob = globalThis.Blob;
beforeAll(() => { (globalThis as { Blob: unknown }).Blob = NodeBlob; });
afterAll(() => { (globalThis as { Blob: unknown }).Blob = jsdomBlob; });

describe("flat base64 — correctness against std@0.168.0 encode", () => {
  it("every length 0..300 is byte-identical (including the =/== padding cases)", () => {
    for (let n = 0; n <= 300; n++) {
      const bytes = randomBytes(n);
      expect(encodeBase64(bytes)).toBe(stdEncode(bytes));
      expect(encodeBase64Bytes(bytes).length).toBe(base64Length(n));
    }
  });
  it("incremental pushes with arbitrary chunk boundaries equal the whole-buffer encode", () => {
    const bytes = randomBytes(10_007);
    const want = stdEncode(bytes);
    for (let trial = 0; trial < 20; trial++) {
      const enc = new FlatBase64Encoder(trial % 2 === 0 ? bytes.length : 0); // right and wrong size hints
      let i = 0;
      while (i < bytes.length) { const step = 1 + (rnd() % 97); enc.push(bytes.subarray(i, i + step)); i += step; }
      expect(new TextDecoder().decode(enc.finish())).toBe(want);
    }
  });
  it("encodes a Blob from its stream without an ArrayBuffer copy of the whole file", async () => {
    const bytes = randomBytes(65_537);
    const out = await encodeBlobBase64(new NodeBlob([bytes]) as unknown as Blob);
    expect(new TextDecoder().decode(out)).toBe(stdEncode(bytes));
  });
  it("parserRequestBody is valid JSON whose content_base64 decodes to the input; names are escaped", async () => {
    const bytes = randomBytes(1234);
    const body = parserRequestBody('we"ird\\name.pdf', "application/pdf", encodeBase64Bytes(bytes));
    expect(body.type).toBe("application/json");
    const parsed = JSON.parse(await body.text()) as { file_name: string; file_type: string; content_base64: string };
    expect(parsed.file_name).toBe('we"ird\\name.pdf');
    expect(parsed.file_type).toBe("application/pdf");
    expect(Buffer.from(parsed.content_base64, "base64")).toEqual(Buffer.from(bytes));
  });
  it("round-trips through Node's decoder at a large size", () => {
    const bytes = randomBytes(3 * 1024 * 1024 + 1);
    expect(Buffer.compare(Buffer.from(encodeBase64(bytes), "base64"), Buffer.from(bytes))).toBe(0);
  });
});

describe("flat base64 — memory (the defect this closes)", () => {
  it("25 MiB encodes with a V8-heap delta well under the 256 MB worker limit (the std rope needed ~43 MB/MiB)", () => {
    const N = 25 * 1024 * 1024;
    const bytes = new Uint8Array(N);
    for (let i = 0; i < N; i += 4096) bytes[i] = i & 255;
    if (typeof global.gc === "function") global.gc();
    const before = process.memoryUsage();
    const t0 = Date.now();
    const out = encodeBase64Bytes(bytes);
    const ms = Date.now() - t0;
    const after = process.memoryUsage();
    const heapDeltaMb = (after.heapUsed - before.heapUsed) / 1048576;
    // eslint-disable-next-line no-console
    console.log(`[flatBase64] 25 MiB: ${ms} ms, heapUsed delta ${heapDeltaMb.toFixed(1)} MB, external delta ${((after.external - before.external) / 1048576).toFixed(1)} MB`);
    expect(out.length).toBe(base64Length(N));
    expect(heapDeltaMb).toBeLessThan(64); // the rope would be ~1075 MB here
    expect(ms).toBeLessThan(2000); // under the worker's 2 s CPU limit with margin
  });
});
