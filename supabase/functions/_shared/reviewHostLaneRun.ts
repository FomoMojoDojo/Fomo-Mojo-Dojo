// ── THE REVIEW-HOST LANE, end to end (V1, 2026-11-18) — the I/O half of reviewHostLane.ts ───────────────────────────────
//
// Two steps, so a response can be read before anything is minted from it and no row is ever rebuilt by a second call:
//   1. CALL (target): spend cap checked BEFORE the request is sent (ledgered spend since spend_since + this call's
//      projection ≤ the cap, ceiling REVIEW_LANE_CAP_CEILING_USD); the model_calls row is written before the answer is
//      parsed (unledgered ⇒ refused); the raw response is stored VERBATIM in review_lane_calls. Then, unless mint:false,
//      step 2 runs on it.
//   2. MINT (call id): the rows are built from the STORED response (buildReviewLaneRows) and inserted; the call's outcome
//      and minted_at are set. A call that already minted is refused. No model, no spend.
// A refused, failed or empty call writes no signal; its outcome says why.
import { normalizeForHash, withContentIdentity } from "./contentIdentity.ts";
import { anthropicPriceFor, anthropicUsd } from "./modelPricing.ts";
import { assertSpendable, makeSpendCap, SpendCapRefused } from "./spendCap.ts";
import { ledgerOrRefuse, promptShaOf, requireWebSearchLedger, webSearchLedgerFor } from "./webSearchLedger.ts";
import { loadConfirmedRelatedEntities, loadEntityExcludeHosts } from "./ownHosts.ts";
import { normalizeHost } from "./firstReadProvenance.ts";
import { decideVoiceClassBeforeJudge } from "./voiceClassAtMint.ts";
import { REVIEW_LISTS, type CompanyReviewList, type ReviewTarget } from "./reviewPages.ts";
import { LEAD_BASIS_LABEL, leadQueries, leadRows, LEAD_SITES, type LeadSite, type SearxResult } from "./searchLeads.ts";
import {
  buildReviewLaneRows, projectReviewLaneUsd, projectReviewLaneVerifyUsd, REVIEW_LANE_BETA, REVIEW_LANE_CALL_SITE, REVIEW_LANE_MAX_TOKENS,
  REVIEW_LANE_VERIFY_MAX_TOKENS, REVIEW_LANE_VERIFY_TARGET_PREFIX, reviewLanePrompt, reviewLaneTools, reviewLaneVerifyPrompt, reviewLaneVerifyTools,
  verifyFetchOutcome,
} from "./reviewHostLane.ts";

// deno-lint-ignore no-explicit-any
type Db = any;

export function reviewListFor(companyId: string): CompanyReviewList | null {
  return REVIEW_LISTS[companyId] ?? null;
}

