// R8 (operator ruling, 2026-10-18) — THE REGEN FUNCTION OBEYS NO-WRITE-BY-DEFAULT.
//
// extract-outside-evidence read three body keys (company_id, urls, run_id) and nothing else: any body
// that passed the review gate WROTE — generated, judged, minted signals — and an unknown key was
// ignored, not refused. There was no way to ask it a read-only question.
//
// The handler now lives here, as a pure-ish function over an injected supabase and two injected seams
// (transport, ledger), so the rule is provable without a network and without a write:
//   * the body MUST name exactly one mode, `plan` or `write`, and carry no key outside REGEN_BODY_KEYS;
//     anything else is a 400 with guard body_mode_unnamed naming the keys sent and the modes named,
//     ledgered on an integrity row like the run_id refusal (when a company is named — a body with no
//     company has nothing to ledger to);
//   * PLAN reads the snapshots and the review gate and answers with one row per URL — snapshot id,
//     chars, at-cap, the b2-blanked signal ids on that URL, estimated tokens and cost, and the
//     review-gate state with the reason the gate would give — and writes NOTHING: no signal, no
//     integrity row, no model call. The transport is never constructed on this path;
//   * WRITE runs as before (R4 ledger, R3 review gate, E4+E2 admission, per-URL cap, wall clock).
import { gateRegenUrls, requireRunId } from "./outsideRecrawlReview.ts";
import { contentIdentity, normalizeForHash } from "./contentIdentity.ts";
import { admitOutsideEvidence, detectAttribution, isBareAttribution, snapshotReadDate } from "./outsideEvidenceRegen.ts";
import { regenCallSite } from "./outsideRegenModel.ts";
import type { AuthorshipLedger, SpeakerJudge, SpeakerLedger } from "./aggregatorAuthorship.ts";
import { finishIntegrityRun, insertIntegrityRun, IntegrityWriteRefused, openIntegrityRun } from "./integrityWrite.ts";
import { sanitizeForStore, sanitizeNullable } from "./sanitizeForStore.ts";
import { BODY_MODE_GUARD, classifyBodyMode } from "./bodyMode.ts";
import { emptyTally, regenGenerate, regenJudge, tallyingLedger, type RegenLedger, type RegenTransport } from "./outsideRegenModel.ts";
import { OPENAI_PRICE_PER_MTOK } from "./modelPricing.ts";
import { classifyRegistryRow } from "./registryClassifier.ts";
import { decideVoiceClassBeforeJudge, voiceClassForMintedExcerpt, type JudgeFailurePolicy, type VoiceClassInput, type TextGate } from "./voiceClassAtMint.ts";
import type { AuthorshipJudgment } from "./aggregatorAuthorship.ts";
import { clientAnchorsFor } from "./clientAnchors.ts";
import { nearestSpan, type NearestSpan } from "./nearestSpan.ts";
import { speakerContext } from "./attribution.ts";
import { buildClientCorpus, type SyndicationJudge, type SyndicationLedger } from "./syndication.ts";

/** R17 (b): on the regen path an unjudged gated row is NOT minted. Named here, passed explicitly — the shared
 *  function has no default. */
export const REGEN_JUDGE_FAILURE_POLICY: JudgeFailurePolicy = "refuse_mint";
/** The regen path's label when no authority fires: a third-party page speaking about the client. */
/** R28: the text gates the regen path names — a first-person candidate is client_voice by rule, before the judge. */
export const REGEN_TEXT_GATES: ReadonlyArray<TextGate> = ["first_person", "attributed_speech"];
export const REGEN_DEFAULT_LABEL = "outside_voice_about_client";
/** R41: pages a WRITE call processes; the approved URLs not yet minted under the run_id beyond it are `remaining`, picked up by a continuation call. */
export const REGEN_PAGE_BUDGET = 8;
export const FIXTURE_HELD_GUARD = "fixture_held" as const;
export type RegenJudge = (input: { subjectName: string; subjectHost: string; url: string; text: string }) => Promise<AuthorshipJudgment | null>;

export const REGEN_MODE_FLAGS = ["plan", "write"] as const;
export type RegenMode = typeof REGEN_MODE_FLAGS[number];
/** Every key this function reads off the body. A key not here is refused rather than ignored. */
export const REGEN_BODY_KEYS: readonly string[] = ["company_id", "run_id", "urls", ...REGEN_MODE_FLAGS];
export const REGEN_COMPONENT = "r3_outside_regen";

export const EMPTY_SHA = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
/** fetchAndExtract's text cap: a snapshot of exactly this length was cut, not complete. */
export const SNAPSHOT_CAP_CHARS = 12_000;

// ── R27: EVERY CANDIDATE IS RECORDED (operator ruling 2026-10-18) ──────────────────────────────────────────
// The generator returns {text, reason}; the judge's reason is kept; each candidate — admitted or refused — is
// stored on the run's integrity row in full with its outcome code, both reasons, and (for an e4 refusal) the
// page span it came closest to with its offset. Nothing per candidate is truncated or capped in storage.
export type CandidateCode =
  | "admitted" | "judge_reject" | "duplicate_identity" | "voice_refused"
  | "e4_not_verbatim" | "e2_bare_attribution" | "e2_overbroad" | "e2_too_short" | "e2_overthinned" | "e2_thin_broke_verbatim" | "empty"
  | "slice_unresolved" | "slice_assert_failed";
