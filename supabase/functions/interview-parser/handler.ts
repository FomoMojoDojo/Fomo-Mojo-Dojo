// ── interview-parser — the RESUMABLE parse run (parser commit 4a, rules 2026-09-23.1) ────────────
//
// The HANDLER lives here and index.ts is three lines of Deno.serve, the same split
// record-interview-upload and infer-interview-market use: Deno.serve runs on import, so a handler in
// index.ts cannot be imported by a test without starting a server.
//
// POST { record_id, resume?: true }. Admin-only caller. Local models only (Ollama); every call is
// ledgered in model_calls. Items land in interview_items and NOWHERE else — landing into odi_needs or
// any framework table is commit 4.
//
// RESUMABLE BY CONSTRUCTION. The transcript is cut into windows by the code (commit 2) and the run
// keeps its cursor on ONE integrity_runs row (component interview_parse). Each pass processes windows
// until the next one would blow the 300 s budget — measured against the SLOWEST window seen, floored
// at MIN_SLOWEST_MS so an optimistic first window cannot talk the run into overrunning — then
// SELF-FIRES the next pass through the internal-call path (R4) and returns 200 with done:false. DB is
// truth: an isolate killed at the 400 s wall leaves the cursor where it was and the next fire picks it
// up. Every pass appends itself to `passes` on the run row, so the chain is readable after the fact.
//
// R5/R6/R7 (2026-09-23): the record says which speaker labels are OUR side; an item our side said
// lands with its words and its pointer and no derived statement, spending no model call. Parsing a
// record whose live items carry an older rules_version retracts them first; a same-version parse stays
// idempotent, except where our_speakers moved under an item, which retracts and re-lands just that one.
//
// Rule 1 runs through the whole file: every candidate item LANDS. A quote the locator cannot find is
// not_located and still lands under keep_and_mark; a kind with no converter lands annotated; a judge
// rejection lands annotated. Nothing is dropped silently, and judge_reason is never blank.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { sha256Hex } from "../_shared/contentIdentity.ts";
import { OURS_SIDE_REASON, itemContentIdentity, type ItemKind, type Scope, type SpeakerSide } from "../_shared/interviewItems.ts";
import {
  MAX_SPLIT_DEPTH, N21_REASON, N21_RUNG, OUTPUT_CAP_ERROR, OUTPUT_CAP_REASON, OVER_BUDGET_ERROR, PARSER_RULES_VERSION,
  READ_FEEDBACK_STATEMENT_PREFIX, READ_OVERLAP_WORDS, SIDE_CHANGED_REASON, WORST_UNIT_MS,
  estimatePromptTokens, numPredictFor, supersededReason, type MatchTolerance, type Strictness,
} from "./rules.ts";
import { detectShape, toPassages, toTurns, toWindows, type Passage } from "./segment.ts";
import { cutLocatedWords, locateQuote, type LocateRung } from "./locate.ts";
import {
  FINDER_SYSTEM, MIN_RAW_WORDS, STORY_NOT_PAIN_REASON, buildFinderUser, convertItem, findNearDuplicates,
  isNarratedStory, parseFinderOutput, wordCount, type Call, type FinderDrops, type Objection,
} from "./convert.ts";
import { buildReadIndex, n21Route, sharedReadRun, stripSpeakerHeader } from "./readFeedback.ts";
import { INTERNAL_CALL_HEADER, isInternalServiceCall } from "../_shared/internalCall.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const text = (v: unknown) => String(v ?? "").trim();
/** R4: hand the fetch to the runtime so the response can return before it settles. */
function waitUntil(p: Promise<unknown>) {
  const edge = (globalThis as unknown as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } }).EdgeRuntime;
  if (edge?.waitUntil) edge.waitUntil(p); else void p;
}

/** N8: a call that was refused before it was sent, or that stopped because it hit its cap. Typed so
 *  the window loop can tell a finder cap (fail the window, keep the cursor) from a converter or judge
 *  cap (land the item annotated) without matching on message text. */
export class ParserCallError extends Error {
  constructor(readonly code: string, readonly stage: string, readonly detail: string) {
    super(`${code} at ${stage}: ${detail}`);
    this.name = "ParserCallError";
  }
}

export const COMPONENT = "interview_parse";
export const RUN_REF = "interview-parser";
export const PARSE_LEVEL = "items";
export const FINDER_MODEL = "qwen2.5:14b-instruct";
/** The judge model. Measured both ways on a throwaway before this was fixed — see the commit report. */
export const JUDGE_MODEL = "qwen2.5:14b-instruct";
export const NUM_CTX = 8192;
export const TIME_BUDGET_MS = 300_000;
export const MIN_SLOWEST_MS = 30_000;
export const STALE_AFTER_MS = 5 * 60_000;

const isLocalUrl = (raw: string): boolean => {
  try { return ["localhost", "127.0.0.1", "::1", "host.docker.internal"].includes(new URL(raw).hostname); } catch { return false; }
};

export type Deps = { createClient: typeof createClient; now?: () => number; selfFire?: (recordId: string) => Promise<void> };

/** ── 4e-4c: EVERY PER-RUN COUNTER, IN ONE OBJECT ────────────────────────────────────────────────
 *  A counter declared beside the others and forgotten in the carry block reads only the LAST pass.
 *  That single mistake was made four times — finder_drops (4d, run 3456 reported 11 drops of a true
 *  24), the 4e set, read_feedback_by (run 4367, all-zero against four captures), and ours_landed
 *  (run 4367, 8 against 15 on the rows). It is closed here BY CONSTRUCTION rather than by one more
 *  carry line: a counter is a key of this object or it is not written to the run row at all, and
 *  carryTally() restores every key without naming one.
 *
 *  Keys are the run-row names, so the write is a spread and the two can never drift apart.
 *
 *  DELIBERATELY NOT HERE. retracted_superseded, retracted_side_changed and near_duplicates are
 *  computed ONCE at completion from the database, not accumulated per pass — carrying them would
 *  restore a stale count over a fresh one. cursor and units are position and shape, not counters,
 *  and are restored with the lease. */
export type Tally = {
  landed: number; skipped: number; not_located: number; annotated: number; ours_landed: number;
  finder_raw: number; splits: number;
  read_feedback: number; read_feedback_code_capture: number;
  objections_dropped: number; objections_kept: number;
  stories_refused: number; recut_from_record: number; cross_turn_refused: number;
  finder_drops: FinderDrops;
  read_feedback_by: Record<string, number>;
  capped: Record<string, number>;
  locate_rungs: Record<string, number>;
};