async function mintFromCall(db: Db, list: CompanyReviewList, callId: string, remintReason: string | null = null): Promise<Record<string, unknown>> {
  const { data: call, error } = await db.from("review_lane_calls").select("id, company_id, target_key, response, minted_at, created_at").eq("id", callId).maybeSingle();
  if (error || !call) return { status: "mint_refused", error: `review lane: call ${callId} not found` };
  if (call.company_id !== list.companyId) return { status: "mint_refused", error: "review lane: the call belongs to another company" };
  if (call.minted_at && !remintReason) return { status: "mint_refused", error: "review lane: this call already minted its rows" };
  let superseded = 0;
  if (call.minted_at && remintReason) {
    // RE-MINT (v2.1): the call's live rows are superseded — kept, never deleted — with the stated reason, then the rows
    // are rebuilt from the SAME stored response (no new call). Their excerpts no longer count as live for the dedupe.
    const { data: sup, error: supErr } = await db.from("signals").update({ superseded_at: new Date().toISOString(), superseded_reason: `review lane re-mint: ${remintReason}`.slice(0, 300) })
      .eq("review_lane_call_id", callId).is("superseded_at", null).select("id");
    if (supErr) return { status: "mint_failed", error: supErr.message };
    superseded = (sup ?? []).length;
  }
  const target = list.targets.find((t) => t.key === call.target_key);
  if (!target) return { status: "mint_refused", error: `review lane: target ${call.target_key} is not on the list` };
  const { data: co } = await db.from("companies").select("website").eq("id", list.companyId).maybeSingle();
  let companyHost: string | null = null;
  try { companyHost = normalizeHost(new URL(String(co?.website || "")).hostname); } catch { companyHost = null; }
  const related = await loadConfirmedRelatedEntities(db, list.companyId);
  const { data: ex } = await db.from("signals").select("evidence_excerpt").eq("company_id", list.companyId).is("superseded_at", null).neq("evidence_excerpt", "");
  const existing = new Set<string>(((ex ?? []) as Array<{ evidence_excerpt: string | null }>).map((r) => normalizeForHash(String(r.evidence_excerpt ?? ""))).filter(Boolean));
  const excludeHosts = await loadEntityExcludeHosts(db, list.companyId);
  const { rows, stats } = buildReviewLaneRows({
    list, target, callId, response: call.response, fetchedAt: String(call.created_at), excludeHosts, existingExcerpts: existing,
    decide: (url) => {
      const d = decideVoiceClassBeforeJudge({ url, item: null, labeledClass: "outside_voice_about_client", pageText: null, judgedText: null,
        company: { name: "", host: companyHost, ...(related.length ? { related } : {}) }, registry: null, judge: null, gate: "profile", onJudgeFailure: "keep_label" });
      // as the main run does: a gated URL with no judge keeps the label
      if ("needs_judge" in d) return { ok: true, voice_class: d.label ?? undefined, authority: "extractor_label" };
      if ("ok" in d && d.ok === true) return { ok: true, voice_class: d.voice_class ?? undefined, authority: d.authority };
      return { ok: false };
    },
  });
  if (rows.length > 0) {
    const { data: inserted, error: insErr } = await db.from("signals").insert(withContentIdentity(rows)).select("id, held_at, held_reason");
    if (insErr) {
      await db.from("review_lane_calls").update({ outcome: { status: "mint_failed", error: insErr.message.slice(0, 300), stats } }).eq("id", callId);
      return { status: "mint_failed", error: insErr.message, stats };
    }
    // A2: every row saved held as a lead gets its hold's audit row, as an operator hold through signal-holds.ts would
    const held = ((inserted ?? []) as Array<{ id: string; held_at: string | null; held_reason: string | null }>).filter((r) => r.held_at);
    if (held.length) {
      const { error: auErr } = await db.from("signal_hold_audit").insert(held.map((r) => ({
        signal_id: r.id, company_id: list.companyId, action: "hold", reason: String(r.held_reason), before: { held_at: null, held_reason: null },
        after: { held_at: r.held_at, held_reason: r.held_reason }, actor: "review-lane (at save, ruling R1)", run_ref: `review_lane_mint:${callId}`,
      })));
      if (auErr) return { status: "mint_failed", error: `hold audit: ${auErr.message}`, stats };
    }
  }
  const outcome = { status: rows.length ? "minted" : "empty", stats, ...(remintReason ? { reminted: { reason: remintReason, superseded } } : {}) };
  await db.from("review_lane_calls").update({ outcome, minted_at: new Date().toISOString() }).eq("id", callId);
  return { ...outcome, call_id: callId };
}

/** LEADS (V2): one SearXNG query per topic for one forum site and one brand; rows into search_leads, never signals.
 *  Each query is one Brave request (the engine's own daily ceiling applies). */
