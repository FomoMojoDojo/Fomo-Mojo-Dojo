// THE MODEL-CALL SITE REGISTRY (Gate 3, 2026-09-10).
//
// "Partial" must be a COMPUTED FACT, not a label someone remembers to update. Coverage is derived
// from this list, so the admin page's "partial (n of m sites)" moves the moment a site flips to
// captured — and cannot silently claim completeness it does not have.
//
// The census that produced this list: six edge functions computed a USD cost and returned it in an
// HTTP body no caller parsed; the own-words judge never read `data.usage` at all; every Ollama site
// drops prompt_eval_count/eval_count; every Dify site drops the envelope's total_tokens; the
// Anthropic search path captures usage on success and then drops it.

export type ModelCallSite = {
  /** Stable id, written into model_calls.call_site. */
  site: string;
  provider: "openai" | "ollama" | "anthropic" | "dify";
  /** What the call does, in one phrase. */
  role: string;
  /** Does this site PERSIST a model_calls row today? */
  captured: boolean;
  /** Why not, when it does not. */
  note?: string;
};

export const MODEL_CALL_SITES: readonly ModelCallSite[] = [
  // ── captured in this gate: the six that already computed a USD cost, plus the own-words judge ──
  { site: "generate-public-read", provider: "openai", role: "public read generate + judge", captured: true },
  { site: "generate-claim-deltas", provider: "openai", role: "delta proposer + judge", captured: true },
  { site: "backstop-delta-relevance", provider: "openai", role: "relevance backstop", captured: true },
  { site: "generate-signal-recurrence", provider: "openai", role: "recurrence judge", captured: true },
  { site: "generate-open-questions", provider: "openai", role: "open-questions generate + judge", captured: true },
  { site: "generate-conflict-explanation", provider: "openai", role: "conflict one-liner + grounding judge", captured: true },
  { site: "own-words-judge", provider: "openai", role: "own-words keep/kind judge (birth + retype)", captured: true },
  // Gate B 2b (2026-09-21): the first local site that reads prompt_eval_count / eval_count — one row per window, usd NULL.
  { site: "infer-interview-market", provider: "ollama", role: "interview market inference (one call per transcript window)", captured: true },

  // ── not captured: the transports never read usage. A later gate. ──
  { site: "ollama-local-judges", provider: "ollama", role: "all local generators and judges", captured: false, note: "prompt_eval_count/eval_count not read by any local transport" },
  { site: "dify-analyze-file", provider: "dify", role: "file analysis workflow", captured: false, note: "workflow envelope total_tokens not read" },
  { site: "run-mojo-analysis", provider: "dify", role: "mojo analysis workflow", captured: false, note: "workflow envelope total_tokens not read" },
  { site: "public-baseline-search", provider: "anthropic", role: "baseline web search synthesis", captured: false, note: "usage captured on the failure path only, never on success" },
  { site: "public-baseline-synthesis", provider: "openai", role: "baseline /v1/responses synthesis", captured: false, note: "shared openaiClient never reads data.usage" },
  { site: "research-company", provider: "openai", role: "research structured synthesis", captured: false, note: "shared openaiClient never reads data.usage" },
  { site: "council-review", provider: "openai", role: "council synthesis", captured: false, note: "shared openaiClient never reads data.usage" },
  { site: "competitor-discovery", provider: "anthropic", role: "competitor web search", captured: false, note: "content blocks read, usage dropped" },
  { site: "extract-client-voice", provider: "openai", role: "client-voice regeneration", captured: false, note: "data.usage never read" },
  // R4 (2026-10-18): both roles (generator, judge) ledgered per attempt through _shared/outsideRegenModel.ts.
  { site: "extract-outside-evidence", provider: "openai", role: "outside-evidence regeneration (generator + judge; R32 speaker judge on ollama, call_site :speaker, usd null; R38 band judge :syndication; R53 authorship judge :authorship)", captured: true },
  // R53 (2026-10-20): the authorship judge ledgers on every path — one row per call before parse (ollama, usd null).
  { site: "public-baseline-authorship", provider: "ollama", role: "baseline aggregator authorship judge (run_id = the long_runner_runs row)", captured: true },
  { site: "restamp-aggregator-self-voice", provider: "ollama", role: "self-voice restamp dry-run authorship judge (run_id null)", captured: true },
  // R52 (2026-10-20): the voice sweep runner (scripts/r52) — call_site r52-voice-sweep:<band|speaker|authorship>, one row per
  // call before parse, ollama only (local transports, usd null), run_id null; the run is named by integrity_runs.run_ref.
  { site: "r52-voice-sweep", provider: "ollama", role: "R52 voice sweep judges (band / speaker / authorship; call_site r52-voice-sweep:<role>)", captured: true },
] as const;

export type CostCoverage = { captured: number; total: number; uncaptured: string[]; complete: boolean };

/** Coverage, computed. `complete` is only ever true when every registered site captures. */
export function costCoverage(sites: readonly ModelCallSite[] = MODEL_CALL_SITES): CostCoverage {
  const captured = sites.filter((s) => s.captured);
  const uncaptured = sites.filter((s) => !s.captured).map((s) => s.site);
  return { captured: captured.length, total: sites.length, uncaptured, complete: uncaptured.length === 0 };
}

/** The column-header label. "partial (7 of 17 sites)" — never a bare "total". */
export function coverageLabel(cov: CostCoverage): string {
  return cov.complete ? "complete" : `partial (${cov.captured} of ${cov.total} sites)`;
}
