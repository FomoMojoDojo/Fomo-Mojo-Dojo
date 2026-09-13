// ── flat base64 (large-file extraction, 2026-09-12) ─────────────────────────────────────────────
//
// deno.land/std@0.168.0/encoding/base64.ts `encode` builds its output one character at a time with
// `result +=` — every append is a V8 ConsString that stays live until the rope is flattened, so the
// intermediate costs ~43 MB of heap per MiB of input and the 256 MB edge worker dies between 5 and
// 6 MiB (measured 2026-09-12). This encoder writes the output as ASCII BYTES into one preallocated
// buffer: no string is ever built for the payload, and the bytes go into the parser request body
// as-is (see parserRequestBody). Peak is ~N (input) + 4N/3 (output), all off the V8 heap.
//
// Incremental (push chunks, then finish) so a storage Blob can be encoded from its stream without
// first copying the whole file into an ArrayBuffer.

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const TABLE = Uint8Array.from(ALPHABET, (c) => c.charCodeAt(0));
const PAD = "=".charCodeAt(0);

/** Exact output length for n input bytes (padded). */
export function base64Length(n: number): number {
  return Math.ceil(n / 3) * 4;
}

export class FlatBase64Encoder {
  private out: Uint8Array;
  private o = 0;
  private readonly carry = new Uint8Array(3);
  private carryLen = 0;
  private finished = false;

  /** `expectedBytes` sizes the buffer once; a wrong hint is only a reallocation, never wrong output. */
  constructor(expectedBytes = 0) {
    this.out = new Uint8Array(base64Length(Math.max(0, expectedBytes)));
  }

  private ensure(extra: number) {
    if (this.o + extra <= this.out.length) return;
    const next = new Uint8Array(Math.max(this.out.length * 2, this.o + extra));
    next.set(this.out.subarray(0, this.o));
    this.out = next;
  }

  private triple(a: number, b: number, c: number) {
    const out = this.out;
    let o = this.o;
    out[o++] = TABLE[a >> 2];
    out[o++] = TABLE[((a & 0x03) << 4) | (b >> 4)];
    out[o++] = TABLE[((b & 0x0f) << 2) | (c >> 6)];
    out[o++] = TABLE[c & 0x3f];
    this.o = o;
  }

  push(chunk: Uint8Array) {
    if (this.finished) throw new Error("FlatBase64Encoder: push after finish");
    let i = 0;
    const n = chunk.length;
    this.ensure(base64Length(this.carryLen + n));
    if (this.carryLen > 0) {
      while (this.carryLen < 3 && i < n) this.carry[this.carryLen++] = chunk[i++];
      if (this.carryLen < 3) return;
      this.triple(this.carry[0], this.carry[1], this.carry[2]);
      this.carryLen = 0;
    }
    const full = i + Math.floor((n - i) / 3) * 3;
    for (; i < full; i += 3) this.triple(chunk[i], chunk[i + 1], chunk[i + 2]);
    while (i < n) this.carry[this.carryLen++] = chunk[i++];
  }

  /** The encoded ASCII bytes (a view onto the internal buffer — do not push afterwards). */
  finish(): Uint8Array {
    if (this.finished) return this.out.subarray(0, this.o);
    this.finished = true;
    this.ensure(4);
    const out = this.out;
    if (this.carryLen === 1) {
      const a = this.carry[0];
      out[this.o++] = TABLE[a >> 2];
      out[this.o++] = TABLE[(a & 0x03) << 4];
      out[this.o++] = PAD;
      out[this.o++] = PAD;
    } else if (this.carryLen === 2) {
      const a = this.carry[0], b = this.carry[1];
      out[this.o++] = TABLE[a >> 2];
      out[this.o++] = TABLE[((a & 0x03) << 4) | (b >> 4)];
      out[this.o++] = TABLE[(b & 0x0f) << 2];
      out[this.o++] = PAD;
    }
    this.carryLen = 0;
    return out.subarray(0, this.o);
  }
}

/** Whole-buffer encode to ASCII bytes. */
export function encodeBase64Bytes(bytes: Uint8Array): Uint8Array {
  const enc = new FlatBase64Encoder(bytes.length);
  enc.push(bytes);
  return enc.finish();
}

/** Whole-buffer encode to a string — for small inputs and tests; the extraction path never calls this. */
export function encodeBase64(bytes: Uint8Array): string {
  return new TextDecoder().decode(encodeBase64Bytes(bytes));
}

/** Encode a Blob from its stream: no whole-file ArrayBuffer copy is made. */
export async function encodeBlobBase64(blob: Blob): Promise<Uint8Array> {
  const enc = new FlatBase64Encoder(blob.size);
  const reader = blob.stream().getReader();
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    if (value) enc.push(value);
  }
  return enc.finish();
}

/**
 * The local parser's `/extract` JSON body `{file_name, file_type, content_base64}` assembled as a Blob
 * of parts, so the base64 payload is never materialised as a JS string or re-copied by JSON.stringify.
 */
export function parserRequestBody(fileName: string, fileType: string, contentBase64: Uint8Array): Blob {
  const head = JSON.stringify({ file_name: fileName, file_type: fileType }).slice(0, -1); // drop the closing brace
  const prefix = `${head},"content_base64":"`;
  const payload = new Uint8Array(contentBase64.buffer as ArrayBuffer, contentBase64.byteOffset, contentBase64.byteLength);
  return new Blob([prefix, payload, '"}'], { type: "application/json" });
}
