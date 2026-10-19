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
import { admitOutsideEvidence, snapshotReadDate } from "./outsideEvidenceRegen.ts";
import { insertIntegrityRun } from "./integrityWrite.ts";
import { BODY_MODE_GUARD, classifyBodyMode } from "./bodyMode.ts";
import { emptyTally, regenGenerate, regenJudge, tallyingLedger, type RegenLedger, type RegenTransport } from "./outsideRegenModel.ts";
import { OPENAI_PRICE_PER_MTOK } from "./modelPricing.ts";
import { normalizeHost } from "./firstReadProvenance.ts";
import { classifyRegistryRow } from "./registryClassifier.ts";
import { decideVoiceClassBeforeJudge, voiceClassForMintedExcerpt, type JudgeFailurePolicy, type VoiceClassInput } from "./voiceClassAtMint.ts";
import type { AuthorshipJudgment } from "./aggregatorAuthorship.ts";

/** R17 (b): on the regen path an unjudged gated row is NOT minted. Named here, passed explicitly — the shared
 *  function has no default. */
export const REGEN_JUDGE_FAILURE_POLICY: JudgeFailurePolicy = "refuse_mint";
/** The regen path's label when no authority fires: a third-party page speaking about the client. */
export const REGEN_DEFAULT_LABEL = "outside_voice_about_client";
export type RegenJudge = (input: { subjectName: string; subjectHost: string; url: string; text: string }) => Promise<AuthorshipJudgment | null>;

export const REGEN_MODE_FLAGS = ["plan", "write"] as const;
export type RegenMode = typeof REGEN_MODE_FLAGS[number];
/** Every key this function reads off the body. A key not here is refused rather than ignored. */
export const REGEN_BODY_KEYS: readonly string[] = ["company_id", "run_id", "urls", ...REGEN_MODE_FLAGS];
export const REGEN_COMPONENT = "r3_outside_regen";