export const newTally = (): Tally => ({
  landed: 0, skipped: 0, not_located: 0, annotated: 0, ours_landed: 0,
  finder_raw: 0, splits: 0,
  read_feedback: 0, read_feedback_code_capture: 0,
  objections_dropped: 0, objections_kept: 0,
  stories_refused: 0, recut_from_record: 0, cross_turn_refused: 0,
  finder_drops: { object_not_in_passage: 0, quote_without_object: 0, fragment: 0, malformed: 0, duplicate: 0, object_in_other_passage: 0 },
  read_feedback_by: { n4_overlap: 0, n17_code: 0, n17_model: 0, n21_route_a: 0, n21_route_b: 0 },
  capped: { finder: 0, convert: 0, judge: 0, over_budget: 0 },
  locate_rungs: { exact: 0, ws: 0, neighbour: 0, "punctuation-blind": 0, fuzzy: 0, none: 0 },
});

/** The whole carry, by enumeration — nothing below names a counter, so a counter added to Tally is
 *  carried the moment it exists. A nested map is restored over the UNION of its keys and the stored
 *  ones, because a map can gain a key at run time: locate_rungs gains N21's code_capture only when
 *  N21 fires, and the old per-key carry (which walked the fresh object's keys) dropped it at the
 *  pass boundary — which is why run 4367's locate_rungs carries no code_capture against 4 captures. */
export function carryTally(t: Tally, prior: Record<string, unknown>): void {
  for (const k of Object.keys(t) as Array<keyof Tally>) {
    const here = t[k];
    if (typeof here === "number") {
      (t as unknown as Record<string, number>)[k] = Number(prior[k] ?? 0);
    } else {
      const stored = (prior[k] ?? {}) as Record<string, unknown>;
      const dst = here as unknown as Record<string, number>;
      for (const kk of new Set([...Object.keys(dst), ...Object.keys(stored)])) dst[kk] = Number(stored[kk] ?? 0);
    }
  }
}

/** The five counters that actually DROP a finder item. object_in_other_passage is NOT one of them:
 *  convert.ts increments it and falls through — it is the N5 recut path and the item survives. */
export const GATE_DROP_KEYS = ["object_not_in_passage", "quote_without_object", "fragment", "malformed", "duplicate"] as const;
export const gateDropTotal = (d: FinderDrops): number =>
  GATE_DROP_KEYS.reduce((sum, k) => sum + Number(d[k] ?? 0), 0);

