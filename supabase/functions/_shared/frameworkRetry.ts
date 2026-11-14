// ── WHICH FRAMEWORK-PASS FAILURES EARN A RETRY (SP-278 — 2026-11-14) ────────────────────────────
//
// Pure. No I/O, no clock, no model. It answers one question: did this framework pass die on a CLOCK,
// or on something about its input?
//
// WHY THE DISTINCTION IS THE WHOLE RULE. A workflow that fails on a bad request, a malformed answer or
// a missing field will fail the same way a second time, and retrying it is SP-269's mistake one level
// up — an identical call that cannot succeed. A clock is the one cause that is NOT a property of the
// input, so it is the one worth a second look. And the second look is cheap, because SP-278 reuses the
// banked window extracts: no re-extraction, no new window model call.
//
// THE THREE CEILINGS, each of which has been hit exactly, in the record:
//   300 s   the model-call read timeout — run a56cb509, node JTBD, failed at exactly 300.0 s with
//           `[models] Connection Error, HTTPConnectionPool(host='host.docker.internal', port=…)`
//   600 s   the plugin daemon — run 1291fccd, node Adjudication, failed at exactly 600.0 s with
//           `[ollama] Error: … PluginDaemonInternalServerError: killed by ti…`
//   1,200 s the workflow — the same run recorded 1,555.6 s and status `stopped`
//
// The strings are matched because that is what the vendor gives us: Dify reports the node's error
// text, and these three shapes are what a ceiling looks like coming out of it. A status of `stopped`
// needs no string at all — the workflow ceiling is the only thing that stops a run.
const CEILING_PATTERNS = [
  "killed by ti",        // the plugin daemon's own truncation of "killed by timeout"
  "plugindaemon",        // any plugin-daemon internal error: the 600 s path
  "timed out",
  "timeout",
  "read timed out",
  "connection error",    // the models path's read timeout surfaces as a connection error
];

export function isTimeCeilingFailure(status: string, error: string): boolean {
  if (String(status).trim().toLowerCase() === "stopped") return true;
  const haystack = `${status} ${error}`.toLowerCase();
  return CEILING_PATTERNS.some((p) => haystack.includes(p));
}

/** The whole budget: the first pass and its ONE retry (SP-278). */
export const MAX_FRAMEWORK_ATTEMPTS = 2;

/** The code a document carries when the budget is spent — not the raw vendor string. */
export const FRAMEWORK_TIMEOUT_CODE = "framework_timeout";

// ── SP-294: THE OUTPUT BACKSTOP, AND WHAT A FIRING MEANS (F43 — 2026-11-14) ─────────────────────
//
// Adjudication's output is bounded by a JSON schema (SP-292) and backstopped by num_predict 6,300
// (SP-294) — set above the schema's worst case, so it fires only if the schema's enforcement fails.
// A firing cuts the answer mid-JSON. The workflow's Code node now THROWS on an unparseable answer
// with the marker below; before F43 it silently turned every section into [] and the analysis
// "succeeded" with nothing in it.
//
// It is NOT a clock, so it earns no SP-278 retry: at temperature 0 the same input is cut at the same
// place every time. It ends the document failed, with its own code.
export const FRAMEWORK_TRUNCATED_MARKER = "ADJUDICATION_OUTPUT_UNPARSEABLE";
export const FRAMEWORK_TRUNCATED_CODE = "framework_output_truncated";

export function isFrameworkOutputTruncated(error: string): boolean {
  return String(error ?? "").includes(FRAMEWORK_TRUNCATED_MARKER);
}
