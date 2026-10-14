// GATE 6a — generate-public-read. A CONFIRMED, ledgered, judged "Our read" of a company's
// positioning / strategy / promise, computed STRICTLY from PUBLIC-provenance inputs. Nothing
// internal / uploaded / intake / internal_declared can enter: every input is gathered by a query
// whose predicate structurally selects public provenance ONLY (named below), never a filter-after.
//
// Inputs (each row carries its id into input_ledger; provenance drives the router):
//   outside_signals  signals.signal_band='outside' AND voice_class ∈ public voices   → public_observed
//   own_words        own_words_candidates.judge_keep=true                            → public_observed
//   findings         findings.register='public_inferred' AND status='open'           → public_inferred
//   deltas           claim_deltas.pairing_kind='public_vs_public' (echoed|divergent) → public_observed
//   positioning read public_reads.kind='positioning' is_current (Stage B How-to-Win context — public
//                    by construction; not a citable ref, framing context only)
//
// FORBIDDEN INPUTS (Stage B Option-B, structural — this module queries NONE of them; a source-level
// test greps this file for each and asserts 0 hits): odi_market_definitions (all-internal markets
// register), strategy_cascades (the admin cascade — market_read is uploaded-augmented), inputs /
// uploaded files. The public cascade rests ONLY on the public record above.
//
// Model via the provenance router (all-public → external gpt-4.1-mini; any non-public/unknown/NULL →
// local, fail-closed). The generator MUST cite input ids; any citation outside the ledger → the output
// is REJECTED (fail loud, no write). The judge checks (a) grounding, (b) plain-sanity (the category
// names what the business IS), (c) consistency across the three kinds. Reject → no write, verdict in
// the response. Accept → write is_current rows; prior current rows get superseded_by + is_current=false
// (never deleted); supersedes_legacy_row points back to the old market_read canvas/cascade if any.
// CB1 / frozen companies are refused structurally (by id here, and by the DB freeze trigger).

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { US_ENGLISH_RULE } from "../_shared/languageRule.ts";
import { resolveModel, callOpenAIJson, withRetry429, usdCost, type OpenAIUsage } from "../_shared/modelRouter.ts";
import { sha256Hex } from "../_shared/contentIdentity.ts";
import { citationsLivePublic, framingViolations, isPublicProvenance, offeringStructureViolations, offeringAcceptFromVerdict } from "../_shared/publicReadGuards.ts";
import { classRefusals, decideFieldClass, extractSpecifics, fieldClassOk, s1Detail, s1Unsourced, specificIsSourced, type FieldClassDecision, type S1Result } from "../_shared/classFactCheck.ts";
import { liveRecordCandidates, reReadRowTexts, searchLiveRecordForSpecifics, specificsCarriedByOurOwnRows, unsourcedSpecificsOf, type SourcingRow } from "../_shared/classSourcingScope.ts";
import { type CascadeGapItem } from "../_shared/cascadeRouting.ts";
import { StageRefusal, detailOf, rejectLogLine, runKindsIsolated } from "../_shared/publicReadPerKind.ts";
import { PromoteRefused, promoteStagedReads, recordPromoteIntegrity, recordPromoteRefusal, writeCascadeGaps } from "../_shared/publicReadPromote.ts";
import { buildRefMeta, buildStoredPayloads, hostOf, translateCitations, type OfferingSeenOn } from "../_shared/publicReadStorage.ts";
import { loadOwnSiteRecord } from "../_shared/offeringNamedOnSite.ts";
import { SELECTION_VERSION } from "../_shared/publicReadSelection.ts";
import { GEN_RULES_VERSION } from "../_shared/genRulesVersion.ts";
import {
  CONTINUITY_GUARD, SOFTENING_GUARD, continuityBlock, continuityDetail, droppedLines,
  softenedSpecifics, softeningDetail, type CitedLine, type ContinuityBlock,
} from "../_shared/stageContinuity.ts";
import {
  CARRIED_DRIFT_GUARD, assembleByPath, carriedBlockOf, carryForLine, driftedSpans,
  furtherDifferentiatorCount,
  rekeyCarriedBlock, searchLiveRecordForSpans, usableSpansOf, type CarriedBlock, type CarriedSpan,
  type CarryPlacement, type FieldCarry,
} from "../_shared/carriedSpan.ts";
import { selectPublicInputs, type InputRow, inheritedClass, type SourceClass } from "../_shared/publicReadInputs.ts";
import { openaiRecord, recordModelCall } from "../_shared/recordModelCall.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const LOCAL_HOST_ALLOWLIST = new Set(["localhost", "127.0.0.1", "::1", "host.docker.internal"]);
const CB1_FROZEN_ID = "58b2b15b-bada-4bcd-9c12-b7e66a37d0bc";
// KINDS is the full set of VALID read kinds (matches the public_reads_kind_check constraint). DEFAULT_KINDS
// is what an unscoped run (body.kinds omitted/[]) generates — the ORIGINAL three, so `offering` is
// OPT-IN ONLY (a caller must pass kinds:["offering"]). This keeps every existing caller's default run
// byte-identical: offering is never generated, judged, or written unless explicitly requested.
const KINDS = ["positioning", "strategy", "promise", "offering"] as const;
const DEFAULT_KINDS = ["positioning", "strategy", "promise"] as const;
type Kind = (typeof KINDS)[number];

function isLocalOllamaUrl(rawUrl: string) {
  try { return LOCAL_HOST_ALLOWLIST.has(String(new URL(rawUrl).hostname || "").trim().toLowerCase()); }
  catch { return false; }
}
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

// InputRow / READ_CAP / selectPublicInputs MOVED to ../_shared/publicReadInputs.ts (wall brief 2026-09-18) — the bet writer reads the same pool.

// The INPUT LEDGER — the anti-provenance-lie record: EXACTLY what was read, its provenance, its
// per-id liveness, and a corpus fingerprint. corpus_md5 is a sha256 of the sorted input texts (a
// stable content hash — "md5" per the gate's shorthand; the algorithm is sha256). liveness is 'live'
// for every id by construction (the queries select live-only public rows), recorded explicitly so the
// ledger states it rather than implying it.
async function ledgerOf(inputs: InputRow[]) {
  const corpus_md5 = await sha256Hex(inputs.map((r) => r.text).sort().join("\n"));
  return {
    ids: inputs.map((r) => r.id),
    by_kind: KINDS_INPUT.reduce((acc, k) => { acc[k] = inputs.filter((r) => r.kind === k).map((r) => r.id); return acc; }, {} as Record<string, string[]>),
    provenances: inputs.reduce((acc, r) => { acc[r.id] = r.provenance; return acc; }, {} as Record<string, string>),
    liveness: inputs.reduce((acc, r) => { acc[r.id] = "live"; return acc; }, {} as Record<string, string>),
    // 1a-4 (2026-10-07): the SOURCE CLASS of every row that was read, so the stored read says what
    // each of its inputs licensed — the same id→value shape as provenances and liveness above.
    classes: inputs.reduce((acc, r) => { acc[r.id] = r.source_class; return acc; }, {} as Record<string, string>),
    corpus_md5,
    count: inputs.length,
    // ruling 5: which selection built this read (absent on rows written before 2026-09-18 = physical-order selection)
    selection_version: SELECTION_VERSION,
    // P3 (2026-10-13): which GENERATION RULES wrote it. selection_version says which rows entered the
    // pool; this says which instructions turned them into prose. Attribution only — it retracts
    // nothing. Absent = written before the ruling.
    gen_rules_version: GEN_RULES_VERSION,
  };
}
const KINDS_INPUT = ["signal", "own_word", "finding", "delta"] as const;

// The cited-line walker lives in _shared/citedLines.ts (2026-10-14) so S1 at promote runs the SAME
// walk. Re-exported under its original name — the harness and the specs import it from here.
export { linesOfStoredPayload } from "../_shared/citedLines.ts";
import { linesOfStoredPayload } from "../_shared/citedLines.ts";

// A SHORT-REF catalogue: an LLM cannot reliably echo dozens of 36-char uuids (it mangles them), so
// each input gets a stable, kind-prefixed ref token (S1, O1, F1, M1, D1) mapped to its real id. The
// model cites refs; we validate refs against the map (unknown ref → reject, fail loud) and translate
// accepted refs BACK to the real ledger ids for storage, so stored citations resolve to the ledger.
const REF_PREFIX: Record<string, string> = { signal: "S", own_word: "O", finding: "F", delta: "D" };
// ── R3 (operator ruling, 2026-10-14): WHAT A CARRIED SPAN MAY BE CUT FROM ───────────────────────
// A span is a byte range into ONE stored row's text, re-verified at stage time by hashing that row
// again (rowTextOf + reReadRowTexts). So a span is only legitimate where a single stored row backs
// it. A DELTA has no such row: its pool text is composed here out of two claim statements
// (`[type] declared: "..." · public: "..."`), and rowTextOf has no delta table, so reReadRowTexts
// returns nothing for it and driftedSpans reports row_missing — every delta carry, always (defect B;
// Riverlane 99adc9d7, Brand AI 7ab1a1aa, SIAA fb2ac69f). Findings are class our_read and the class
// test already excludes them. Deltas STAY in the pool and stay citable: this bars them from being a
// span SOURCE, nothing else.
const SPAN_SOURCE_KINDS: ReadonlySet<string> = new Set(["signal", "own_word"]);
/** How a class is NAMED to the model in the catalogue (1a-4). */
export const CLASS_LABEL: Record<SourceClass, string> = { record: "the record", you: "you", our_read: "our read" };
// ── S2 (operator ruling, 2026-10-14): the catalogue collapses identical halves ──────────────────
// DISPLAY ONLY. 2269 of 3175 signals carry claim_text = evidence_excerpt, so rowTextOf's assembly
// (claim_text + " " + evidence_excerpt) renders them doubled. R1 made that text the pool's text on
// purpose — it is the one assembly the drift re-read can reproduce — so the fix belongs at the point
// of RENDERING, not in the text. Pool text, span offsets and row hashes stay exactly on rowTextOf;
// nothing a span is cut from or hashed against is touched here.
//
// ONE function for both catalogues (generator and judge), because two renderers would be the same
// mistake R1 just removed: the judge must read what the generator read.
/** A row's text with a duplicated second half collapsed to one copy. Display only. */
export function collapseHalves(text: string): string {
  const t = String(text ?? "");
  const mid = t.length / 2;
  if (!Number.isInteger(mid) || mid === 0) {
    // rowTextOf joins with a single space, so an exactly-doubled row has odd length: "X X".
    const sp = (t.length - 1) / 2;
    if (Number.isInteger(sp) && sp > 0 && t[sp] === " " && t.slice(0, sp) === t.slice(sp + 1)) return t.slice(0, sp);
    return t;
  }
  return t.slice(0, mid) === t.slice(mid) ? t.slice(0, mid) : t;
}
/** THE catalogue line, for the generator AND the judge. */
export function catalogueLine(ref: string, kind: string, cls: SourceClass, text: string, title: string | null): string {
  // R1 (2026-10-14): the source title is an ATTRIBUTE of the line, after the text, never inside it.
  // It used to be appended to r.text upstream, which put a span's offsets over words the source
  // never asserted and made the drift re-read impossible (defect A). The model still sees where the
  // row was found; a span is only ever cut from the text before this suffix.
  return `[${ref}] (${kind} · ${CLASS_LABEL[cls]}) ${collapseHalves(text).slice(0, 400)}${title ? ` — source: ${title}` : ""}`;
}

