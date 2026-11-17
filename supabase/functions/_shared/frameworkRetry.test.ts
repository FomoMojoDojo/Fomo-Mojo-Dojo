// SP-278: only a CLOCK earns a retry. Asserted against the error strings actually in the record,
// because a predicate written from memory of what a timeout looks like is a predicate that misses
// the one the vendor really emits.
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  FRAMEWORK_TIMEOUT_CODE, isTimeCeilingFailure, MAX_FRAMEWORK_ATTEMPTS,
} from "./frameworkRetry.ts";

Deno.test("the 600 s PLUGIN ceiling — run 1291fccd, Adjudication, exactly 600.0 s", () => {
  assert(isTimeCeilingFailure(
    "failed",
    "[ollama] Error: req_id: 4fd7391b47 PluginDaemonInternalServerError: killed by timeout",
  ));
});

Deno.test("the 300 s MODEL-CALL ceiling — run a56cb509, JTBD, exactly 300.0 s", () => {
  assert(isTimeCeilingFailure(
    "failed",
    "[models] Connection Error, HTTPConnectionPool(host='host.docker.internal', port=11434): Read timed out.",
  ));
});

Deno.test("the 1,200 s WORKFLOW ceiling — a stopped run needs no string at all", () => {
  // Run 1291fccd recorded 1,555.6 s with status `stopped`. Nothing else stops a run.
  assert(isTimeCeilingFailure("stopped", ""));
  assert(isTimeCeilingFailure("STOPPED", "whatever"));
});

Deno.test("a failure that is NOT a clock earns no retry — the whole point of the rule", () => {
  // Each of these would fail identically a second time, so retrying is SP-269's mistake one level up.
  assertEquals(isTimeCeilingFailure("failed", "[models] Bad Request: invalid model parameter"), false);
  assertEquals(isTimeCeilingFailure("failed", "Variable file_text is required"), false);
  assertEquals(isTimeCeilingFailure("failed", "output parse error: expected JSON object"), false);
  assertEquals(isTimeCeilingFailure("failed", ""), false);
  assertEquals(isTimeCeilingFailure("succeeded", ""), false);
});

Deno.test("the budget is ONE retry, and the code is ours rather than the vendor's", () => {
  assertEquals(MAX_FRAMEWORK_ATTEMPTS, 2);   // the first pass plus one retry
  assertEquals(FRAMEWORK_TIMEOUT_CODE, "framework_timeout");
  // A reader must be able to tell "ran out of time twice" from "the document could not be read".
  assert(!FRAMEWORK_TIMEOUT_CODE.includes("ingest"));
});

import {
  FRAMEWORK_TRUNCATED_CODE, FRAMEWORK_TRUNCATED_MARKER, isFrameworkOutputTruncated,
} from "./frameworkRetry.ts";

Deno.test("SP-294: the Code node's truncation marker is recognised — and is NOT a clock", () => {
  const thrown = `${FRAMEWORK_TRUNCATED_MARKER}: the Adjudication answer is not a complete JSON object (24173 chars); it was most likely cut by the node output limit`;
  assert(isFrameworkOutputTruncated(thrown));
  // Deterministic at temperature 0: retrying would cut at the same place. It must not earn SP-278's retry.
  assertEquals(isTimeCeilingFailure("failed", thrown), false);
  assertEquals(FRAMEWORK_TRUNCATED_CODE, "framework_output_truncated");
});

Deno.test("SP-294: an ordinary failure is not mistaken for a truncation", () => {
  assertEquals(isFrameworkOutputTruncated("[models] Bad Request: invalid model parameter"), false);
  assertEquals(isFrameworkOutputTruncated(""), false);
});

// ── C1 (2026-11-16): a cut answer earns ONE whole-run retry, inside SP-278's budget ──────────────────
import { frameworkFailureAction } from "./frameworkRetry.ts";
const CUT = "Run failed: ADJUDICATION_OUTPUT_UNPARSEABLE: Adjudication's answer is not a complete JSON object (31216 chars); it was most likely cut by the node output limit";

Deno.test("C1: the first cut answer is retried — a whole new run gives Adjudication different input", () => {
  assertEquals(frameworkFailureAction("failed", CUT, 1), { action: "retry" });
});

Deno.test("C1: the second cut answer fails the document with framework_output_truncated", () => {
  assertEquals(frameworkFailureAction("failed", CUT, 2), { action: "fail", code: "framework_output_truncated" });
});

Deno.test("C1: a clock still earns its one retry, and is not called a truncation", () => {
  assertEquals(frameworkFailureAction("failed", "PluginDaemonInternalServerError: killed by timeout", 1), { action: "retry" });
  assertEquals(frameworkFailureAction("stopped", "", 2), { action: "fail", code: "framework_timeout" });
});

Deno.test("C1: any other failure earns nothing and carries no code", () => {
  assertEquals(frameworkFailureAction("failed", "Model Parameter num_predict should be less than or equal to 4096.0", 1), { action: "fail", code: null });
});

Deno.test("C1: dify-analyze-file's truncation branch starts the retry before it fails the document", async () => {
  const src = await Deno.readTextFile(new URL("../dify-analyze-file/index.ts", import.meta.url));
  const at = src.indexOf("if (isFrameworkOutputTruncated(String(detail))) {");
  assert(at > 0, "the truncation branch is present");
  const branch = src.slice(at, src.indexOf("return { state: \"failed\" };", at));
  const retry = branch.indexOf("retryFrameworkPass(");
  const fail = branch.indexOf("markProposalFailed(");
  assert(retry > 0, "the truncation branch calls retryFrameworkPass");
  assert(fail > retry, "the retry is tried before the document is failed");
});
