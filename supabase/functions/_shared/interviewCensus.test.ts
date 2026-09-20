// Gate B census-gap guards (2026-09-19) — every direct reader of the input-files bucket / input_files rows
// that can carry an interview file's bytes, text or name to a model is fenced on the file flag. Proven by
// source (these entrypoints start their server at module level): the select carries is_interview and the
// filter sits before the model-bound use. Plant: the filter removed → the assertion fails.
import { assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
const here = new URL(".", import.meta.url).pathname;
const read = (f: string) => Deno.readTextFile(`${here}${f}`);
const pos = (s: string, needle: string, label: string) => { const i = s.indexOf(needle); assert(i >= 0, `${label}: missing ${needle}`); return i; };

Deno.test("research-company: the uploaded-evidence context (names, tags, sidecar snippets → EXTERNAL model) drops interview files, and a company with an interview upload is never cold-started", async () => {
  const s = await read("../research-company/index.ts");
  const sel = pos(s, 'select("input_id,file_name,file_path,tags,uploaded_at,is_interview")', "rc");
  const filt = pos(s, ".filter((f) => f?.is_interview !== true)", "rc");
  const names = pos(s, '`${index + 1}. ${String(file?.file_name || "uploaded_file")}`', "rc");
  assert(sel < filt && filt < names, "select → filter → names");
  const spine = pos(s, 'return jsonResponse({ error: "company_has_spine" }, 409);', "rc");
  const guard = pos(s, 'error: "company_has_interview_uploads"', "rc");
  const lock = pos(s, "const { data: companyRow, error: companySourceFilterErr }", "rc");
  assert(spine < guard && guard < lock, "the interview-upload refusal sits with the cold-start guard, before the lock");
  assert(s.includes("async function companyHasInterviewUploads") && s.includes("return true;\n  }\n}"), "fails closed");
});

Deno.test("local-jobmap-synthesis: the file list handed to the local model drops interview files", async () => {
  const s = await read("../local-jobmap-synthesis/handler.ts");
  const sel = pos(s, '.select("input_id,file_name,file_path,tags,uploaded_at,is_interview")', "ljs");
  const filt = pos(s, "?.is_interview !== true);", "ljs");
  const use = pos(s, "files: files.map((row) => ({", "ljs");
  assert(sel < filt && filt < use, "select → filter → context");
});

Deno.test("local-alignment: the file list (names) handed to the local model drops interview files", async () => {
  const s = await read("../local-alignment/index.ts");
  const sel = pos(s, '.select("id,input_id,file_name,tags,uploaded_at,is_interview")', "la");
  const filt = pos(s, ".filter((f: any) => f?.is_interview !== true)", "la");
  const use = pos(s, "filesByInput", "la");
  assert(sel < filt && filt < use);
});

Deno.test("generate-deep-dive: the file list is fenced (flag OR record, fail closed) before the raw-object fallback", async () => {
  const s = await read("../generate-deep-dive/index.ts");
  const filt = pos(s, "file?.is_interview === true || interviewFileIds.has(", "gdd");
  assert(filt < pos(s, ".download(tf.file_path)", "gdd"));
  assert(s.includes("interviewLookupFailed) return false"));
});
