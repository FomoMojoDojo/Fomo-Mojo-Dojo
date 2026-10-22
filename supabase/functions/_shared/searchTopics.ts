// ── PER-RUN SEARCH TOPICS FOR A DOMAIN PLAN (operator ruling 10, 2026-10-22) ─────────────────────────────────────────
//
// A domain plan's web_search prompt is the fixed footprint prompt (nameOnlyLane.claudeWebSearchPrompt): the model picks its
// own searches, so a run cannot be pointed at filings, competition or an integration. Ruling 10: a run may carry a TOPIC
// LIST, fleet-wide. Topics are DATA passed in the request body (`search_topics`), never written into code. With no topics
// the prompt is byte-identical to today's (the domain snapshot test pins it). The topics enter the prompt as a numbered list
// in the same shape buildNameOnlyBrief gives the name-only lane (numberedIntents, below — one shape for both), so they are
// inside the prompt sha the model_calls row carries; the run ledger records them as sent.
//
// Refused, never ignored (the WD lesson — a misspelled key that is silently dropped runs the fixed prompt and pays for it):
//   - a body key public-baseline does not read (BASELINE_BODY_KEYS) — including a misspelled topics key
//   - search_topics that is not an array of 1..MAX_TOPICS non-blank strings, each ≤ MAX_TOPIC_CHARS, single-line, distinct
//   - search_topics on a run that would not use them: a name-only plan (its brief is the six passes), seed_lane_only, or the
//     openai engine (no web_search prompt)
// Pure: no I/O. The handlers call it before any work.

export const SEARCH_TOPICS_KEY = "search_topics" as const;
export const MAX_TOPICS = 8;
export const MAX_TOPIC_CHARS = 160;

/** Every key public-baseline reads off the body. A key not here is refused rather than ignored. */
export const BASELINE_BODY_KEYS: readonly string[] = [
  "company_id", "company_name", "website", "skip_mojo_analysis", "chain", "parent_run_id", "spend_cap_usd",
  "synthesis_engine", "public_source_filters_json", "seed_lane_only", SEARCH_TOPICS_KEY,
];

/** Every key run-public-research (the wrapper) reads off the body. */
export const RESEARCH_BODY_KEYS: readonly string[] = ["company_id", "trigger", SEARCH_TOPICS_KEY];

/** The numbered-intents shape — "1. a\n2. b" — shared by the name-only brief and the domain topics block. */
export function numberedIntents(lines: readonly string[]): string {
  return lines.map((q, i) => `${i + 1}. ${q}`).join("\n");
}

export type TopicsVerdict = { ok: true; topics: string[] | null } | { ok: false; detail: string };

/** Absent ⇒ { ok, topics: null } (the fixed prompt). Present ⇒ validated, trimmed, order kept; any defect ⇒ refused. */
export function parseSearchTopics(raw: unknown): TopicsVerdict {
  if (raw === undefined) return { ok: true, topics: null };
  if (!Array.isArray(raw)) return { ok: false, detail: `${SEARCH_TOPICS_KEY} must be an array of strings` };
  if (raw.length === 0) return { ok: false, detail: `${SEARCH_TOPICS_KEY} is empty — omit the key for the fixed prompt` };
  if (raw.length > MAX_TOPICS) return { ok: false, detail: `${SEARCH_TOPICS_KEY}: ${raw.length} topics (max ${MAX_TOPICS})` };
  const topics: string[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < raw.length; i++) {
    const t = raw[i];
    if (typeof t !== "string") return { ok: false, detail: `${SEARCH_TOPICS_KEY}[${i}] is not a string` };
    if (/[\u0000-\u001f\u007f]/.test(t)) return { ok: false, detail: `${SEARCH_TOPICS_KEY}[${i}] carries a newline or control character` };
    const s = t.trim();
    if (!s) return { ok: false, detail: `${SEARCH_TOPICS_KEY}[${i}] is blank` };
    if (s.length > MAX_TOPIC_CHARS) return { ok: false, detail: `${SEARCH_TOPICS_KEY}[${i}] is ${s.length} characters (max ${MAX_TOPIC_CHARS})` };
    const k = s.toLowerCase();
    if (seen.has(k)) return { ok: false, detail: `${SEARCH_TOPICS_KEY}[${i}] repeats an earlier topic` };
    seen.add(k);
    topics.push(s);
  }
  return { ok: true, topics };
}

/** A run that would not put topics in a prompt refuses them, naming why. Null ⇒ admitted. */
export function topicsRefusalForRun(topics: readonly string[] | null, run: { planKind: "domain" | "name_only"; seedLaneOnly: boolean; engine: string }): string | null {
  if (!topics || topics.length === 0) return null;
  if (run.seedLaneOnly) return `${SEARCH_TOPICS_KEY} is not accepted with seed_lane_only (the seed lane has its own prompt)`;
  if (run.planKind !== "domain") return `${SEARCH_TOPICS_KEY} is accepted on a domain plan only (this company is read by name)`;
  if (run.engine !== "claude_websearch") return `${SEARCH_TOPICS_KEY} needs synthesis_engine claude_websearch (the ${run.engine} path has no web_search prompt)`;
  return null;
}

/** The block a domain prompt carries for the run's topics ("" when there are none — the prompt is then unchanged). */
export function domainTopicsBlock(topics: readonly string[] | null | undefined): string {
  if (!topics || topics.length === 0) return "";
  return `Also run each of these search topics for this company as a web search, and cite what you find:\n${numberedIntents(topics)}\n`;
}
