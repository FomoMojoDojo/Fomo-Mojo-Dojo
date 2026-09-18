// ── Name-only lane (operator ruling 2026-09-18) ──────────────────────────────────────────────────
//
// SearXNG has returned nothing on this egress since ≤2026-08-18 (every general engine captchas/403s the
// CGNAT address). Domain plans never noticed: the Anthropic web_search lane (callClaudeWebSearch) does its
// own discovery, and own-site crawl supplies the bootstrap evidence that carries the run past the thin gate
// to the lane. A NAME-ONLY plan (no_public_site) has no own site → no bootstrap → the gate refused BEFORE the
// lane could fire, and SRCH-1 recorded search_unavailable (Mithun runs 71/72/73/75).
//
// Ruling: on name-only plans the web_search lane IS discovery — it runs AFTER searx (kept, for the record)
// and BEFORE the thin gate; its results merge into evidence like search results (source_url/host); the
// fallback crawl runs over its hosts; only then the gate. Outcomes:
//   searx dead  + lane found evidence   → completed, search_status "lane_only"
//   both empty                          → insufficient_public_evidence, thin_reason "no_results"
//   searx dead  + lane did not fire / errored → search_unavailable (the only case it may still say so)
// Domain plans are untouched (their prompt is byte-identical — the snapshot test pins it).
// Option B: only the company NAME goes to the lane (as domain plans already send name + site).
import type { BaselineQueryPlan, QueryKey } from "./baselineQueryPlan.ts";
import { QUERY_KEYS } from "./baselineQueryPlan.ts";

export type LaneStatus = {
  fired: boolean;
  /** distinct URLs the lane cited / listed */
  results: number;
  /** distinct registrable-ish hosts (www-stripped) of those URLs */
  hosts: string[];
  error: string | null;
};
export type SearxVerdict = "dead" | "ok" | "empty" | "not_run";
export type SearchLedger = { searx: SearxVerdict; lane: LaneStatus | null };
export type LaneSource = { url: string; title: string; snippet: string; engine: "claude_web_search_lane"; source_type: string };

/** The six name-only passes, joined as the lane's search intents (Option B: the name and its intents, nothing else). */
export function buildNameOnlyBrief(plan: BaselineQueryPlan): string {
  const lines = QUERY_KEYS.map((k: QueryKey) => plan[k]).filter((q): q is string => typeof q === "string" && q.trim().length > 0);
  return lines.map((q, i) => `${i + 1}. ${q}`).join("\n");
}

/** SRCH-1's whole-run verdict, as the ledger names it. */
export function searxVerdict(diag: { queriesRun: number; totalRawResults: number; unresponsive: Map<string, string> }, outage: boolean): SearxVerdict {
  if (diag.queriesRun === 0) return "not_run";
  if (outage) return "dead";
  return diag.totalRawResults > 0 ? "ok" : "empty";
}

function hostOf(url: string): string | null {
  try { return new URL(url).hostname.replace(/^www\d*\./i, "").toLowerCase() || null; } catch { return null; }
}

/** The lane's parsed result + citations → discovery sources (dedup by URL), shaped like search results so the
 *  existing scoring / fetch / fallback-crawl pipeline treats them as such. */
