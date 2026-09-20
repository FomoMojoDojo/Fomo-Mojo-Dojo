// Gate B (vi) — no sidecar is ever written for an interview file (analyze-file refuses; record-interview-upload
// writes none; reparse skips), so every direct sidecar reader yields nothing for it. Proven: (1) the shared
// loader returns null without a sidecar; (2) by source, each direct reader reads ONLY `<file_path>.extracted.txt`
// for a document and never the raw object.
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { loadUploadSidecar } from "./uploadSidecar.ts";

Deno.test("(vi) loadUploadSidecar → null when the interview file has no sidecar", async () => {
  const sb = {
    from: (_t: string) => ({ select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: { file_path: "u/interview-fixture.txt" }, error: null }) }) }) }),
    storage: { from: (_b: string) => ({ download: (p: string) => { assert(p.endsWith(".extracted.txt"), `reads only the sidecar, got ${p}`); return Promise.resolve({ data: null, error: "missing" }); } }) },
  };
  assertEquals(await loadUploadSidecar(sb as never, "f-int"), null);
});

Deno.test("(vi) research-company, verify-excerpts and loadUploadSidecar read only the .extracted.txt sidecar", async () => {
  const here = new URL(".", import.meta.url).pathname;
  for (const f of ["../research-company/index.ts", "../verify-excerpts/index.ts", "./uploadSidecar.ts"] as const) {
    const src = await Deno.readTextFile(`${here}${f}`);
    assert(src.includes(".extracted.txt"), `${f} reads the sidecar`);
    const downloads = [...src.matchAll(/\.from\("input-files"\)\s*\.download\(([^)]*)\)/g)].map((m) => m[1]);
    assert(downloads.length > 0, `${f}: no storage download found`);
    for (const arg of downloads) assert(/extracted|sidecarPath/.test(arg), `${f}: raw download of ${arg}`);
  }
});

Deno.test("(vi) generate-deep-dive falls back to the RAW object for txt/csv/md/json — so its file list is fenced before that fallback", async () => {
  const here = new URL(".", import.meta.url).pathname;
  const src = await Deno.readTextFile(`${here}../generate-deep-dive/index.ts`);
  const rawFallback = src.indexOf('.download(tf.file_path)');
  assert(rawFallback > 0, "the raw fallback exists (that is why the fence is needed)");
  const fence = src.indexOf('file?.is_interview === true || interviewFileIds.has(');
  assert(fence > 0 && fence < rawFallback, "the file-list fence precedes the raw fallback");
  assert(src.includes('from("interview_records").select("input_file_id")'), "keyed on the record as well as the flag");
  assert(src.includes("interviewLookupFailed) return false"), "fails closed on a lookup error");
});