export type CandidateRecord = {
  url: string; text: string; code: CandidateCode;
  generator_reason: string | null; judge_reason: string | null;
  /** the page span an e4 refusal came closest to (longest common run on e4's normalization); null otherwise */
  nearest_span: NearestSpan | null;
  /** the voice authority's refusal reason when code is voice_refused */
  detail?: string;
  /** R36 (a): a field of this candidate carried U+0000 / a control character from the model's JSON and was cleaned at parse */
  sanitized?: true;
};
/** The generator's statements as {text, reason}. A bare string (the pre-R27 shape) reads as text with no reason. */
/** R32: the paragraph the candidate sits in — from the previous blank line to the next, capped. */
export function paragraphAround(page: string, offset: number, length: number): string {
  const sep = page.lastIndexOf("\n\n", offset);
  const start = Math.max(0, sep >= 0 ? sep + 2 : 0, offset - 1200);   // after the separator, never including it
  const endNl = page.indexOf("\n\n", offset + length);
  const end = Math.min(page.length, endNl < 0 ? offset + length + 1200 : endNl, offset + length + 1200);
  return page.slice(start, end);
}
export type GeneratorStatement = { text: string; reason: string | null; /** R36 (a) */ sanitized?: true };
export function parseGeneratorStatements(statements: unknown, quoteMaxWords: number): GeneratorStatement[] {
  const list = Array.isArray(statements) ? statements : [];
  const out: GeneratorStatement[] = [];
  for (const s of list) {
    // R36 (a): the ONE sanitizer, at the parse boundary — text and reason
    const sText = sanitizeForStore(typeof s === "string" ? s : (s as { text?: unknown })?.text);
    const text = sText.text.trim();
    if (!text || text.split(/\s+/).length > quoteMaxWords) continue;
    const sReason = sanitizeNullable(typeof s === "object" && s !== null ? (s as { reason?: unknown }).reason : null);
    const reason = sReason.text && sReason.text.trim() ? sReason.text.trim() : null;
    out.push({ text, reason, ...(sText.changed || sReason.changed ? { sanitized: true as const } : {}) });
  }
  return out;
}
/** Token estimate: ~4 chars per token for English page text, plus the system prompt and the judge's
 *  candidate list. Estimates, labelled as such — the ledger holds the real figures. */
export const EST_CHARS_PER_TOKEN = 4;
export const EST_PROMPT_OVERHEAD_TOKENS = 350;
export const EST_OUTPUT_TOKENS_PER_CALL = 250;
export const CALLS_PER_URL = 2;

export type ReviewState = "approved" | "rejected" | "undecided" | "no_review_row";

// deno-lint-ignore no-explicit-any
export type AnySupabase = { from: (t: string) => any };

export type RegenDeps = {
  supabase: AnySupabase;
  /** Built ONLY on the write path — a plan never constructs one. */
  makeTransport: () => RegenTransport;
  makeLedger: (companyId: string) => RegenLedger;
  /** The local authorship judge, built ONLY on the write path like the transport; null when none is wired —
   *  under REGEN_JUDGE_FAILURE_POLICY every gated URL is then refused, never minted outside. */
  makeJudge: (ledger: AuthorshipLedger) => RegenJudge | null;   // R53: built with the run's ledger; every call writes a model_calls row before parse
  /** R32: the speaker judge, built with the run's ledger so every call writes a model_calls row before parse. Null ⇒ attributed candidates are refused. */
  makeSpeakerJudge?: (ledger: SpeakerLedger) => SpeakerJudge | null;
  /** R38: the syndication band judge (llama3:70b on the operator's Ollama), built with the run's ledger (role "syndication").
   *  Null ⇒ a candidate in the uncertain band is refused (syndication_unresolved), never minted. */
  makeSyndicationJudge?: (ledger: SyndicationLedger) => SyndicationJudge | null;
  models: readonly string[];
  genSystem: (anchors: readonly string[]) => string;
  judgeSystem: (anchors: readonly string[]) => string;
  quoteMaxWords: number;
  perUrlCap: number;
  wallMs: number;
  nowIso?: () => string;
  now?: () => number;
};

export type RegenResult = { status: number; body: Record<string, unknown> };

export type PlanVoice = {
  /** the class a minted excerpt from this URL would carry, decided by the shared authority at URL level;
   *  "registry" means the excerpt's section decides (filing / self-reported ⇒ client_voice, else outside) */
  class: string;
  authority: string;
  /** set when the write path would REFUSE every excerpt from this URL as it stands (gated, no judge on plan) */
  refusal: string | null;
};
export type PlanRow = {
  url: string;
  snapshot_id: string | null;
  chars: number;
  at_cap: boolean;
  blanked_signal_ids: string[];
  est_input_tokens: number;
  est_usd: number;
  review: { state: ReviewState; reason: string };
  voice: PlanVoice;
};

/** R17: the URL-level voice decision a plan reports — the same function the write path runs per excerpt, with no
 *  judge (a plan calls no model) and no excerpt (a registry page's class is per section). */
export function planVoiceFor(url: string, pageText: string, company: { name: string; host: string | null }, registry: ReturnType<typeof classifyRegistryRow>): PlanVoice {
  const pre = decideVoiceClassBeforeJudge({ url, item: null, labeledClass: REGEN_DEFAULT_LABEL, pageText, judgedText: null, company, registry, judge: null, gate: "profile_wire_boilerplate", onJudgeFailure: REGEN_JUDGE_FAILURE_POLICY });
  if ("needs_speaker" in pre) return { class: "(speaker judge decides)", authority: "speaker_judge", refusal: null };   // R32: never on plan (no candidate text), typed for completeness
  if ("needs_syndication_judge" in pre) return { class: "(band judge decides)", authority: "syndication", refusal: null };   // R38: never on plan (no syndication input), typed for completeness
  if ("needs_judge" in pre) return { class: "(judge decides)", authority: "authorship_judge", refusal: `gated (${pre.gate.via} ${pre.gate.host}): every excerpt is judged on write; with no judge wired each is refused, not minted` };
  if (!pre.ok) return { class: "(refused)", authority: pre.authority, refusal: pre.reason };
  if (pre.authority === "registry") return { class: "registry: section decides", authority: "registry", refusal: null };
  return { class: pre.voice_class ?? "(unlabelled)", authority: pre.authority, refusal: null };
}

