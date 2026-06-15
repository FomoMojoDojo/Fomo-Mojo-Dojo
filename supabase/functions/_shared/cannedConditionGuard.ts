// b-ii write-time canned-condition guard.
//
// MIRROR of the b-i render gate in
// src/views/client/workshop/tabs/JobMapOrgPanel.tsx:199-236
// (CANNED_CONDITION_PATTERNS / RUN_TAG_CONDITION_PATTERN / assertNoCannedConditionString).
// Duplicated by hand across the Vite/Deno runtime boundary (the two runtimes share
// no imports). The writer MUST reject anything the renderer would drop, so a canned
// or run-tag string can never reach job_steps.conditions_json in the first place.
// KEEP IN SYNC with that file — any change to the canned class must update both.

const CANNED_CONDITION_PATTERNS: RegExp[] = [
  /\b(?:is|are)\s+established\b/i,
  /requirements?\s+(?:are\s+established|(?:are\s+)?documented\s+before\s+the\s+step\s+begins)/i,
  /\bmust\s+be\s+confirmed\b/i,
  /\bis\s+named\s+and\s+documented\b/i,
  /\bis\s+tracked\s+and\s+current\b/i,
  /\bis\s+captured\s+before\s+decisions\s+are\s+made\b/i,
  // ODI-phase boilerplate stems:
  /can\s+state\s+what\s+a\s+successful\b/i,
  /\bis\s+documented,\s+not\s+held\s+by\s+one\s+person\b/i,
  /\bis\s+written\s+down,\s+not\s+assumed\b/i,
  /\bhas\s+the\s+authority\s+to\s+act\s+without\s+escalating\b/i,
  /\ba\s+named\s+signal\b|\bnot\s+a\s+gut\s+check\b/i,
  /\bgo\s+through\s+an\s+identified\s+reviewer\b/i,
  /\bhanded\s+off\s+in\s+a\s+form\s+the\s+next\s+step\s+can\s+use\b/i,
  /\bsomeone\s+updates\s+the\s+approach\s+based\s+on\s+what\s+happened\b/i,
];
// Internal run-tag leak shape (e.g. "run_mojo_analysis:2026-06-10",
// "dify_mojo_analysis:…") — never persisted as a condition.
const RUN_TAG_CONDITION_PATTERN = /^\s*(?:run|dify)_mojo_analysis\s*:/i;

// Returns true if `s` is a canned/templated assertion or a run-tag leak that must
// NOT be persisted as a condition (writer drops it; mirrors the render-time drop).
export function isCannedConditionString(s: string): boolean {
  const str = String(s ?? "");
  return RUN_TAG_CONDITION_PATTERN.test(str) || CANNED_CONDITION_PATTERNS.some((re) => re.test(str));
}
