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
import { declaredEligibleFor, parseOwnWordsKind } from "../_shared/ownWordsKinds.ts";
import { US_ENGLISH_RULE } from "../_shared/languageRule.ts";
import { resolveModel, callOpenAIJson, withRetry429, usdCost, type OpenAIUsage } from "../_shared/modelRouter.ts";
import { sha256Hex } from "../_shared/contentIdentity.ts";
import { citationsLivePublic, framingViolations, isPublicProvenance, offeringStructureViolations, offeringAcceptFromVerdict } from "../_shared/publicReadGuards.ts";
import { deriveCascadeSpineAndGaps, type CascadeCoherence, type CascadeGapItem, type StrategyPayload } from "../_shared/cascadeRouting.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const LOCAL_HOST_ALLOWLIST = new Set(["localhost", "127.0.0.1", "::1", "host.docker.internal"]);
const CB1_FROZEN_ID = "58b2b15b-bada-4bcd-9c12-b7e66a37d0bc";
const PUBLIC_SIGNAL_VOICES = ["outside_voice_about_client", "client_voice", "market_context", "competitor_voice"];
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

type InputRow = {
  id: string; kind: string; provenance: string; text: string;
  // Source metadata — used ONLY to DERIVE the offering read's seen_on / source_count / date range in
  // code (the model never claims these). source_url → domain; event_date → the item's date range;
  // own_site is true for own-words (the company's own public site by construction) or when the domain
  // matches the company's own host. Absent (findings/deltas are syntheses with no single source).
  source_url?: string | null; event_date?: string | null; own_site?: boolean;
};

// Per-kind read caps. A 3-sentence public read needs a tractable, prioritized catalogue — a model
// cannot reliably cite from hundreds of id-tagged rows (it invents ref numbers). The input_ledger
// records EXACTLY the capped set that was read (honest — "these ids, not the whole corpus"). Findings
// (public synthesis) and own-words (the company's own voice) are the highest-signal, so they get the
// widest caps; signals/deltas are sampled. Every capped row is still 100% public-provenance.
const READ_CAP: Record<string, number> = { finding: 25, own_word: 25, signal: 20, delta: 15 };