export async function handleInterviewParse(req: Request, deps: Deps = { createClient }): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "Only POST is supported." }, 405);
  const now = deps.now ?? (() => Date.now());
  const startedAt = now();
  try {
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const recordId = text(body.record_id);
    if (!recordId) return json({ ok: false, error: "record_id required" }, 400);
    const resume = body.resume === true;

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    if (!supabaseUrl || !serviceRole) return json({ ok: false, error: "Missing Supabase env vars" }, 500);
    const ollamaBase = (Deno.env.get("OLLAMA_BASE_URL") || "http://host.docker.internal:11434").replace(/\/v1\/?$/, "");
    if (!isLocalUrl(ollamaBase)) return json({ ok: false, error: "Local-only policy violation: the Ollama base must resolve to localhost/host.docker.internal." }, 500);

    // deno-lint-ignore no-explicit-any
    const db = deps.createClient(supabaseUrl, serviceRole) as unknown as { from: (t: string) => any; auth: any };

    // ── the actor: the JWT's admin, or the service role. Never anything from the body. ──
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
    if (!actor) return json({ ok: false, error: "no_authenticated_caller", message: "No signed-in user — nothing was parsed." }, 401);
    if (actor.kind === "user") {
      const { data: roles } = await db.from("user_roles").select("role").eq("user_id", actor.id).eq("role", "admin").limit(1);
      if (!Array.isArray(roles) || roles.length === 0) return json({ ok: false, error: "not_admin", message: "Only an admin can parse an interview — nothing was parsed." }, 403);
    }

    // ── the record ──
    const { data: rec } = await db.from("interview_records")
      .select("id, company_id, speaker_role, verbatim, text_sha256, retracted_at, input_file_id, parsed_at, strictness, match_tolerance, journey_key, our_speakers")
      .eq("id", recordId).maybeSingle();
    if (!rec) return json({ ok: false, error: "no_record", message: `interview record ${recordId} not found.` }, 404);
    if (rec.retracted_at) return json({ ok: false, error: "record_withdrawn", message: "This interview was withdrawn — nothing was parsed." }, 409);
    // A hand-entered record has no uploaded transcript: its verbatim IS the quote, and there is no
    // saved file to be the one transcript authority. Parsing it would invent passages.
    if (!rec.input_file_id) return json({ ok: false, error: "not_upload_record", message: "Only an uploaded transcript is parsed — nothing was parsed." }, 409);
    const companyId = String(rec.company_id);
    const { data: company } = await db.from("companies").select("id, frozen").eq("id", companyId).maybeSingle();
    if (!company) return json({ ok: false, error: "no_company" }, 404);
    if (company.frozen === true) return json({ ok: false, error: "frozen_company", message: "This company is a frozen reference fixture (SELECT-only)." }, 403);

    // ── the text, hash-verified before a single passage is cut ──
    const verbatim = typeof rec.verbatim === "string" ? rec.verbatim : "";
    const storedSha = String(rec.text_sha256 ?? "").toLowerCase();
    const actualSha = await sha256Hex(verbatim);
    if (!storedSha || actualSha !== storedSha) {
      return json({ ok: false, error: "text_hash_mismatch", message: "The stored transcript does not match its hash — nothing was parsed." }, 409);
    }

    // ── R5: which labels are OUR side, as they stand at this moment ──
    // The record is the authority and the set is read once per pass; R7 says a later change never
    // rewrites a landed item, it is recognised by the NEXT parse.
    const ourSpeakers = new Set(
      (Array.isArray(rec.our_speakers) ? rec.our_speakers : []).map((l: unknown) => String(l ?? "").trim().toLowerCase()).filter(Boolean),
    );
    const sideOf = (label: string | null | undefined): SpeakerSide =>
      label && ourSpeakers.has(String(label).trim().toLowerCase()) ? "ours" : "client";

    // ── R6/R7: what is live on this record, and whether this parse supersedes it ──
    const { data: liveRows } = await db.from("interview_items")
      .select("id, rules_version, speaker_label, speaker_side")
      .eq("interview_record_id", recordId).is("retracted_at", null);
    const liveItems = (Array.isArray(liveRows) ? liveRows : []) as Array<{ id: string; rules_version: string; speaker_label: string | null; speaker_side: SpeakerSide }>;
    const olderVersion = liveItems.filter((i) => String(i.rules_version) !== PARSER_RULES_VERSION);
    // R7: the ONE case where a same-version parse is not a no-op.
    const sideMoved = liveItems.filter((i) => String(i.rules_version) === PARSER_RULES_VERSION && sideOf(i.speaker_label) !== i.speaker_side);
    const supersedes = olderVersion.length > 0;
    const relandsForSide = sideMoved.length > 0;

    // Already parsed and nothing has moved under it: the 409 stands.
    if (rec.parsed_at && !resume && !supersedes && !relandsForSide) {
      return json({ ok: false, error: "already_parsed", message: "This transcript is already parsed. Re-run with resume to continue an unfinished run.", parsed_at: rec.parsed_at }, 409);
    }

    const shape = detectShape(verbatim);
    const passages = await toPassages(verbatim, shape);
    const windows = toWindows(passages);
    // ── N15: THE CURSOR INDEXES UNITS, NOT WINDOWS ────────────────────────────────────────────────
    // A unit starts life as a window. When its finder call hits the cap, the unit is REPLACED IN PLACE
    // by its two halves, split at the passage boundary nearest the middle, and the cursor stays put so
    // the first half is what runs next. `depth` is how a half is told from a whole: a cap at depth 0
    // splits, a cap at MAX_SPLIT_DEPTH fails the run with the cursor kept. The list lives in the run
    // row's jsonb — no migration, because `excluded_by_rule` is unconstrained.
    type Unit = { start_passage: number; end_passage: number; depth: number };
    const unitsFromWindows = (): Unit[] =>
      windows.map((w) => ({ start_passage: w.start_passage, end_passage: w.end_passage, depth: 0 }));
    /** Split at the passage boundary nearest the middle. A unit of one passage cannot be split. */
    const splitUnit = (u: Unit): Unit[] | null => {
      if (u.end_passage <= u.start_passage) return null;
      const mid = u.start_passage + Math.floor((u.end_passage - u.start_passage + 1) / 2);
      if (mid <= u.start_passage || mid > u.end_passage) return null;
      return [
        { start_passage: u.start_passage, end_passage: mid - 1, depth: u.depth + 1 },
        { start_passage: mid, end_passage: u.end_passage, depth: u.depth + 1 },
      ];
    };

    // ── the run row: adopt a live one (resume) or open a new one ──
    const iso = (ms: number) => new Date(ms).toISOString();
    const { data: existing } = await db.from("integrity_runs")
      .select("id, ran_at, status, excluded_by_rule")
      .eq("company_id", companyId).eq("component", COMPONENT).eq("surface_type", "interview_records").eq("surface_id", recordId)
      .eq("status", "planned").order("ran_at", { ascending: false }).limit(1);
    let runId: number | null = null;
    let cursor = 0;
    // 4e-4c: the one object. Every per-run counter is a key of it; carryTally() below restores the
    // whole thing at a pass boundary without naming a single counter.
    const tally = newTally();
    // Computed once at completion, from the database — NOT carried, and so not part of the tally.
    let retractedOlder = 0, retractedSide = 0;
    let units: Unit[] = unitsFromWindows();   // N15: replaced from the run row when a pass resumes
    // N10: this pass's identity. The lease is (pass_id, heartbeat) and only one pass may hold it.
    const passId = crypto.randomUUID();
    const live = Array.isArray(existing) && existing.length ? existing[0] : null;
    if (live) {
      // ── N10: THE SINGLE-WRITER LEASE ────────────────────────────────────────────────────────────
      // The old guard was `!resume && age < STALE_AFTER_MS`, keyed on ran_at. `resume` short-circuited
      // it, so a resuming caller was trusted unconditionally with no test that another pass was alive
      // — and on 2026-09-24 an edge self-fire pass and a second caller adopted the same open row 21 s
      // apart and wrote each other's counters. The lease applies to a RESUME exactly as to a fresh
      // call: whoever holds an unexpired heartbeat owns the run, and everyone else is refused.
      //
      // A pass CLEARS the lease when it returns, so its own self-fire successor adopts immediately
      // rather than waiting out the 5 minutes.
      const prevPayload = (live.excluded_by_rule ?? {}) as Record<string, unknown>;
      const lease = (prevPayload.lease ?? null) as { pass_id?: string; heartbeat?: string } | null;
      const heartbeat = lease?.heartbeat ? Date.parse(String(lease.heartbeat)) : NaN;
      const leaseAge = Number.isFinite(heartbeat) ? startedAt - heartbeat : Number.POSITIVE_INFINITY;
      if (leaseAge < STALE_AFTER_MS) {
        return json({
          ok: false, error: "parse_in_flight",
          message: "Another pass holds the lease on this record's run.",
          run_id: live.id, lease_pass_id: lease?.pass_id ?? null, lease_age_ms: leaseAge,
        }, 409);
      }
      runId = Number(live.id);
      const prev = (live.excluded_by_rule ?? {}) as Record<string, unknown>;
      cursor = Number(prev.cursor ?? 0);
      // 4e-4c: landed/skipped/not_located/annotated used to be restored here, by hand, while the
      // rest of the counters were restored 140 lines below. Two carry sites is how one gets
      // forgotten; there is now exactly one, and it is carryTally().
      // N15: a pass that resumes must inherit the SPLIT unit list, or it would re-cut a window the
      // previous pass already halved and the cursor would point into the wrong shape.
      const storedUnits = Array.isArray(prev.units) ? (prev.units as Unit[]) : null;
      if (storedUnits && storedUnits.length) units = storedUnits;
    } else {
      const { data: opened, error: openErr } = await db.from("integrity_runs").insert({
        company_id: companyId, component: COMPONENT, surface_type: "interview_records", surface_id: recordId,
        ran_at: iso(startedAt), status: "planned", examined: passages.length, admitted: 0,
        excluded_by_rule: {
          shape, chars: verbatim.length, passages: passages.length, windows: windows.length,
          cursor: 0, ...newTally(),   // 4e-4c: the row carries the full counter shape from the open
          finder_model: FINDER_MODEL, judge_model: JUDGE_MODEL, num_ctx: NUM_CTX,
          rules_version: PARSER_RULES_VERSION, started_at: iso(startedAt),
        },
        run_ref: RUN_REF,
      }).select("id").single();
      if (openErr) return json({ ok: false, error: "run_open_failed", message: String(openErr.message ?? openErr) }, 500);
      runId = Number(opened.id);

      // ── R6/R7: supersession, on a NEW run only ──
      // The run row is opened FIRST so the retraction is never an orphan act: whatever happens next,
      // the audit has a row that says which run retracted what and why. (PostgREST gives no
      // multi-statement transaction, so "one transaction" is not literally available through this
      // client; opening the run first is the ordering that keeps the audit readable either way.)
      const retractNow = iso(startedAt);
      if (supersedes) {
        const { error: rErr } = await db.from("interview_items")
          .update({ retracted_at: retractNow, retracted_reason: supersededReason(PARSER_RULES_VERSION) })
          .eq("interview_record_id", recordId).is("retracted_at", null).neq("rules_version", PARSER_RULES_VERSION);
        if (rErr) {
          await db.from("integrity_runs").update({ status: "failed", error: "supersede_failed", ran_at: iso(now()) }).eq("id", runId);
          return json({ ok: false, error: "supersede_failed", message: String(rErr.message ?? rErr) }, 500);
        }
        retractedOlder = olderVersion.length;
      }
      if (relandsForSide) {
        // Same version, but our_speakers moved under these items. Retract exactly the ones whose side
        // changed, by id — never a blanket update, so an item whose side is unchanged keeps its row.
        const ids = sideMoved.map((i) => i.id);
        const { error: sErr } = await db.from("interview_items")
          .update({ retracted_at: retractNow, retracted_reason: SIDE_CHANGED_REASON })
          .in("id", ids).is("retracted_at", null);
        if (sErr) {
          await db.from("integrity_runs").update({ status: "failed", error: "side_reland_failed", ran_at: iso(now()) }).eq("id", runId);
          return json({ ok: false, error: "side_reland_failed", message: String(sErr.message ?? sErr) }, 500);
        }
        retractedSide = ids.length;
      }
      if (retractedOlder || retractedSide) {
        await db.from("integrity_runs").update({
          excluded_by_rule: {
            shape, chars: verbatim.length, passages: passages.length, windows: windows.length,
            cursor: 0, ...newTally(),
            finder_model: FINDER_MODEL, judge_model: JUDGE_MODEL, num_ctx: NUM_CTX,
            rules_version: PARSER_RULES_VERSION, started_at: iso(startedAt),
            retracted_superseded: retractedOlder, retracted_side_changed: retractedSide,
            our_speakers_count: ourSpeakers.size,
          },
        }).eq("id", runId);
      }
    }

    // N10: take the lease. Whether this pass adopted an open run or opened a new one, from here until
    // it returns it is the only writer, and the heartbeat says so.
    const leaseNow = (ms: number) => ({ pass_id: passId, heartbeat: iso(ms) });
    {
      const { data: cur } = await db.from("integrity_runs").select("excluded_by_rule").eq("id", runId).maybeSingle();
      const base = ((cur?.excluded_by_rule ?? {}) as Record<string, unknown>);
      await db.from("integrity_runs").update({ excluded_by_rule: { ...base, lease: leaseNow(startedAt) } }).eq("id", runId);
    }

    // ── the ledgered call ──
    let calls = 0;
    // N8: the bucket a stage's cap event is counted under.
    const capBucket = (stage: string) => (stage === "finder" ? "finder" : stage === "judge" ? "judge" : "convert");
    const call: Call = async ({ stage, system, user, model }) => {
      const useModel = model ?? FINDER_MODEL;
      // ── N8: THE CAP, AND THE BUDGET CHECK BEFORE THE CALL ─────────────────────────────────────
      // No call had ever sent num_predict. Nothing bounded the finder, and on this transcript it
      // stopped terminating: a probe ran past 13,563 tokens in 11 minutes while --context-shift threw
      // the prompt away 4,093 tokens at a time. The cap is the floor. The budget check is the other
      // half: a prompt that cannot fit its own cap is refused HERE, before the model is asked, rather
      // than discovered as a context shift halfway through an answer.
      const cap = numPredictFor(stage);
      const estimated = estimatePromptTokens(system) + estimatePromptTokens(user);
      if (estimated + cap > NUM_CTX) {
        tally.capped.over_budget++;
        throw new ParserCallError(OVER_BUDGET_ERROR, stage, `~${estimated} prompt + ${cap} cap > ${NUM_CTX} num_ctx`);
      }
      const resp = await fetch(`${ollamaBase}/api/chat`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: useModel, format: "json", stream: false, options: { num_ctx: NUM_CTX, temperature: 0, num_predict: cap }, messages: [{ role: "system", content: system }, { role: "user", content: user }] }),
      });
      if (!resp.ok) throw new Error(`ollama HTTP ${resp.status}`);
      const data = await resp.json().catch(() => ({})) as Record<string, unknown>;
      calls++;
      await db.from("model_calls").insert({
        company_id: companyId, call_site: `interview_parse:${stage}`, provider: "ollama", model: useModel,
        prompt_tokens: Number(data.prompt_eval_count ?? 0) || null, completion_tokens: Number(data.eval_count ?? 0) || null, usd: 0,
      });
      // N8: hitting the cap is an ERROR, never a silently truncated answer. A truncated JSON answer
      // parses to nothing useful anyway; saying so is the difference between a marked item and a
      // quietly missing one.
      if (String(data.done_reason ?? "") === "length") {
        tally.capped[capBucket(stage)]++;
        throw new ParserCallError(OUTPUT_CAP_ERROR, stage, `done_reason=length at num_predict ${cap}`);
      }
      return String((data.message as { content?: unknown } | undefined)?.content ?? "");
    };

    // ── R4: the next pass, fired through the internal-call path ──
    // Same shape market-discovery-step uses: handed to the runtime with waitUntil so this response can
    // return while the next pass is still being accepted. The bearer is the service role (which this
    // handler already authenticates) AND the shared internal secret travels with it, so the pass is
    // recognisably a self-fire rather than a caller.
    const internalSecret = Deno.env.get("INTERNAL_CALL_SECRET") ?? "";
    const firedInternally = isInternalServiceCall({
      presentedSecret: req.headers.get(INTERNAL_CALL_HEADER),
      internalSecret, bearer, serviceRoleKey: serviceRole,
    });
    const selfFire = deps.selfFire ?? (async (rid: string) => {
      waitUntil(fetch(`${supabaseUrl}/functions/v1/interview-parser`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${serviceRole}`,
          apikey: serviceRole,
          [INTERNAL_CALL_HEADER]: internalSecret,
        },
        body: JSON.stringify({ record_id: rid, resume: true }),
      }).catch(() => {}));
    });

    // R4: the pass log is read ONCE here and carried through every write below. The per-window update
    // rewrites excluded_by_rule wholesale, so a terminal block that RE-READ the row would see whatever
    // the last window write left — which is how the first integration lost pass 1's entry.
    const { data: runRow } = await db.from("integrity_runs").select("excluded_by_rule").eq("id", runId).maybeSingle();
    const basePayload = ((runRow?.excluded_by_rule ?? {}) as Record<string, unknown>);
    const passLog: unknown[] = Array.isArray(basePayload.passes) ? [...(basePayload.passes as unknown[])] : [];
    // ── 4e-4c: THE WHOLE CARRY, IN ONE CALL ──────────────────────────────────────────────────────
    // What stood here was nineteen lines, one per counter, each of which had to be remembered when a
    // counter was added. Four were not. This names no counter and cannot be incomplete.
    carryTally(tally, basePayload);
    {
      // N15/4e-3: the unit list is state, not a counter, and it is read here for the same reason.
      const storedUnits = Array.isArray(basePayload.units) ? (basePayload.units as Unit[]) : null;
      if (storedUnits && storedUnits.length) units = storedUnits;
    }

    // 4d R5: what counts as a reaction to the document on screen. Deliberately narrow — the words
    // the client uses when they are looking at the read, not any mention of a document. It stays as
    // the PHRASE half of the test; N4 below adds the half that actually caught turn 226.
    const READ_FEEDBACK_RE = /\b(first read|the read|mojomap|mojo map|this (?:doc|document|deck|page|slide|report)|the (?:doc|document|deck|page|slide|report)|that paragraph|this paragraph|that claim|this claim|that chip|this chip|on (?:the )?screen|level \d)\b/i;
    // ── 4e N4: the company's CURRENT first-read text, as an n-gram index ──────────────────────────
    // public_reads is the store the First Read renders its cascade from; is_current is the row the
    // client is looking at. Citation id lists and the internal cascade_source copy are not prose the
    // client reads, so readFeedback.ts drops them. A company with no current read yields an empty
    // index and N4 simply never fires — the rule needs our own words to compare against.
    const { data: readRows } = await db.from("public_reads")
      .select("id, kind, payload").eq("company_id", companyId).eq("is_current", true);
    const readPayloads = ((Array.isArray(readRows) ? readRows : []) as Array<{ payload: unknown }>).map((r) => r.payload);
    const readIndex = buildReadIndex(readPayloads, READ_OVERLAP_WORDS);
    const readRowIds = ((Array.isArray(readRows) ? readRows : []) as Array<{ id: string }>).map((r) => String(r.id));

    // ── 4e-3 N17(a): READ FEEDBACK BY WHAT WE SAID, NOT ONLY BY WHAT THEY SAID ────────────────────
    // N4 asks whether the CLIENT's words quote our read. Measured on run 3456, that misses the common
    // case: our side reads a line aloud and the client answers it in their own words, sharing nothing
    // with the document — turns 141, 188 and 242. The reaction is identifiable from OUR turn, not
    // theirs. So the same index is run over the two preceding turns, and an our-side turn that quotes
    // the read makes the client's answer read feedback.
    const turns = toTurns(verbatim, shape);
    const turnQuotesRead = new Map<number, boolean>();
    for (const t of turns) {
      const isOurs = sideOf(t.speaker_label) === "ours";
      turnQuotesRead.set(t.turn_index, isOurs && sharedReadRun(stripSpeakerHeader(t.text), readIndex, READ_OVERLAP_WORDS) !== null);
    }
    const turnOrder = turns.map((t) => t.turn_index);
    /** True when either of the two turns before `turnIndex` is one of ours that quotes the read. */
    const precededByOurReadTurn = (turnIndex: number): boolean => {
      const at = turnOrder.indexOf(turnIndex);
      if (at < 0) return false;
      for (const prior of turnOrder.slice(Math.max(0, at - 2), at)) {
        if (turnQuotesRead.get(prior) === true) return true;
      }
      return false;
    };
    // 4d R2: every speaker label on this record, so a person's name can be kept out of a statement.
    const { data: labelRows } = await db.from("interview_items").select("speaker_label").eq("interview_record_id", recordId).limit(1000);
    const speakerLabels = [...new Set([
      ...((Array.isArray(labelRows) ? labelRows : []) as Array<{ speaker_label: string | null }>).map((r) => String(r.speaker_label ?? "")),
      ...passages.map((p) => String(p.speaker_label ?? "")),
      ...(Array.isArray(rec.our_speakers) ? rec.our_speakers.map((l: unknown) => String(l ?? "")) : []),
    ].filter((l) => l.trim().length > 0))];

    const strictness = (String(rec.strictness ?? "keep_and_mark") as Strictness);
    const tolerance = (String(rec.match_tolerance ?? "ws") as MatchTolerance);
    const jobExecutor = String(rec.journey_key ?? "") || "the interviewee";

    // ── 4e-3: EVERY COUNTER, IN ONE PLACE ─────────────────────────────────────────────────────────
    // The replay caught this: the mid-pass write carried neither finder_drops nor read_feedback, so a
    // run that took two passes reported only the second pass's drops — 11 of a true 24 on run 3456.
    // Every write path now spreads the SAME object, so a counter cannot be carried by one path and
    // dropped by another.
    // 4e-4c: the spread IS the tally, so a key added to Tally reaches every write path at once.
    // units and read_index_rows ride along because every write path wants them; they are shape and
    // provenance, not counters, which is why they are not in the tally itself.
    const counters = () => ({ ...tally, units, read_index_rows: readRowIds.length });

    // ── the pass ──
    let slowestMs = 0;
    let windowsDone = 0;
    let failure: { reason: string; detail: string } | null = null;
    // N15: the loop walks UNITS, and the list can grow under it when a unit splits — so the bound is
    // read fresh each turn and the cursor is only advanced when a unit actually completes.
    for (let w = cursor; w < units.length; w++) {
      const elapsed = now() - startedAt;
      // N15's stated threshold: a unit starts only while a WORST-CASE unit would still finish inside
      // the budget — 150 s of worst case against a 300 s budget, so the last start is at 150 s and the
      // worst finish is 300 s, 100 s clear of the 400 s isolate wall. MIN_SLOWEST_MS/slowestMs is kept
      // as the second bound so a run of genuinely slow units still stops early.
      if (elapsed + Math.max(slowestMs, MIN_SLOWEST_MS, WORST_UNIT_MS) > TIME_BUDGET_MS) break;
      const win = units[w];
      const slice = passages.slice(win.start_passage, win.end_passage + 1);
      const t0 = now();
      // 4d R4: the code's own copy of each passage's text, keyed by the index the model is shown, so
      // the object and the quote are checked against the transcript rather than taken on trust.
      const passageTexts = new Map<number, string>();
      slice.forEach((p, i) => passageTexts.set(win.start_passage + i, p.text));
      let found: ReturnType<typeof parseFinderOutput>;
      const dropsBefore = gateDropTotal(tally.finder_drops);
      try {
        const user = buildFinderUser(slice, win.start_passage, { all: passages, start: win.start_passage, sideOf });
        found = parseFinderOutput(await call({ stage: "finder", system: FINDER_SYSTEM, user }), passageTexts, tally.finder_drops);
        // ── 4e-4c: finder_raw — HOW MANY ITEMS THE FINDER ACTUALLY OFFERED, per unit, summed ───────
        // Every ledger of this parser has had to DERIVE the raw count from landed + drops, because
        // the run row recorded only what survived. It is recorded now. parseFinderOutput returns the
        // survivors and does not report the raw count, so it is reconstructed exactly rather than by
        // re-parsing the answer: each entry the model offered ends either in `found` or in exactly
        // one of the five gate counters, which are the only ones that `continue`.
        tally.finder_raw += found.length + (gateDropTotal(tally.finder_drops) - dropsBefore);
      } catch (e) {
        // N8: a finder that hit its cap, or a prompt refused before it was sent, FAILS THE WINDOW.
        // `cursor` is only advanced after the item loop below, so it is kept exactly where it was and
        // a later pass retries this window. No item from this window lands.
        const pce = e instanceof ParserCallError ? e : null;
        // ── N15: A CAPPED FINDER SPLITS THE UNIT, IT DOES NOT FAIL THE RUN ─────────────────────────
        // First occurrence on a whole window: cut it in two at the passage boundary nearest the
        // middle, put the halves where the window was, leave the cursor alone so the first half runs
        // next, and count the split. A half that caps AGAIN has nowhere left to go and fails the run
        // with the cursor kept — at temperature 0 the same input caps every time, so retrying it
        // forever is the one thing that must not happen.
        if (pce?.code === OUTPUT_CAP_ERROR && win.depth < MAX_SPLIT_DEPTH) {
          const halves = splitUnit(win);
          if (halves) {
            units = [...units.slice(0, w), ...halves, ...units.slice(w + 1)];
            tally.splits++;
            w--;                       // the for-loop's w++ puts us back on the first half
            continue;
          }
        }
        failure = {
          reason: pce?.code === OUTPUT_CAP_ERROR ? "finder_output_cap"
                : pce?.code === OVER_BUDGET_ERROR ? "finder_over_budget"
                : "window_error",
          detail: `unit ${w + 1} (passages ${win.start_passage}-${win.end_passage}, depth ${win.depth}): ${String((e as Error)?.message ?? e).slice(0, 200)}`,
        };
        break;
      }
      for (const item of found) {
        // PR8: the CODE decides where the quote sits. The model's index is a hint, never the pointer.
        const rel = item.passage_index - win.start_passage;
        const loc = locateQuote(item.raw_words, slice, rel);
        if (loc.trace_state === "not_located") {
          tally.not_located++;
          if (strictness === "located_only") continue; // the operator asked for located items only
        }
        const passage: Passage = slice[loc.passage_index];
        tally.locate_rungs[loc.rung ?? "none"] = (tally.locate_rungs[loc.rung ?? "none"] ?? 0) + 1;

        // ── 4e N5: THE WORDS ARE THE RECORD'S, NOT THE MODEL'S ────────────────────────────────────
        // The locator says WHERE; the record says WHAT. raw_words is now cut from the passage at the
        // located span and snapped to whole sentences, so a fuzzy hit can no longer carry the model's
        // misquote into the row (Edgewood 9f5f32ba stored "We dons" for a record that says "We don't").
        // A span is cut from ONE passage and a passage never spans more than one turn, so the cut
        // cannot cross a turn boundary; the check below is the guard that says so out loud.
        const cut = cutLocatedWords(passage.text, loc.span);
        let rawWords = item.raw_words;
        if (loc.trace_state === "located") {
          if (cut && passage.text.includes(cut) && wordCount(cut) >= MIN_RAW_WORDS) {
            if (cut !== item.raw_words) tally.recut_from_record++;
            rawWords = cut;
          } else {
            // LOCATED but not cuttable: the span did not yield whole words inside the one passage, so
            // the only thing left to store would be the model's quote — which N5 forbids, and which is
            // exactly the cross-turn case the ruling names. Refused, and counted; never landed on
            // words the passage does not contain.
            tally.cross_turn_refused++;
            tally.finder_drops.object_not_in_passage++;
            continue;
          }
        }
        // NOT located, under keep_and_mark: rule 1 lands it anyway, carrying the model's words against
        // the passage the finder named. This is the one place N5 cannot cut from the record, because no
        // span was found — and the row SAYS SO: trace_state is not_located, which is what marks those
        // words as the model's claim rather than the record's. Under located_only it was already
        // dropped above.

        // R5: an item our OWN side said is not the client's evidence. It lands with its words, its
        // speaker and its pointer, and nothing derived — no converter, no judge, no model call.
        const side = sideOf(passage.speaker_label);
        const scope: Scope = item.scope;

        // ── 4e N4: READ FEEDBACK, DECIDED BY THE CODE ─────────────────────────────────────────────
        // A run of READ_OVERLAP_WORDS words shared with our current read means the speaker is reading
        // our document back at us. The deterministic match WINS over the model's kind: whatever the
        // finder called it, it is an ask. Any implied item the passage carries is a separate entry of
        // its own and is untouched by this.
        const sharedRun = side === "client" ? sharedReadRun(rawWords, readIndex, READ_OVERLAP_WORDS) : null;
        // N17(a): our own preceding turn is the other way in.
        const afterOurRead = side === "client" && precededByOurReadTurn(passage.turn_index);
        const phraseFeedback = item.kind === "ask" && READ_FEEDBACK_RE.test(rawWords);
        const readFeedback = sharedRun !== null || afterOurRead || phraseFeedback;
        let kind = item.kind as ItemKind;
        // the deterministic match wins over the model's kind, by either route
        if ((sharedRun !== null || afterOurRead) && kind !== "ask") kind = "ask";
        if (readFeedback) {
          const trig = sharedRun !== null ? "n4_overlap" : afterOurRead ? "n17_code" : "n17_model";
          tally.read_feedback_by[trig] = (tally.read_feedback_by[trig] ?? 0) + 1;
        }

        // ── 4e N6: A STORY IS NEVER A PAIN POINT ──────────────────────────────────────────────────
        // A reaction to us is handled above — it became an ask. What is left is the narrated past
        // event, which yields only the item it implies. That implied item is a separate finder entry
        // and stands on its own; this one does not land. Counted, never silent.
        if (kind === "pain_point" && isNarratedStory(rawWords)) {
          tally.stories_refused++;
          continue;
        }

        // N8: a converter or judge that hits its cap annotates THIS ITEM and nothing more — the window
        // and every other item in it are unaffected. Rule 1 still lands it, with a reason that says
        // what happened rather than a half-parsed statement.
        let conv: Awaited<ReturnType<typeof convertItem>>;
        if (side === "ours") {
          // no judge runs on our own side, so judge_objections stays NULL (the fields are left unset)
          conv = { framework_statement: null, framework_form: null, judge_state: "annotated", judge_reason: OURS_SIDE_REASON };
        } else {
          try {
            conv = await convertItem({
              call, kind, rawWords,
              speaker: passage.speaker_label, jobExecutor, judgeModel: JUDGE_MODEL,
              side, scope,   // R7: together these decide whether the means test applies at all
              speakerLabels,  // 4d R2
              passageText: passage.text,  // 4e N3: what an added_* term is checked against
            });
          } catch (e) {
            if (!(e instanceof ParserCallError)) throw e;
            // the call never returned a verdict, so there are no objections to record: NULL, not empty
            conv = {
              framework_statement: null, framework_form: null, judge_state: "annotated",
              judge_reason: `${OUTPUT_CAP_REASON}: ${e.stage}`,
            };
          }
        }
        tally.objections_dropped += (conv.objections_dropped ?? []).length;
        tally.objections_kept += (conv.objections_kept ?? []).length;
        if (readFeedback && !conv.judge_reason.startsWith(READ_FEEDBACK_STATEMENT_PREFIX)) {
          conv.judge_reason = `${READ_FEEDBACK_STATEMENT_PREFIX} ${conv.judge_reason}`;
          tally.read_feedback++;
        }
        if (conv.judge_state === "annotated") tally.annotated++;
        const identity = await itemContentIdentity({ kind, raw_words: rawWords, passage_sha256: passage.passage_sha256 });
        const { error: insErr } = await db.from("interview_items").insert({
          company_id: companyId, interview_record_id: recordId, kind,
          raw_words: rawWords, speaker_label: passage.speaker_label, speaker_side: side, scope,
          framework_statement: conv.framework_statement, framework_form: conv.framework_form,
          // N11: what the judge objected to and what the term check threw away. NULL when no judge
          // ran at all — our own side, a kind with no converter, a guard refusal before the call, or a
          // call that hit its cap. An empty pair {kept:[],dropped:[]} means a judge DID run and found
          // nothing, which is a different statement and is meant to be.
          judge_objections: conv.objections_kept === undefined
            ? null
            : { kept: conv.objections_kept, dropped: conv.objections_dropped ?? [] },
          pointer: {
            turn_index: passage.turn_index, line_start: passage.line_start, line_end: passage.line_end,
            passage_sha256: passage.passage_sha256,
            // N5: the rung that matched, on every item. No migration — pointer is free jsonb.
            locate_rung: (loc.rung ?? null) as LocateRung | null,
          },
          record_text_sha256: storedSha, trace_state: loc.trace_state, landing: "unplaced",
          judge_state: conv.judge_state, judge_reason: conv.judge_reason,
          parse_level: PARSE_LEVEL, rules_version: PARSER_RULES_VERSION, content_identity: identity,
        });
        // Rule 5: an identity already live on this record is the SAME item — a re-parse is idempotent,
        // so the unique index refusing it is the expected path, not an error.
        if (insErr) {
          if (String(insErr.message ?? "").includes("interview_items_one_live_per_identity")) tally.skipped++;
          else { failure = { reason: "insert_failed", detail: String(insErr.message ?? insErr).slice(0, 200) }; break; }
        } else { tally.landed++; if (side === "ours") tally.ours_landed++; }
      }
      if (failure) break;

      // ── N21: THE CODE CAPTURE ─────────────────────────────────────────────────────────────────
      // Runs over the unit's own passages, after the finder's items for that unit have landed, so a
      // pass that stops here leaves nothing half-captured and a resume redoes only this unit. No model
      // call is made and nothing about the finder's items is changed: a finder item on the same turn
      // still lands and is still relabelled by N4 / N17(a). The content identity keeps a re-parse from
      // doubling these, exactly as it does for every other item.
      for (const p of slice) {
        if (sideOf(p.speaker_label) !== "client") continue;
        const turn = turns.find((t) => t.turn_index === p.turn_index);
        if (!turn) continue;
        const route = n21Route({
          turnText: turn.text, index: readIndex,
          precedingOurTurnQuotesRead: precededByOurReadTurn(p.turn_index),
          overlapWords: READ_OVERLAP_WORDS,
        });
        if (!route) continue;
        // the whole passage as the code cut it, minus its own speaker header — the header is the
        // transcript's furniture, not the speaker's words, and every other item stores words only.
        const body = stripSpeakerHeader(p.text);
        if (!body) continue;
        const identity = await itemContentIdentity({ kind: "ask", raw_words: body, passage_sha256: p.passage_sha256 });
        const { error: n21Err } = await db.from("interview_items").insert({
          company_id: companyId, interview_record_id: recordId, kind: "ask",
          raw_words: body, speaker_label: p.speaker_label, speaker_side: "client", scope: "market",
          framework_statement: null, framework_form: null, judge_objections: null,
          pointer: { turn_index: p.turn_index, line_start: p.line_start, line_end: p.line_end, passage_sha256: p.passage_sha256, locate_rung: N21_RUNG, n21_route: route },
          record_text_sha256: storedSha, trace_state: "located", landing: "unplaced",
          judge_state: "annotated", judge_reason: `${READ_FEEDBACK_STATEMENT_PREFIX} ${N21_REASON}`,
          parse_level: PARSE_LEVEL, rules_version: PARSER_RULES_VERSION, content_identity: identity,
        });
        if (n21Err) {
          if (String(n21Err.message ?? "").includes("interview_items_one_live_per_identity")) tally.skipped++;
          else { failure = { reason: "insert_failed", detail: String(n21Err.message ?? n21Err).slice(0, 200) }; break; }
        } else {
          tally.landed++; tally.annotated++; tally.read_feedback++; tally.read_feedback_code_capture++;
          tally.read_feedback_by[route === "a_turn_quotes_read" ? "n21_route_a" : "n21_route_b"]++;
          tally.locate_rungs[N21_RUNG] = (tally.locate_rungs[N21_RUNG] ?? 0) + 1;
        }
      }
      if (failure) break;

      slowestMs = Math.max(slowestMs, now() - t0);
      cursor = w + 1; windowsDone++;
      const tick = now();
      await db.from("integrity_runs").update({
        ran_at: iso(tick),
        excluded_by_rule: { ...basePayload, passes: passLog, ...counters(), lease: leaseNow(tick), shape, chars: verbatim.length, passages: passages.length, windows: windows.length, cursor, finder_model: FINDER_MODEL, judge_model: JUDGE_MODEL, num_ctx: NUM_CTX, rules_version: PARSER_RULES_VERSION, tolerance, strictness },
        admitted: tally.landed,
      }).eq("id", runId);
    }

    const done = cursor >= units.length;
    if (failure) {
      // N10: a failed pass RELEASES the lease. Holding it would lock the run for STALE_AFTER_MS and
      // turn one bad window into five minutes of refused retries.
      const { data: curF } = await db.from("integrity_runs").select("excluded_by_rule").eq("id", runId).maybeSingle();
      const baseF = ((curF?.excluded_by_rule ?? {}) as Record<string, unknown>);
      await db.from("integrity_runs").update({
        status: "failed", error: failure.reason, ran_at: iso(now()),
        excluded_by_rule: { ...baseF, ...counters(), lease: null },
      }).eq("id", runId);
      // A failed pass still says what it did: the run row carries the counters, and so does the answer.
      return json({
        ok: false, error: failure.reason, message: failure.detail, run_id: runId, cursor,
        windows: units.length, splits: tally.splits, capped: tally.capped, model_calls: calls, elapsed_ms: now() - startedAt,
      }, 500);
    }
    // ── R4: every pass is ledgered on the run row, in order ──
    const payload = basePayload;
    passLog.push({
      n: passLog.length + 1, via: firedInternally ? "self_fire" : "caller",
      windows_done: windowsDone, cursor, landed: tally.landed, skipped: tally.skipped,
      not_located: tally.not_located, annotated: tally.annotated, finder_raw: tally.finder_raw,
      model_calls: calls, ms: now() - startedAt, at: iso(now()),
    });

    // ── R9: CONCEPT DEDUP, once, when the whole record has been parsed ──────────────────────────
    // It runs on completion rather than per window because a duplicate can sit in window 1 and window
    // 7. Nothing is dropped: the later row keeps its statement and is annotated with the id it
    // repeats. judge_state is left alone — a near-duplicate of an ACCEPTED item is still accepted.
    let dedupMarked = 0;
    if (done) {
      const { data: landedRows } = await db.from("interview_items")
        .select("id, framework_statement, created_at")
        .eq("interview_record_id", recordId).is("retracted_at", null)
        .not("framework_statement", "is", null)
        .order("created_at", { ascending: true });
      const dups = findNearDuplicates((Array.isArray(landedRows) ? landedRows : []) as Array<{ id: string; framework_statement: string | null }>);
      for (const d of dups) {
        const { error: dErr } = await db.from("interview_items")
          .update({ judge_reason: d.reason }).eq("id", d.id);
        if (!dErr) dedupMarked++;
      }
    }

    if (done) {
      await db.from("integrity_runs").update({
        status: "completed", admitted: tally.landed, ran_at: iso(now()),
        excluded_by_rule: { ...payload, passes: passLog, cursor, near_duplicates: dedupMarked, ...counters(), lease: null, retracted_superseded: retractedOlder, retracted_side_changed: retractedSide, our_speakers_count: ourSpeakers.size },
      }).eq("id", runId);
      // parsed_at also LOCKS THE SPEAKER (the existing rule on this record).
      await db.from("interview_records").update({ parsed_at: iso(now()), rules_version: PARSER_RULES_VERSION, parse_level: PARSE_LEVEL }).eq("id", recordId);
    } else {
      await db.from("integrity_runs").update({
        excluded_by_rule: { ...payload, passes: passLog, cursor, ...counters(), lease: null, retracted_superseded: retractedOlder, retracted_side_changed: retractedSide, our_speakers_count: ourSpeakers.size },
      }).eq("id", runId);
      // R4: SELF-FIRE. Only when this pass actually moved the cursor — a pass that did no window would
      // fire an identical one forever, so no progress means no fire and the caller resumes by hand.
      if (windowsDone > 0) await selfFire(recordId);
    }
    return json({
      ok: true, run_id: runId, done, cursor, windows: units.length, windows_done: windowsDone,
      passages: passages.length, shape, model_calls: calls, ...tally,
      near_duplicates: dedupMarked, units: units.length, lease_pass_id: passId,
      retracted_superseded: retractedOlder, retracted_side_changed: retractedSide,
      self_fired: !done && windowsDone > 0, passes: passLog.length,
      elapsed_ms: now() - startedAt,
    });
  } catch (e) {
    return json({ ok: false, error: "unhandled", message: String((e as Error)?.message ?? e).slice(0, 300) }, 500);
  }
}