function buildCatalogue(inputs: InputRow[]): { text: string; uuidByRef: Map<string, string>; classByRef: Map<string, SourceClass>; textByRef: Map<string, string>; kindByRef: Map<string, string>; tokenSummary: string } {
  const uuidByRef = new Map<string, string>();
  const classByRef = new Map<string, SourceClass>();
  const textByRef = new Map<string, string>();
  // R3: the row KIND travels with the ref, so poolSpans can apply SPAN_SOURCE_KINDS. The ref prefix
  // already encodes it, but parsing a prefix back into a kind is a second statement of the mapping.
  const kindByRef = new Map<string, string>();
  const counters: Record<string, number> = {};
  const lines: string[] = [];
  for (const r of inputs) {
    const px = REF_PREFIX[r.kind] ?? "X";
    counters[px] = (counters[px] ?? 0) + 1;
    const ref = `${px}${counters[px]}`;
    uuidByRef.set(ref, r.id);
    classByRef.set(ref, r.source_class);
    textByRef.set(ref, r.text);        // the FULL row text, for the class fact-check (not the 400-char catalogue slice)
    kindByRef.set(ref, r.kind);        // R3: what kind of row this is, for the span-source law
    // 1a-4: the class rides WITH the line, so the model sees what each row licenses as it cites it.
    lines.push(catalogueLine(ref, r.kind, r.source_class, r.text, r.source_title ?? null));
  }
  // The exact valid token ranges, e.g. "S1–S20, O1–O25, F1–F13, D1–D15" — the model may cite ONLY these.
  const tokenSummary = Object.entries(counters).map(([px, n]) => (n === 1 ? `${px}1` : `${px}1–${px}${n}`)).join(", ");
  return { text: lines.join("\n"), uuidByRef, classByRef, textByRef, kindByRef, tokenSummary };
}

// Collect every ref token a payload cites (from any "citations"/"cite" array).
function citedRefs(payload: unknown): string[] {
  const out: string[] = [];
  const walk = (v: unknown, key?: string) => {
    if (Array.isArray(v)) { if (key && /citation|cite|refs?$|ids$/i.test(key)) { for (const x of v) if (typeof x === "string") out.push(x.trim()); } else for (const x of v) walk(x); }
    else if (v && typeof v === "object") for (const [k, val] of Object.entries(v)) walk(val, k);
  };
  walk(payload);
  return [...new Set(out)];
}

// ── PER-FIELD CLASS (1a-4, signed 2026-10-07) ────────────────────────────────────────────────────
// Every field that cites gets a sibling `<field>_class` (or `class`, for a field whose citation key is
// the bare `citations`/`refs`) = inheritedClass of its refs, WEAKEST-wins. COMPUTED, never model-set:
// the model is never asked for a class and anything it volunteered under these keys is overwritten.
// An UNCITED field gets NO class — it is required to be empty by the existing cited-or-omitted rule,
// so there is nothing for a class to license.
const CITE_KEY_TO_CLASS_KEY = (key: string): string | null => {
  if (key === "citations" || key === "cite" || key === "refs" || key === "ref") return "class";
  const m = /^(.*?)_(?:citations|cites?|refs?)$/.exec(key);
  return m ? `${m[1]}_class` : null;
};
export type StampedField = {
  field: string; cls: SourceClass; refs: string[]; text: string;
  /** the object that holds the citation array, and its key — so a row admitted from the live
   *  record can be APPENDED to the field's own citations rather than justified silently. */
  obj: Record<string, unknown>; citeKey: string; textKey: string;
};
const CITE_OR_CLASS_KEY = /citation|cites?$|refs?$|ids$|_class$|^class$/i;
/** The TEXT of the field that cites, beside its citation key. Three shapes exist in these payloads:
 *    market_category_citations → market_category          (base names the value exactly)
 *    value_citations           → value_for_customer       (base is a PREFIX of the value key)
 *    citations / refs          → text | statement         (an array element, no named base)
 *  The prefix case is why this is not a one-line lookup: `value_citations` and `best_fit_citations`
 *  do not name their value keys, and resolving them to "" made the fact-check skip two whole rungs.
 *  Returns "" only when nothing resolves, which decideFieldClass treats as a refusal, not a pass. */
function resolveFieldText(obj: Record<string, unknown>, base: string): { key: string; text: string } {
  const str = (v: unknown) => (typeof v === "string" ? v : null);
  if (base) {
    const exact = str(obj[base]);
    if (exact !== null) return { key: base, text: exact };
    // the prefix case, deterministic: the shortest non-citation key starting with `<base>_`
    const prefixed = Object.keys(obj)
      .filter((k) => k.startsWith(`${base}_`) && !CITE_OR_CLASS_KEY.test(k) && str(obj[k]) !== null)
      .sort((a, b) => a.length - b.length)[0];
    if (prefixed) return { key: prefixed, text: str(obj[prefixed])! };
  }
  for (const k of ["text", "statement", "promise", "body"]) {
    const v = str(obj[k]);
    if (v !== null) return { key: k, text: v };
  }
  return { key: "", text: "" };
}
/** Mutates `payload` in place, stamping each citing field's class. Returns one entry per citing
 *  field — its class, the refs it cited and its own TEXT — which is what the class fact-check needs. */
function stampFieldClasses(payload: unknown, classByRef: ReadonlyMap<string, SourceClass>, path = ""): StampedField[] {
  const out: StampedField[] = [];
  const walk = (v: unknown, at: string): void => {
    if (Array.isArray(v)) { v.forEach((x, i) => walk(x, `${at}[${i}]`)); return; }
    if (!v || typeof v !== "object") return;
    const obj = v as Record<string, unknown>;
    for (const [k, val] of Object.entries(obj)) {
      const classKey = CITE_KEY_TO_CLASS_KEY(k);
      if (classKey && Array.isArray(val)) {
        const refs = val.filter((x): x is string => typeof x === "string").map((x) => x.trim());
        const cls = inheritedClass(refs, classByRef);
        if (cls) {
          obj[classKey] = cls;
          // A BARE `citations`/`refs` key has no named base — the element's text is text/statement.
          const base = classKey === "class" ? "" : classKey.replace(/_class$/, "");
          const fieldName = classKey === "class" ? (at || "(root)") : `${at ? `${at}.` : ""}${base}`;
          const rt = resolveFieldText(obj, base);
          out.push({ field: fieldName, cls, refs, text: rt.text, obj, citeKey: k, textKey: rt.key });
        } else {
          delete obj[classKey];           // uncited ⇒ no class, and never a stale one
        }
        continue;
      }
      walk(val, k === "items" || k === "open_questions" || Array.isArray(val) ? `${at ? `${at}.` : ""}${k}` : at);
    }
  };
  walk(payload, path);
  return out;
}