// ── gather PUBLIC inputs — each query's predicate selects public provenance ONLY ──────────────────
async function gatherPublicInputs(supabase: SupabaseClient, companyId: string): Promise<InputRow[]> {
  const rows: InputRow[] = [];

  // 1. outside signals — outside band AND a PUBLIC web voice (analysis/NULL voice = our own read, excluded).
  //    LIVE-ONLY (Gate 6a, 2026-08-26): superseded_at IS NULL AND held_at IS NULL — a hypothesis must not
  //    rest on evidence that is terminally gone (fabricated / redesigned-away / source_gone) OR merely
  //    held/recrawl-pending (unverified). Generation is STRICTER than the render overlay by design: the
  //    render marks provisional citations, but the "Our read" seeds posits ONLY from live public evidence.
  const { data: sig } = await supabase
    .from("signals")
    .select("id, claim_text, evidence_excerpt, source_title, source_url, event_date, topic")
    .eq("company_id", companyId).eq("signal_band", "outside")
    .in("voice_class", PUBLIC_SIGNAL_VOICES).is("superseded_at", null).is("held_at", null);
  for (const s of (sig ?? []) as Array<{ id: string; claim_text: string | null; evidence_excerpt: string | null; source_title: string | null; source_url: string | null; event_date: string | null; topic: string | null }>) {
    const text = (s.claim_text ?? s.evidence_excerpt ?? "").trim();
    if (text) rows.push({ id: s.id, kind: "signal", provenance: "public_observed", text: `${text}${s.source_title ? ` (${s.source_title})` : ""}`, source_url: s.source_url, event_date: s.event_date });
  }

  // 2. own-words — the company's OWN public-site voice, judge-kept only. own_site=true by construction
  //    (own-words ARE judge-kept quotes from the company's own public site — the seen_on "own site" set).
  const { data: ow } = await supabase
    .from("own_words_candidates").select("id, quote, judge_kind").eq("company_id", companyId).eq("judge_keep", true);
  for (const w of (ow ?? []) as Array<{ id: string; quote: string | null; judge_kind?: string | null }>) {
    // ADMISSION CRITERION (2026-09-03): only declared-eligible kinds seed posits (a missing kind is eligible).
    if (!declaredEligibleFor(parseOwnWordsKind(w.judge_kind))) continue;
    const text = (w.quote ?? "").trim();
    if (text) rows.push({ id: w.id, kind: "own_word", provenance: "public_observed", text, own_site: true });
  }

  // 3. findings — the public_inferred register, open, AND RECURRENCE-BACKED (Gate 6a, 2026-08-26):
  //    only findings with a Gate-5c finding_recurrence row (entity-anchored, IDF-coherent, judge-anchored,
  //    corroborated across ≥2 independent public sources) seed posits. Single-source open findings are
  //    unverified across the record and do NOT seed a hypothesis — the 5c coherence work IS this gate.
  const { data: recRows } = await supabase
    .from("finding_recurrence").select("finding_id").eq("company_id", companyId);
  const recurrenceBacked = new Set(((recRows ?? []) as Array<{ finding_id: string }>).map((r) => r.finding_id));
  const { data: fnd } = await supabase
    .from("findings").select("id, body").eq("company_id", companyId).eq("register", "public_inferred").eq("status", "open");
  for (const f of (fnd ?? []) as Array<{ id: string; body: string | null }>) {
    if (!recurrenceBacked.has(f.id)) continue; // recurrence-backed only
    const text = (f.body ?? "").trim();
    if (text) rows.push({ id: f.id, kind: "finding", provenance: "public_inferred", text });
  }

  // 4. (REMOVED — Stage B Option-B, 2026-08-28) odi_market_definitions is a STRUCTURALLY FORBIDDEN
  //    input for this generator. Stage A proved the table holds ZERO public_research rows across the
  //    portfolio (every market is internal_declared / internal_hypothesis — the internal Where-to-Play
  //    register), so the old provenance_type='public_research' filter was a false-safety over an
  //    all-internal table. The public cascade's Where-to-Play is read from the public record itself
  //    (signals / findings / own-words / the positioning read), never from the markets table. This
  //    generator now queries NO forbidden table (proven by the source-level forbidden-input test).

  // 5. deltas — the public_vs_public pairing; echoed/divergent (public confirms or contests a public claim)
  const { data: dl } = await supabase
    .from("claim_deltas").select("id, delta_type, declared_claim_id, public_claim_id")
    .eq("company_id", companyId).eq("pairing_kind", "public_vs_public").in("delta_type", ["echoed", "divergent"]);
  const deltas = (dl ?? []) as Array<{ id: string; delta_type: string; declared_claim_id: string | null; public_claim_id: string | null }>;
  const claimIds = [...new Set(deltas.flatMap((d) => [d.declared_claim_id, d.public_claim_id]).filter((x): x is string => !!x))];
  const claimText = new Map<string, string>();
  if (claimIds.length) {
    const { data: cl } = await supabase.from("claims").select("id, statement").in("id", claimIds);
    for (const c of (cl ?? []) as Array<{ id: string; statement: string | null }>) if (c.statement) claimText.set(c.id, c.statement.trim());
  }
  for (const d of deltas) {
    const decl = d.declared_claim_id ? claimText.get(d.declared_claim_id) : "";
    const pub = d.public_claim_id ? claimText.get(d.public_claim_id) : "";
    const text = decl || pub ? `[${d.delta_type}] declared: "${decl ?? ""}" · public: "${pub ?? ""}"` : "";
    if (text.trim()) rows.push({ id: d.id, kind: "delta", provenance: "public_observed", text });
  }

  // Apply per-kind caps (order preserved within kind) — the ledger records exactly what's kept.
  const seen: Record<string, number> = {};
  return rows.filter((r) => {
    const n = (seen[r.kind] = (seen[r.kind] ?? 0) + 1);
    return n <= (READ_CAP[r.kind] ?? 9999);
  });
}

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
    corpus_md5,
    count: inputs.length,
  };
}
const KINDS_INPUT = ["signal", "own_word", "finding", "delta"] as const;

// A SHORT-REF catalogue: an LLM cannot reliably echo dozens of 36-char uuids (it mangles them), so
// each input gets a stable, kind-prefixed ref token (S1, O1, F1, M1, D1) mapped to its real id. The
// model cites refs; we validate refs against the map (unknown ref → reject, fail loud) and translate
// accepted refs BACK to the real ledger ids for storage, so stored citations resolve to the ledger.
const REF_PREFIX: Record<string, string> = { signal: "S", own_word: "O", finding: "F", delta: "D" };
function buildCatalogue(inputs: InputRow[]): { text: string; uuidByRef: Map<string, string>; tokenSummary: string } {
  const uuidByRef = new Map<string, string>();
  const counters: Record<string, number> = {};
  const lines: string[] = [];
  for (const r of inputs) {
    const px = REF_PREFIX[r.kind] ?? "X";
    counters[px] = (counters[px] ?? 0) + 1;
    const ref = `${px}${counters[px]}`;
    uuidByRef.set(ref, r.id);
    lines.push(`[${ref}] (${r.kind}) ${r.text.slice(0, 400)}`);
  }
  // The exact valid token ranges, e.g. "S1–S20, O1–O25, F1–F13, D1–D15" — the model may cite ONLY these.
  const tokenSummary = Object.entries(counters).map(([px, n]) => (n === 1 ? `${px}1` : `${px}1–${px}${n}`)).join(", ");
  return { text: lines.join("\n"), uuidByRef, tokenSummary };
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

// Deep-copy a payload, replacing every citation ref token with its real ledger uuid (unknown refs are
// already rejected upstream, so every ref resolves here).
function translateCitations(payload: unknown, uuidByRef: Map<string, string>): unknown {
  if (Array.isArray(payload)) return payload.map((x) => translateCitations(x, uuidByRef));
  if (payload && typeof payload === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(payload)) {
      if (/citation|cite|refs?$|ids$/i.test(k) && Array.isArray(v)) out[k] = v.map((x) => (typeof x === "string" ? (uuidByRef.get(x.trim()) ?? x) : x));
      else out[k] = translateCitations(v, uuidByRef);
    }
    return out;
  }
  return payload;
}

