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
import { PARSER_RULES_VERSION, SIDE_CHANGED_REASON, supersededReason, type MatchTolerance, type Strictness } from "./rules.ts";
import { detectShape, toPassages, toWindows, type Passage } from "./segment.ts";
import { locateQuote } from "./locate.ts";
import { FINDER_SYSTEM, buildFinderUser, convertItem, findNearDuplicates, parseFinderOutput, type Call } from "./convert.ts";
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

    // ── the run row: adopt a live one (resume) or open a new one ──
    const iso = (ms: number) => new Date(ms).toISOString();
    const { data: existing } = await db.from("integrity_runs")
      .select("id, ran_at, status, excluded_by_rule")
      .eq("company_id", companyId).eq("component", COMPONENT).eq("surface_type", "interview_records").eq("surface_id", recordId)
      .eq("status", "planned").order("ran_at", { ascending: false }).limit(1);
    let runId: number | null = null;
    let cursor = 0;
    let landed = 0, skipped = 0, notLocated = 0, annotated = 0;
    let retractedOlder = 0, retractedSide = 0, oursLanded = 0;
    const live = Array.isArray(existing) && existing.length ? existing[0] : null;
    if (live) {
      const age = startedAt - Date.parse(String(live.ran_at));
      if (!resume && age < STALE_AFTER_MS) {
        return json({ ok: false, error: "parse_in_flight", message: "A parse is already running for this record.", run_id: live.id }, 409);
      }
      runId = Number(live.id);
      const prev = (live.excluded_by_rule ?? {}) as Record<string, unknown>;
      cursor = Number(prev.cursor ?? 0);
      landed = Number(prev.landed ?? 0); skipped = Number(prev.skipped ?? 0);
      notLocated = Number(prev.not_located ?? 0); annotated = Number(prev.annotated ?? 0);
    } else {
      const { data: opened, error: openErr } = await db.from("integrity_runs").insert({
        company_id: companyId, component: COMPONENT, surface_type: "interview_records", surface_id: recordId,
        ran_at: iso(startedAt), status: "planned", examined: passages.length, admitted: 0,
        excluded_by_rule: {
          shape, chars: verbatim.length, passages: passages.length, windows: windows.length,
          cursor: 0, landed: 0, skipped: 0, not_located: 0, annotated: 0,
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
            cursor: 0, landed: 0, skipped: 0, not_located: 0, annotated: 0,
            finder_model: FINDER_MODEL, judge_model: JUDGE_MODEL, num_ctx: NUM_CTX,
            rules_version: PARSER_RULES_VERSION, started_at: iso(startedAt),
            retracted_superseded: retractedOlder, retracted_side_changed: retractedSide,
            our_speakers_count: ourSpeakers.size,
          },
        }).eq("id", runId);
      }
    }

    // ── the ledgered call ──
    let calls = 0;
    const call: Call = async ({ stage, system, user, model }) => {
      const useModel = model ?? FINDER_MODEL;
      const resp = await fetch(`${ollamaBase}/api/chat`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: useModel, format: "json", stream: false, options: { num_ctx: NUM_CTX, temperature: 0 }, messages: [{ role: "system", content: system }, { role: "user", content: user }] }),
      });
      if (!resp.ok) throw new Error(`ollama HTTP ${resp.status}`);
      const data = await resp.json().catch(() => ({})) as Record<string, unknown>;
      calls++;
      await db.from("model_calls").insert({
        company_id: companyId, call_site: `interview_parse:${stage}`, provider: "ollama", model: useModel,
        prompt_tokens: Number(data.prompt_eval_count ?? 0) || null, completion_tokens: Number(data.eval_count ?? 0) || null, usd: 0,
      });
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

    const strictness = (String(rec.strictness ?? "keep_and_mark") as Strictness);
    const tolerance = (String(rec.match_tolerance ?? "ws") as MatchTolerance);
    const jobExecutor = String(rec.journey_key ?? "") || "the interviewee";

    // ── the pass ──
    let slowestMs = 0;
    let windowsDone = 0;
    let failure: { reason: string; detail: string } | null = null;
    for (let w = cursor; w < windows.length; w++) {
      const elapsed = now() - startedAt;
      if (elapsed + Math.max(slowestMs, MIN_SLOWEST_MS) > TIME_BUDGET_MS) break;
      const win = windows[w];
      const slice = passages.slice(win.start_passage, win.end_passage + 1);
      const t0 = now();
      let found: ReturnType<typeof parseFinderOutput>;
      try {
        found = parseFinderOutput(await call({ stage: "finder", system: FINDER_SYSTEM, user: buildFinderUser(slice, win.start_passage) }));
      } catch (e) {
        failure = { reason: "window_error", detail: `window ${w + 1}: ${String((e as Error)?.message ?? e).slice(0, 200)}` };
        break;
      }
      for (const item of found) {
        // PR8: the CODE decides where the quote sits. The model's index is a hint, never the pointer.
        const rel = item.passage_index - win.start_passage;
        const loc = locateQuote(item.raw_words, slice, rel);
        if (loc.trace_state === "not_located") {
          notLocated++;
          if (strictness === "located_only") continue; // the operator asked for located items only
        }
        const passage: Passage = slice[loc.passage_index];
        // R5: an item our OWN side said is not the client's evidence. It lands with its words, its
        // speaker and its pointer, and nothing derived — no converter, no judge, no model call.
        const side = sideOf(passage.speaker_label);
        const scope: Scope = item.scope;
        const conv = side === "ours"
          ? { framework_statement: null, framework_form: null, judge_state: "annotated" as const, judge_reason: OURS_SIDE_REASON }
          : await convertItem({
              call, kind: item.kind as ItemKind, rawWords: item.raw_words,
              speaker: passage.speaker_label, jobExecutor, judgeModel: JUDGE_MODEL,
              side, scope,   // R7: together these decide whether the means test applies at all
            });
        if (conv.judge_state === "annotated") annotated++;
        const identity = await itemContentIdentity({ kind: item.kind as ItemKind, raw_words: item.raw_words, passage_sha256: passage.passage_sha256 });
        const { error: insErr } = await db.from("interview_items").insert({
          company_id: companyId, interview_record_id: recordId, kind: item.kind,
          raw_words: item.raw_words, speaker_label: passage.speaker_label, speaker_side: side, scope,
          framework_statement: conv.framework_statement, framework_form: conv.framework_form,
          pointer: { turn_index: passage.turn_index, line_start: passage.line_start, line_end: passage.line_end, passage_sha256: passage.passage_sha256 },
          record_text_sha256: storedSha, trace_state: loc.trace_state, landing: "unplaced",
          judge_state: conv.judge_state, judge_reason: conv.judge_reason,
          parse_level: PARSE_LEVEL, rules_version: PARSER_RULES_VERSION, content_identity: identity,
        });
        // Rule 5: an identity already live on this record is the SAME item — a re-parse is idempotent,
        // so the unique index refusing it is the expected path, not an error.
        if (insErr) {
          if (String(insErr.message ?? "").includes("interview_items_one_live_per_identity")) skipped++;
          else { failure = { reason: "insert_failed", detail: String(insErr.message ?? insErr).slice(0, 200) }; break; }
        } else { landed++; if (side === "ours") oursLanded++; }
      }
      if (failure) break;
      slowestMs = Math.max(slowestMs, now() - t0);
      cursor = w + 1; windowsDone++;
      await db.from("integrity_runs").update({
        ran_at: iso(now()),
        excluded_by_rule: { ...basePayload, passes: passLog, shape, chars: verbatim.length, passages: passages.length, windows: windows.length, cursor, landed, skipped, not_located: notLocated, annotated, ours_landed: oursLanded, finder_model: FINDER_MODEL, judge_model: JUDGE_MODEL, num_ctx: NUM_CTX, rules_version: PARSER_RULES_VERSION, tolerance, strictness },
        admitted: landed,
      }).eq("id", runId);
    }

    const done = cursor >= windows.length;
    if (failure) {
      await db.from("integrity_runs").update({ status: "failed", error: failure.reason, ran_at: iso(now()) }).eq("id", runId);
      return json({ ok: false, error: failure.reason, message: failure.detail, run_id: runId, cursor, windows: windows.length }, 500);
    }
    // ── R4: every pass is ledgered on the run row, in order ──
    const payload = basePayload;
    passLog.push({
      n: passLog.length + 1, via: firedInternally ? "self_fire" : "caller",
      windows_done: windowsDone, cursor, landed, skipped, not_located: notLocated, annotated,
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
        status: "completed", admitted: landed, ran_at: iso(now()),
        excluded_by_rule: { ...payload, passes: passLog, cursor, landed, skipped, not_located: notLocated, annotated, ours_landed: oursLanded, near_duplicates: dedupMarked, retracted_superseded: retractedOlder, retracted_side_changed: retractedSide, our_speakers_count: ourSpeakers.size },
      }).eq("id", runId);
      // parsed_at also LOCKS THE SPEAKER (the existing rule on this record).
      await db.from("interview_records").update({ parsed_at: iso(now()), rules_version: PARSER_RULES_VERSION, parse_level: PARSE_LEVEL }).eq("id", recordId);
    } else {
      await db.from("integrity_runs").update({
        excluded_by_rule: { ...payload, passes: passLog, cursor, landed, skipped, not_located: notLocated, annotated, ours_landed: oursLanded, retracted_superseded: retractedOlder, retracted_side_changed: retractedSide, our_speakers_count: ourSpeakers.size },
      }).eq("id", runId);
      // R4: SELF-FIRE. Only when this pass actually moved the cursor — a pass that did no window would
      // fire an identical one forever, so no progress means no fire and the caller resumes by hand.
      if (windowsDone > 0) await selfFire(recordId);
    }
    return json({
      ok: true, run_id: runId, done, cursor, windows: windows.length, windows_done: windowsDone,
      passages: passages.length, shape, landed, skipped, not_located: notLocated, annotated, model_calls: calls,
      ours_landed: oursLanded, near_duplicates: dedupMarked, retracted_superseded: retractedOlder, retracted_side_changed: retractedSide,
      self_fired: !done && windowsDone > 0, passes: passLog.length,
      elapsed_ms: now() - startedAt,
    });
  } catch (e) {
    return json({ ok: false, error: "unhandled", message: String((e as Error)?.message ?? e).slice(0, 300) }, 500);
  }
}