// Deep-copy a payload, replacing every citation ref token with its real ledger uuid (unknown refs are
// already rejected upstream, so every ref resolves here).
// translateCitations / hostOf / OfferingSeenOn / deriveOfferingSeenOn MOVED to ../_shared/publicReadStorage.ts (Part F, 2026-09-18):
// the ONE builder of what a read row stores (buildStoredPayloads) — stage and direct write insert the same enriched payload.

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const OLLAMA_BASE_URL = Deno.env.get("OLLAMA_BASE_URL") ?? "http://host.docker.internal:11434/v1";
    if (!isLocalOllamaUrl(OLLAMA_BASE_URL)) {
      return json({ error: "Local-only policy violation: OLLAMA_BASE_URL must be localhost/host.docker.internal." }, 412);
    }
    const body = await req.json().catch(() => ({}));
    const company_id = String(body.company_id ?? "");
    if (!company_id) return json({ error: "company_id is required" }, 400);
    if (company_id === CB1_FROZEN_ID) return json({ error: "frozen reference company — never written" }, 403);
    const doPlan = body.plan === true;
    const doStage = body.stage === true;                 // Gate 6a two-phase: write NOT-current, await accept
    const doPromote = body.promote === true;             // Gate 6a: flip the staged rows current + supersede
    const doWrite = body.write !== false && !doPlan && !doStage && !doPromote;
    const probeId: string | null = typeof body._probe_internal_id === "string" ? body._probe_internal_id : null;

    // ── KINDS-SCOPED RUN (2026-08-31, operator-signed): optional body.kinds narrows this run —
    //    generate/judge/stage/write/promote loops iterate ONLY the listed kinds. Omitted or [] ⇒ all
    //    three (existing behavior, non-breaking). An out-of-set entry is rejected loudly (400), never
    //    silently dropped. An UNLISTED kind is not generated, judged, staged, written, or superseded
    //    by this run — its current row is untouched. (Cascade-gap routing rides the strategy kind, so
    //    it too runs only when "strategy" is listed.) No kind's generation prompt/logic is changed.
    const rawKinds: unknown = body.kinds;
    let activeKinds: readonly Kind[] = DEFAULT_KINDS;
    if (rawKinds !== undefined && rawKinds !== null) {
      if (!Array.isArray(rawKinds)) return json({ error: "kinds must be an array of read kinds" }, 400);
      const bad = rawKinds.filter((k) => !(KINDS as readonly string[]).includes(String(k)));
      if (bad.length) return json({ error: `kinds must be a subset of: ${KINDS.join(", ")}`, bad_kinds: bad }, 400);
      if (rawKinds.length > 0) activeKinds = [...new Set(rawKinds.map(String))] as Kind[];
    }

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // ── PROMOTE (accept): no generation, no model call. Per kind, flip the staged row (is_current
    //    false→true) and supersede the prior current row (is_current true→false, superseded_by=staged).
    //    The staged row is the unique is_current=false row with superseded_by NULL (staging created it).
    if (doPromote) {
      // ruling 6 (2026-09-18): the ONE promote path (publicReadPromote.ts) — flips rows AND, for a promoted strategy,
      // re-routes the cascade gaps from the staged row's cascade_source + judge coherence via writeCascadeGaps.
      try {
        const { promoted, cascade_routing } = await promoteStagedReads(supabase, company_id, activeKinds);
        // Part B (2026-10-12): the promote writes its own audit row per kind, AFTER the flip. This
        // branch returns before recordKindIntegrity is defined (and that helper closes over `ledger`,
        // which promote never builds), so the row comes from recordPromoteIntegrity — same component
        // name, same excluded_by_rule shape, mode 'promote', plus the ids and the reversal.
        await recordPromoteIntegrity(supabase, company_id, promoted, cascade_routing);
        return json({ ok: true, promoted, cascade_routing });
      } catch (e) {
        // FAIL CLOSED (amendment 2026-09-18): a refused promote names the read; nothing was flipped or routed for it.
        if (e instanceof PromoteRefused) {
          await recordPromoteRefusal(supabase, company_id, e.kind, e.readId, e.message);
          return json({ ok: false, error: e.message, refused: { kind: e.kind, read_id: e.readId } }, 409);
        }
        throw e;
      }
    }

    const { inputs, dropped } = await selectPublicInputs(supabase, company_id);
    const ledger = await ledgerOf(inputs);
    const ledgerIds = new Set(ledger.ids);

    // ── VACUOUS PROOF hook: prove a planted internal id is absent from every query's output + ledger.
    if (probeId) {
      // look up what the probe id actually IS (its provenance) — expected internal, NOT public.
      // Stage B: the probe does NOT read odi_market_definitions (a FORBIDDEN table — the source-level
      // test greps this file for 0 hits). A planted markets-table id therefore reports probe_found_as
      // null; the proof is the invariant `in_ledger:false` + `ledger_all_public:true`, not the lookup.
      let probeFoundAs: string | null = null;
      const { data: c } = await supabase.from("claims").select("id").eq("id", probeId).maybeSingle();
      if (c) probeFoundAs = "claim(internal_declared side)";
      return json({
        ok: true, vacuous_proof: true, probe_id: probeId, probe_found_as: probeFoundAs,
        in_ledger: ledgerIds.has(probeId),
        ledger_count: ledger.count,
        ledger_all_public: ledger.ids.every((id) => require_public(ledger.provenances[id])),
        ledger_provenances_distinct: [...new Set(Object.values(ledger.provenances))].sort(),
      });
    }

    // ── ROUTER: one decision over the provenance of EVERY gathered input. All-public → external. ─────
    const genChoice = resolveModel({ role: "generator", inputs: inputs.map((r) => ({ provenance: r.provenance })) });
    const judgeChoice = resolveModel({ role: "judge", inputs: inputs.map((r) => ({ provenance: r.provenance })) });

    if (doPlan) {
      return json({
        ok: true, plan: true, input_ledger: ledger,
        // ruling 5: what the selection refused and why (ids only; plan is read-only)
        selection: { version: SELECTION_VERSION, dropped_by_kind: KINDS_INPUT.reduce((acc, k) => { acc[k] = dropped.filter((d) => d.kind === k).map((d) => ({ id: d.id, reason: d.reason })); return acc; }, {} as Record<string, Array<{ id: string; reason: string }>>) },
        model: { generator: genChoice, judge: judgeChoice },
        catalogue_preview: inputs.slice(0, 8).map((r) => ({ id: r.id, kind: r.kind, preview: r.text.slice(0, 100) })),
      });
    }

    if (inputs.length === 0) {
      // Whole-run empty is still a REJECT, and it is now visible per kind like every other guard.
      const detail = "no public inputs for this company";
      for (const kind of activeKinds) {
        console.log(rejectLogLine(company_id, kind, "empty_inputs", detail));
        try {
          const base = {
            company_id, component: `first_read_public_read_${kind}`, examined: 0, admitted: 0,
            excluded_by_rule: { kind, guard: "empty_inputs", detail, mode: doStage ? "stage" : (doWrite ? "write" : "dry_run") },
            error: `guard=empty_inputs detail=${detailOf(detail)}`, run_ref: null,
          };
          const { error } = await supabase.from("integrity_runs").insert({ ...base, status: "rejected" });
          if (error) await supabase.from("integrity_runs").insert({ ...base, status: "failed" });
        } catch { /* observability must never break the pipeline */ }
      }
      const perKind = Object.fromEntries(activeKinds.map((k) => [k, { status: "rejected", guard: "empty_inputs", detail }]));
      return json({ ok: false, status: "empty", reason: detail, per_kind: perKind, rejected: activeKinds.map((kind) => ({ kind, guard: "empty_inputs", detail })) });
    }

    const usage: OpenAIUsage = { prompt_tokens: 0, completion_tokens: 0 };
    const callLocal = async (model: string, system: string, user: string, temperature: number): Promise<Record<string, unknown>> => {
      const res = await fetch(`${OLLAMA_BASE_URL}/chat/completions`, {
        method: "POST", headers: { Authorization: "Bearer ollama", "Content-Type": "application/json" },
        body: JSON.stringify({ model, temperature, messages: [{ role: "system", content: system }, { role: "user", content: user }] }),
      });
      if (!res.ok) throw new Error(`ollama ${model} ${res.status}: ${(await res.text()).slice(0, 300)}`);
      const data = await res.json();
      const content = String(data?.choices?.[0]?.message?.content ?? "");
      const mm = content.match(/\{[\s\S]*\}/);
      if (!mm) throw new Error(`${model} returned no JSON: ${content.slice(0, 200)}`);
      return JSON.parse(mm[0]) as Record<string, unknown>;
    };
    const run = async (choice: typeof genChoice, system: string, user: string, temperature: number): Promise<Record<string, unknown>> => {
      if (choice.provider === "external_openai") {
        // Large public catalogues (hundreds of inputs) push a single call past the 60s default — give it room.
        const r = await withRetry429(() => callOpenAIJson({ model: choice.model, system, user, temperature, timeoutMs: 180_000 }));
        usage.prompt_tokens += r.usage.prompt_tokens; usage.completion_tokens += r.usage.completion_tokens;
        const mm = r.content.match(/\{[\s\S]*\}/);
        if (!mm) throw new Error(`openai ${choice.model} returned no JSON: ${r.content.slice(0, 200)}`);
        return JSON.parse(mm[0]) as Record<string, unknown>;
      }
      return callLocal(choice.model, system, user, temperature);
    };

    const { text: CAT, uuidByRef, classByRef, textByRef, kindByRef, tokenSummary } = buildCatalogue(inputs);
    // The ref set and the catalogue TEXT both grow when a row is admitted from the live record,
    // so guard 1 accepts the new token and the judge can see the line it cites.
    const validRefs = new Set(uuidByRef.keys());
    let CAT_LIVE = CAT;
    /** rows admitted from outside the pool, for the report and the ledger */
    const admitted: Array<{ ref: string; id: string; kind: string; cls: string; sourced: string[] }> = [];
    const CITE_RULE = `Cite ONLY tokens that appear VERBATIM in the LEDGER below — each printed in square brackets at the start of its line (e.g. [S1], [O3], [F2], [D1]). The valid tokens are exactly these families and NO others: ${tokenSummary} (S… = signals, O… = own-words, F… = findings, D… = deltas). Any token NOT printed in the ledger INVALIDATES THE WHOLE RESPONSE — this includes a position/ordinal number, an "Item N" reference to your own output, and any "I…" / "INPUT…" / "L…" prefix. There is no "I" family; never invent one. Copy each token EXACTLY as shown and cite AT MOST 3 per claim. If the public record does not support a field, return it empty ("" or []) with no citations — never guess or invent a token. Each ledger line names its SOURCE CLASS after its kind: the record (outside voices, filings), you (the company's own site and own words), or our read (our analysis of the record). A line you write may assert only as much as the weakest class it cites. Cite our-read rows freely — they are what makes this worth discussing — but a line resting on our read is written as our reading ('we read you as…'), never as an established fact.`;

    // ── SPECIFICS (operator ruling, signed 2026-10-08) ─────────────────────────────────────────
    // The class gate refuses a field that states a specific our read cannot source. Until now the
    // generator was never told the rule: the prompts said "state as a hypothesis" and nothing about
    // specifics, so the model wrote "sole Level 14 residential facility" where the record says "the
    // only level 14 residential facility" and the gate — correctly — refused it. This block is the
    // rule, referenced from every GEN_* and from the slots shorten instruction.
    //
    // THREE EDITS to the proposed text, each reported:
    //   1. the example names no ref TOKEN. Tokens are assigned per run (buildCatalogue counts per
    //      kind in input order), so a static "S4" points at a different row every time and would
    //      teach the model to cite a number rather than a row.
    //   2. the hedge example gained "in the Bay Area". A specific at the END of a sentence has no
    //      right-hand window, so the gate can build no probe for it and it can never clear (b) —
    //      "serving children under 12" fails on the figure 12 even with the row that carries it
    //      cited. With the scope restored the same sentence clears. (The gate's blindness to a
    //      trailing specific is reported separately; the gate is frozen in this brief.)
    //   3. one sentence added: cite the row whose words you used. The live failure was a CITATION
    //      omission as much as a wording one — the under-12 claim was made while citing two findings
    //      and the mightycause row, and never the filing row that actually carries it.
    // ── P1 (operator ruling, 2026-10-13): rewritten for the FIXED figure gate ───────────────────
    // The old rule was written when a percentage could not be sourced at all (the FIGURE_RE defect,
    // fixed 2026-10-13), so it taught the model to retreat: clause (2) offered a hedge as an equal
    // alternative to omission, and clause (4) told it to prefer the plain claim over a superlative
    // the record carries. Both did exactly what they said on the first run under the fixed gate —
    // "the first kinship program in the country" came back as "a nationally pioneering kinship
    // program", and a sourced differentiator was dropped because nothing said to keep it.
    //
    // The three changes: a SOURCED specific is stated as its row states it (2); an UNSOURCED one is
    // left out and NOT hedged (3); and the differentiator count is pinned to the current read (7).
    // Nothing here loosens the gate — (1) still requires the row and the citation.
    const SPECIFICS_RULE = `SPECIFICS. A specific is a superlative, an exclusivity word, a figure, or a reach claim (a place or market you say you cover).
(1) Use a specific only in the exact words of a ledger row whose class is 'the record' or 'you', and CITE THAT ROW. If you use a row's words, its token must be in that field's citations — a specific sourced to a row you did not cite reads as unsourced.
(2) A specific that appears in such a row is STATED AS THAT ROW STATES IT. Do not soften it, generalise it, or turn it into a reading: if a row says 'the longest-running apprenticeship in the state', write that and cite the row — never 'a long-established apprenticeship program'. A sourced fact is the record speaking, and hedging it misreports the record.
(3) A specific you cannot find in any cited row of class 'the record' or 'you' is LEFT OUT. Do not write it as our reading instead — a reading is for a judgement we are making, not for a fact we could not source.
(4) Never strengthen a source: 'one of the only' stays 'one of the only'; it never becomes 'the only' or 'sole'.
(5) When the record carries both a superlative and a plain claim for the SAME fact, use the one the row states. Prefer the plain claim only when no row states the superlative.
(6) Keep the scope the row states. Do not end a claim on a bare number — 'serving youth under 12 in the Bay Area' carries the row's scope, 'serving youth under 12' drops it.
(7) Besides the lines listed as ALREADY WRITTEN, keep every differentiator you can source from the ledger; dropping a sourceable one is a loss, not a simplification.
EXAMPLE. A row of class 'the record' says 'the only level 14 residential facility in northern California'. Write: 'the only Level 14 residential facility in Northern California' and cite that row. Do NOT write 'sole' and do NOT write 'a high-acuity residential facility'. If NO row carries the under-12 CSU claim, leave it out.`;
    // ── GENERATE each kind ───────────────────────────────────────────────────────────────────────
    const GEN_POSITIONING = `You read a company's PUBLIC record and state its positioning as a hypothesis for the room to test. ${CITE_RULE}
${SPECIFICS_RULE}
Return ONLY JSON:
{"market_category":"<a plain-language category this business ACTUALLY IS — e.g. 'neighborhood cafe & roaster', not a fancy or aspirational label>","market_category_citations":["<id>"],
 "value_for_customer":"<what a customer gets, in plain words>","value_citations":["<id>"],
 "best_fit_customers":"<who it's for>","best_fit_citations":["<id>"],
 "unique_attributes":[{"text":"<one differentiator>","citations":["<id>"]}]}
${US_ENGLISH_RULE}`;
    // Stage B — the FULL Playing-to-Win cascade (5 rungs), read as THE STRATEGY THE PUBLIC RECORD
    // IMPLIES (a reading, never a go-forward proposal). Each rung is cited-or-OMITTED: a rung the
    // public record can't ground is returned EMPTY (""/[]) with empty citations — never guessed. An
    // omitted rung is routed to the Questions beat downstream (cascade_gap), never fabricated here.
    const GEN_STRATEGY = `You read a company's PUBLIC record and state, as a hypothesis, THE STRATEGY ITS PUBLIC RECORD IMPLIES — using Roger Martin's Playing-to-Win cascade (five linked choices). This is a READING of what the record points to, never a recommendation or a go-forward plan. ${CITE_RULE}
${SPECIFICS_RULE}
CRITICAL — cited-or-omitted: if the public record does not GROUND a rung, return it EMPTY ("" for a text rung, [] for a list rung) with empty citations. Do NOT invent capabilities or management systems that the record doesn't show. It is EXPECTED and correct for a rung to be empty.
Return ONLY JSON:
{"winning_aspiration":"<what winning looks like for this business, plainly>","winning_aspiration_citations":["<id>"],
 "where_to_play":"<the arena the record implies — who / where / which segment>","where_to_play_citations":["<id>"],
 "how_to_win":"<the edge the record implies — how it wins where it plays>","how_to_win_citations":["<id>"],
 "must_have_capabilities":[{"text":"<one capability the record actually shows the business has/needs to win this way>","citations":["<id>"]}],
 "management_systems":[{"text":"<one system/process/measure the record shows runs the strategy — rarely visible in a public record; return [] if none is shown>","citations":["<id>"]}]}
${US_ENGLISH_RULE}`;
    const GEN_PROMISE = `You read a company's PUBLIC record and state, in ONE sentence, what the customer is promised — stated ONLY as far as the record backs it. ${CITE_RULE}
${SPECIFICS_RULE}
Return ONLY JSON: {"promise":"<one sentence>","citations":["<id>"]}
${US_ENGLISH_RULE}`;
    // OFFERING (2026-09-01) — ENUMERATE what the public record shows THIS COMPANY currently puts in
    // front of the people it serves: products / services / programs / formats / channels. This is a
    // catalogue of concrete offerings AS THE RECORD SHOWS THEM — never a strategy statement, never
    // intent, never a quality judgment. Cite every item; OMIT anything uncited. Currency/entity doubts
    // go in open_questions (never inside an item statement). ATTRIBUTE ONLY TO THIS COMPANY.
    const GEN_OFFERING = `You read a company's PUBLIC record and ENUMERATE what it currently puts in front of the people it serves — its offerings: products, services, programs, formats, and channels, exactly as the record shows them. ${CITE_RULE}
${SPECIFICS_RULE}
STRICT RULES:
- ENUMERATE, don't strategize: each item names ONE concrete thing offered (e.g. "small-batch roasted coffee", "residential crisis stabilization program", "wholesale café supply"). NOT a positioning line, NOT a value claim, NOT intent, NOT a quality/verdict word.
- CITED-OR-OMITTED: every item MUST cite at least one token in its "refs" array, and every token MUST be one printed in the LEDGER (e.g. [S3], [O4], [F1], [D1]). If you cannot cite it from the ledger, DO NOT include it. NEGATIVE EXAMPLE — never write refs like ["I11"], ["Item 11"], or ["11"]: there is no "I" family and item positions are NOT tokens; any such token invalidates the whole response.
- ATTRIBUTE ONLY TO THIS COMPANY: if the record shows an offering that belongs to a CO-LOCATED, PARTNER, or THIRD-PARTY entity (a different business at the same address, a supplier, a marketplace), EXCLUDE it from items and instead raise it as an open_question with reason:"entity".
- DOUBTS GO IN open_questions, never in an item: if the record raises a CURRENCY doubt (a dated closure, a management change, a possibly-retired program) or an ENTITY doubt, put it in open_questions with reason:"currency" or "entity" and cite it. Never write a doubt as a verdict inside an item statement.
- Do NOT output any "seen_on" / "source"/"where" field — those are derived downstream from your refs, not by you.
- If the public record shows NO attributable offering, return items:[] (an honest empty is correct).
Return ONLY JSON:
{"items":[{"label":"<≤8 words>","statement":"<one sentence: what is put in front of whom, in the record's own terms>","refs":["<token>"],"kind_hint":"product|service|program|format|channel|platform"}],
 "open_questions":[{"text":"<the doubt, as a question>","refs":["<token>"],"reason":"currency|entity|other"}]}
${US_ENGLISH_RULE}`;

    // Stage B — the CURRENT positioning read (public_reads, is_current) is the How-to-Win CONTEXT for
    // the strategy cascade (brief §4). It is public BY CONSTRUCTION (this generator only ever writes
    // public_reads from public inputs), so it never introduces internal provenance. It is CONTEXT
    // only — not a citable ledger ref: how_to_win still cites raw public inputs (S/O/F/D), so grounding
    // is checked against the record, not against a prior synthesis restated.
    const { data: posCurrent } = await supabase.from("public_reads")
      .select("payload").eq("company_id", company_id).eq("kind", "positioning").eq("is_current", true).maybeSingle();
    const posCtx = (posCurrent as { payload?: Record<string, unknown> } | null)?.payload ?? null;
    const positioningContext = posCtx
      ? `\n\nThe company's PUBLIC positioning read (already public-derived — use ONLY to frame how_to_win; do NOT restate it, do NOT cite it):\n` +
        `category: ${String(posCtx.market_category ?? "")}\nvalue: ${String(posCtx.value_for_customer ?? "")}\n` +
        `differentiators: ${Array.isArray(posCtx.unique_attributes) ? (posCtx.unique_attributes as Array<{ text?: string }>).map((a) => a?.text).filter(Boolean).join("; ") : ""}`
      : "";

    // ── PER-KIND ISOLATION (2026-09-09) ─────────────────────────────────────────────────────────
    //  Each kind is generated, guarded, judged and written ON ITS OWN. A reject records that kind's
    //  rejected integrity row + log line and the NEXT kind still runs. Every guard and the judge are
    //  unchanged — same functions, same thresholds, same prompts; only the SCOPE narrows to one kind
    //  (exactly what a kinds-scoped run already did) and rejects are now visible. See
    //  ../_shared/publicReadPerKind.ts for the isolation contract and its one admission consequence.
    const genSys: Record<Kind, string> = { positioning: GEN_POSITIONING, strategy: GEN_STRATEGY, promise: GEN_PROMISE, offering: GEN_OFFERING };

    // The judge prompt, built for ONE kind — byte-identical to what a kinds-scoped single-kind run
    // produced before (offeringActive is now "is this kind the offering kind").
    const judgeSysFor = (kind: Kind): string => {
      const offeringActive = kind === "offering";
      const OFFERING_JUDGE_CLAUSE = offeringActive
        // 1a-4: CLASS takes (e) by signature, so the offering clause moved from (e)–(h) to (f)–(i).
      // Its four CHECKS and its four verdict flags are unchanged — only the letters shift.
      ? `\n(f)–(i) OFFERING (the "offering" read is a CATALOGUE of what the company puts in front of customers):
(f) ENUMERABLE — every item names a concrete offering (product/service/program/format/channel), NOT a strategy line, value claim, or intent;
(g) ENTITY ATTRIBUTION — every item's cited inputs describe THIS company's own offering; if ANY item actually describes a CO-LOCATED / partner / third-party entity's offering, set entity_attribution_ok:false;
(h) DOUBTS-PLACED — currency/entity doubts live in open_questions (with a reason), never phrased as a verdict inside an item statement;
(i) BANNED-VOCAB — no verdict/currency/status words (confirmed, disputed, stale, closed, retired, underserved, …) appear inside any item statement.`
        : "";
      const OFFERING_VERDICT_FIELD = offeringActive
        ? `,\n "offering":{"enumerable_ok":true|false,"entity_attribution_ok":true|false,"doubts_placed_ok":true|false,"banned_vocab_ok":true|false,"reason":"<one line>"}`
        : "";
      return `You judge a public-only "Our read" of a company (positioning, strategy, promise, and possibly an offering catalogue). Check:
(a) GROUNDING — every claim is supported by the cited inputs (the cited excerpts back it; nothing invented);
(b) PLAIN-SANITY — market_category names what this business ACTUALLY IS per its own words and outside signals (a coffee roaster is NOT "SaaS"; a clinic is NOT "marketplace"). Reject an absurd or aspirational category. If positioning is not in this read, set sanity_ok:true;
(c) CONSISTENCY — the read describes the SAME business throughout and does not contradict itself. If only one kind is in this read, judge its internal consistency and set consistency_ok:true when coherent;
(d) CASCADE COHERENCE (strategy only, does NOT affect accept) — does how_to_win plausibly SERVE the stated where_to_play AND winning_aspiration? Does each must_have_capability plausibly SERVE how_to_win? A rung left empty is neither coherent nor incoherent — mark empty rungs coherent:true. Judge only NON-empty rungs on the merits.\n(e) CLASS — each field names its source class. A field of class 'our_read' must read as an openly-held reading, never as an established fact. A field of class 'record' may say what the record shows. A field of class 'you' may say what the company says. Set class_ok:false on any field that asserts more than its class allows, naming the words that do it. A sentence that states a superlative, figure or exclusivity as fact is NOT an openly-held reading, whatever its citations say.${OFFERING_JUDGE_CLAUSE}
Respond with ONLY JSON:
{"grounding_ok":true|false,"sanity_ok":true|false,"consistency_ok":true|false,
 "per_kind":{"positioning":{"ok":true|false,"reason":"..."},"strategy":{"ok":true|false,"reason":"..."},"promise":{"ok":true|false,"reason":"..."}},
 "cascade_coherence":{"how_to_win":{"coherent":true|false,"reason":"<one line: does it serve where-to-play + aspiration?>"},
   "capabilities":[{"text":"<echo the capability text>","coherent":true|false,"reason":"<one line: does it serve how-to-win?>"}]}${OFFERING_VERDICT_FIELD},
 ,
 "class":{"class_ok":true|false,"fields":[{"field":"<the field name as given in FIELD CLASSES>","class":"record|you|our_read","class_ok":true|false,"reason":"<ok, or the words that assert more than the class allows>"}]},
 "accept":true|false,"reason":"<one line>"}`;
    };

    // Legacy market_read pointers — read ONCE, before any write, so a per-kind write sees the same
    // legacy row the whole-run write saw.
    const { data: legacyCanvas } = await supabase.from("positioning_canvases").select("id").eq("company_id", company_id).eq("artifact_role", "market_read").maybeSingle();
    const { data: legacyCascade } = await supabase.from("strategy_cascades").select("id").eq("company_id", company_id).eq("artifact_role", "market_read").maybeSingle();
    const legacyFor = (k: Kind): string | null =>
      k === "strategy" ? ((legacyCascade as { id?: string } | null)?.id ?? null) : ((legacyCanvas as { id?: string } | null)?.id ?? null);

    // Company own-host set — read once, used by the offering seen_on derivation.
    const { data: coRow } = await supabase.from("companies").select("website").eq("id", company_id).maybeSingle();
    const ownHost = hostOf((coRow as { website?: string | null } | null)?.website ?? null);
    const ownHosts = new Set<string>(ownHost ? [ownHost] : []);
    const refMeta = buildRefMeta(inputs, ownHost);
    // The own-site record (rule 2026-09-18): the offering's "Named on your own site" is earned against it.
    const ownSiteRecord = await loadOwnSiteRecord(supabase, company_id, ownHost);
    const refUrl = (id: string) => inputs.find((r) => r.id === id)?.source_url ?? null;

    const payloads: Partial<Record<Kind, Record<string, unknown>>> = {};

    /** C1/C2: the continuity block per kind — stored on the integrity row and returned (D3). */
    const continuityBlocks: Partial<Record<Kind, ContinuityBlock>> = {};
    /** D1: generated differentiators removed as restatements of a carried line, for the ledger. */
    const restatedCarried: Array<{ generated_text: string; carried_path: string }> = [];
    /** Q4: sha256 of the exact prompt each kind was generated from (system + user, ledger included).
     *  The TEXT is deliberately not stored — see the wall check at the model call. */
    const promptSha: Partial<Record<Kind, string>> = {};
    /** V1-R4: how much live record the pre-generation span search read, per kind. */
    const carrySearch: Partial<Record<Kind, { lines: number; considered: number; admitted: number }>> = {};
    /** S1 (2026-10-14): the per-field sourcing results for the LAST payload gated for each kind —
     *  reported and stored whether S1 refused or a later guard did. */
    const s1Results: Partial<Record<Kind, S1Result[]>> = {};
    /** V1: the carried block per kind, and the carries themselves for the splice. */
    const carriedBlocks: Partial<Record<Kind, CarriedBlock>> = {};
    const carriesByKind: Partial<Record<Kind, FieldCarry[]>> = {};
    const fieldClasses: Partial<Record<Kind, StampedField[]>> = {};          // 1a-4: per citing field, its class + refs + text
    const classDecisions: Partial<Record<Kind, FieldClassDecision[]>> = {};  // the tightening: (b) sourced, or judge_required
    /** Stamp a candidate payload's field classes and run (b) over it. Used for the FIRST answer and
     *  for a re-asked one, so a re-ask is decided by exactly the same rule — never a softer one.
     *  (b) runs FIRST and costs nothing: a field whose every specific is verbatim-sourced in a cited
     *  record/you row clears without a judgment. Our OWN rows are excluded from the sourcing
     *  evidence — our read cannot source itself. */
    /** Admit a row found in the LIVE RECORD to this read's ledger: it gets the next ref token of its
     *  kind, joins uuid/class/text lookup and the valid-ref set, is appended to the ledger's ids,
     *  by_kind, provenances, liveness and classes, and its line is appended to the catalogue the
     *  judge reads. Every downstream guard then sees it exactly as it sees a pool row — which is the
     *  point of admitting it rather than justifying a field against something it does not cite. */
    const admitSourcingRow = (row: SourcingRow): string => {
      const existing = [...uuidByRef.entries()].find(([, id]) => id === row.id);
      if (existing) return existing[0];
      const px = REF_PREFIX[row.kind] ?? "X";
      const next = 1 + Math.max(0, ...[...uuidByRef.keys()]
        .filter((r) => r.startsWith(px)).map((r) => Number(r.slice(px.length)) || 0));
      const ref = `${px}${next}`;
      uuidByRef.set(ref, row.id);
      classByRef.set(ref, row.cls);
      textByRef.set(ref, row.text);
      kindByRef.set(ref, row.kind);    // R3: SourcingRow.kind is already signal|own_word by type
      validRefs.add(ref);
      ledger.ids.push(row.id);
      (ledger.by_kind as Record<string, string[]>)[row.kind] =
        [...((ledger.by_kind as Record<string, string[]>)[row.kind] ?? []), row.id];
      (ledger.provenances as Record<string, string>)[row.id] = "public_observed";
      (ledger.liveness as Record<string, string>)[row.id] = "live";
      (ledger.classes as Record<string, string>)[row.id] = row.cls;
      ledger.count = ledger.ids.length;
      CAT_LIVE += `\n${catalogueLine(ref, row.kind, row.cls, row.text, null)}`;   // S2: one renderer
      return ref;
    };

    // ── V1 helpers: selection, and the splice ───────────────────────────────────────────────────
    const refByUuid = new Map<string, string>();
    for (const [ref, uuid] of uuidByRef) refByUuid.set(uuid, ref);

    /** The current read's cited lines for a kind, loaded once and shared with C1. */
    const currentLinesCache: Partial<Record<Kind, CitedLine[]>> = {};
    const currentLinesFor = async (kind: Kind): Promise<CitedLine[]> => {
      if (currentLinesCache[kind]) return currentLinesCache[kind]!;
      const { data } = await supabase.from("public_reads")
        .select("payload").eq("company_id", company_id).eq("kind", kind).eq("is_current", true).maybeSingle();
      const lines = linesOfStoredPayload((data as { payload?: Record<string, unknown> } | null)?.payload ?? null);
      currentLinesCache[kind] = lines;
      return lines;
    };

    /** Every usable span in THIS run's pool. Computed once per kind. */
    const poolSpans = async (): Promise<CarriedSpan[]> => {
      const out: CarriedSpan[] = [];
      for (const [ref, uuid] of uuidByRef) {
        // R3: the span-source law FIRST — a kind with no single stored row behind its text can never
        // be re-verified, so it is not a span source at all. Before the class test, because a delta
        // is class `record` and would otherwise sail straight through it.
        if (!SPAN_SOURCE_KINDS.has(String(kindByRef.get(ref) ?? ""))) continue;
        const cls = String(classByRef.get(ref) ?? "");
        if (cls !== "record" && cls !== "you") continue;   // rule 2, before any clause work
        const { spans } = await usableSpansOf(uuid, textByRef.get(ref) ?? "", cls);
        out.push(...spans);
      }
      return out;
    };

    const selectCarries = async (kind: Kind): Promise<FieldCarry[]> => {
      const current = await currentLinesFor(kind);
      if (current.length === 0) return [];               // nothing to anchor relevance on

      // ── V1-R4: the PRE-GENERATION admission, narrow ─────────────────────────────────────────
      // Search the live record for a row holding a usable span RELEVANT to each differentiator
      // line, and admit only the winners — through admitSourcingRow, so each lands in the
      // catalogue, the ledger and admitted_from_live_record exactly as a PASS 2 admission does.
      // Without this the carry sees only the base selection, and the span it needs most
      // (dfb6da68, which reaches a read through PASS 2) is invisible to it — refusal 9791.
      const diffLines = current.filter((l) => /^unique_attributes\[\d+\]$/.test(l.field ?? ""))
        .map((l) => ({ field: String(l.field), text: l.text }));
      if (diffLines.length > 0) {
        const alreadyInCatalogue = new Set([...uuidByRef.values()]);
        const { candidates } = await liveRecordCandidates(supabase, company_id, new Set<string>());
        const outside = candidates.filter((c) => !alreadyInCatalogue.has(c.id));
        const won = await searchLiveRecordForSpans(diffLines, outside);
        for (const w of won) {
          const ref = admitSourcingRow(w.row);
          admitted.push({ ref, id: w.row.id, kind: w.row.kind, cls: w.row.cls, sourced: [`carry:${w.field}`] });
          refByUuid.set(w.row.id, ref);
        }
        carrySearch[kind] = { lines: diffLines.length, considered: outside.length, admitted: won.length };
      }

      const pool = await poolSpans();
      if (pool.length === 0) return [];
      const out: FieldCarry[] = [];
      for (const line of current) {
        // only the differentiator paths carry in slice 1 — the narrative fields are compositions
        if (!/^unique_attributes\[\d+\]$/.test(line.field ?? "")) continue;
        const c = carryForLine(String(line.field), line.text, pool);
        if (c) out.push(c);
      }
      return out;
    };

    /** Assemble unique_attributes BY PATH (S1): a carried path takes its carry, the remaining paths
     *  take the model's returned lines in order. Never by the model's index — the prompt tells it
     *  not to write the carried lines, so its array is not index-aligned with the paths.
     *  The citations are REPLACED, not merged: a carried line's citations ARE its span's rows, so
     *  its inherited class is the span's class (record/you) and never our_read (V1-R3).
     *  The placement rule itself lives in _shared/carriedSpan.ts (assembleByPath); this resolves the
     *  span's row to a ledger ref and hands the pure assembly the two lists. */
    const spliceCarries = (payload: Record<string, unknown>, carries: readonly FieldCarry[]): Record<string, string> => {
      const modelLines = Array.isArray(payload.unique_attributes)
        ? payload.unique_attributes as Array<Record<string, unknown>> : [];
      const placements: CarryPlacement[] = carries.flatMap((c) => {
        if (!/^unique_attributes\[\d+\]$/.test(c.field)) return [];
        const citations = c.add_refs.map((u) => refByUuid.get(u)).filter((x): x is string => !!x);
        if (citations.length === 0) return [];           // the span's row is not in this run's catalogue
        return [{ field: c.field, text: c.stored_text, citations }];
      });
      if (placements.length === 0 && !Array.isArray(payload.unique_attributes)) return {};
      const { lines, placedAt, restated } = assembleByPath(modelLines, placements);
      payload.unique_attributes = lines;
      // D1: a removal is recorded, never silent. The ledger names the line that came out and the
      // carry it duplicated, so the read can be read back against what the model actually returned.
      if (restated.length > 0) restatedCarried.push(...restated);
      return placedAt;
    };

    const stampAndDecide = async (kind: Kind, p: Record<string, unknown>): Promise<FieldClassDecision[]> => {
      const stamped = stampFieldClasses(p, classByRef);
      fieldClasses[kind] = stamped;
      const decideOne = (f: StampedField) =>
        decideFieldClass({
          field: f.field, cls: f.cls, text: f.text,
          citedSourceTexts: f.refs
            .filter((r) => classByRef.get(r) === "record" || classByRef.get(r) === "you")
            .map((r) => textByRef.get(r) ?? ""),
        });
      // PASS 1 — the pool, as before: free, and it settles most fields.
      let decs = stamped.map(decideOne);

      // PASS 2 (ruling 2026-10-08) — the LIVE RECORD, only for what the pool could not source. A hit
      // is ADMITTED to the ledger and appended to the field's citations, then the field is re-decided
      // on the widened evidence. A miss stays a miss and still goes to the judge.
      for (let i = 0; i < decs.length; i++) {
        const d = decs[i];
        if (d.branch !== "judge_required") continue;
        const tokens = d.unsourced.filter((u) => u.kind !== "unresolved").map((u) => u.token);
        if (tokens.length === 0) continue;
        const f = stamped[i];
        const specifics = unsourcedSpecificsOf(f.text, tokens);
        const alreadyCited = new Set(f.refs.map((r) => uuidByRef.get(r) ?? "").filter(Boolean));
        const found = await searchLiveRecordForSpecifics(supabase, company_id, specifics, alreadyCited);
        sourcingSearch[kind] = {
          searched: found.searched,
          considered: (sourcingSearch[kind]?.considered ?? 0) + specifics.length,
        };
        if (found.hits.length === 0) continue;
        for (const hit of found.hits) {
          const ref = admitSourcingRow(hit);
          const cites = Array.isArray(f.obj[f.citeKey]) ? (f.obj[f.citeKey] as unknown[]).map(String) : [];
          if (!cites.includes(ref)) f.obj[f.citeKey] = [...cites, ref];
          f.refs = Array.isArray(f.obj[f.citeKey]) ? (f.obj[f.citeKey] as unknown[]).map(String) : f.refs;
          admitted.push({
            ref, id: hit.id, kind: hit.kind, cls: hit.cls,
            sourced: [...found.bySpecific.entries()].filter(([, h]) => h.id === hit.id).map(([t]) => t),
          });
        }
        decs[i] = decideOne(f);     // re-decide on the widened evidence
      }

      // PASS 3 (ruling 2026-10-08) — THE STAGE GATE. The promote fact-check used to be the last
      // line; it is now the gate, because the class judge cleared "unique" and "exclusive" on a
      // staged strategy row where neither word appears anywhere in 253 live signals or 258 own-words
      // rows. A specific that survives PASS 2 is in NO record/you row. Two very different things can
      // be true of it, and only one of them is hedgeable:
      //   carried by one of OUR OWN rows (a finding, an analysis row) → it is ours to hedge, and the
      //     judge still decides whether we hedged it. Branch stays judge_required.
      //   carried by NOTHING → UNSUPPORTED. It cannot be cited and it cannot be hedged into
      //     existence, so the field refuses here and the judge is never asked about it.
      for (let i = 0; i < decs.length; i++) {
        const d = decs[i];
        if (d.branch !== "judge_required") continue;
        const tokens = d.unsourced.filter((u) => u.kind !== "unresolved").map((u) => u.token);
        if (tokens.length === 0) continue;
        const specifics = unsourcedSpecificsOf(stamped[i].text, tokens);
        const ours = await specificsCarriedByOurOwnRows(supabase, company_id, specifics);
        const unsupported = d.unsourced.filter((u) => u.kind !== "unresolved" && !ours.has(u.token));
        if (unsupported.length > 0) {
          decs[i] = { ...d, branch: "unsupported", unsourced: unsupported };
        }
      }
      classDecisions[kind] = decs;
      return decs;
    };
    /** per kind, how much live record was searched — reported, never guessed */
    const sourcingSearch: Partial<Record<Kind, { searched: { signals: number; own_words: number }; considered: number }>> = {};
    /** Which kinds used their one re-ask, for the report. */
    const reasked: Partial<Record<Kind, { specifics: string[]; fields: string[] }>> = {};
    const storagePayloads: Partial<Record<Kind, Record<string, unknown>>> = {};
    const resolvedPayloads: Partial<Record<Kind, Record<string, unknown>>> = {};
    const verdicts: Partial<Record<Kind, Record<string, unknown>>> = {};
    const written: Array<{ kind: Kind; id: string; superseded: string | null }> = [];
    const staged: Array<{ kind: Kind; id: string }> = [];
    let derivedSeenOn: OfferingSeenOn[] | null = null;
    let cascadeItems: CascadeGapItem[] = [];
    let cascadeRouting: { superseded: number; inserted: number; run_id: string | null } = { superseded: 0, inserted: 0, run_id: null };

    // Part F (2026-09-18): the stored payload is built ONCE (publicReadStorage.buildStoredPayloads) — the direct write
    // inserts `stored`, stage inserts `staged` (= stored + cascade_source on a strategy row). The derived artifacts the
    // response reports (cascade items, offering seen_on) come from the same call.
    const prepareStorage = (kind: Kind, payload: Record<string, unknown>, verdict: Record<string, unknown>) => {
      const built = buildStoredPayloads({ kind, payload, verdict, uuidByRef, refMeta, ownHosts, ownSiteRecord, refUrl });
      if (kind === "strategy") cascadeItems = built.cascadeItems;
      if (kind === "offering") derivedSeenOn = built.derivedSeenOn;
      return built;
    };

    // ── ONE integrity row per kind: component first_read_public_read_<kind>. Observability only —
    //    it must NEVER turn a per-kind reject into a 500, so every failure here is swallowed. Status
    //    'rejected' needs the widened CHECK (migration 20260909180000); until that is applied the
    //    insert falls back to 'failed' with the guard preserved in `error`.
    const recordKindIntegrity = async (kind: string, row: {
      status: "completed" | "rejected"; guard?: string; detail?: string;
      payload?: Record<string, unknown> | null;
    }): Promise<void> => {
      // ── V4 (operator ruling, 2026-10-14): a refusal records WHAT IT REFUSED ────────────────────
      // Audits 10153 and 10190 name their guard and their reason but not the words that were
      // refused: the payload existed in runKindsIsolated and went only to the HTTP response, so the
      // refused text was unrecoverable the moment the response was gone. The full payload and the
      // citations it made now ride on the audit row, for every guard, on every refusal.
      const refusedPayload = row.status === "rejected" ? (row.payload ?? null) : null;
      const refusedCitations = refusedPayload
        ? [...new Set(citedRefs(refusedPayload))].map((ref) => ({ ref, id: uuidByRef.get(ref) ?? null }))
        : null;
      const base = {
        company_id, component: `first_read_public_read_${kind}`,
        examined: ledger.count, admitted: row.status === "completed" ? 1 : 0,
        // D3 (operator ruling, 2026-10-13): the continuity block is WRITTEN here and RETURNED below.
        // It was computed at the C1 site and then dropped on the floor — assigned to continuityBlocks
        // and read by nothing — so an accepted run could not show what it continued, and a refusal
        // showed only the guard's detail string. The block is what tells a clean run from a vacuous
        // one (required 0 means there was no read to continue), and it belongs on the audit row.
        excluded_by_rule: {
          kind, guard: row.guard ?? null, detail: row.detail ?? null,
          mode: doStage ? "stage" : (doWrite ? "write" : "dry_run"),
          continuity: continuityBlocks[kind as Kind] ?? null,
          restated_carried: restatedCarried,
          // V4: the refused read itself, and what it cited. Null on an accepted kind — the row that
          // was written IS the record there, and duplicating it would make the audit the source.
          refused_payload: refusedPayload,
          refused_citations: refusedCitations,
          // S1's per-field results, so a reader can see which specifics were tested and which failed
          // even when a LATER guard is the one that refused.
          s1: s1Results[kind as Kind] ?? null,
        },
        error: row.guard ? `guard=${row.guard} detail=${detailOf(row.detail ?? "")}` : null,
        run_ref: ledger.corpus_md5 ?? null,
      };
      // V4: EXACTLY ONE row. The old fallback inserted a second row when the first insert errored,
      // so a refusal could leave two audit rows for one refusal; the retry now reuses the same
      // single-row budget by downgrading the status, and never runs when the first insert succeeded.
      try {
        const { error } = await supabase.from("integrity_runs").insert({ ...base, status: row.status });
        if (!error) return;
        if (row.status === "rejected") {
          await supabase.from("integrity_runs").insert({ ...base, status: "failed" });
        }
      } catch { /* observability must never break the pipeline */ }
    };

    // FINALIZE an accepted kind. Runs for EVERY accepted kind (write, stage AND dry-run) so the
    // derived artifacts the response reports — the cascade spine + gaps, the offering seen_on — are
    // computed on every path exactly as the whole-run code computed them. Persistence is what the
    // mode decides: write inserts the STORAGE payload (strategy spine / offering with seen_on),
    // stage inserts the RAW translated payload except the strategy spine (unchanged from before),
    // and a dry-run persists nothing.
    const finalize = async (rawKind: string, payload: Record<string, unknown>, verdict: Record<string, unknown>): Promise<void> => {
      const kind = rawKind as Kind;

      // ── C1 / C2 (rulings 2026-10-13): the two stage-time checks, BEFORE any persistence ────────
      // They run here, at the top of finalize, so every persisting path is covered (stage AND the
      // direct write) and so they sit AFTER the re-ask — the re-ask repairs a CLASS refusal and
      // returns null for anything else, so neither of these gets one, which is the ruling.
      // They REFUSE and never rewrite: a throw here is caught by runKindsIsolated, which records the
      // kind as rejected and leaves every sibling untouched.
      //
      // The ref-token/UUID boundary matters. fieldClasses[kind] carries REF TOKENS (S21…) because
      // that is what the model echoes; the stored payload and the current read carry UUIDs. So the
      // staged lines are mapped through uuidByRef before anything is compared.
      const toUuid = (r: string) => uuidByRef.get(r) ?? r;
      // C1-A: the field path travels with the line. A carried line continues by anchor, and the
      // anchor is this path — so dropping it here would make every carried line un-continuable.
      const stagedLines: CitedLine[] = (fieldClasses[kind] ?? []).map((f) => ({
        field: f.field, text: f.text, cls: f.cls, refs: f.refs.map(toUuid),
      }));
      const textByUuid: Record<string, string> = {};
      const classByUuid: Record<string, string> = {};
      for (const [ref, uuid] of uuidByRef) {
        textByUuid[uuid] = textByRef.get(ref) ?? "";
        classByUuid[uuid] = String(classByRef.get(ref) ?? "");
      }

      // ── V1 drift, FAIL CLOSED, before anything else ─────────────────────────────────────────
      // The spans were chosen against the pool as it was read at the top of this run. If a row's
      // text has moved since — or the row is gone — the carried line is no longer a carry, and it
      // must not be persisted on offsets into text that no longer says that. Mirrors
      // extract-own-words' snapshot_drift (index.ts:111).
      const carriedNow = carriedBlocks[kind] ?? {};
      if (Object.keys(carriedNow).length > 0) {
        const wanted = [...new Set(Object.values(carriedNow).flatMap((c) =>
          [c.primary.row_id, ...(c.second ? [c.second.row_id] : [])]))];
        // R6: the re-read rebuilds each row's text through rowTextOf — the SAME function that built
        // it at selection time, over every column that function reads. This loop used to select one
        // column per table and hash that, which is why row 9830 saw sha_drift on two rows that had
        // not moved. The re-read now asks the selection's own question.
        const rowTextNow = await reReadRowTexts(supabase, wanted);
        const drifted = await driftedSpans(carriedNow, rowTextNow);
        if (drifted.length > 0) {
          throw new StageRefusal(
            CARRIED_DRIFT_GUARD,
            drifted.map((d) => `${d.field} ${d.row_id.slice(0, 8)}:${d.why}`).join("; "),
          );
        }
      }

      // C2 — SOFTENING, on every our_read line of what we are about to store.
      // V2: the FULL line text, never a slice — the refusal must be able to say what it refused.
      const softened = stagedLines.flatMap((l) =>
        softenedSpecifics(l, textByUuid, classByUuid).map((h) => ({ field: l.text, ...h }))
      );

      // C1 — CONTINUITY, against the read this one would replace. No current read ⇒ nothing to
      // continue, and the block says so rather than passing vacuously.
      const { data: curRow } = await supabase.from("public_reads")
        .select("payload, input_ledger").eq("company_id", company_id).eq("kind", kind).eq("is_current", true).maybeSingle();
      const currentLines: CitedLine[] = linesOfStoredPayload((curRow as { payload?: Record<string, unknown> } | null)?.payload ?? null);
      const missing = droppedLines({
        currentLines, stagedLines,
        newLedgerIds: new Set(Object.keys(textByUuid)),
        textByRef: textByUuid, classByRef: classByUuid,
        carriedFields: new Set(Object.keys(carriedNow)),   // C1-A: which paths are the record's words
      });
      // ── C1-P (operator ruling, 2026-10-14): C1 is REPORT-ONLY against a pre-rules predecessor ──
      // Wasabi's stage was refused by C1 for dropping 5 of 6 lines of a read generated 2026-08-22:
      // b4c9e31a predates rules 2026-10-13.1, is wholly unclassed, and cites five ids no longer in
      // the pool. C1 asks "does the new read still say what the old one said", and that question is
      // only answerable when the old read was built under the same rules. Against an older read a
      // refusal blocks every company from ever leaving the old rules — the regeneration C1 exists to
      // protect would be impossible.
      //
      // So the DROPS ARE STILL COMPUTED and still recorded, in full, on the staged row's continuity
      // block and in the response. Nothing is hidden; the operator reads what the regeneration did
      // not carry forward and rules on it. Against a predecessor at 2026-10-13.1 or later, C1
      // refuses exactly as before.
      const predecessorRules = String(
        ((curRow as { input_ledger?: Record<string, unknown> } | null)?.input_ledger?.gen_rules_version) ?? "",
      );
      const c1Enforced = predecessorRules !== "" && predecessorRules >= "2026-10-13.1";
      const block: ContinuityBlock = {
        ...continuityBlock(currentLines.length, missing, softened),
        // the ruling's own fact, on the row: which mode C1 ran in and what decided it
        c1_mode: c1Enforced ? "enforced" : "report_only",
        predecessor_gen_rules_version: predecessorRules || null,
      } as ContinuityBlock;
      continuityBlocks[kind] = block;
      // V3: ONE refusal, ONE row. The check does NOT record its own integrity row — it throws a
      // typed StageRefusal, and runKindsIsolated records the row with the guard unchanged. Writing a
      // row here AND letting the wrapper write its own is what produced the duplicate pair 9712
      // (specific_softened) + 9713 (write_error) on the 2026-10-13 run.
      if (softened.length > 0) throw new StageRefusal(SOFTENING_GUARD, softeningDetail(softened));
      // C1-P: enforced against a rules-current predecessor; reported against an older or absent one.
      if (missing.length > 0 && c1Enforced) throw new StageRefusal(CONTINUITY_GUARD, continuityDetail(missing));

      const built = prepareStorage(kind, payload, verdict);
      const storage = built.storage;
      storagePayloads[kind] = storage;
      resolvedPayloads[kind] = built.stored;

      if (doStage) {
        // Part F: stage stores exactly what direct write stores (`stored`), plus cascade_source on a strategy row
        // (ruling 6) so promote re-derives the gap/tension set from the raw rungs; only is_current/superseded_by differ.
        const { data: ins, error: insErr } = await supabase.from("public_reads").insert({
          company_id, kind, payload: built.staged,
          // V1: the `carried` block records every carried span — sha/start/end, its class, and what
          // the field was chosen over — so the operator can see which lines are the record's words.
          input_ledger: {
            ...ledger, carried: carriedBlocks[kind] ?? {},
            restated_carried: restatedCarried,       // D1: what the model restated and we removed
            prompt_sha: promptSha[kind] ?? null,     // Q4: WHICH prompt wrote this read
          },
          model_provider: genChoice.provider, model_name: genChoice.model,
          judge_verdict: verdict, judge_model: judgeChoice.model,
          is_current: false, supersedes_legacy_row: legacyFor(kind),
        }).select("id").single();
        if (insErr) throw new Error(`stage insert failed (${kind}): ${insErr.message}`);
        staged.push({ kind, id: (ins as { id: string }).id });
        return;
      }
      if (!doWrite) return; // dry-run — derived, reported, nothing persisted

      const { data: prior } = await supabase.from("public_reads").select("id").eq("company_id", company_id).eq("kind", kind).eq("is_current", true).maybeSingle();
      const priorId = (prior as { id?: string } | null)?.id ?? null;
      if (priorId) {
        // free the (company,kind) is_current uniqueness before inserting the new current row
        const { error: upErr } = await supabase.from("public_reads").update({ is_current: false }).eq("id", priorId);
        if (upErr) throw new Error(`supersede-prior failed (${kind}): ${upErr.message}`);
      }
      const { data: ins, error: insErr } = await supabase.from("public_reads").insert({
        company_id, kind, payload: built.stored,
        // Q4: EVERY stored read is stamped, not only staged ones — a read with no prompt_sha is a
        // read nobody can attribute to a prompt, which is the gap Q4 exists to close.
        input_ledger: { ...ledger, prompt_sha: promptSha[kind] ?? null },
        model_provider: genChoice.provider, model_name: genChoice.model,
        judge_verdict: verdict, judge_model: judgeChoice.model,
        is_current: true, supersedes_legacy_row: legacyFor(kind),
      }).select("id").single();
      if (insErr) throw new Error(`insert failed (${kind}): ${insErr.message}`);
      const newId = (ins as { id: string }).id;
      if (priorId) await supabase.from("public_reads").update({ superseded_by: newId }).eq("id", priorId);
      written.push({ kind, id: newId, superseded: priorId });

      // Stage B — route THIS strategy read's gaps + tensions to the Questions beat (idempotent).
      // Tighter than the run-level flag it replaces: only a strategy read that passed every guard
      // and was actually written may supersede the live cascade_gap rows.
      if (kind === "strategy") {
        cascadeRouting = await writeCascadeGaps(supabase, company_id, cascadeItems, { provider: genChoice.provider, model: genChoice.model });
      }
      // OFFERING integrity (Stage B) — the persisted record an earned-empty offering renders from.
      if (kind === "offering") {
        const offItems = Array.isArray(storage.items) ? (storage.items as unknown[]) : [];
        const offOqs = Array.isArray(payload.open_questions) ? (payload.open_questions as unknown[]) : [];
        const ownCount = (derivedSeenOn ?? []).filter((s) => s.seen_on === "own_site").length;
        await writeOfferingIntegrity(supabase, company_id, {
          examined: ledger.count, admitted: offItems.length,
          excludedByRule: { items: offItems.length, own_site: ownCount, outside: offItems.length - ownCount, open_questions: offOqs.length, ledger_ids: ledger.count, mode: "write" },
        });
      }
    };

    /** judge class_ok per field, from the verdict's class.fields[] block. */
    const judgeHedgedByField = (verdict: Record<string, unknown>): Record<string, boolean | undefined> => {
      const block = (verdict?.class ?? null) as Record<string, unknown> | null;
      const fields = block && Array.isArray(block.fields) ? block.fields : [];
      const out: Record<string, boolean | undefined> = {};
      for (const f of fields) {
        const o = (f ?? {}) as Record<string, unknown>;
        if (typeof o.field === "string") out[o.field] = o.class_ok === true;
      }
      return out;
    };
    const classGateOk = (kind: string, verdict: Record<string, unknown>): boolean => {
      const decs = classDecisions[kind as Kind] ?? [];
      const hedged = judgeHedgedByField(verdict);
      return decs.every((d) => fieldClassOk(d, hedged[d.field]));
    };
    const outcomes = await runKindsIsolated(activeKinds, {
      citedRefs,
      // ── S1 (operator ruling, 2026-10-14) ──────────────────────────────────────────────────────
      // Every record- or you-classed line must carry its specifics verbatim in one of ITS OWN cited
      // rows. The sources are that line's refs, narrowed to class record/you (our read cannot
      // source the record) and with FINDINGS removed by kind — a finding is our synthesis, and the
      // ruling bars it outright, so it is excluded twice over rather than relying on its class.
      // stampFieldClasses is re-run here rather than reusing fieldClasses[kind]: the re-ask replaces
      // the payload, and S1 must judge the payload actually in front of it.
      s1Refusal: (kind, payload) => {
        const stamped = stampFieldClasses(payload, classByRef);
        const results = stamped.map((f) => s1Unsourced({
          field: f.field, cls: f.cls, text: f.text,
          citedSourceTexts: f.refs
            .filter((r) => {
              const cls = classByRef.get(r);
              if (cls !== "record" && cls !== "you") return false;     // our_read cannot source
              return kindByRef.get(r) !== "finding";                   // S1: a finding is never a source
            })
            .map((r) => textByRef.get(r) ?? ""),
        }));
        s1Results[kind as Kind] = results;
        const failing = results.filter((r) => r.unsourced.length > 0);
        return failing.length > 0 ? { detail: s1Detail(results) } : null;
      },
      validRefs,
      uuidByRef,
      provenances: ledger.provenances,
      liveness: ledger.liveness,
      generate: async (kind) => {
        const extra = kind === "strategy" ? positioningContext : "";

        // ── V1 (rulings 2026-10-13, R1-R3): CARRY BEFORE GENERATE ───────────────────────────────
        // For a line whose pool holds a relevant, usable record/you span, the read CARRIES that
        // span's words byte-exact. The model is told those lines are already written, writes the
        // rest, and the carried text is spliced over whatever it returned — the slot path's
        // applyVerbatim mechanic, one level up. No generation for a carried line means the hedge is
        // unreachable rather than refused.
        //
        // The RELEVANCE ANCHOR is the CURRENT read's line at that field path: it is what the line is
        // about, and it is the only description of the line available before the model writes. A
        // company with no current read therefore carries nothing and generates everything — honest,
        // not a failure.
        const carries = await selectCarries(kind as Kind);
        carriesByKind[kind as Kind] = carries;
        carriedBlocks[kind as Kind] = carriedBlockOf(carries);
        // ── Q2 (operator ruling, 2026-10-13): the notice states a COUNT ─────────────────────────
        // Nothing in the prompt said how many differentiators to write. GEN_POSITIONING shows an
        // array with one example element; CITE_RULE explicitly permits an empty one; clause (7)
        // pointed at the current read, which is not in the prompt at all (that was Q1). On runs
        // 9941 and 9976 the model wrote only the carried lines back, and D1 removed them, so the
        // read got thinner each time. N turns an unstated expectation into an instruction.
        const currentDiffCount = (await currentLinesFor(kind as Kind))
          .filter((l) => /^unique_attributes\[\d+\]$/.test(l.field ?? "")).length;
        const furtherWanted = furtherDifferentiatorCount(currentDiffCount, carries.length);
        const takenBlock = carries.length === 0 ? "" :
          `\n\nALREADY WRITTEN — these lines are carried from the record verbatim. Do not write them, do not restate their facts, and write every other line as usual:\n` +
          carries.map((c) => `  ${c.field}: ${c.stored_text}`).join("\n") +
          `\nWrite ${furtherWanted} further differentiators.`;

        // ── Q4 (operator ruling, 2026-10-13): STAMP THE PROMPT, STORE ONLY THE SHA ──────────────
        // Nothing recorded which prompt produced a read. input_ledger carried selection_version,
        // model_name and gen_rules_version, so the diagnostic of runs 9941/9976 could only
        // RECONSTRUCT the prompt from source and say so — a reconstruction is as good as the claim
        // that the source has not moved since.
        //
        // THE TEXT IS NOT STORED, and the wall check is why. The ruling said to store it unless the
        // prompt can carry client-provided material. It can, in two places: the ledger body (the
        // selector filters signal_band/voice_class/liveness, never source_type — 13 Edgewood signals
        // with source_type='uploaded_file' satisfy every predicate it applies) and the ALREADY
        // WRITTEN notice (carries come through liveRecordCandidates, the same predicates minus
        // source_type, so a carried span can be lifted from one of those 13). Run 9976's ledger held
        // none of them, but that is the cap and the ordering, not a wall. So: the sha alone.
        //
        // What the sha still buys: two reads with the same prompt_sha were written to the same
        // prompt, and a read whose sha differs from today's rebuild was not.
        const systemText = genSys[kind as Kind];
        const userText = `LEDGER (cite only the bracketed tokens on these lines):\n${CAT}${extra}${takenBlock}\n\nProduce the ${kind} JSON.`;
        promptSha[kind as Kind] = await sha256Hex(`${systemText}\n\n${userText}`);
        const p = await run(genChoice, systemText, userText, 0);
        // S1: the assembly reports where each carry actually landed. A slot with neither a carry nor
        // a generated line to fill it shifts every later carry down one, and the block must name the
        // path the line is STORED at — the drift check and C1-A's anchor both key off it.
        carriedBlocks[kind as Kind] = rekeyCarriedBlock(carriedBlocks[kind as Kind] ?? {}, spliceCarries(p, carries));
        // 1a-4: the class of every citing field is COMPUTED here from the refs the model returned,
        // weakest-wins, overwriting anything it volunteered. Done BEFORE the judge sees the payload so
        // the judge is told each field's class rather than asked to infer it.
        await stampAndDecide(kind as Kind, p);
        payloads[kind as Kind] = p;
        return p;
      },
      judge: async (kind, payload) => {
        const offeringActive = kind === "offering";
        const decs = classDecisions[kind as Kind] ?? [];
        const needJudgment = decs.filter((d) => d.branch === "judge_required");
        const unsupportedFields = decs.filter((d) => d.branch === "unsupported");
        // Only the fields (b) could not source are put to the judge. A field it cleared is not
        // offered for judgment at all, so a lenient judge can neither rescue nor overturn it.
        const askBlock = needJudgment.length === 0
          ? "none — every our_read field is either verbatim-sourced in a cited record/you row or already refused, so there is nothing to judge for class."
          : JSON.stringify(needJudgment.map((d) => ({ field: d.field, class: d.cls, stated_only_in_our_own_rows: d.unsourced.map((u) => u.token) })));
        // an unsupported field is REFUSED already — it is reported to the judge as context, never as
        // a question, so no answer it gives can clear it
        const refusedBlock = unsupportedFields.length === 0 ? "none"
          : JSON.stringify(unsupportedFields.map((d) => ({ field: d.field, unsupported_specifics: d.unsourced.map((u) => u.token) })));
        const judgeUser = `LEDGER (id-tagged):\n${CAT_LIVE}\n\nFIELD CLASSES (computed from each field's citations, weakest-wins):\n${JSON.stringify(decs.map((d) => ({ field: d.field, class: d.cls, branch: d.branch })))}\n\nFIELDS NEEDING A CLASS JUDGMENT (check (e) — these state specifics carried only by OUR OWN rows, so the question is whether we wrote them as our reading):\n${askBlock}\n\nALREADY REFUSED (specifics found nowhere in the company's record — context only, your answer cannot clear these):\n${refusedBlock}\n\nTHE READ:\n${kind}: ${JSON.stringify(payload)}\n\nJudge and decide accept (accept reflects a,b,c,e${offeringActive ? " and the offering f–i flags" : ""} ONLY — d is reported, never blocks).`;
        const v = await run(judgeChoice, judgeSysFor(kind as Kind), judgeUser, 0);
        verdicts[kind as Kind] = v;
        return v;
      },
      // The EXISTING accept expression, plus the 1a-4 CLASS gate (ruling S2): a field that asserts
      // more than its class allows refuses the kind at the SAME point a grounding failure does.
      // TIGHTENED 2026-10-07: the gate is (b)-then-(a) per field. A field (b) sourced clears without
      // consulting the judge at all; a field (b) could not source clears ONLY if the judge found it
      // hedged. FAIL-CLOSED: a judge that answers nothing for a judge_required field refuses it.
      accepts: (kind, verdict) =>
        verdict.grounding_ok === true && verdict.sanity_ok === true && verdict.consistency_ok === true
        && verdict.accept === true && classGateOk(kind, verdict)
        && (kind === "offering" ? offeringAcceptFromVerdict(verdict) : true),
      // ── THE BOUNDED RE-ASK (2026-10-08) ─────────────────────────────────────────────────────
      // Fires ONLY when the class gate alone refused: grounding, plain-sanity, consistency and the
      // judge's own accept must all hold, and at least one field must be refused on class. Anything
      // else is a different fault and gets no re-ask. One call, the refused specifics named back,
      // then the FULL gate again — the driver re-runs every guard in order.
      reaskOnClassRefusal: async (kind, payload, verdict) => {
        const decs = classDecisions[kind as Kind] ?? [];
        const hedged = judgeHedgedByField(verdict);
        const refused = decs.filter((d) => !fieldClassOk(d, hedged[d.field]));
        // NOTE on `accept`: it is deliberately NOT part of this test. The judge's prompt makes accept
        // reflect checks a, b, c AND e (class), so the moment a class refusal exists the judge sets
        // accept:false — requiring accept:true here made the re-ask unreachable in exactly the case
        // it exists for (first observed on the 2026-10-08 Edgewood run: a/b/c all true, accept false,
        // reason "class violations ... prevent acceptance"). With a, b and c all true, the only thing
        // accept can be objecting to IS the class, which is what the re-ask addresses.
        const classOnly = verdict.grounding_ok === true && verdict.sanity_ok === true
          && verdict.consistency_ok === true
          && (kind === "offering" ? offeringAcceptFromVerdict(verdict) : true)
          && refused.length > 0;
        if (!classOnly) return null;   // a different fault — no re-ask
        // every unsourced word, once, in the order the fields were read
        const words = [...new Set(refused.flatMap((d) => d.unsourced.map((u) => u.token)))];
        // THE POINTER (2026-10-08). The first re-ask offered (a) use the record's words, (b) hedge, or
        // (c) leave it out — and the model took (c) every time, deleting the Level 14 claim that the
        // record carries VERBATIM. "Find a ledger row that uses it" was a search problem it had no
        // cheap way to solve, so it chose deletion. We already know the answer: scan the record/you
        // rows with the SAME probe the gate uses and NAME the row. (a) then costs less than (c).
        const sourcingRefs = [...classByRef.entries()]
          .filter(([, c]) => c === "record" || c === "you").map(([r]) => r);
        /** Which record/you rows carry this specific, by ref token — the gate's own test, run wider. */
        const carriedBy = (fieldText: string, token: string): string[] => {
          const sp = extractSpecifics(fieldText).filter((x) => x.token === token);
          if (sp.length === 0) return [];
          return sourcingRefs.filter((r) => sp.some((x) => specificIsSourced(x, [textByRef.get(r) ?? ""])));
        };
        const byField = new Map(decs.map((d) => [d.field, d]));
        const textFor = (f: string) => (fieldClasses[kind as Kind] ?? []).find((x) => x.field === f)?.text ?? "";
        const lines: string[] = [];
        let anyCarried = false;
        for (const d of refused) {
          const ft = textFor(d.field);
          for (const u of d.unsourced) {
            const hits = carriedBy(ft, u.token);
            if (hits.length > 0) {
              anyCarried = true;
              lines.push(`- ${d.field}: "${u.token}" IS carried by ${hits.slice(0, 3).map((h) => `[${h}]`).join(" ")} — use THAT ROW'S WORDS for this claim and cite it.`);
            } else {
              lines.push(`- ${d.field}: "${u.token}" is in NO record/you row — hedge the claim as our reading, or leave the claim out.`);
            }
          }
        }
        void byField;
        // PER-FIELD RE-ASK (ruling 2026-10-08) — the slots pattern: ONLY the refused fields are
        // rewritten, each once, and an accepted sibling is never re-rolled. The model returns a
        // `fixes` map keyed by the field names it was given; each fix is spliced into the SAME object
        // the field came from, so every untouched field stays byte-identical by construction rather
        // than by inspection. The whole payload is then re-gated, in order, by the driver.
        const askedFields = refused.map((d) => d.field);
        const current = Object.fromEntries(refused.map((d) => {
          const f = (fieldClasses[kind as Kind] ?? []).find((x) => x.field === d.field);
          return [d.field, { text: f?.text ?? "", citations: f?.refs ?? [] }];
        }));
        const ask = `YOUR ANSWER WAS REFUSED ON CLASS — on these fields ONLY. Every other field was ACCEPTED and must not be rewritten.\n`
          + `Each word below states a specific that the field's own citations do not carry.\n${lines.join("\n")}\n\n`
          + `THE FIELDS TO REWRITE, as they stand:\n${JSON.stringify(current, null, 1)}\n\n`
          + `REWRITE UNDER SPECIFICS, in this order of preference:\n`
          + `  (a) where a row is named above, KEEP THE CLAIM and restate it in that row's own words, citing that row. This is REQUIRED, not optional: a claim the record carries must not be dropped.\n`
          + `  (b) where no row is named, write the claim as our reading ('we read you as…', 'the record suggests…') with its scope attached;\n`
          + `  (c) only if neither works, leave that claim out.\n`
          + (anyCarried ? `At least one refused word IS in the ledger (see above) — deleting that claim instead of restating it is a WRONG answer.\n` : ``)
          + `Do not strengthen a source. Do not drop a scope to fit.\n`
          + `Return ONLY the rewritten fields, keyed by the EXACT field names above:\n`
          + `{"fixes":{${askedFields.map((f) => `"${f}":{"text":"...","citations":["<token>"]}`).join(",")}}}`;
        const extra = kind === "strategy" ? positioningContext : "";
        const fixResp = await run(genChoice, genSys[kind as Kind], `LEDGER (cite only the bracketed tokens on these lines):\n${CAT_LIVE}${extra}\n\n${ask}`, 0);
        const fixes = ((fixResp?.fixes ?? fixResp ?? {}) as Record<string, unknown>);
        let spliced = 0;
        for (const d of refused) {
          const f = (fieldClasses[kind as Kind] ?? []).find((x) => x.field === d.field);
          const fix = (fixes[d.field] ?? null) as { text?: unknown; citations?: unknown } | null;
          if (!f || !fix || typeof fix.text !== "string" || !fix.text.trim()) continue;
          if (f.textKey) f.obj[f.textKey] = fix.text;
          if (Array.isArray(fix.citations)) f.obj[f.citeKey] = fix.citations.map(String);
          spliced++;
        }
        if (spliced === 0) return null;      // nothing usable came back — reject exactly as before
        reasked[kind as Kind] = { specifics: words, fields: askedFields };
        await stampAndDecide(kind as Kind, payload);
        payloads[kind as Kind] = payload;
        return payload;
      },
      commit: finalize,
      recordIntegrity: recordKindIntegrity,
      onReject: (kind, guard, detail) => {
        // name the unsourced specifics on a class refusal, so the log says WHICH words failed
        const v = verdicts[kind as Kind] ?? null;
        const refs = v ? classRefusals(classDecisions[kind as Kind] ?? [], judgeHedgedByField(v)) : [];
        const extra = refs.length > 0 ? ` class_refusals=${JSON.stringify(refs)}` : "";
        console.log(rejectLogLine(company_id, kind, guard, detail) + extra);
      },
    });

    const acceptedKinds = outcomes.filter((o) => o.status === "written").map((o) => o.kind as Kind);
    const perKind = Object.fromEntries(outcomes.map((o) => [o.kind, { status: o.status, guard: o.guard, detail: o.detail }]));
    const rejected = outcomes.filter((o) => o.status === "rejected").map((o) => ({ kind: o.kind, guard: o.guard, detail: o.detail }));

    // Citation resolution proof, over the kinds that passed every guard.
    const citedUuids = [...new Set(acceptedKinds.flatMap((k) => citedRefs(payloads[k]).map((ref) => uuidByRef.get(ref)).filter((x): x is string => !!x)))];
    const citationResolution = citedUuids.map((id) => ({
      id, in_ledger: ledgerIds.has(id), provenance: ledger.provenances[id] ?? null,
      public: require_public(ledger.provenances[id]), liveness: ledger.liveness[id] ?? null,
    }));
    const cascadeGapsPreview = cascadeItems.map((it) => ({ kind: it.kind, rung: it.rung, question: it.question_text }));
    const cost = { prompt_tokens: usage.prompt_tokens, completion_tokens: usage.completion_tokens, usd: usdCost(usage) };
    // GATE 3 — PERSIST THE COST. This number was computed and then returned in a response body no
    // caller parsed, so every run's spend vanished. recordModelCall never throws: an accounting
    // failure must not take down the work it measures.
    await recordModelCall(supabase, {
      companyId: company_id,
      runId: null,
      callSite: "generate-public-read",
      usage: openaiRecord(genChoice?.model ?? "gpt-4.1-mini", usage),
    });
    const routerResolution = {
      generator: genChoice.provider, judge: judgeChoice.provider,
      all_public: ledger.ids.every((id) => require_public(ledger.provenances[id])),
      distinct_provenances: [...new Set(Object.values(ledger.provenances))].sort(),
    };
    const ledgerSummary = { count: ledger.count, by_kind: Object.fromEntries(KINDS_INPUT.map((k) => [k, ledger.by_kind[k]?.length ?? 0])), corpus_md5: ledger.corpus_md5 };
    // A per-kind run has no single verdict; keep the field for callers by reporting the accepted ones.
    const judgeVerdicts = Object.fromEntries(outcomes.map((o) => [o.kind, o.verdict]));

    if (doStage) {
      // 1a-4: a STAGE run reports the same class evidence a dry run does — the staged rows are the
      // ones an operator is about to accept, so the branch that decided each field, the specifics
      // the fact-check could not source, and the rows admitted from the live record all belong here.
      return json({ ok: true, staged, per_kind: perKind, rejected,
        // D3: the continuity block is returned, not only stored — a caller should not have to read
        // integrity_runs to learn what the staged read continued. D1's removals ride beside it.
        continuity: continuityBlocks, restated_carried: restatedCarried,
        reasked, sourcing_search: sourcingSearch, admitted_from_live_record: admitted,
        class_decisions: Object.fromEntries(Object.entries(classDecisions).map(([k, ds]) => [k, (ds ?? []).map((d) => ({
          field: d.field, class: d.cls, branch: d.branch, examined: d.examined,
          unsourced: d.unsourced.map((u) => `${u.token} (${u.kind})`),
          judge_class_ok: judgeHedgedByField(verdicts[k as Kind] ?? {})[d.field] ?? null,
          class_ok: fieldClassOk(d, judgeHedgedByField(verdicts[k as Kind] ?? {})[d.field]),
        }))])),
        resolved_payloads: resolvedPayloads, citation_resolution: citationResolution, judge_verdicts: judgeVerdicts, judge_model: judgeChoice.model, model: { generator: genChoice, judge: judgeChoice }, input_ledger: ledger, cost });
    }
    if (!doWrite) {
      return json({ ok: true, dry_run: true, per_kind: perKind, rejected, payloads, resolved_payloads: resolvedPayloads,
        continuity: continuityBlocks, restated_carried: restatedCarried,   // D3/D1 on every path
        // 1a-4 tightened: per field, the class, the branch that decided it, and what (b) could not source
        reasked: reasked,
        sourcing_search: sourcingSearch,
        admitted_from_live_record: admitted,
        class_decisions: Object.fromEntries(Object.entries(classDecisions).map(([k, ds]) => [k, (ds ?? []).map((d) => ({
          field: d.field, class: d.cls, branch: d.branch, examined: d.examined,
          unsourced: d.unsourced.map((u) => `${u.token} (${u.kind})`),
          judge_class_ok: judgeHedgedByField(verdicts[k as Kind] ?? {})[d.field] ?? null,
          class_ok: fieldClassOk(d, judgeHedgedByField(verdicts[k as Kind] ?? {})[d.field]),
        }))])), derived_seen_on: derivedSeenOn, citation_resolution: citationResolution, cascade_gaps: cascadeGapsPreview, judge_verdicts: judgeVerdicts, router_resolution: routerResolution, ledger_summary: ledgerSummary, model: { generator: genChoice, judge: judgeChoice }, input_ledger: ledger, cost });
    }

    return json({ ok: true, written, per_kind: perKind, rejected,
      continuity: continuityBlocks, restated_carried: restatedCarried, cascade_routing: cascadeRouting, cascade_gaps: cascadeGapsPreview, payloads, derived_seen_on: derivedSeenOn, judge_verdicts: judgeVerdicts, judge_model: judgeChoice.model, model: { generator: genChoice, judge: judgeChoice }, input_ledger: ledger, cost });
  } catch (e) {
    return json({ error: `unexpected: ${(e as Error).message}` }, 500);
  }
});