// bare host of a URL (www. stripped, lowercased). null when unparseable — a synthesis row has no URL.
function hostOf(url: string | null | undefined): string | null {
  if (!url) return null;
  try { return new URL(url).hostname.replace(/^www\./, "").toLowerCase() || null; }
  catch { return null; }
}

// ── OFFERING seen_on derivation (STRUCTURAL — the model never emits seen_on) ────────────────────────
// For each offering item, resolve its cited ref tokens → ledger uuids → the per-id source metadata
// gathered above, then decide seen_on by the honesty axis WHERE it was seen: any own-site ref (own-words,
// or a signal whose domain matches the company's own host) → "own_site"; otherwise "outside". Also
// record source_count (distinct cited refs), the distinct source domains, and the earliest/latest source
// date. This is a breadth/strength measure, never a verdict.
type OfferingSeenOn = {
  index: number; label: string; seen_on: "own_site" | "outside";
  source_count: number; domains: string[]; earliest: string | null; latest: string | null;
};
function deriveOfferingSeenOn(
  payload: Record<string, unknown>,
  uuidByRef: Map<string, string>,
  refMeta: Map<string, { domain: string | null; date: string | null; own_site: boolean }>,
  ownHosts: Set<string>,
): OfferingSeenOn[] {
  const items = Array.isArray(payload.items) ? (payload.items as Array<Record<string, unknown>>) : [];
  return items.map((it, index) => {
    const refTokens = [...new Set((Array.isArray(it.refs) ? it.refs : []).filter((r): r is string => typeof r === "string").map((r) => r.trim()))];
    const metas = refTokens.map((t) => refMeta.get(uuidByRef.get(t) ?? "")).filter((m): m is { domain: string | null; date: string | null; own_site: boolean } => !!m);
    const domains = [...new Set(metas.map((m) => m.domain).filter((d): d is string => !!d))];
    const dates = metas.map((m) => m.date).filter((d): d is string => !!d).sort();
    const ownSite = metas.some((m) => m.own_site) || domains.some((d) => ownHosts.has(d));
    return {
      index, label: typeof it.label === "string" ? it.label : "",
      seen_on: ownSite ? "own_site" : "outside",
      source_count: refTokens.length, domains,
      earliest: dates[0] ?? null, latest: dates[dates.length - 1] ?? null,
    };
  });
}

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
      const promoted: Array<{ kind: Kind; staged: string; superseded: string | null }> = [];
      for (const kind of activeKinds) {
        const { data: staged } = await supabase.from("public_reads")
          .select("id").eq("company_id", company_id).eq("kind", kind).eq("is_current", false).is("superseded_by", null)
          .order("created_at", { ascending: false }).limit(1).maybeSingle();
        const stagedId = (staged as { id?: string } | null)?.id ?? null;
        if (!stagedId) { promoted.push({ kind, staged: "", superseded: null }); continue; }
        const { data: prior } = await supabase.from("public_reads")
          .select("id").eq("company_id", company_id).eq("kind", kind).eq("is_current", true).maybeSingle();
        const priorId = (prior as { id?: string } | null)?.id ?? null;
        if (priorId) {
          const { error: e1 } = await supabase.from("public_reads").update({ is_current: false, superseded_by: stagedId }).eq("id", priorId);
          if (e1) throw new Error(`supersede-prior failed (${kind}): ${e1.message}`);
        }
        const { error: e2 } = await supabase.from("public_reads").update({ is_current: true }).eq("id", stagedId);
        if (e2) throw new Error(`promote-staged failed (${kind}): ${e2.message}`);
        promoted.push({ kind, staged: stagedId, superseded: priorId });
      }
      return json({ ok: true, promoted });
    }

    const inputs = await gatherPublicInputs(supabase, company_id);
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
        model: { generator: genChoice, judge: judgeChoice },
        catalogue_preview: inputs.slice(0, 8).map((r) => ({ id: r.id, kind: r.kind, preview: r.text.slice(0, 100) })),
      });
    }

    if (inputs.length === 0) return json({ ok: false, status: "empty", reason: "no public inputs for this company" });

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

    const { text: CAT, uuidByRef, tokenSummary } = buildCatalogue(inputs);
    const CITE_RULE = `Cite ONLY tokens that appear VERBATIM in the LEDGER below — each printed in square brackets at the start of its line (e.g. [S1], [O3], [F2], [D1]). The valid tokens are exactly these families and NO others: ${tokenSummary} (S… = signals, O… = own-words, F… = findings, D… = deltas). Any token NOT printed in the ledger INVALIDATES THE WHOLE RESPONSE — this includes a position/ordinal number, an "Item N" reference to your own output, and any "I…" / "INPUT…" / "L…" prefix. There is no "I" family; never invent one. Copy each token EXACTLY as shown and cite AT MOST 3 per claim. If the public record does not support a field, return it empty ("" or []) with no citations — never guess or invent a token.`;

    // ── GENERATE each kind ───────────────────────────────────────────────────────────────────────
    const GEN_POSITIONING = `You read a company's PUBLIC record and state its positioning as a hypothesis for the room to test. ${CITE_RULE}
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
CRITICAL — cited-or-omitted: if the public record does not GROUND a rung, return it EMPTY ("" for a text rung, [] for a list rung) with empty citations. Do NOT invent capabilities or management systems that the record doesn't show. It is EXPECTED and correct for a rung to be empty.
Return ONLY JSON:
{"winning_aspiration":"<what winning looks like for this business, plainly>","winning_aspiration_citations":["<id>"],
 "where_to_play":"<the arena the record implies — who / where / which segment>","where_to_play_citations":["<id>"],
 "how_to_win":"<the edge the record implies — how it wins where it plays>","how_to_win_citations":["<id>"],
 "must_have_capabilities":[{"text":"<one capability the record actually shows the business has/needs to win this way>","citations":["<id>"]}],
 "management_systems":[{"text":"<one system/process/measure the record shows runs the strategy — rarely visible in a public record; return [] if none is shown>","citations":["<id>"]}]}
${US_ENGLISH_RULE}`;
    const GEN_PROMISE = `You read a company's PUBLIC record and state, in ONE sentence, what the customer is promised — stated ONLY as far as the record backs it. ${CITE_RULE}
Return ONLY JSON: {"promise":"<one sentence>","citations":["<id>"]}
${US_ENGLISH_RULE}`;
    // OFFERING (2026-09-01) — ENUMERATE what the public record shows THIS COMPANY currently puts in
    // front of the people it serves: products / services / programs / formats / channels. This is a
    // catalogue of concrete offerings AS THE RECORD SHOWS THEM — never a strategy statement, never
    // intent, never a quality judgment. Cite every item; OMIT anything uncited. Currency/entity doubts
    // go in open_questions (never inside an item statement). ATTRIBUTE ONLY TO THIS COMPANY.
    const GEN_OFFERING = `You read a company's PUBLIC record and ENUMERATE what it currently puts in front of the people it serves — its offerings: products, services, programs, formats, and channels, exactly as the record shows them. ${CITE_RULE}
STRICT RULES:
- ENUMERATE, don't strategize: each item names ONE concrete thing offered (e.g. "small-batch roasted coffee", "residential crisis stabilization program", "wholesale café supply"). NOT a positioning line, NOT a value claim, NOT intent, NOT a quality/verdict word.
- CITED-OR-OMITTED: every item MUST cite at least one token in its "refs" array, and every token MUST be one printed in the LEDGER (e.g. [S3], [O4], [F1], [D1]). If you cannot cite it from the ledger, DO NOT include it. NEGATIVE EXAMPLE — never write refs like ["I11"], ["Item 11"], or ["11"]: there is no "I" family and item positions are NOT tokens; any such token invalidates the whole response.
- ATTRIBUTE ONLY TO THIS COMPANY: if the record shows an offering that belongs to a CO-LOCATED, PARTNER, or THIRD-PARTY entity (a different business at the same address, a supplier, a marketplace), EXCLUDE it from items and instead raise it as an open_question with reason:"entity".
- DOUBTS GO IN open_questions, never in an item: if the record raises a CURRENCY doubt (a dated closure, a management change, a possibly-retired program) or an ENTITY doubt, put it in open_questions with reason:"currency" or "entity" and cite it. Never write a doubt as a verdict inside an item statement.
- Do NOT output any "seen_on" / "source"/"where" field — those are derived downstream from your refs, not by you.
- If the public record shows NO attributable offering, return items:[] (an honest empty is correct).
Return ONLY JSON:
{"items":[{"label":"<≤8 words>","statement":"<one sentence: what is put in front of whom, in the record's own terms>","refs":["<token>"],"kind_hint":"product|service|program|format|channel"}],
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

    const payloads: Record<Kind, Record<string, unknown>> = {} as Record<Kind, Record<string, unknown>>;
    const genSys: Record<Kind, string> = { positioning: GEN_POSITIONING, strategy: GEN_STRATEGY, promise: GEN_PROMISE, offering: GEN_OFFERING };
    const citationErrors: Array<{ kind: Kind; bad_ids: string[] }> = [];
    for (const kind of activeKinds) {
      const extra = kind === "strategy" ? positioningContext : "";
      const p = await run(genChoice, genSys[kind], `LEDGER (cite only the bracketed tokens on these lines):\n${CAT}${extra}\n\nProduce the ${kind} JSON.`, 0);
      payloads[kind] = p;
      const bad = citedRefs(p).filter((ref) => !uuidByRef.has(ref));
      if (bad.length) citationErrors.push({ kind, bad_ids: bad });
    }
    // FAIL LOUD: any citation outside the ledger → reject the whole read, write nothing.
    if (citationErrors.length) {
      return json({ ok: false, rejected: "citation_outside_ledger", citation_errors: citationErrors, payloads, ledger_count: ledger.count }, 200);
    }

    // ── OFFERING STRUCTURE GATE (deterministic, pre-judge): every offering item must carry a label, a
    //    statement, a NON-EMPTY refs array of valid ledger tokens, and a valid kind_hint; no currency/
    //    verdict vocab in a statement; open_questions well-formed. This is the cite-or-omit floor for the
    //    offering catalogue (an uncited item slips past the generic ref-token check, which only rejects
    //    UNKNOWN tokens — never an EMPTY refs array). Reject → write nothing.
    if (activeKinds.includes("offering")) {
      const offViol = offeringStructureViolations(payloads.offering, new Set(uuidByRef.keys()));
      if (offViol.length) {
        return json({ ok: false, rejected: "offering_structure", offering_violations: offViol, payloads, ledger_count: ledger.count }, 200);
      }
    }

    // ── FRAMING GATE (Gate 6a, deterministic, pre-judge): a posit is a HYPOTHESIS, never a verdict.
    //    Reject verdict-family / UNDERSERVED vocabulary before the judge even runs. Write nothing.
    const framing = framingViolations(payloads);
    if (framing.length) {
      return json({ ok: false, rejected: "framing_vocab", framing_violations: framing, payloads, ledger_count: ledger.count }, 200);
    }

    // ── CITATION RESOLUTION PROOF (Gate 6a): every ref a posit cites resolves to a ledger id that is
    //    LIVE + PUBLIC at mint. Refs → uuids via the catalogue; each uuid must be in the ledger with a
    //    public provenance and liveness 'live'. The ledger is live-public by construction (the queries
    //    select live-only public rows), so this is an explicit assertion of that invariant.
    const resolvedPayloads = Object.fromEntries(
      activeKinds.map((k) => [k, translateCitations(payloads[k], uuidByRef)]),
    ) as Record<Kind, Record<string, unknown>>;
    const citedUuids = [...new Set(activeKinds.flatMap((k) => citedRefs(payloads[k]).map((ref) => uuidByRef.get(ref)).filter((x): x is string => !!x)))];
    const citationResolution = citedUuids.map((id) => ({
      id, in_ledger: ledgerIds.has(id), provenance: ledger.provenances[id] ?? null,
      public: require_public(ledger.provenances[id]), liveness: ledger.liveness[id] ?? null,
    }));
    const livePublic = citationsLivePublic(citedUuids, ledger.provenances, ledger.liveness);
    if (!livePublic.ok) {
      // A cited id that isn't live-public in the ledger is an integrity failure — reject, write nothing.
      return json({ ok: false, rejected: "citation_not_live_public", bad_ids: livePublic.bad, citation_resolution: citationResolution, payloads, ledger_count: ledger.count }, 200);
    }

    // ── JUDGE all three together: grounding + plain-sanity + consistency + (Stage B) cascade coherence
    // (d) CASCADE COHERENCE is a per-rung READING check — it NEVER blocks acceptance (ruling R3: a
    // grounded-but-incoherent rung is SURFACED as a tension question, not a reason to reject the read).
    // It reports whether how_to_win serves the stated where_to_play + winning_aspiration, and whether
    // each capability serves how_to_win. A false verdict → that rung is excluded from the rendered spine
    // and a tension question is minted downstream (with the judge's reason).
    const offeringActive = activeKinds.includes("offering");
    // OFFERING criteria (appended only when the offering kind is in this run). The judge returns an
    // `offering` verdict block whose four flags gate acceptance (offeringAcceptFromVerdict): (e)
    // ENUMERABLE — each item is a concrete offering, not a strategy/positioning statement; (f) ENTITY
    // ATTRIBUTION — no item describes a co-located / partner / third-party entity's offering (reject the
    // whole read if any item does); (g) DOUBTS-PLACED — currency/entity doubts appear in open_questions,
    // never as a verdict inside an item; (h) BANNED-VOCAB — no verdict/currency/status words in an item.
    const OFFERING_JUDGE_CLAUSE = offeringActive
      ? `\n(e)–(h) OFFERING (the "offering" read is a CATALOGUE of what the company puts in front of customers):