/** The review-gate state of one URL, with the reason gateRegenUrls would give. */
export function reviewStateOf(url: string, gate: ReturnType<typeof gateRegenUrls>, runId: string): { state: ReviewState; reason: string } {
  if (gate.allowed.includes(url)) return { state: "approved", reason: `operator_decision=approve on the outside_recrawl_review row for run ${runId}` };
  const r = gate.refused.find((x) => x.url === url);
  if (!r || r.reason === "no_review_row") return { state: "no_review_row", reason: `no outside_recrawl_review row for this url under run ${runId}` };
  if (r.reason === "rejected") return { state: "rejected", reason: `operator_decision=reject on the review row for run ${runId}` };
  return { state: "undecided", reason: `a review row exists for run ${runId} but operator_decision is null` };
}

export function estimateUrl(chars: number): { est_input_tokens: number; est_usd: number } {
  const page = Math.ceil(chars / EST_CHARS_PER_TOKEN);
  const input = CALLS_PER_URL * (page + EST_PROMPT_OVERHEAD_TOKENS);
  const output = CALLS_PER_URL * EST_OUTPUT_TOKENS_PER_CALL;
  const usd = (input / 1e6) * OPENAI_PRICE_PER_MTOK.input + (output / 1e6) * OPENAI_PRICE_PER_MTOK.output;
  return { est_input_tokens: input, est_usd: Math.round(usd * 1e6) / 1e6 };
}

function isBlankedByB2(s: { evidence_excerpt?: string | null; raw_payload?: unknown }): boolean {
  const rp = (s.raw_payload ?? {}) as { excerpt_guard?: { backfill_run_ref?: unknown } };
  const stamped = typeof rp.excerpt_guard?.backfill_run_ref === "string" && rp.excerpt_guard.backfill_run_ref.length > 0;
  return stamped && !String(s.evidence_excerpt ?? "").trim();
}

