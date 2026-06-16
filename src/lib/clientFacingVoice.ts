// Client-surface voice guard (parallel to assertNoCannedConditionString).
// ODI-surface rule: proprietary framework/vendor names stay internal; client
// surfaces are humanized. Two operations, no render-time prose rewriter —
// framework/vendor names are fixed AT SOURCE; this module only HIDES pure metadata
// and TRIPS in dev so a leak can't sneak back in.

// Pure internal metadata with no client value → caller renders NOTHING.
const INTERNAL_METADATA_PATTERNS: RegExp[] = [
  /^\s*(?:run|dify)_mojo_analysis\s*:/i, // run-tags: run_mojo_analysis:2026-…, dify_mojo_analysis:…
  /^\s*research[-_]company\s*:/i, // research-company:…
  /^\s*\[input_key:/i, // raw input-key references
  // bare provenance / model / framework keys standing alone as a value
  /^\s*(?:run_mojo_analysis|dify_mojo_analysis|local_jobmap_synthesis|framework_adjudicated|internal_declared|internal_hypothesis|public_research|internal_derived|operator_authored|odi_survey)\s*$/i,
  /^\s*(?:qwen2\.5|llama3|mistral|gpt-)[\w.:-]*\s*$/i,
];

export function isInternalMetadataString(s: string | null | undefined): boolean {
  const str = String(s ?? "").trim();
  if (!str) return false;
  return INTERNAL_METADATA_PATTERNS.some((re) => re.test(str));
}

// Proprietary framework / vendor names that must never render client-facing.
const FRAMEWORK_TERMS: RegExp[] = [
  /\bODI\b/i,
  /outcome[-\s]?driven\s+innovation/i,
  /\bJTBD\b/i,
  /jobs[-\s]?to[-\s]?be[-\s]?done/i,
  /\bStrategyn\b/i,
  /\bDify\b/i,
];

// Dev-only fail-closed tripwire. Throws in dev if a string about to render on a
// client surface carries a framework/vendor name or an internal-metadata shape;
// pass-through in prod (fail open — never break a client render in production).
// Returns the string unchanged so it can wrap a render inline.
export function assertNoFrameworkLeak(s: string | null | undefined): string {
  const str = String(s ?? "");
  const leaks = FRAMEWORK_TERMS.some((re) => re.test(str)) || isInternalMetadataString(str);
  if (leaks && import.meta.env?.DEV) {
    throw new Error(
      `[clientFacingVoice] Client string carries a framework/vendor name or internal metadata: ` +
        `${JSON.stringify(str.slice(0, 120))}. Fix it at source — framework/vendor names stay internal.`,
    );
  }
  return str;
}