export function laneSourcesFromResult(
  parsed: Record<string, unknown> | null | undefined,
  citationSourceTextByUrl: Map<string, string> | null | undefined,
  inferSourceType: (url: string, title?: string, snippet?: string) => string,
): LaneSource[] {
  const out: LaneSource[] = [];
  const seen = new Set<string>();
  const push = (url: unknown, title: unknown, snippet: unknown, sourceType?: unknown) => {
    const u = String(url ?? "").trim();
    if (!/^https?:\/\//i.test(u) || seen.has(u)) return;
    seen.add(u);
    const t = String(title ?? "").trim();
    const s = String(snippet ?? "").trim();
    const inferred = inferSourceType(u, t, s);
    const st = typeof sourceType === "string" && sourceType.trim() && inferred === "public_web" ? sourceType.trim() : inferred;
    out.push({ url: u, title: t || u, snippet: s, engine: "claude_web_search_lane", source_type: st });
  };
  for (const key of ["evidence_ledger", "outside_voice_signals"]) {
    const arr = parsed?.[key];
    if (!Array.isArray(arr)) continue;
    for (const e of arr) {
      if (!e || typeof e !== "object") continue;
      const r = e as Record<string, unknown>;
      push(r.url, r.title ?? r.bucket, r.snippet ?? r.signal ?? r.perspective, r.source_type);
    }
  }
  for (const [url, text] of citationSourceTextByUrl ?? []) push(url, undefined, text);
  return out;
}

export function laneStatusFromSources(sources: LaneSource[], error: string | null): LaneStatus {
  const hosts = [...new Set(sources.map((s) => hostOf(s.url)).filter((h): h is string => !!h))].sort();
  return { fired: error === null, results: sources.length, hosts, error };
}

export type NameOnlyOutcome =
  | { status: "completed"; search_status: "lane_only" | "searx_and_lane" }
  | { status: "insufficient_public_evidence"; thin_reason: "no_results" }
  | { status: "search_unavailable"; thin_reason: null };

/** The thin-gate decision for a NAME-ONLY plan, taken AFTER the lane has run. `evidenceCount` is the evidence the
 *  pipeline assembled from searx + lane sources (fetched / fallback-crawled). */
export function resolveNameOnlyOutcome(args: { searx: SearxVerdict; lane: LaneStatus | null; evidenceCount: number; minEvidence?: number }): NameOnlyOutcome {
  const min = args.minEvidence ?? 2;
  if (args.evidenceCount >= min) {
    return { status: "completed", search_status: args.searx === "ok" ? "searx_and_lane" : "lane_only" };
  }
  const laneFired = !!args.lane && args.lane.fired;
  // searx dead AND the lane did not fire / errored → nothing was checked: the honest outage.
  if (args.searx === "dead" && !laneFired) return { status: "search_unavailable", thin_reason: null };
  // otherwise something looked and found nothing → thin, never "search_unavailable" on searx's word alone.
  return { status: "insufficient_public_evidence", thin_reason: "no_results" };
}

// ── The lane's prompt — ONE builder for both plans ───────────────────────────────────────────────
// Domain form: byte-identical to the pre-ruling inline prompt (the snapshot test pins it). Name-only form: the
// two domain-anchored sentences are replaced by the brief; everything else is the same text.
export function claudeWebSearchPrompt(opts: {
  companyName: string;
  website: string;
  domain: string;
  resolvedCategory?: string;
  schemaHint: string;
  /** present ⇒ name-only plan: the six passes as search intents; absent ⇒ the domain prompt, unchanged */
  nameOnlyBrief?: string | null;
}): string {
  const nameOnly = typeof opts.nameOnlyBrief === "string" && opts.nameOnlyBrief.trim().length > 0;
  const head = nameOnly
    ? `You are an outside-in strategy analyst. Research the organization "${opts.companyName}" ` +
      `comprehensively using web search. It has NO public website of its own — read it BY NAME.\n` +
      (opts.resolvedCategory ? `Likely category: ${opts.resolvedCategory}.\n` : "") +
      `First, establish what kind of organization this is from registries, directories and press ` +
      `(category, offering, geography). Run each of these search intents as a web search:\n${opts.nameOnlyBrief!.trim()}\n` +
      `Then discover its REAL PUBLIC FOOTPRINT: the places where outside `
    : `You are an outside-in strategy analyst. Research the company "${opts.companyName}" ` +
      `(website: ${opts.website || opts.domain}) comprehensively using web search.\n` +
      (opts.resolvedCategory ? `Likely category: ${opts.resolvedCategory}.\n` : "") +
      `First, establish from the company's own site what kind of business this is — category, ` +
      `offering, geography. Then discover its REAL PUBLIC FOOTPRINT: the places where outside `;
  const anchor = nameOnly
    ? `- Anchor every search to the exact entity: the name, and the location and category you established from registries and press.\n`
    : `- Anchor every search to the exact entity: the name, the domain (${opts.domain}), and the location and category you established from its own site.\n`;
  return head +
    `voices actually talk about THIS kind of business. Cover each footprint class below, ` +
    `choosing the platforms that genuinely serve this company's category and locale — the ` +
    `named sites are illustrations, not a checklist; skip any that don't fit and find the ` +
    `ones that do:\n` +
    `1. Customer reviews — wherever this category is actually reviewed (e.g. Google/Yelp for local service and retail; G2/Capterra/Trustpilot for software; HomeAdvisor/Angi for home services; TripAdvisor for hospitality).\n` +
    `2. Employee reviews, where the company is large enough to have them (e.g. Glassdoor, Indeed).\n` +
    `3. Local and trade press — local news outlets and the category's trade publications.\n` +
    `4. Social presence — the company's actual profiles, with audience-size and engagement signals.\n` +
    `5. Marketplace, retail, and ordering listings — wherever its products or services are sold or listed.\n` +
    `6. Partner and customer mentions — other businesses' sites that reference this company.\n` +
    `7. Directories and registries — BBB, chambers of commerce, licensing bodies, as applicable.\n` +
    `Prioritise genuine third-party sentiment over the company's own claims.\n\n` +
    `DISAMBIGUATION LAW (precision over coverage):\n` +
    anchor +
    `- If you cannot be confident a result refers to THIS company, EXCLUDE it. Same-named or similarly-named organizations elsewhere are contamination, not coverage.\n\n` +
    `Then output a SINGLE JSON object — and NOTHING else — matching exactly this shape:\n${opts.schemaHint}\n\n` +
    `Rules:\n` +
    `- Use ONLY facts found via your web searches. Do NOT fabricate reviews, quotes, ratings, or URLs.\n` +
    `- Every outside_voice_signals[].url and evidence_ledger[].url MUST be a real URL returned by a search.\n` +
    `- source_type ∈ {employee_review, customer_review, community_discussion, third_party_profile, profile_or_company_page, news_signal, review_signal, public_web}.\n` +
    `- voice_class ∈ {client_voice, outside_voice_about_client, market_context}: client_voice = the company speaking about itself (its site, its profiles, its posts); outside_voice_about_client = a genuine third party speaking ABOUT this company (reviews, press about them, partner/customer mentions, registries attesting them); market_context = category/market information not about this company specifically (industry stats, category coverage). When unsure between outside_voice_about_client and market_context, ask: does this source attest something about THIS company? If not, it is market_context.\n` +
    `- For genuine third-party voices set bucket="outside_voice_signal".\n` +
    `- Include ≥1 employee_review, ≥1 customer_review, and ≥1 community_discussion IF such public sources exist; ` +
    `if a type genuinely has no public source, omit it rather than inventing one.\n` +
    `- confidence is 0-100. Emit the JSON object only — no markdown fences, no prose before or after.`;
}
