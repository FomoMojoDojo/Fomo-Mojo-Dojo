// infer-interview-market (Gate B commit 2b — operator rulings R19–R35, signed 2026-09-21).
//
// Input: { company_id, interview_record_id }. The actor is the signed-in user from the JWT (must be an admin)
// or the service role; nothing about the actor comes from the browser. No JWT → 401; not an admin → 403.
// Refused before any model call: a frozen company; a retracted record; a stakeholder record; a record
// CURRENTLY placed by an operator choice (its last placing basis entry is operator_override). A currently
// unplaced record is always eligible, whatever its history (R23). The stored transcript text is the only
// input — sha256(verbatim) must equal text_sha256 (mismatch = refused, ledgered). The text goes to the LOCAL
// Ollama only (the base URL must resolve to localhost / host.docker.internal); no external call on any path.
//
// Windows: ≤ 12,000 chars cut at line boundaries. One call per window — qwen2.5:14b-instruct, format json,
// schema { market_key | null, reason }. Candidates = the company's live market definitions
// (odi_market_definitions, retracted_at NULL) whose market_lens.portfolio_state is 'active', excluding internal
// (R34, R45 — a definition with no lens row or a deferred lens is not offered; "Change market" still lists every
// live market); the keys offered are recorded as candidate_keys on the basis entry. A key outside the list is invalid and
// counted as "none"; an errored window is recorded as an error, never as "none". R33: any errored window fails
// the run — nothing placed. R32: before each window, elapsed + the slowest window so far (minimum 30 s) past
// 300 s → stop, reason time_budget, nothing placed. Result: a STRICT majority of the windows that named a
// market places the record; otherwise it stays "Market not inferred". Votes and reasons are stored in the
// appended market_basis entry (R35: reasons are never rendered); NO confidence word or number anywhere.
// Every run that starts windows APPENDS exactly one market_basis entry (never rewrites one). Inference never
// changes a record the operator placed — a "Change market" during the run wins (re-checked before the write).
// In flight: ONE integrity_runs row (component interview_market_inference, surface = the record) in status
// planned, its ran_at bumped after every window; 5 minutes without a bump = stopped (the row offers "Infer
// market" again) and the next run marks the stale row failed. Every window call → one model_calls row
// (provider 'ollama', prompt_eval_count / eval_count, usd NULL).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { FROZEN_COMPANY_IDS } from "../_shared/frozenCompanies.ts";
import { recordModelCall } from "../_shared/recordModelCall.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/** 4f-1 (signed 2026-09-24): the one refusal for any record that is not a customer interview.
 *  Rendered verbatim; src/lib/interviewUploadStrings.ts mirrors it for the client-side pre-check. */
export const INFER_NON_CUSTOMER_REFUSAL = "Market inference runs only on customer interviews.";
export const INFERENCE_MODEL = "qwen2.5:14b-instruct";
/** R38 (2026-09-21): measured — no 12,000-char window exceeded 7,000 prompt tokens (max 6,457 for .srt cues with 18
 *  candidates), so 8192 stays. */
export const NUM_CTX = 8192;
/** R36 — Ollama 0.34 truncates SILENTLY when the prompt exceeds num_ctx: it keeps 4 tokens + the LAST num_ctx/2 − 2
 *  and answers with done_reason "stop", prompt_eval_count = num_ctx/2 + 2 and no flag (measured: 4098 at 8192,
 *  8194 at 16384; the system prompt and candidate list are what gets dropped). A reply whose prompt_eval_count
 *  equals that size, or that could not have read the prompt at any plausible density (< 1 token per 8 chars), is
 *  a window that was NOT fully read → status error, reason context_overflow; R33 fails the run. */
export const truncationSize = (numCtx: number) => Math.floor(numCtx / 2) + 2;
/** R44 (2026-09-21): the guard above is tied to the runtime's measured truncation behaviour. The handler reads
 *  GET /api/version once per run; a version not in this list fails the run BEFORE any model call
 *  (failure_reason unverified_runtime) — re-measure, then add the version here. */
