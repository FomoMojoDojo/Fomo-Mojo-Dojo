// X1: the start step reads a file that has NO sidecar from its stored path (a reader-down upload).
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { resolveStartSource } from "./uploadSidecar.ts";

Deno.test("X1: a sidecar is used when there is one", () => {
  assertEquals(resolveStartSource({ text: "t", filePath: "a/b.pdf" }, "a/b.pdf"), { text: "t", filePath: "a/b.pdf", fromSidecar: true });
});
Deno.test("X1: no sidecar but a stored path → read from the path, with no old text", () => {
  assertEquals(resolveStartSource(null, "a/reader-was-down.pdf"), { text: "", filePath: "a/reader-was-down.pdf", fromSidecar: false });
});
Deno.test("X1: neither → nothing to read (the start step still fails that row, with its message)", () => {
  assertEquals(resolveStartSource(null, null), null);
  assertEquals(resolveStartSource(null, "  "), null);
});
Deno.test("X1: the start step uses the resolver and does not reuse banked extracts without a sidecar (source)", async () => {
  const src = await Deno.readTextFile(new URL("../dify-analyze-file/index.ts", import.meta.url));
  assertEquals(src.includes("const sidecar = resolveStartSource("), true);
  assertEquals(src.includes("const reused = !sidecar.fromSidecar ? null : await reuseBankedExtracts({"), true);
});