export async function runOutsideRegen(rawBody: unknown, deps: RegenDeps): Promise<RegenResult> {
  const nowIso = deps.nowIso ?? (() => new Date().toISOString());
  const now = deps.now ?? (() => Date.now());
  const startedAt = now();
  const supabase = deps.supabase;
  const body = (rawBody && typeof rawBody === "object" && !Array.isArray(rawBody) ? rawBody : {}) as Record<string, unknown>;
  const company_id = String(body.company_id ?? "");

  // ── THE MODE IS NAMED, OR THE CALL IS REFUSED — before company, before run_id, before any read ──
  const verdict = classifyBodyMode(body, REGEN_MODE_FLAGS, REGEN_BODY_KEYS);
  if (!verdict.ok) {
    // Ledgered like the run_id refusal — when a company is named. A refusal must stay a 400: an audit
    // row that cannot be written (unknown company ⇒ FK) is reported in the body, never turned into a 500.
    let audit: { ledgered: boolean; error?: string } = { ledgered: false };
    if (company_id) {
      try {
        await insertIntegrityRun(supabase, {
          company_id, component: REGEN_COMPONENT, status: "failed", examined: 0, admitted: 0,
          error: `guard=${BODY_MODE_GUARD} detail=${verdict.detail}`,
          excluded_by_rule: {
            guard: BODY_MODE_GUARD, detail: verdict.detail, mode: null,
            keys_sent: verdict.keys_sent, keys_known: [...REGEN_BODY_KEYS].sort(),
            modes_named: verdict.modes_named, unknown_keys: verdict.unknown_keys, review_gate: true,
          },
          run_ref: "r3_outside_regen_refused_body_mode",
        });
        audit = { ledgered: true };
      } catch (e) {
        audit = { ledgered: false, error: (e as Error).message };
      }
    }
    return { status: 400, body: { ok: false, error: verdict.detail, guard: BODY_MODE_GUARD, keys_sent: verdict.keys_sent, modes_named: verdict.modes_named, keys_known: [...REGEN_BODY_KEYS].sort(), audit } };
  }
  const mode: RegenMode = verdict.mode;
  const urlFilter: string[] | null = Array.isArray(body.urls) ? body.urls.map(String) : null;
  if (!company_id) return { status: 400, body: { error: "company_id is required" } };

  // R3 REVIEW GATE: run_id names the outside_recrawl_review run whose rows decide. Missing ⇒ refused + ledgered.
  const runId = requireRunId(body);
  if (!runId) {
    await insertIntegrityRun(supabase, {
      company_id, component: REGEN_COMPONENT, status: "failed", examined: 0, admitted: 0,
      excluded_by_rule: { refused: "run_id_required", review_gate: true, mode }, run_ref: "r3_outside_regen_refused_no_run_id",
    });
    return { status: 400, body: { ok: false, error: "run_id is required: name the outside_recrawl_review run whose approved rows to regenerate" } };
  }

  // R17: name and website join the select — the shared voice authority needs the company's host (own domain)
  // and name (the judge's outcome test).
  const { data: co } = await supabase.from("companies").select("id, name, website, frozen, entity_anchors_json, fixture_hold").eq("id", company_id).maybeSingle();
  if (!co) return { status: 404, body: { error: "company not found" } };
  // R40: a HELD company (companies.fixture_hold non-null — a test fixture) is refused on plan and write alike, ledgered.
  const hold = (co as { fixture_hold?: unknown }).fixture_hold;
  if (typeof hold === "string" && hold.trim()) {
    await insertIntegrityRun(supabase, {
      company_id, component: REGEN_COMPONENT, status: "failed", examined: 0, admitted: 0,
      error: `guard=${FIXTURE_HELD_GUARD} ${hold}`,
      excluded_by_rule: { refused: FIXTURE_HELD_GUARD, guard: FIXTURE_HELD_GUARD, hold, review_gate: true, mode }, run_ref: `r3_outside_regen_refused_${FIXTURE_HELD_GUARD}`,
    });
    return { status: 403, body: { ok: false, error: `company is held (${hold}) — a test fixture never regenerates`, guard: FIXTURE_HELD_GUARD, hold } };
  }
  if ((co as { frozen?: boolean }).frozen) return { status: 403, body: { error: "outside-regen refused: company is frozen" } };
  // R22: the client is ALWAYS named — company name, website host (one derivation), then entity anchors; name and
  // host both absent is a named refusal, never a fallback string. The set used rides on the plan and the ledger.
  const ca = clientAnchorsFor(co as { name?: unknown; website?: unknown; entity_anchors_json?: unknown });
  if (!ca.ok) {
    await insertIntegrityRun(supabase, {
      company_id, component: REGEN_COMPONENT, status: "failed", examined: 0, admitted: 0,
      error: `guard=${ca.guard} ${ca.reason}`,
      excluded_by_rule: { refused: ca.guard, guard: ca.guard, reason: ca.reason, review_gate: true, mode }, run_ref: `r3_outside_regen_refused_${ca.guard}`,
    });
    return { status: 400, body: { ok: false, error: ca.reason, guard: ca.guard } };
  }
  const anchors = ca.anchors;
  const company = { name: ca.name ?? "", host: ca.host };

  // Basis: newest ok (real-body) snapshot per URL. NO fetch. `structured` rides along for the registry classifier's ld hint.
  const { data: snapRows } = await supabase
    .from("outside_page_snapshots")
    .select("id, source_url, signal_id, clean_text, text_sha256, crawled_at, fetch_status, structured")
    .eq("company_id", company_id).eq("fetch_status", "ok")
    .order("crawled_at", { ascending: false });
  const newestByUrl = new Map<string, { id: string | null; clean_text: string; sha: string; signal_id: string | null; readDate: string | null; structured: unknown }>();
  for (const r of (snapRows ?? []) as Array<{ id?: string | null; source_url: string; signal_id: string | null; clean_text: string | null; text_sha256: string; crawled_at?: string | null; structured?: unknown }>) {
    if (newestByUrl.has(r.source_url)) continue;
    if (!r.clean_text || r.text_sha256 === EMPTY_SHA) continue;
    newestByUrl.set(r.source_url, { id: r.id ?? null, clean_text: r.clean_text, sha: r.text_sha256, signal_id: r.signal_id, readDate: snapshotReadDate(r.crawled_at), structured: r.structured ?? null });
  }
  /** The registry classification of one excerpt (or of the page when no excerpt is given) on a registry URL; null elsewhere. */
  const registryFor = (url: string, text: string | null) => {
    const snap = newestByUrl.get(url)!;
    return classifyRegistryRow({ url, text: text ?? "", snapshot: { clean_text: snap.clean_text, text_sha256: snap.sha, structured: snap.structured } });
  };
  let urls = [...newestByUrl.keys()];
  if (urlFilter) urls = urls.filter((u) => urlFilter.includes(u));
  // R41: plan order is the review rows' order (from-snapshots inserts them in plan order); a URL already minted under
  // this run_id (a signal whose raw_payload.run_id is the run) is DONE and never re-run.
  const { data: reviewRows } = await supabase
    .from("outside_recrawl_review").select("source_url, operator_decision, created_at")
    .eq("company_id", company_id).eq("run_id", runId).order("created_at", { ascending: true });
  const planIndex = new Map<string, number>(((reviewRows ?? []) as Array<{ source_url: string }>).map((r, i) => [r.source_url, i]));
  urls.sort((a, b) => (planIndex.get(a) ?? 1e9) - (planIndex.get(b) ?? 1e9));
  const gate = gateRegenUrls(urls, (reviewRows ?? []) as Array<{ source_url: string; operator_decision: string | null }>);
  const { data: mintedRows } = await supabase.from("signals").select("source_url").eq("company_id", company_id).eq("raw_payload->>run_id", runId);
  const mintedUnderRun = new Set(((mintedRows ?? []) as Array<{ source_url: string | null }>).map((r) => r.source_url).filter((u): u is string => !!u));
  // R43 (operator ruling 2026-10-20): a URL is DONE under a run when ANY r3_outside_regen integrity row for the run —
  // completed or failed — lists it as processed (processed_urls, written by every finish), or a signal carries the
  // run_id. A page processed with no candidate and no mint is not re-run on a continuation.
  const { data: priorRuns } = await supabase.from("integrity_runs").select("excluded_by_rule").eq("company_id", company_id).eq("component", REGEN_COMPONENT);
  for (const row of (priorRuns ?? []) as Array<{ excluded_by_rule?: { run_id?: string; processed_urls?: unknown; candidates?: Array<{ url?: string }> } | null }>) {
    const p = row.excluded_by_rule; if (!p || p.run_id !== runId) continue;
    for (const u of Array.isArray(p.processed_urls) ? p.processed_urls : []) if (typeof u === "string") mintedUnderRun.add(u);
    for (const c of Array.isArray(p.candidates) ? p.candidates : []) if (typeof c?.url === "string") mintedUnderRun.add(c.url);
  }
  const doneUrls = gate.allowed.filter((u) => mintedUnderRun.has(u));
  const pendingUrls = gate.allowed.filter((u) => !mintedUnderRun.has(u));

  // ── PLAN: answer, write nothing, call nothing ────────────────────────────────────────────────
  if (mode === "plan") {
    const { data: liveSig } = await supabase
      .from("signals").select("id, source_url, evidence_excerpt, raw_payload")
      .eq("company_id", company_id).eq("signal_band", "outside")
      .is("superseded_at", null).is("held_at", null);
    const blankedByUrl = new Map<string, string[]>();
    for (const s of (liveSig ?? []) as Array<{ id: string; source_url: string | null; evidence_excerpt?: string | null; raw_payload?: unknown }>) {
      if (!s.source_url || !isBlankedByB2(s)) continue;
      const list = blankedByUrl.get(s.source_url) ?? [];
      list.push(s.id);
      blankedByUrl.set(s.source_url, list);
    }
    const rows: PlanRow[] = urls.map((url) => {
      const snap = newestByUrl.get(url)!;
      const chars = snap.clean_text.length;
      return {
        url, snapshot_id: snap.id, chars, at_cap: chars >= SNAPSHOT_CAP_CHARS,
        blanked_signal_ids: (blankedByUrl.get(url) ?? []).sort(),
        ...estimateUrl(chars),
        review: reviewStateOf(url, gate, runId),
        voice: planVoiceFor(url, snap.clean_text, company, registryFor(url, null)),
        done: mintedUnderRun.has(url),   // R41: already minted under this run_id
      };
    });
    const summary = { approved: 0, rejected: 0, undecided: 0, no_review_row: 0 } as Record<ReviewState, number>;
    for (const r of rows) summary[r.review.state] += 1;
    const est_input_tokens = rows.reduce((a, r) => a + r.est_input_tokens, 0);
    const est_usd = Math.round(rows.reduce((a, r) => a + r.est_usd, 0) * 1e6) / 1e6;
    return {
      status: 200,
      body: {
        ok: true, mode: "plan", company_id, run_id: runId, model_calls: 0, writes: 0,
        anchors_used: anchors, anchors_from_entity: ca.from_entity_anchors,
        urls_total: rows.length, would_run: pendingUrls.length, review: summary,
        // R41: the budget view — what a write call would process now, and what would remain for a continuation
        pages_budget: REGEN_PAGE_BUDGET, done: doneUrls.length, remaining: pendingUrls.length, would_run_this_call: Math.min(REGEN_PAGE_BUDGET, pendingUrls.length), done_urls: doneUrls, remaining_urls: pendingUrls,
        estimate: { calls: CALLS_PER_URL * rows.length, calls_if_approved_only: CALLS_PER_URL * summary.approved, est_input_tokens, est_usd },
        rows,
      },
    };
  }

  // ── WRITE ────────────────────────────────────────────────────────────────────────────────────
  const reviewRefused = gate.refused;
  // R41: this call processes the approved URLs not yet minted under the run, in plan order, up to the budget
  const remaining = pendingUrls.slice(REGEN_PAGE_BUDGET);
  urls = pendingUrls.slice(0, REGEN_PAGE_BUDGET);
  if (urls.length === 0 && doneUrls.length > 0) {
    return { status: 200, body: { ok: true, mode: "write", company_id, run_id: runId, urls_total: gate.allowed.length, pages_processed: 0, pages_budget: REGEN_PAGE_BUDGET, done: doneUrls.length, remaining: [], note: "every approved URL is already minted under this run_id — nothing to do", model_calls: emptyTally(), review_refused: reviewRefused } };
  }
  if (urls.length === 0) {
    await insertIntegrityRun(supabase, {
      company_id, component: REGEN_COMPONENT, status: "failed", examined: 0, admitted: 0,
      excluded_by_rule: { refused: "no_approved_urls", review_refused: reviewRefused, run_id: runId, review_gate: true, mode }, run_ref: `r3_outside_regen_${runId}`,
    });
    return { status: 400, body: { ok: false, error: "no approved URLs for this run_id", run_id: runId, review_refused: reviewRefused } };
  }

  // The seams, built once per run and ONLY here. A missing key refuses before any attempt. The judge may be
  // null: then every gated URL's excerpts are refused under REGEN_JUDGE_FAILURE_POLICY, never minted outside.
  const transport = deps.makeTransport();
  // R36 (b): the run's integrity row is OPENED (status running) before the first page — a refused open refuses the run
  // before any mint; the row is FINISHED with the full payload at the end, and a refused finish leaves it failed with the
  // error, never no row.
  let integrityId: number;
  const openedAt = nowIso();   // carried through the finish payload: the open time is part of the record (and the ledger guard's forward window reads it)
  try {
    integrityId = await openIntegrityRun(supabase, {
      company_id, component: REGEN_COMPONENT, status: "running", examined: 0, admitted: 0,
      excluded_by_rule: { mode, run_id: runId, urls: urls.length, review_refused: reviewRefused, review_gate: true, anchors_used: anchors, opened_at: openedAt, pages_budget: REGEN_PAGE_BUDGET, done_before: doneUrls.length, remaining: remaining },
      run_ref: `r3_outside_regen_${runId}`,
    });
  } catch (e) {
    return { status: 500, body: { ok: false, error: `integrity row could not be opened — run refused before any mint: ${(e as Error).message}`, run_id: runId, mints: 0 } };
  }
  const tally = emptyTally();
  const ledger = tallyingLedger(deps.makeLedger(company_id), tally);
  // R32: the speaker judge ledgers through the same tallying ledger, role "speaker", call site extract-outside-evidence:speaker
  const speakerJudge: SpeakerJudge | null = deps.makeSpeakerJudge ? deps.makeSpeakerJudge((e) => ledger({ role: "speaker", callSite: regenCallSite("speaker"), usage: e.usage, attempt: 1, promptSha: e.promptSha })) : null;
  // R38: the band judge ledgers through the same tallying ledger, role "syndication", call site extract-outside-evidence:syndication
  const syndicationJudge: SyndicationJudge | null = deps.makeSyndicationJudge ? deps.makeSyndicationJudge((e) => ledger({ role: "syndication", callSite: regenCallSite("syndication"), usage: e.usage, attempt: 1, promptSha: e.promptSha })) : null;
  // R53: the authorship judge ledgers through the same tallying ledger, role "authorship", call site extract-outside-evidence:authorship.
  // Built here, after the ledger, rather than before the integrity row opens: the judge makes no call until the first gated excerpt.
  const judge: RegenJudge | null = deps.makeJudge((e) => ledger({ role: "authorship", callSite: regenCallSite("authorship"), usage: e.usage, attempt: 1, promptSha: e.promptSha }));
  // R38: the client corpus ONCE per write call — every client_voice / own-domain / company-claim row of the company, the rows
  // minted under THIS run excluded so no candidate scores against itself. The baseline's own builder, the same rule.
  const corpus = await buildClientCorpus(supabase, company_id, company.host ?? "", [], (row) => String(row.raw_payload?.run_id ?? "") === runId);
  let voice_refused_total = 0;
  const voiceRefusals: Array<{ url: string; reason: string; excerpts: number }> = [];

  // Existing outside content identities (dedup — never mint a duplicate of an existing signal's excerpt).
  const { data: existSig } = await supabase
    .from("signals").select("evidence_excerpt, raw_payload")
    .eq("company_id", company_id).eq("voice_class", "outside_voice_about_client");
  const existingCI = new Set<string>();
  for (const s of (existSig ?? []) as Array<{ evidence_excerpt: string | null; raw_payload?: { content_identity?: string } }>) {
    if (s.raw_payload?.content_identity) existingCI.add(s.raw_payload.content_identity);
    if (s.evidence_excerpt) existingCI.add(await contentIdentity(s.evidence_excerpt));
  }

  // Source title per URL (reuse the held signal's title where present).
  const titleByUrl = new Map<string, string | null>();
  for (const [u, meta] of newestByUrl) {
    if (!urls.includes(u)) continue;
    if (meta.signal_id) {
      const { data: sig } = await supabase.from("signals").select("source_title").eq("id", meta.signal_id).maybeSingle();
      titleByUrl.set(u, (sig as { source_title?: string | null } | null)?.source_title ?? null);
    } else titleByUrl.set(u, null);
  }

  const pages: Array<Record<string, unknown>> = [];
  const candidateRecords: CandidateRecord[] = [];   // R27: every candidate of the run, in full, for the integrity row
  const processedUrls: string[] = [];               // R43: every page this call processed, candidates or none
  const seenThisRun = new Set<string>();
  let candidates_total = 0, admitted_total = 0, guard_rejected_total = 0;
  const rejectReasons: Record<string, number> = {};
  let processed = 0, stoppedForTime = false;

  for (const url of urls) {
    if (now() - startedAt > deps.wallMs) { stoppedForTime = true; break; }
    const { clean_text, sha, readDate } = newestByUrl.get(url)!;

    let cands: GeneratorStatement[] = [];
    try {
      const { json: gen } = await regenGenerate({ system: deps.genSystem(anchors), user: `PAGE TEXT:\n${clean_text}`, models: deps.models, transport, ledger });
      cands = parseGeneratorStatements(gen.statements, deps.quoteMaxWords);
    } catch (e) {
      pages.push({ url, error: `gen: ${(e as Error).message}`, candidates: 0, admitted: 0 });
      continue;
    }
    candidates_total += cands.length;

    // R27: the judge's verdict AND its reason are kept per quote
    let keepByQuote = new Map<string, { keep: boolean; reason: string | null; sanitized?: true }>();
    const admittedRows: Array<Record<string, unknown>> = [];
    const rejected: Array<{ quote: string; reason: string }> = [];
    const pageCandidates: CandidateRecord[] = [];
    const record = (c: GeneratorStatement, code: CandidateCode, extra: Partial<CandidateRecord> = {}) => {
      const jv = keepByQuote.get(c.text);
      // R36 (a): the nearest span is page-derived but sanitized all the same; `sanitized` names any cleaned field
      const ns = extra.nearest_span ? (() => { const s = sanitizeForStore(extra.nearest_span!.text); return { span: { ...extra.nearest_span!, text: s.text }, changed: s.changed }; })() : null;
      const sanitized = c.sanitized || jv?.sanitized || ns?.changed;
      const rec: CandidateRecord = { url, text: c.text, code, generator_reason: c.reason, judge_reason: jv?.reason ?? null, nearest_span: null, ...extra, ...(ns ? { nearest_span: ns.span } : {}), ...(sanitized ? { sanitized: true as const } : {}) };
      pageCandidates.push(rec); candidateRecords.push(rec);
    };
    // R31 (c): a bare attribution clause is refused by rule BEFORE the judge — it never reaches the judge prompt
    for (const cand of cands.filter((c) => isBareAttribution(c.text))) {
      guard_rejected_total++;
      rejectReasons["e2_bare_attribution"] = (rejectReasons["e2_bare_attribution"] ?? 0) + 1;
      rejected.push({ quote: cand.text.slice(0, 80), reason: "e2_bare_attribution" });
      record(cand, "e2_bare_attribution");
    }
    cands = cands.filter((c) => !isBareAttribution(c.text));
    if (cands.length) {
      try {
        const { json: j } = await regenJudge({ system: deps.judgeSystem(anchors), user: `PAGE TEXT:\n${clean_text}\n\nCANDIDATES:\n${cands.map((c) => `- ${c.text}`).join("\n")}`, models: deps.models, transport, ledger });
        const verdicts = (Array.isArray(j.verdicts) ? j.verdicts : []) as Array<Record<string, unknown>>;
        // R36 (a): the ONE sanitizer, at the parse boundary — quote (the match key) and reason
        keepByQuote = new Map(verdicts.map((v) => { const q = sanitizeForStore(v.quote), r = sanitizeNullable(v.reason); return [q.text.trim(), { keep: v.keep === true, reason: r.text && r.text.trim() ? r.text.trim() : null, ...(q.changed || r.changed ? { sanitized: true as const } : {}) }]; }));
      } catch (e) {
        pages.push({ url, error: `judge: ${(e as Error).message}`, candidates: cands.length, admitted: 0 });
        continue;
      }
    }

    for (const cand of cands) {
      if (admittedRows.length >= deps.perUrlCap) break;
      const c = cand.text;
      if (keepByQuote.size && keepByQuote.get(c)?.keep === false) { rejected.push({ quote: c.slice(0, 80), reason: "judge_reject" }); record(cand, "judge_reject"); continue; }
      const verdictA = admitOutsideEvidence(c, clean_text);
      if (!verdictA.admit) {
        guard_rejected_total++;
        rejectReasons[verdictA.reason] = (rejectReasons[verdictA.reason] ?? 0) + 1;
        rejected.push({ quote: c.slice(0, 80), reason: verdictA.reason });
        // R27: an e4 refusal names the page span it came closest to, with its offset in the raw page
        record(cand, verdictA.reason, verdictA.reason === "e4_not_verbatim" ? { nearest_span: nearestSpan(c, clean_text) } : {});
        continue;
      }
      // R31 (a): the stored excerpt is the page slice at (offset, length) — asserted here; a mismatch fails the ROW, never the run
      if (clean_text.slice(verdictA.offset, verdictA.offset + verdictA.length) !== verdictA.excerpt) {
        rejected.push({ quote: c.slice(0, 80), reason: "slice_assert_failed" });
        record(cand, "slice_assert_failed", { detail: `offset ${verdictA.offset} length ${verdictA.length} does not reproduce the excerpt` });
        continue;
      }
      const ci = await contentIdentity(verdictA.excerpt);
      if (existingCI.has(ci) || seenThisRun.has(ci)) { rejected.push({ quote: c.slice(0, 80), reason: "duplicate_identity" }); record(cand, "duplicate_identity"); continue; }
      // R17: THE voice class, from the one shared authority — never a literal here. An unjudged gated row is refused.
      const voiceInput: VoiceClassInput = {
        url, item: null, labeledClass: REGEN_DEFAULT_LABEL, pageText: clean_text, judgedText: verdictA.excerpt, company,
        registry: registryFor(url, verdictA.excerpt), judge, gate: "profile_wire_boilerplate", textGates: REGEN_TEXT_GATES, onJudgeFailure: REGEN_JUDGE_FAILURE_POLICY, now: nowIso,
        // R32: attributed speech detected on the candidate with its page context; the speaker judge decides who speaks
        attribution: detectAttribution(verdictA.excerpt, clean_text, verdictA.offset), speakerJudge,
        // R42: the paragraph plus every page sentence naming the speaker (or their surname), capped — see speakerContext
        // R45: a first-person candidate is judged too, so the context names the company (sentences naming it) when no speaker string exists
        context: (() => { const a = detectAttribution(verdictA.excerpt, clean_text, verdictA.offset); return speakerContext(clean_text, verdictA.offset, verdictA.length, a?.speaker_string || company.name); })(),
        // R38: the syndication stage — corpus, ledgered band judge, anchors for the short-item floor
        syndication: { corpus, judge: syndicationJudge, anchors },
      };
      const voice = await voiceClassForMintedExcerpt(voiceInput);
      if (!voice.ok) {
        voice_refused_total++;
        rejected.push({ quote: c.slice(0, 80), reason: `voice_refused: ${voice.reason}` });
        record(cand, "voice_refused", { detail: voice.reason });
        const vr = voiceRefusals.find((x) => x.url === url && x.reason === voice.reason);
        if (vr) vr.excerpts++; else voiceRefusals.push({ url, reason: voice.reason, excerpts: 1 });
        continue;
      }
      seenThisRun.add(ci);
      record(cand, "admitted");
      admittedRows.push({
        company_id, source_id: null, source_type: "outside_recrawl_regen", source_title: titleByUrl.get(url) ?? null,
        source_url: url, signal_band: "outside", evidence_type: "market_signal",
        claim_text: verdictA.excerpt, evidence_excerpt: verdictA.excerpt,
        topic: "outside_voice_signal", directness: "direct", recency: "recent", framing_fit: "partial",
        structure_level: "extracted", validation_status: "directional", confidence_to_use: "medium",
        voice_class: voice.voice_class,
        evidence_class: voice.evidence_class,
        event_date: readDate, // READ-DATE stamped at mint from the snapshot's crawled_at (null if none)
        raw_payload: {
          source: "outside_recrawl_regen", content_identity: ci, page_url: url, snapshot_text_sha256: sha,
          run_id: runId, provenance: "public_observed", read_at: nowIso(),
          verbatim: normalizeForHash(verdictA.excerpt).length,
          // R31 (a): the page slice is the stored text; the model's shaped copy is a locator, kept here only
          // UNITS (R36 c): excerpt_offset / excerpt_length are UTF-16 CODE UNITS (JavaScript string indices — the unit the
          // mint asserts in); excerpt_offset_cp is the same position in Unicode CODE POINTS, for SQL readers (substr counts
          // code points). The two differ only when an astral character (an emoji) precedes the span.
          excerpt_offset: verdictA.offset, excerpt_length: verdictA.length, excerpt_offset_cp: Array.from(clean_text.slice(0, verdictA.offset)).length, excerpt_length_cp: Array.from(verdictA.excerpt).length, model_text: verdictA.model_text,
          // R27: why the generator lifted it and why the judge kept it — the model's own words, beside the page's
          generator_reason: cand.reason, judge_reason: keepByQuote.get(c)?.reason ?? null,
          voice_authority: { authority: voice.authority, detail: voice.detail, policy: REGEN_JUDGE_FAILURE_POLICY, gate: voice.gate, ...(voice.rule ? { rule: voice.rule } : {}) },
          ...(voice.authorship_judge ? { authorship_judge: voice.authorship_judge } : {}),
          // R32: who was quoted or reported, as the judge found; the detected attribution beside it
          ...(voice.speaker ? { speaker: { speaker_name: voice.speaker.speaker_name, speaker_role: voice.speaker.speaker_role, speaker_class: voice.speaker.speaker_class, reason: voice.speaker.reason, model: voice.speaker.model, judged_at: voice.speaker.judged_at }, attribution: voice.speaker.attribution } : voiceInput.attribution ? { attribution: voiceInput.attribution } : {}),
          ...(voiceInput.registry ? { registry: voiceInput.registry } : {}),
          // R38: what the syndication stage measured and decided — on every minted row of the regen path
          ...(voice.syndication ? { syndication: voice.syndication } : {}),
        },
      });
    }

    if (admittedRows.length) {
      const { error: insErr } = await supabase.from("signals").insert(admittedRows);
      if (insErr) throw new Error(`signal insert failed for ${url}: ${insErr.message}`);
    }
    admitted_total += admittedRows.length;
    processed++;
    processedUrls.push(url);   // R43: named on the finish so a zero-candidate page counts as done
    pages.push({
      url, candidates: cands.length, admitted: admittedRows.length,
      admitted_excerpts: admittedRows.map((r) => r.evidence_excerpt),
      rejected: rejected.slice(0, 20),
      candidate_records: pageCandidates,   // R27: every candidate in full, with reasons and nearest spans (candidates stays the count)
    });
  }

  // R36 (b): FINISH the run's row with the full payload; a refused finish leaves the row failed with the error text
  // (payload omitted), the mints stand, and the response says so.
  let integrity: { id: number; finish: "completed" | "failed"; error?: string } = { id: integrityId, finish: "completed" };
  try {
    await finishIntegrityRun(supabase, integrityId, {
      status: stoppedForTime ? "failed" : "completed", examined: candidates_total, admitted: admitted_total,
      // R4: the run's model-call tally beside its counts — {generator, judge, speaker, syndication, authorship, usd, ledger_failed}.
      // R17: the voice refusals — excerpts not minted because a gated URL could not be judged; retried next run.
      excluded_by_rule: { guard_rejected_total, reject_reasons: rejectReasons, urls: urls.length, pages: processed, run_id: runId, stopped_for_time: stoppedForTime, review_refused: reviewRefused, review_gate: true, mode, model_calls: tally, voice_refused_total, voice_refusals: voiceRefusals, judge_wired: judge !== null, speaker_judge_wired: speakerJudge !== null, syndication_judge_wired: syndicationJudge !== null, corpus_texts: corpus.texts.length, voice_policy: REGEN_JUDGE_FAILURE_POLICY, anchors_used: anchors, candidates: candidateRecords, processed_urls: processedUrls, opened_at: openedAt, finished_at: nowIso(), pages_budget: REGEN_PAGE_BUDGET, pages_done: processed, done_before: doneUrls.length, remaining },
    });
  } catch (e) {
    const msg = e instanceof IntegrityWriteRefused ? e.cause_message : (e as Error).message;
    integrity = { id: integrityId, finish: "failed", error: msg };
    try { await finishIntegrityRun(supabase, integrityId, { status: "failed", examined: candidates_total, admitted: admitted_total, error: `finish refused: ${msg}`, excluded_by_rule: { mode, run_id: runId, urls: urls.length, review_gate: true, anchors_used: anchors, opened_at: openedAt, pages_budget: REGEN_PAGE_BUDGET, done_before: doneUrls.length, remaining, processed_urls: processedUrls, finish_refused: true } }); } catch (e2) { integrity.error = `${msg}; and the failed-status update was refused too: ${(e2 as Error).message}`; }
  }

  return {
    status: 200,
    body: {
      ok: true, mode: "write", company_id, run_id: runId, urls_total: gate.allowed.length, pages_processed: processed, stopped_for_time: stoppedForTime, review_refused: reviewRefused,
      pages_budget: REGEN_PAGE_BUDGET, pages_done: processed, done_before: doneUrls.length, remaining,
      integrity,
      model_calls: tally,
      anchors_used: anchors,
      voice: { policy: REGEN_JUDGE_FAILURE_POLICY, judge_wired: judge !== null, speaker_judge_wired: speakerJudge !== null, syndication_judge_wired: syndicationJudge !== null, corpus_texts: corpus.texts.length, refused_total: voice_refused_total, refusals: voiceRefusals },
      totals: { candidates: candidates_total, admitted: admitted_total, guard_rejected: guard_rejected_total, reject_reasons: rejectReasons },
      pages,
    },
  };
}