export const VERIFIED_OLLAMA_VERSIONS: readonly string[] = ["0.34.0"];
export const MIN_TOKENS_PER_CHAR = 1 / 8;
export function promptNotFullyRead(promptEvalCount: number | null, promptChars: number, numCtx = NUM_CTX): boolean {
  if (promptEvalCount == null) return false; // no count → nothing to judge (the transport error path handles it)
  return promptEvalCount === truncationSize(numCtx) || promptEvalCount < promptChars * MIN_TOKENS_PER_CHAR;
}
export const WINDOW_CHARS = 12_000;
export const TIME_BUDGET_MS = 300_000;
export const MIN_SLOWEST_MS = 30_000;
export const STALE_AFTER_MS = 5 * 60_000;
export const COMPONENT = "interview_market_inference";
export const RUN_REF = "infer-interview-market";
export const CALL_SITE = "infer-interview-market";

export type Candidate = { market_key: string; title: string; job_executor: string; jtbd: string };
export type ModelReply = { content: string; prompt_eval_count: number | null; eval_count: number | null };
export type CallModel = (args: { baseUrl: string; model: string; system: string; user: string; schema: unknown; signal: AbortSignal }) => Promise<ModelReply>;
export type ReadVersion = (baseUrl: string) => Promise<string>;
export type Deps = { createClient: typeof createClient; callModel?: CallModel; readVersion?: ReadVersion; now?: () => number };

