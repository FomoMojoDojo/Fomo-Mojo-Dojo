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