async function gatherLeads(db: Db, list: CompanyReviewList, site: LeadSite, brand: "spectrum" | "cox"): Promise<Record<string, unknown>> {
  const searx = Deno.env.get("SEARXNG_URL") || "http://host.docker.internal:8888";
  const seen = new Set<string>();
  const perQuery: Array<Record<string, unknown>> = [];
  let inserted = 0;
  for (const q of leadQueries(site, brand)) {
    const u = new URL("/search", searx);
    u.searchParams.set("q", q); u.searchParams.set("format", "json"); u.searchParams.set("language", "en"); u.searchParams.set("safesearch", "0");
    let results: SearxResult[] = [], refused: string | null = null;
    try {
      const r = await fetch(u.toString(), { signal: AbortSignal.timeout(30_000) });
      const j = await r.json();
      results = Array.isArray(j?.results) ? j.results : [];
      const un = (Array.isArray(j?.unresponsive_engines) ? j.unresponsive_engines : []).find((e: unknown[]) => e?.[0] === "braveapi");
      refused = un ? String(un[1] ?? "refused") : null;
    } catch (e) { refused = String(e).slice(0, 120); }
    const { rows, stats } = leadRows({ list, site, query: q, results, seen });
    if (rows.length) {
      const { data, error } = await db.from("search_leads").upsert(rows, { onConflict: "company_id,url", ignoreDuplicates: true }).select("id");
      if (error) return { status: "leads_failed", error: error.message, per_query: perQuery };
      inserted += (data ?? []).length;
    }
    perQuery.push({ query: q, braveapi_refused: refused, ...stats });
  }
  return { status: "leads_gathered", site, brand, inserted, per_query: perQuery };
}

export async function runReviewLane(a: {
  db: Db; companyId: string; request: Record<string, unknown>; capUsd: number | null; spendSince: string | null;
  apiKey: string | undefined; model: string; actingUserId: string | null;
}): Promise<{ httpStatus: number; body: Record<string, unknown> }> {
  const list = reviewListFor(a.companyId);
  if (!list) return { httpStatus: 400, body: { status: "review_lane_refused", error: "review lane: this company has no reviewed page list" } };
  const mint = a.request.mint !== false;
  const gl = a.request.gather_leads as { site?: unknown; brand?: unknown } | undefined;
  if (gl !== undefined) {
    const site = String(gl?.site ?? "") as LeadSite, brand = String(gl?.brand ?? "");
    if (!(site in LEAD_SITES) || (brand !== "spectrum" && brand !== "cox")) return { httpStatus: 400, body: { status: "review_lane_refused", error: "gather_leads needs { site: reddit | dslreports, brand: spectrum | cox }" } };
    return { httpStatus: 200, body: { review_lane: await gatherLeads(a.db, list, site, brand) } };
  }
  if (typeof a.request.mint_call_id === "string") {
    const reason = typeof a.request.remint_reason === "string" && a.request.remint_reason.trim() ? a.request.remint_reason.trim() : null;
    const out = await mintFromCall(a.db, list, a.request.mint_call_id, reason);
    return { httpStatus: String(out.status).endsWith("refused") || out.status === "mint_failed" ? 409 : 200, body: { review_lane: out } };
  }
  if (a.request.verify !== undefined) return await verifyLeadPage(a, list);
  const target: ReviewTarget | undefined = list.targets.find((t) => t.key === a.request.target);
  if (!target) return { httpStatus: 400, body: { status: "review_lane_refused", error: `review lane: unknown target (known: ${list.targets.map((t) => t.key).join(", ")})` } };
  if (!a.apiKey) return { httpStatus: 500, body: { status: "review_lane_refused", error: "review lane: ANTHROPIC_API_KEY missing" } };
  if (a.capUsd == null) return { httpStatus: 400, body: { status: "review_lane_refused", error: "review lane requires spend_cap_usd" } };
  if (!a.spendSince) return { httpStatus: 400, body: { status: "review_lane_refused", error: "review lane requires spend_since: the research run's start, an ISO time in the last 24 hours" } };

  const cap = makeSpendCap({ capUsd: a.capUsd, companyId: a.companyId, since: a.spendSince, supabase: a.db });
  const prompt = reviewLanePrompt(target);
  const ledger = webSearchLedgerFor(a.db, { companyId: a.companyId, runId: null, callSite: REVIEW_LANE_CALL_SITE });
  requireWebSearchLedger(ledger, REVIEW_LANE_CALL_SITE);
  const promptSha = await promptShaOf(prompt);
  try {
    await assertSpendable(cap, { site: REVIEW_LANE_CALL_SITE, model: a.model, projectedUsd: projectReviewLaneUsd(anthropicPriceFor(a.model), prompt.length) });
  } catch (e) {
    if (e instanceof SpendCapRefused) return { httpStatus: 200, body: { review_lane: { status: "refused_by_cap", target: target.key, reason: e.message, refusals: cap.refusals } } };
    throw e;
  }
  let res: Response;
  try {
    res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": a.apiKey, "anthropic-version": "2023-06-01", "anthropic-beta": REVIEW_LANE_BETA, "content-type": "application/json" },
      body: JSON.stringify({ model: a.model, max_tokens: REVIEW_LANE_MAX_TOKENS, tools: reviewLaneTools(target.host), messages: [{ role: "user", content: prompt }] }),
    });
  } catch (netErr) {
    await ledgerOrRefuse(ledger, { model: a.model, usage: null, attempt: 1, promptSha }, REVIEW_LANE_CALL_SITE);
    return { httpStatus: 502, body: { review_lane: { status: "call_failed", target: target.key, error: String(netErr).slice(0, 300) } } };
  }
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    await ledgerOrRefuse(ledger, { model: a.model, usage: null, attempt: 1, promptSha }, REVIEW_LANE_CALL_SITE);
    return { httpStatus: 502, body: { review_lane: { status: "call_failed", target: target.key, error: `Anthropic HTTP ${res.status} ${errText.slice(0, 300)}` } } };
  }
  const d = await res.json();
  await ledgerOrRefuse(ledger, { model: a.model, usage: d?.usage ?? null, attempt: 1, promptSha }, REVIEW_LANE_CALL_SITE);
  const usd = anthropicUsd(a.model, d?.usage ?? null);
  const { data: callRow, error: callErr } = await a.db.from("review_lane_calls").insert({
    company_id: a.companyId, target_key: target.key, host: target.host, model: a.model, usd, response: d,
    outcome: { status: "stored", stop_reason: d?.stop_reason ?? null, usage: d?.usage ?? null, prompt_sha: promptSha }, created_by: a.actingUserId,
  }).select("id").single();
  if (callErr || !callRow) return { httpStatus: 500, body: { review_lane: { status: "store_failed", target: target.key, error: callErr?.message ?? "no row", usd } } };
  if (!mint) return { httpStatus: 200, body: { review_lane: { status: "stored", call_id: callRow.id, target: target.key, usd } } };
  const out = await mintFromCall(a.db, list, callRow.id);
  return { httpStatus: 200, body: { review_lane: { ...out, target: target.key, usd } } };
}