type WindowOutcome = {
  index: number;
  chars: number;
  status: "ok" | "error";
  /** The key the model named (validated against the candidate list) — null for none / invalid / error. */
  market_key: string | null;
  /** The raw key the model returned when it was not in the candidate list (counted as none). */
  invalid_key?: string;
  /** Stored, never rendered (R35). */
  reason: string | null;
  error?: string;
  ms: number;
  prompt_tokens: number | null;
  completion_tokens: number | null;
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
const text = (v: unknown) => String(v ?? "").trim();
function isLocalUrl(rawUrl: string): boolean {
  try { const h = new URL(rawUrl).hostname; return ["localhost", "127.0.0.1", "::1", "host.docker.internal"].includes(h); } catch { return false; }
}
export async function sha256HexText(s: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(d)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Windows of ≤ WINDOW_CHARS cut at line boundaries; a single line longer than a window is hard-cut. */
export function cutWindows(transcript: string, max = WINDOW_CHARS): string[] {
  const lines = transcript.split(/(?<=\n)/); // keep the newline on each line
  const out: string[] = [];
  let cur = "";
  const flush = () => { if (cur.trim().length > 0) out.push(cur); cur = ""; };
  for (const line of lines) {
    if (line.length > max) {
      flush();
      for (let i = 0; i < line.length; i += max) out.push(line.slice(i, i + max));
      continue;
    }
    if (cur.length + line.length > max) flush();
    cur += line;
  }
  flush();
  return out;
}

/** Who placed the record last: the last basis entry that carries a placement. */
export function lastPlacement(basis: unknown): { kind: string; journey_key: string | null } | null {
  if (!Array.isArray(basis)) return null;
  for (let i = basis.length - 1; i >= 0; i--) {
    const e = basis[i] as Record<string, unknown> | null;
    if (!e || typeof e !== "object") continue;
    const kind = String(e.kind ?? "");
    if (kind === "operator_override") return { kind, journey_key: e.journey_key == null ? null : String(e.journey_key) };
    if (kind === "inference" && e.result === "placed") return { kind, journey_key: e.journey_key == null ? null : String(e.journey_key) };
  }
  return null;
}
/** A record currently placed by an operator choice is never touched by inference. */
export function isOperatorPlaced(record: { market_state?: unknown; market_basis?: unknown }): boolean {
  if (record.market_state !== "placed") return false;
  const last = lastPlacement(record.market_basis);
  return last === null || last.kind === "operator_override"; // a placed record with no inference entry is the operator's
}

/** Strict majority of the windows that named a valid market; null otherwise (tie, no majority, none named). */
export function tally(windows: readonly WindowOutcome[]): { named: number; votes: Record<string, number>; winner: string | null } {
  const votes: Record<string, number> = {};
  let named = 0;
  for (const w of windows) if (w.status === "ok" && w.market_key) { named += 1; votes[w.market_key] = (votes[w.market_key] ?? 0) + 1; }
  let winner: string | null = null; let top = 0;
  for (const [k, n] of Object.entries(votes)) if (n > top) { top = n; winner = k; }
  return { named, votes, winner: named > 0 && top * 2 > named ? winner : null };
}

export function buildPrompt(candidates: readonly Candidate[], window: string) {
  const system = "You place one window of a customer interview transcript into exactly one of the company's markets, or none. " +
    "Answer with JSON only: {\"market_key\": <one of the candidate market_key values, or null>, \"reason\": <one sentence>}. " +
    "Choose null when the window does not clearly belong to one market. Never invent a key.";
  const list = candidates.map((c) => `- ${c.market_key}: ${c.title}${c.job_executor ? ` — who: ${c.job_executor}` : ""}${c.jtbd ? ` — job: ${c.jtbd}` : ""}`).join("\n");
  const user = `Candidate markets:\n${list}\n\nTranscript window (${window.length} chars):\n${window}`;
  const schema = { type: "object", properties: { market_key: { anyOf: [{ type: "string", enum: candidates.map((c) => c.market_key) }, { type: "null" }] }, reason: { type: "string" } }, required: ["market_key", "reason"] };
  return { system, user, schema };
}

/** GET /api/version on the local Ollama — the string it reports, or "unreadable:<reason>". */
async function defaultReadVersion(baseUrl: string): Promise<string> {
  try {
    const resp = await fetch(`${baseUrl.replace(/\/+$/, "")}/api/version`);
    if (!resp.ok) return `unreadable:http_${resp.status}`;
    const data = await resp.json().catch(() => ({})) as { version?: unknown };
    return typeof data.version === "string" && data.version ? data.version : "unreadable:no_version";
  } catch (e) { return `unreadable:${String((e as Error)?.message ?? e).slice(0, 80)}`; }
}
/** The local transport: Ollama's native /api/chat with a JSON schema; reads prompt_eval_count / eval_count. */
async function defaultCallModel(args: { baseUrl: string; model: string; system: string; user: string; schema: unknown; signal: AbortSignal }): Promise<ModelReply> {
  const resp = await fetch(`${args.baseUrl.replace(/\/+$/, "")}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: args.model, format: args.schema, stream: false, options: { num_ctx: NUM_CTX, temperature: 0 }, messages: [{ role: "system", content: args.system }, { role: "user", content: args.user }] }),
    signal: args.signal,
  });
  if (!resp.ok) throw new Error(`ollama HTTP ${resp.status}: ${(await resp.text().catch(() => "")).slice(0, 200)}`);
  const data = await resp.json().catch(() => ({})) as Record<string, unknown>;
  const content = String((data.message as { content?: unknown } | undefined)?.content ?? "");
  const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  return { content, prompt_eval_count: n(data.prompt_eval_count), eval_count: n(data.eval_count) };
}

export async function handleInferInterviewMarket(req: Request, deps: Deps = { createClient }): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "Only POST is supported." }, 405);
  const now = deps.now ?? (() => Date.now());
  try {
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const companyId = text(body.company_id);
    if (!companyId) return json({ ok: false, error: "company_id required" }, 400);
    const recordId = text(body.interview_record_id);
    if (!recordId) return json({ ok: false, error: "interview_record_id required" }, 400);

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    if (!supabaseUrl || !serviceRole) return json({ ok: false, error: "Missing Supabase env vars" }, 500);
    const ollamaBase = Deno.env.get("OLLAMA_SYNDICATION_BASE_URL") || (Deno.env.get("OLLAMA_BASE_URL") || "http://host.docker.internal:11434").replace(/\/v1\/?$/, "");
    if (!isLocalUrl(ollamaBase)) return json({ ok: false, error: "Local-only policy violation: the Ollama base must resolve to localhost/host.docker.internal." }, 500);

    // deno-lint-ignore no-explicit-any
    const db = deps.createClient(supabaseUrl, serviceRole) as unknown as { from: (t: string) => any; auth: any };

    // ── the actor: the JWT's user (an admin) or the service role — never anything from the body ──
    const authHeader = req.headers.get("Authorization") ?? "";
    const bearer = authHeader.replace(/^Bearer\s+/i, "").trim();
    let actor: { kind: "service_role" } | { kind: "user"; id: string } | null = null;
    if (bearer && bearer === serviceRole) actor = { kind: "service_role" };
    else if (bearer) {
      try {
        const anon = deps.createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY") ?? "", { global: { headers: { Authorization: authHeader } } });
        const { data } = await (anon as unknown as typeof db).auth.getUser();
        if (data?.user?.id) actor = { kind: "user", id: String(data.user.id) };
      } catch { actor = null; }
    }
    if (!actor) return json({ ok: false, error: "no_authenticated_caller", message: "No signed-in user — nothing was inferred." }, 401);
    if (actor.kind === "user") {
      const { data: roles } = await db.from("user_roles").select("role").eq("user_id", actor.id).eq("role", "admin").limit(1);
      if (!Array.isArray(roles) || roles.length === 0) return json({ ok: false, error: "not_admin", message: "Only an admin can infer a market — nothing was inferred." }, 403);
    }

    // ── frozen company: the constant fast-fails, companies.frozen is the truth ──
    if (FROZEN_COMPANY_IDS.has(companyId)) return json({ ok: false, error: "frozen_company", message: "This company is a frozen reference fixture (SELECT-only)." }, 403);
    const { data: company } = await db.from("companies").select("id, frozen").eq("id", companyId).maybeSingle();
    if (!company) return json({ ok: false, error: "no_company" }, 404);
    if (company.frozen === true) return json({ ok: false, error: "frozen_company", message: "This company is a frozen reference fixture (SELECT-only)." }, 403);

    // ── the record: ours, live, a customer record, not operator-placed ──
    const { data: rec, error: recErr } = await db.from("interview_records").select("id, company_id, speaker_role, verbatim, text_sha256, market_state, journey_key, market_basis, retracted_at, input_file_id").eq("id", recordId).eq("company_id", companyId).maybeSingle();
    if (recErr) return json({ ok: false, error: "lookup_failed", message: String(recErr.message ?? recErr) }, 500);
    if (!rec) return json({ ok: false, error: "no_record", message: `interview record ${recordId} not found for this company.` }, 404);
    if (!rec.input_file_id) return json({ ok: false, error: "not_upload_record", message: "Only an uploaded transcript is inferred — nothing was inferred." }, 409);
    if (rec.retracted_at) return json({ ok: false, error: "record_withdrawn", message: "This interview was withdrawn — nothing was inferred." }, 409);
    // 4f-1: the fence is unchanged in effect — only a customer transcript is inferred — but it now
    // refuses more than one kind of record, so the message names the rule rather than the caller.
    if (rec.speaker_role !== "market_participant") return json({ ok: false, error: "not_customer_record", message: INFER_NON_CUSTOMER_REFUSAL }, 409);
    if (isOperatorPlaced(rec)) return json({ ok: false, error: "operator_placed", message: "This record was placed by an operator — inference never changes it." }, 409);

    // ── the text: the stored verbatim, hash-verified before use ──
    const verbatim = typeof rec.verbatim === "string" ? rec.verbatim : "";
    const storedSha = String(rec.text_sha256 ?? "").toLowerCase();
    const actualSha = await sha256HexText(verbatim);
    if (!storedSha || actualSha !== storedSha) {
      const { data: bad } = await db.from("integrity_runs").insert({ company_id: companyId, component: COMPONENT, surface_type: "interview_records", surface_id: recordId, ran_at: new Date(now()).toISOString(), status: "failed", examined: 0, admitted: 0, excluded_by_rule: { reason: "text_hash_mismatch", stored_sha256: storedSha, actual_sha256: actualSha, chars: verbatim.length }, error: "text_hash_mismatch", run_ref: RUN_REF }).select("id").single();
      return json({ ok: false, error: "text_hash_mismatch", message: "The stored transcript does not match its hash — nothing was inferred.", run_id: bad?.id ?? null }, 409);
    }

    // ── in flight / stale: one planned row per record; fresh → refuse; stale → mark failed ──
    const { data: planned } = await db.from("integrity_runs").select("id, ran_at").eq("component", COMPONENT).eq("surface_type", "interview_records").eq("surface_id", recordId).eq("status", "planned");
    const staleMarked: number[] = [];
    for (const p of (Array.isArray(planned) ? planned : []) as Array<{ id: number; ran_at: string }>) {
      const age = now() - Date.parse(String(p.ran_at));
      if (age < STALE_AFTER_MS) return json({ ok: false, error: "inference_in_flight", message: "A market inference is already running for this record.", run_id: p.id }, 409);
      await db.from("integrity_runs").update({ status: "failed", error: "stale_no_progress" }).eq("id", p.id);
      staleMarked.push(p.id);
    }

    // ── candidates: the live market definitions with an ACTIVE lens, internal excluded (R34, R45) ──
    const [{ data: defs }, { data: lens }] = await Promise.all([
      db.from("odi_market_definitions").select("journey_key, job_executor, jtbd").eq("company_id", companyId).is("retracted_at", null),
      db.from("market_lens").select("journey_key, title, portfolio_state").eq("company_id", companyId),
    ]);
    const titles = new Map<string, string>();
    const activeLens = new Set<string>();
    for (const l of (Array.isArray(lens) ? lens : []) as Array<{ journey_key?: unknown; title?: unknown; portfolio_state?: unknown }>) {
      const k = text(l.journey_key); const t = text(l.title);
      if (k && t && !titles.has(k)) titles.set(k, t);
      if (k && l.portfolio_state === "active") activeLens.add(k);
    }
    const seen = new Set<string>();
    const candidates: Candidate[] = [];
    for (const d of (Array.isArray(defs) ? defs : []) as Array<{ journey_key?: unknown; job_executor?: unknown; jtbd?: unknown }>) {
      const k = text(d.journey_key);
      if (!k || k === "internal" || seen.has(k) || !activeLens.has(k)) continue; // R45: no lens row / deferred → not offered
      seen.add(k);
      candidates.push({ market_key: k, title: titles.get(k) || text(d.job_executor) || k, job_executor: text(d.job_executor), jtbd: text(d.jtbd) });
    }
    if (candidates.length === 0) return json({ ok: false, error: "no_markets", message: "This company has no live market definitions — nothing was inferred." }, 409);
    const keySet = new Set(candidates.map((c) => c.market_key));

    // ── the runtime (R44): the version is read once per run and recorded; an unverified one fails the run before any model call ──
    const ollamaVersion = await (deps.readVersion ?? defaultReadVersion)(ollamaBase);
    const runtimeVerified = VERIFIED_OLLAMA_VERSIONS.includes(ollamaVersion);

    // ── the run: one planned row, bumped per window ──
    const windows = cutWindows(verbatim);
    const startedAt = now();
    const iso = (ms: number) => new Date(ms).toISOString();
    const { data: runRow, error: runErr } = await db.from("integrity_runs").insert({
      company_id: companyId, component: COMPONENT, surface_type: "interview_records", surface_id: recordId, ran_at: iso(startedAt), status: "planned", examined: windows.length, admitted: 0,
      excluded_by_rule: { model: INFERENCE_MODEL, num_ctx: NUM_CTX, ollama_version: ollamaVersion, actor: actor.kind === "user" ? { kind: "user", id: actor.id } : { kind: "service_role" }, chars: verbatim.length, windows_total: windows.length, windows_done: 0, candidates: candidates.length, started_at: iso(startedAt), stale_marked: staleMarked },
      run_ref: RUN_REF,
    }).select("id").single();
    if (runErr || !runRow?.id) return json({ ok: false, error: "run_row_refused", message: String(runErr?.message ?? "no id") }, 500);
    const runId = runRow.id as number;
    const bump = async (done: number, extra: Record<string, unknown> = {}, status: "planned" | "completed" | "failed" = "planned", admitted = 0) => {
      const { data: cur } = await db.from("integrity_runs").select("excluded_by_rule").eq("id", runId).maybeSingle();
      const prev = (cur?.excluded_by_rule && typeof cur.excluded_by_rule === "object") ? cur.excluded_by_rule as Record<string, unknown> : {};
      await db.from("integrity_runs").update({ ran_at: iso(now()), status, admitted, excluded_by_rule: { ...prev, windows_done: done, ...extra }, ...(extra.error ? { error: String(extra.error) } : {}) }).eq("id", runId);
    };

    const outcomes: WindowOutcome[] = [];
    let slowestMs = 0;
    let failure: { reason: "time_budget" | "window_error" | "context_overflow" | "unverified_runtime"; detail: string } | null = null;
    if (!runtimeVerified) failure = { reason: "unverified_runtime", detail: `ollama ${ollamaVersion} is not in VERIFIED_OLLAMA_VERSIONS (${VERIFIED_OLLAMA_VERSIONS.join(", ")}) — the overflow guard is only measured there` };
    const callModel = deps.callModel ?? defaultCallModel;
    for (let i = 0; i < windows.length && !failure; i++) {
      // R32 — before each window: would this window pass the budget?
      const elapsed = now() - startedAt;
      if (elapsed + Math.max(slowestMs, MIN_SLOWEST_MS) > TIME_BUDGET_MS) { failure = { reason: "time_budget", detail: `window ${i + 1} of ${windows.length}: elapsed ${Math.round(elapsed / 1000)} s + slowest ${Math.round(Math.max(slowestMs, MIN_SLOWEST_MS) / 1000)} s > 300 s` }; break; }
      const w = windows[i];
      const { system, user, schema } = buildPrompt(candidates, w);
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), Math.max(1000, TIME_BUDGET_MS - elapsed));
      const t0 = now();
      let reply: ModelReply | null = null; let err: string | null = null;
      try { reply = await callModel({ baseUrl: ollamaBase, model: INFERENCE_MODEL, system, user, schema, signal: ctrl.signal }); }
      catch (e) { err = ctrl.signal.aborted ? "time_budget" : String((e as Error)?.message ?? e).slice(0, 300); }
      finally { clearTimeout(t); }
      const ms = now() - t0;
      slowestMs = Math.max(slowestMs, ms);
      const outcome: WindowOutcome = { index: i, chars: w.length, status: "error", market_key: null, reason: null, ms, prompt_tokens: reply?.prompt_eval_count ?? null, completion_tokens: reply?.eval_count ?? null };
      if (reply && promptNotFullyRead(reply.prompt_eval_count, system.length + user.length)) {
        // R36: the model never saw the whole window (nor, being at the start, the candidates) — an error, never a vote
        outcome.error = "context_overflow";
        await recordModelCall(db, { companyId, runId: null, callSite: CALL_SITE, usage: { provider: "ollama", model: INFERENCE_MODEL, prompt_tokens: reply.prompt_eval_count, completion_tokens: reply.eval_count, usd: null } });
      } else if (reply) {
        let parsed: Record<string, unknown> | null = null;
        try { parsed = JSON.parse(reply.content) as Record<string, unknown>; } catch { parsed = null; }
        if (!parsed || typeof parsed !== "object") { outcome.error = "unparsable_reply"; }
        else {
          outcome.status = "ok";
          outcome.reason = typeof parsed.reason === "string" ? parsed.reason : null;
          const k = parsed.market_key == null ? null : text(parsed.market_key);
          if (k && keySet.has(k)) outcome.market_key = k;
          else if (k) { outcome.market_key = null; outcome.invalid_key = k; } // outside the list = invalid = none
        }
        // every window call is ledgered — provider ollama, the counts Ollama returned, usd NULL
        await recordModelCall(db, { companyId, runId: null, callSite: CALL_SITE, usage: { provider: "ollama", model: INFERENCE_MODEL, prompt_tokens: reply.prompt_eval_count, completion_tokens: reply.eval_count, usd: null } });
      } else {
        outcome.error = err ?? "model_call_failed";
        await recordModelCall(db, { companyId, runId: null, callSite: CALL_SITE, usage: { provider: "ollama", model: INFERENCE_MODEL, prompt_tokens: null, completion_tokens: null, usd: null } });
      }
      outcomes.push(outcome);
      await bump(outcomes.length, { last_window_ms: ms, slowest_ms: slowestMs });
      if (outcome.status === "error") { failure = { reason: outcome.error === "time_budget" ? "time_budget" : outcome.error === "context_overflow" ? "context_overflow" : "window_error", detail: `window ${i + 1} of ${windows.length}: ${outcome.error}` }; break; } // R33
    }

    // ── the verdict ──
    const t = tally(outcomes);
    // a "Change market" during the run wins: re-read before writing
    const { data: fresh } = await db.from("interview_records").select("market_state, journey_key, market_basis, retracted_at").eq("id", recordId).maybeSingle();
    const operatorMeanwhile = Boolean(fresh && (isOperatorPlaced(fresh) || fresh.retracted_at));
    const result: "placed" | "not_inferred" | "failed" | "operator_placed_meanwhile" = failure ? "failed" : operatorMeanwhile ? "operator_placed_meanwhile" : t.winner ? "placed" : "not_inferred";
    const finishedAt = now();
    const entry = {
      kind: "inference", at: iso(finishedAt), run_id: runId, model: INFERENCE_MODEL, num_ctx: NUM_CTX, ollama_version: ollamaVersion, candidate_keys: candidates.map((c) => c.market_key), result,
      ...(failure ? { failure_reason: failure.reason, failure_detail: failure.detail } : {}),
      ...(result === "placed" ? { journey_key: t.winner } : {}),
      windows_total: windows.length, windows_run: outcomes.length, named: t.named, votes: t.votes,
      windows: outcomes.map((o) => ({ index: o.index, chars: o.chars, status: o.status, market_key: o.market_key, ...(o.invalid_key ? { invalid_key: o.invalid_key } : {}), reason: o.reason, ...(o.error ? { error: o.error } : {}), ms: o.ms, prompt_tokens: o.prompt_tokens, completion_tokens: o.completion_tokens })),
      by: actor.kind === "user" ? actor.id : "service_role",
    };
    const basis = Array.isArray(fresh?.market_basis) ? fresh!.market_basis as unknown[] : (Array.isArray(rec.market_basis) ? rec.market_basis as unknown[] : []);
    const patch: Record<string, unknown> = { market_basis: [...basis, entry] };
    if (result === "placed") { patch.journey_key = t.winner; patch.market_state = "placed"; }
    const { error: writeErr } = await db.from("interview_records").update(patch).eq("id", recordId);
    const summary = { result, journey_key: result === "placed" ? t.winner : null, windows_total: windows.length, windows_run: outcomes.length, named: t.named, votes: t.votes, keys: outcomes.map((o) => o.status === "ok" ? (o.market_key ?? (o.invalid_key ? "invalid" : "none")) : "error"), ms: finishedAt - startedAt, ...(failure ? { failure_reason: failure.reason, failure_detail: failure.detail } : {}), ...(writeErr ? { record_write_error: String(writeErr.message ?? writeErr).slice(0, 300) } : {}) };
    await bump(outcomes.length, { ...summary, ...(failure || writeErr ? { error: failure ? failure.reason : "record_write_refused" } : {}) }, failure || writeErr ? "failed" : "completed", result === "placed" && !writeErr ? 1 : 0);
    if (writeErr) return json({ ok: false, error: "record_write_refused", message: String(writeErr.message ?? writeErr), run_id: runId, result }, 409);
    if (failure) return json({ ok: false, error: failure.reason, message: failure.detail, run_id: runId, windows_total: windows.length, windows_run: outcomes.length }, 422);
    const title = result === "placed" ? (candidates.find((c) => c.market_key === t.winner)?.title ?? t.winner) : null;
    return json({ ok: true, result, run_id: runId, journey_key: result === "placed" ? t.winner : null, market_title: title, windows_total: windows.length, windows_run: outcomes.length, named: t.named, votes: t.votes });
  } catch (err) {
    return json({ ok: false, error: String((err as Error)?.message ?? err) }, 500);
  }
}