export const EMPTY_SHA = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
/** fetchAndExtract's text cap: a snapshot of exactly this length was cut, not complete. */
export const SNAPSHOT_CAP_CHARS = 12_000;
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
  makeJudge: () => RegenJudge | null;
  models: readonly string[];
  genSystem: (anchors: string[]) => string;
  judgeSystem: string;
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
  const { data: co } = await supabase.from("companies").select("id, name, website, frozen, entity_anchors_json").eq("id", company_id).maybeSingle();
  if (!co) return { status: 404, body: { error: "company not found" } };
  if ((co as { frozen?: boolean }).frozen) return { status: 403, body: { error: "outside-regen refused: company is frozen" } };
  const anchorsRaw = (co as { entity_anchors_json?: unknown }).entity_anchors_json;
  const anchors = Array.isArray(anchorsRaw) ? anchorsRaw.map((a) => String(a || "").trim()).filter(Boolean) : [];
  const companyName = String((co as { name?: unknown }).name ?? "").trim();
  const companyHost = (() => { try { return normalizeHost(new URL(String((co as { website?: unknown }).website ?? "")).hostname) || null; } catch { return null; } })();
  const company = { name: companyName, host: companyHost };

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
  const { data: reviewRows } = await supabase
    .from("outside_recrawl_review").select("source_url, operator_decision")
    .eq("company_id", company_id).eq("run_id", runId);
  const gate = gateRegenUrls(urls, (reviewRows ?? []) as Array<{ source_url: string; operator_decision: string | null }>);

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
        urls_total: rows.length, would_run: summary.approved, review: summary,
        estimate: { calls: CALLS_PER_URL * rows.length, calls_if_approved_only: CALLS_PER_URL * summary.approved, est_input_tokens, est_usd },
        rows,
      },
    };
  }

  // ── WRITE ────────────────────────────────────────────────────────────────────────────────────
  const reviewRefused = gate.refused;
  urls = gate.allowed;
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
  const judge = deps.makeJudge();
  const tally = emptyTally();
  const ledger = tallyingLedger(deps.makeLedger(company_id), tally);
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
  const seenThisRun = new Set<string>();
  let candidates_total = 0, admitted_total = 0, guard_rejected_total = 0;
  const rejectReasons: Record<string, number> = {};
  let processed = 0, stoppedForTime = false;

  for (const url of urls) {
    if (now() - startedAt > deps.wallMs) { stoppedForTime = true; break; }
    const { clean_text, sha, readDate } = newestByUrl.get(url)!;

    let cands: string[] = [];
    try {
      const { json: gen } = await regenGenerate({ system: deps.genSystem(anchors), user: `PAGE TEXT:\n${clean_text}`, models: deps.models, transport, ledger });
      cands = (Array.isArray(gen.statements) ? gen.statements : []).map((s: unknown) => String(s ?? "").trim())
        .filter((s) => s && s.split(/\s+/).length <= deps.quoteMaxWords);
    } catch (e) {
      pages.push({ url, error: `gen: ${(e as Error).message}`, candidates: 0, admitted: 0 });
      continue;
    }
    candidates_total += cands.length;

    let keepByQuote = new Map<string, boolean>();
    if (cands.length) {
      try {
        const { json: j } = await regenJudge({ system: deps.judgeSystem, user: `PAGE TEXT:\n${clean_text}\n\nCANDIDATES:\n${cands.map((c) => `- ${c}`).join("\n")}`, models: deps.models, transport, ledger });
        const verdicts = (Array.isArray(j.verdicts) ? j.verdicts : []) as Array<Record<string, unknown>>;
        keepByQuote = new Map(verdicts.map((v) => [String(v.quote ?? "").trim(), v.keep === true]));
      } catch (e) {
        pages.push({ url, error: `judge: ${(e as Error).message}`, candidates: cands.length, admitted: 0 });
        continue;
      }
    }

    const admittedRows: Array<Record<string, unknown>> = [];
    const rejected: Array<{ quote: string; reason: string }> = [];
    for (const c of cands) {
      if (admittedRows.length >= deps.perUrlCap) break;
      if (keepByQuote.size && keepByQuote.get(c) === false) { rejected.push({ quote: c.slice(0, 80), reason: "judge_reject" }); continue; }
      const verdictA = admitOutsideEvidence(c, clean_text);
      if (!verdictA.admit) {
        guard_rejected_total++;
        rejectReasons[verdictA.reason] = (rejectReasons[verdictA.reason] ?? 0) + 1;
        rejected.push({ quote: c.slice(0, 80), reason: verdictA.reason });
        continue;
      }
      const ci = await contentIdentity(verdictA.excerpt);
      if (existingCI.has(ci) || seenThisRun.has(ci)) { rejected.push({ quote: c.slice(0, 80), reason: "duplicate_identity" }); continue; }
      // R17: THE voice class, from the one shared authority — never a literal here. An unjudged gated row is refused.
      const voiceInput: VoiceClassInput = {
        url, item: null, labeledClass: REGEN_DEFAULT_LABEL, pageText: clean_text, judgedText: verdictA.excerpt, company,
        registry: registryFor(url, verdictA.excerpt), judge, gate: "profile_wire_boilerplate", onJudgeFailure: REGEN_JUDGE_FAILURE_POLICY, now: nowIso,
      };
      const voice = await voiceClassForMintedExcerpt(voiceInput);
      if (!voice.ok) {
        voice_refused_total++;
        rejected.push({ quote: c.slice(0, 80), reason: `voice_refused: ${voice.reason}` });
        const vr = voiceRefusals.find((x) => x.url === url && x.reason === voice.reason);
        if (vr) vr.excerpts++; else voiceRefusals.push({ url, reason: voice.reason, excerpts: 1 });
        continue;
      }
      seenThisRun.add(ci);
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
          voice_authority: { authority: voice.authority, detail: voice.detail, policy: REGEN_JUDGE_FAILURE_POLICY, gate: voice.gate },
          ...(voice.authorship_judge ? { authorship_judge: voice.authorship_judge } : {}),
          ...(voiceInput.registry ? { registry: voiceInput.registry } : {}),
        },
      });
    }

    if (admittedRows.length) {
      const { error: insErr } = await supabase.from("signals").insert(admittedRows);
      if (insErr) throw new Error(`signal insert failed for ${url}: ${insErr.message}`);
    }
    admitted_total += admittedRows.length;
    processed++;
    pages.push({
      url, candidates: cands.length, admitted: admittedRows.length,
      admitted_excerpts: admittedRows.map((r) => r.evidence_excerpt),
      rejected: rejected.slice(0, 20),
    });
  }

  await insertIntegrityRun(supabase, {
    company_id, component: REGEN_COMPONENT, status: stoppedForTime ? "failed" : "completed",
    examined: candidates_total, admitted: admitted_total,
    // R4: the run's model-call tally beside its counts — {generator, judge, usd, ledger_failed}.
    // R17: the voice refusals — excerpts not minted because a gated URL could not be judged; retried next run.
    excluded_by_rule: { guard_rejected_total, reject_reasons: rejectReasons, urls: urls.length, pages: processed, run_id: runId, stopped_for_time: stoppedForTime, review_refused: reviewRefused, review_gate: true, mode, model_calls: tally, voice_refused_total, voice_refusals: voiceRefusals, judge_wired: judge !== null, voice_policy: REGEN_JUDGE_FAILURE_POLICY },
    run_ref: `r3_outside_regen_${runId}`,
  });

  return {
    status: 200,
    body: {
      ok: true, mode: "write", company_id, run_id: runId, urls_total: urls.length, pages_processed: processed, stopped_for_time: stoppedForTime, review_refused: reviewRefused,
      model_calls: tally,
      voice: { policy: REGEN_JUDGE_FAILURE_POLICY, judge_wired: judge !== null, refused_total: voice_refused_total, refusals: voiceRefusals },
      totals: { candidates: candidates_total, admitted: admitted_total, guard_rejected: guard_rejected_total, reject_reasons: rejectReasons },
      pages,
    },
  };
}