// HARDENED (2026-09-01): delegates to the single shared public-provenance allowlist, which DELIBERATELY
// excludes 'market_read' (the refresh-cascade provenance-lie string). One allowlist, fail-closed — any
// value not explicitly public (market_read, unknown, null) is non-public. See publicReadGuards.ts.
function require_public(p: string | null | undefined): boolean {
  return isPublicProvenance(p);
}

// OFFERING integrity (2026-09-01) — one first_read_offering row per accepted offering write, mirroring
// the first_read_own_words / first_read_gap_pairs shape (examined / admitted / excluded_by_rule / status).
// Written ONLY on the real accept-write path (never on dry_run). The persisted record is what an
// earned-empty offering read renders from — sources examined + items admitted — so an empty offering
// never renders from a bare empty query.
async function writeOfferingIntegrity(
  supabase: SupabaseClient,
  companyId: string,
  args: { examined: number; admitted: number; excludedByRule: Record<string, unknown> },
): Promise<void> {
  const { error } = await supabase.from("integrity_runs").insert({
    company_id: companyId, component: "first_read_offering", status: "completed",
    examined: args.examined, admitted: args.admitted, excluded_by_rule: args.excludedByRule,
  });
  if (error) throw new Error(`offering integrity insert failed: ${error.message}`);
}

// Stage B — route the cascade's ungrounded rungs (gap) + grounded-but-incoherent rungs (tension) to
// the Questions beat as first_read_open_questions rows (source_kind='cascade_gap'). IDEMPOTENT per
// (company, current read): each regeneration supersedes this company's prior LIVE cascade_gap rows,
// then inserts the fresh set under a new run_id — never duplicates a live row. Reversible (superseded
// rows are kept as history, never deleted).
// writeCascadeGaps MOVED to ../_shared/publicReadPromote.ts (ruling 6, 2026-09-18) — the direct write and promote call the same function.