/** VERIFY (slice 4; ruling R1): fetch ONE page a held lead row cites, with the lane's own page fetch and no search, and
 *  store the response. No signal is written here: scripts/review-lane/promote-verified.ts reads the stored call and
 *  promotes a lead only under the existing rules (verifyLead). The URL must be the page of a live lead row of this
 *  company held "search summary, not checked against the page", on its call's target host. */
async function verifyLeadPage(a: Parameters<typeof runReviewLane>[0], list: CompanyReviewList): Promise<{ httpStatus: number; body: Record<string, unknown> }> {
  const v = a.request.verify as { url?: unknown } | null;
  const url = typeof v?.url === "string" ? v.url.trim() : "";
  const refuse = (error: string) => ({ httpStatus: 400, body: { status: "review_lane_refused", error } });
  if (!url) return refuse("verify needs { url }");
  const { data: leads } = await a.db.from("signals").select("id, review_lane_call_id").eq("company_id", list.companyId).eq("source_url", url)
    .eq("held_reason", LEAD_BASIS_LABEL).is("superseded_at", null).not("review_lane_call_id", "is", null);
  if (!leads?.length) return refuse("verify: no live lead row of this company cites that url");
  const { data: calls } = await a.db.from("review_lane_calls").select("id, target_key").in("id", [...new Set((leads as Array<{ review_lane_call_id: string }>).map((l) => l.review_lane_call_id))]);
  const target = list.targets.find((t) => t.key === (calls ?? [])[0]?.target_key);
  if (!target) return refuse("verify: the lead's call has no target on the list");
  let host = "";
  try { host = new URL(url).hostname.toLowerCase().replace(/^www\./, ""); } catch { /* refused below */ }
  const th = target.host.toLowerCase().replace(/^www\./, "");
  if (!host || !(host === th || host.endsWith(`.${th}`))) return refuse("verify: the url is off its target host");
  if (!a.apiKey) return { httpStatus: 500, body: { status: "review_lane_refused", error: "review lane: ANTHROPIC_API_KEY missing" } };
  if (a.capUsd == null) return refuse("review lane requires spend_cap_usd");
  if (!a.spendSince) return refuse("review lane requires spend_since: the research run's start, an ISO time in the last 24 hours");

  const cap = makeSpendCap({ capUsd: a.capUsd, companyId: a.companyId, since: a.spendSince, supabase: a.db });
  const prompt = reviewLaneVerifyPrompt(url);
  const ledger = webSearchLedgerFor(a.db, { companyId: a.companyId, runId: null, callSite: REVIEW_LANE_CALL_SITE });
  requireWebSearchLedger(ledger, REVIEW_LANE_CALL_SITE);
  const promptSha = await promptShaOf(prompt);
  try {
    await assertSpendable(cap, { site: REVIEW_LANE_CALL_SITE, model: a.model, projectedUsd: projectReviewLaneVerifyUsd(anthropicPriceFor(a.model), prompt.length) });
  } catch (e) {
    if (e instanceof SpendCapRefused) return { httpStatus: 200, body: { review_lane: { status: "refused_by_cap", verify_url: url, reason: e.message, refusals: cap.refusals } } };
    throw e;
  }
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": a.apiKey, "anthropic-version": "2023-06-01", "anthropic-beta": REVIEW_LANE_BETA, "content-type": "application/json" },
    body: JSON.stringify({ model: a.model, max_tokens: REVIEW_LANE_VERIFY_MAX_TOKENS, tools: reviewLaneVerifyTools(target.host), messages: [{ role: "user", content: prompt }] }),
  }).catch((e) => e as Error);
  if (res instanceof Error || !res.ok) {
    const raw = res instanceof Error ? "" : await res.text().catch(() => "");
    const errText = res instanceof Error ? String(res) : `Anthropic HTTP ${res.status} ${raw.slice(0, 300)}`;
    // an unbilled refusal (HTTP 400 invalid_request_error) is ledgered at zero tokens, as the forum test was; anything
    // else is ledgered unpriced, which stops the cap until it is priced
    let unbilled = false;
    try { unbilled = !(res instanceof Error) && res.status === 400 && JSON.parse(raw)?.error?.type === "invalid_request_error"; } catch { unbilled = false; }
    await ledgerOrRefuse(ledger, { model: a.model, usage: unbilled ? { input_tokens: 0, output_tokens: 0 } : null, attempt: 1, promptSha }, REVIEW_LANE_CALL_SITE);
    return { httpStatus: 502, body: { review_lane: { status: "call_failed", verify_url: url, error: errText.slice(0, 300) } } };
  }
  const d = await res.json();
  await ledgerOrRefuse(ledger, { model: a.model, usage: d?.usage ?? null, attempt: 1, promptSha }, REVIEW_LANE_CALL_SITE);
  const usd = anthropicUsd(a.model, d?.usage ?? null);
  const fetchOutcome = verifyFetchOutcome(d);
  const { data: callRow, error: callErr } = await a.db.from("review_lane_calls").insert({
    company_id: a.companyId, target_key: `${REVIEW_LANE_VERIFY_TARGET_PREFIX}${target.key}`, host: target.host, model: a.model, usd, response: d,
    // never minted: a verify call's rows are promoted leads, not new rows (minted_at set so mint_call_id refuses it)
    outcome: { status: "verify_stored", verify_url: url, fetch: fetchOutcome, stop_reason: d?.stop_reason ?? null, usage: d?.usage ?? null, prompt_sha: promptSha },
    minted_at: new Date().toISOString(), created_by: a.actingUserId,
  }).select("id").single();
  if (callErr || !callRow) return { httpStatus: 500, body: { review_lane: { status: "store_failed", verify_url: url, error: callErr?.message ?? "no row", usd } } };
  return { httpStatus: 200, body: { review_lane: { status: "verify_stored", call_id: callRow.id, verify_url: url, fetch: fetchOutcome, usd } } };
}