(e) ENUMERABLE — every item names a concrete offering (product/service/program/format/channel), NOT a strategy line, value claim, or intent;
(f) ENTITY ATTRIBUTION — every item's cited inputs describe THIS company's own offering; if ANY item actually describes a CO-LOCATED / partner / third-party entity's offering, set entity_attribution_ok:false;
(g) DOUBTS-PLACED — currency/entity doubts live in open_questions (with a reason), never phrased as a verdict inside an item statement;
(h) BANNED-VOCAB — no verdict/currency/status words (confirmed, disputed, stale, closed, retired, underserved, …) appear inside any item statement.`
      : "";
    const OFFERING_VERDICT_FIELD = offeringActive
      ? `,\n "offering":{"enumerable_ok":true|false,"entity_attribution_ok":true|false,"doubts_placed_ok":true|false,"banned_vocab_ok":true|false,"reason":"<one line>"}`
      : "";
    const JUDGE_SYS = `You judge a public-only "Our read" of a company (positioning, strategy, promise, and possibly an offering catalogue). Check:
(a) GROUNDING — every claim is supported by the cited inputs (the cited excerpts back it; nothing invented);
(b) PLAIN-SANITY — market_category names what this business ACTUALLY IS per its own words and outside signals (a coffee roaster is NOT "SaaS"; a clinic is NOT "marketplace"). Reject an absurd or aspirational category. If positioning is not in this read, set sanity_ok:true;
(c) CONSISTENCY — the read describes the SAME business throughout and does not contradict itself. If only one kind is in this read, judge its internal consistency and set consistency_ok:true when coherent;
(d) CASCADE COHERENCE (strategy only, does NOT affect accept) — does how_to_win plausibly SERVE the stated where_to_play AND winning_aspiration? Does each must_have_capability plausibly SERVE how_to_win? A rung left empty is neither coherent nor incoherent — mark empty rungs coherent:true. Judge only NON-empty rungs on the merits.${OFFERING_JUDGE_CLAUSE}
Respond with ONLY JSON:
{"grounding_ok":true|false,"sanity_ok":true|false,"consistency_ok":true|false,
 "per_kind":{"positioning":{"ok":true|false,"reason":"..."},"strategy":{"ok":true|false,"reason":"..."},"promise":{"ok":true|false,"reason":"..."}},
 "cascade_coherence":{"how_to_win":{"coherent":true|false,"reason":"<one line: does it serve where-to-play + aspiration?>"},
   "capabilities":[{"text":"<echo the capability text>","coherent":true|false,"reason":"<one line: does it serve how-to-win?>"}]}${OFFERING_VERDICT_FIELD},
 "accept":true|false,"reason":"<one line>"}`;
    // KINDS-SCOPED: the judge sees only the kinds this run generated (an unlisted kind is not judged —
    // there is no payload for it). The criteria and prompt are unchanged; only the READ list narrows.
    const judgeRead = activeKinds.map((k) => `${k}: ${JSON.stringify(payloads[k])}`).join("\n");
    const judgeUser = `LEDGER (id-tagged):\n${CAT}\n\nTHE READ:\n${judgeRead}\n\nJudge and decide accept (accept reflects a,b,c${offeringActive ? " and the offering e–h flags" : ""} ONLY — d is reported, never blocks).`;
    const verdict = await run(judgeChoice, JUDGE_SYS, judgeUser, 0);
    // Accept: base (grounding/sanity/consistency/accept) AND — when offering is in the run — all four
    // offering flags (offeringAcceptFromVerdict, fail-closed on a missing flag).
    const accept = verdict.grounding_ok === true && verdict.sanity_ok === true && verdict.consistency_ok === true
      && verdict.accept === true && (offeringActive ? offeringAcceptFromVerdict(verdict) : true);
    const cost = { prompt_tokens: usage.prompt_tokens, completion_tokens: usage.completion_tokens, usd: usdCost(usage) };

    // ── Stage B — CASCADE ROUTING (deterministic, post-judge): the rendered SPINE (incoherent rungs
    //    excluded) + the cascade_gap items (ungrounded rungs → gap; grounded-but-incoherent → tension).
    //    The SPINE (not the raw strategy) is what gets stored, so the render shows only the coherent
    //    spine; the excluded rungs live as questions on the Questions beat. Positioning/promise unchanged.
    // KINDS-SCOPED: cascade routing rides the strategy kind — when "strategy" is not in this run,
    // there is no strategy payload to derive from and the live cascade_gap questions must NOT be
    // superseded (they belong to the untouched current strategy row).
    const strategyActive = activeKinds.includes("strategy");
    const coherence = (verdict.cascade_coherence ?? null) as CascadeCoherence | null;
    // Storage payloads: strategy → the spine (still ref-tokened); positioning/promise → raw.
    const storagePayloads: Record<Kind, Record<string, unknown>> = { ...payloads };
    let cascadeItems: CascadeGapItem[] = [];
    if (strategyActive) {
      const derived = deriveCascadeSpineAndGaps(payloads.strategy as StrategyPayload, coherence);
      cascadeItems = derived.items;
      storagePayloads.strategy = derived.spine as Record<string, unknown>;
      resolvedPayloads.strategy = translateCitations(derived.spine, uuidByRef) as Record<string, unknown>;
    }
    const cascadeGapsPreview = cascadeItems.map((it) => ({ kind: it.kind, rung: it.rung, question: it.question_text }));

    // ── OFFERING seen_on derivation (STRUCTURAL, post-judge): resolve each item's refs → source domains
    //    against the company's own host(s). The model never emitted seen_on; it is derived here from the
    //    ledger's per-id source metadata. refMeta maps ledger uuid → {domain, date, own_site}; ownHosts is
    //    the company's own-site host(s). Built only when offering is in the run.
    let derivedSeenOn: OfferingSeenOn[] | null = null;
    if (offeringActive) {
      const { data: coRow } = await supabase.from("companies").select("website").eq("id", company_id).maybeSingle();
      const ownHost = hostOf((coRow as { website?: string | null } | null)?.website ?? null);
      const ownHosts = new Set<string>(ownHost ? [ownHost] : []);
      const refMeta = new Map<string, { domain: string | null; date: string | null; own_site: boolean }>();
      for (const r of inputs) {
        refMeta.set(r.id, {
          domain: hostOf(r.source_url) ?? (r.own_site && ownHost ? ownHost : null),
          date: r.event_date ?? null,
          own_site: r.own_site === true || (hostOf(r.source_url) !== null && ownHosts.has(hostOf(r.source_url)!)),
        });
      }
      derivedSeenOn = deriveOfferingSeenOn(payloads.offering, uuidByRef, refMeta, ownHosts);
      // Merge the DERIVED seen_on/source_count/date range into the STORAGE payload's items (Stage B
      // write path). The model's item refs get translated token→uuid at insert; the seen_on fields carry
      // no refs, so they pass through unchanged. (Dry-run returns derivedSeenOn separately and writes
      // nothing.)
      const offItems = Array.isArray((storagePayloads.offering as Record<string, unknown>).items)
        ? ((storagePayloads.offering as Record<string, unknown>).items as Array<Record<string, unknown>>) : [];
      storagePayloads.offering = {
        ...(storagePayloads.offering as Record<string, unknown>),
        items: offItems.map((it, i) => ({
          ...it,
          seen_on: derivedSeenOn![i]?.seen_on ?? null,
          source_count: derivedSeenOn![i]?.source_count ?? 0,
          source_domains: derivedSeenOn![i]?.domains ?? [],
          earliest_source: derivedSeenOn![i]?.earliest ?? null,
          latest_source: derivedSeenOn![i]?.latest ?? null,
        })),
      };
    }
    // Router resolution + a compact ledger summary — surfaced in the dry-run for operator review.
    const routerResolution = {
      generator: genChoice.provider, judge: judgeChoice.provider,
      all_public: ledger.ids.every((id) => require_public(ledger.provenances[id])),
      distinct_provenances: [...new Set(Object.values(ledger.provenances))].sort(),
    };
    const ledgerSummary = { count: ledger.count, by_kind: Object.fromEntries(KINDS_INPUT.map((k) => [k, ledger.by_kind[k]?.length ?? 0])), corpus_md5: ledger.corpus_md5 };

    if (!accept) {
      // Reject → no write, verdict returned (nothing persisted).
      return json({ ok: false, rejected: "judge", judge_verdict: verdict, judge_model: judgeChoice.model, payloads, derived_seen_on: derivedSeenOn, model: { generator: genChoice, judge: judgeChoice }, input_ledger: ledger, cost });
    }
    if (!doWrite && !doStage) {
      return json({ ok: true, dry_run: true, payloads, resolved_payloads: resolvedPayloads, derived_seen_on: derivedSeenOn, citation_resolution: citationResolution, cascade_gaps: cascadeGapsPreview, judge_verdict: verdict, router_resolution: routerResolution, ledger_summary: ledgerSummary, model: { generator: genChoice, judge: judgeChoice }, input_ledger: ledger, cost });
    }

    // ── ACCEPT → write rows, superseding the prior current row (kept, never deleted). ───────
    // Legacy market_read canvas/cascade id (if any) so the row records what it supersedes.
    const { data: legacyCanvas } = await supabase.from("positioning_canvases").select("id").eq("company_id", company_id).eq("artifact_role", "market_read").maybeSingle();
    const { data: legacyCascade } = await supabase.from("strategy_cascades").select("id").eq("company_id", company_id).eq("artifact_role", "market_read").maybeSingle();
    const legacyFor = (k: Kind): string | null =>
      k === "strategy" ? ((legacyCascade as { id?: string } | null)?.id ?? null) : ((legacyCanvas as { id?: string } | null)?.id ?? null);

    // ── STAGE (Gate 6a two-phase): write is_current=FALSE rows, DO NOT supersede the prior current row.
    //    The signed payloads persist as staged; `promote` (accept) flips them current + supersedes. This
    //    lets the operator sign the EXACT payloads with nothing marked current until accept.
    if (doStage) {
      const staged: Array<{ kind: Kind; id: string }> = [];
      for (const kind of activeKinds) {
        const { data: ins, error: insErr } = await supabase.from("public_reads").insert({
          company_id, kind, payload: resolvedPayloads[kind], input_ledger: ledger,
          model_provider: genChoice.provider, model_name: genChoice.model,
          judge_verdict: verdict, judge_model: judgeChoice.model,
          is_current: false, supersedes_legacy_row: legacyFor(kind),
        }).select("id").single();
        if (insErr) throw new Error(`stage insert failed (${kind}): ${insErr.message}`);
        staged.push({ kind, id: (ins as { id: string }).id });
      }
      return json({ ok: true, staged, resolved_payloads: resolvedPayloads, citation_resolution: citationResolution, judge_verdict: verdict, judge_model: judgeChoice.model, model: { generator: genChoice, judge: judgeChoice }, input_ledger: ledger, cost });
    }

    const written: Array<{ kind: Kind; id: string; superseded: string | null }> = [];
    for (const kind of activeKinds) {
      const { data: prior } = await supabase.from("public_reads").select("id").eq("company_id", company_id).eq("kind", kind).eq("is_current", true).maybeSingle();
      const priorId = (prior as { id?: string } | null)?.id ?? null;
      if (priorId) {
        // free the (company,kind) is_current uniqueness before inserting the new current row
        const { error: upErr } = await supabase.from("public_reads").update({ is_current: false }).eq("id", priorId);
        if (upErr) throw new Error(`supersede-prior failed (${kind}): ${upErr.message}`);
      }
      const { data: ins, error: insErr } = await supabase.from("public_reads").insert({
        company_id, kind, payload: translateCitations(storagePayloads[kind], uuidByRef), input_ledger: ledger,
        model_provider: genChoice.provider, model_name: genChoice.model,
        judge_verdict: verdict, judge_model: judgeChoice.model,
        is_current: true, supersedes_legacy_row: legacyFor(kind),
      }).select("id").single();
      if (insErr) throw new Error(`insert failed (${kind}): ${insErr.message}`);
      const newId = (ins as { id: string }).id;
      if (priorId) await supabase.from("public_reads").update({ superseded_by: newId }).eq("id", priorId);
      written.push({ kind, id: newId, superseded: priorId });
    }

    // ── Stage B — route the cascade's gaps + tensions to the Questions beat (idempotent supersede). This
    //    happens on the DIRECT-WRITE path only (the read is is_current here, so its questions are live in
    //    lockstep). The two-phase stage/promote path does NOT emit cascade_gaps (the staged read is not
    //    current); regenerate via write to (re)route.
    // KINDS-SCOPED: only a run that regenerated the strategy may touch cascade_gap rows — otherwise a
    // scoped run (e.g. kinds:["positioning"]) would supersede the live questions of an untouched read.
    const cascadeRouting = strategyActive
      ? await writeCascadeGaps(supabase, company_id, cascadeItems, { provider: genChoice.provider, model: genChoice.model })
      : { superseded: 0, inserted: 0, run_id: null };

    // ── OFFERING integrity (Stage B — REAL run only; never on dry_run). One first_read_offering row per
    //    accepted write: examined = public rows in the ledger, admitted = offering items enumerated,
    //    excluded_by_rule records the own-site/outside split + open-question count. This is the persisted
    //    record an earned-empty offering read renders from (items:[] → admitted 0, honest not-empty-query).
    if (offeringActive) {
      const offStored = (storagePayloads.offering as Record<string, unknown>) ?? {};
      const offItems = Array.isArray(offStored.items) ? (offStored.items as unknown[]) : [];
      const offOqs = Array.isArray((payloads.offering as Record<string, unknown>).open_questions) ? ((payloads.offering as Record<string, unknown>).open_questions as unknown[]) : [];
      const ownCount = (derivedSeenOn ?? []).filter((s) => s.seen_on === "own_site").length;
      await writeOfferingIntegrity(supabase, company_id, {
        examined: ledger.count, admitted: offItems.length,
        excludedByRule: { items: offItems.length, own_site: ownCount, outside: offItems.length - ownCount, open_questions: offOqs.length, ledger_ids: ledger.count, mode: "write" },
      });
    }

    return json({ ok: true, written, cascade_routing: cascadeRouting, cascade_gaps: cascadeGapsPreview, payloads, derived_seen_on: derivedSeenOn, judge_verdict: verdict, judge_model: judgeChoice.model, model: { generator: genChoice, judge: judgeChoice }, input_ledger: ledger, cost });
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
async function writeCascadeGaps(
  supabase: SupabaseClient,
  companyId: string,
  items: CascadeGapItem[],
  model: { provider: string; model: string },
): Promise<{ superseded: number; inserted: number; run_id: string | null }> {
  const { data: prior } = await supabase.from("first_read_open_questions")
    .select("id").eq("company_id", companyId).eq("source_kind", "cascade_gap").eq("status", "live");
  const priorIds = ((prior ?? []) as Array<{ id: string }>).map((r) => r.id);
  if (priorIds.length) {
    const { error } = await supabase.from("first_read_open_questions").update({ status: "superseded" }).in("id", priorIds);
    if (error) throw new Error(`cascade_gap supersede failed: ${error.message}`);
  }
  if (!items.length) return { superseded: priorIds.length, inserted: 0, run_id: null };
  const runId = `cascade:${crypto.randomUUID()}`;
  const rows = items.map((it) => ({
    company_id: companyId, run_id: runId, source_kind: "cascade_gap",
    question_text: it.question_text, question_identity: it.question_identity,
    anchor_identity: it.rung, status: "live",
    model_provider: model.provider, model_name: model.model,
  }));
  const { error } = await supabase.from("first_read_open_questions").insert(rows);
  if (error) throw new Error(`cascade_gap insert failed: ${error.message}`);
  return { superseded: priorIds.length, inserted: rows.length, run_id: runId };
}
