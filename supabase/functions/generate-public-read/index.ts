// GATE 6a — generate-public-read. A CONFIRMED, ledgered, judged "Our read" of a company's
// positioning / strategy / promise, computed STRICTLY from PUBLIC-provenance inputs. Nothing
// internal / uploaded / intake / internal_declared can enter: every input is gathered by a query
// whose predicate structurally selects public provenance ONLY (named below), never a filter-after.
//
// Inputs (each row carries its id into input_ledger; provenance drives the router):
//   outside_signals  signals.signal_band='outside' AND voice_class ∈ public voices   → public_observed
//   own_words        own_words_candidates.judge_keep=true                            → public_observed
//   findings         findings.register='public_inferred' AND status='open'           → public_inferred
//   markets          odi_market_definitions.provenance_type='public_research'        → public_research
//   deltas           claim_deltas.pairing_kind='public_vs_public' (echoed|divergent) → public_observed
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
import { citationsLivePublic, framingViolations } from "../_shared/publicReadGuards.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const LOCAL_HOST_ALLOWLIST = new Set(["localhost", "127.0.0.1", "::1", "host.docker.internal"]);
const CB1_FROZEN_ID = "58b2b15b-bada-4bcd-9c12-b7e66a37d0bc";
const PUBLIC_SIGNAL_VOICES = ["outside_voice_about_client", "client_voice", "market_context", "competitor_voice"];
const KINDS = ["positioning", "strategy", "promise"] as const;
type Kind = (typeof KINDS)[number];

function isLocalOllamaUrl(rawUrl: string) {
  try { return LOCAL_HOST_ALLOWLIST.has(String(new URL(rawUrl).hostname || "").trim().toLowerCase()); }
  catch { return false; }
}
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

type InputRow = { id: string; kind: string; provenance: string; text: string };

// Per-kind read caps. A 3-sentence public read needs a tractable, prioritized catalogue — a model
// cannot reliably cite from hundreds of id-tagged rows (it invents ref numbers). The input_ledger
// records EXACTLY the capped set that was read (honest — "these ids, not the whole corpus"). Findings
// (public synthesis) and own-words (the company's own voice) are the highest-signal, so they get the
// widest caps; signals/deltas are sampled. Every capped row is still 100% public-provenance.
const READ_CAP: Record<string, number> = { finding: 25, own_word: 25, signal: 20, market: 10, delta: 15 };

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
    .select("id, claim_text, evidence_excerpt, source_title, topic")
    .eq("company_id", companyId).eq("signal_band", "outside")
    .in("voice_class", PUBLIC_SIGNAL_VOICES).is("superseded_at", null).is("held_at", null);
  for (const s of (sig ?? []) as Array<{ id: string; claim_text: string | null; evidence_excerpt: string | null; source_title: string | null; topic: string | null }>) {
    const text = (s.claim_text ?? s.evidence_excerpt ?? "").trim();
    if (text) rows.push({ id: s.id, kind: "signal", provenance: "public_observed", text: `${text}${s.source_title ? ` (${s.source_title})` : ""}` });
  }

  // 2. own-words — the company's OWN public-site voice, judge-kept only
  const { data: ow } = await supabase
    .from("own_words_candidates").select("id, quote").eq("company_id", companyId).eq("judge_keep", true);
  for (const w of (ow ?? []) as Array<{ id: string; quote: string | null }>) {
    const text = (w.quote ?? "").trim();
    if (text) rows.push({ id: w.id, kind: "own_word", provenance: "public_observed", text });
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

  // 4. markets — public_research provenance ONLY (internal_hypothesis / internal_declared excluded structurally)
  const { data: mk } = await supabase
    .from("odi_market_definitions").select("id, job_executor, jtbd").eq("company_id", companyId).eq("provenance_type", "public_research");
  for (const m of (mk ?? []) as Array<{ id: string; job_executor: string | null; jtbd: string | null }>) {
    const text = [m.job_executor, m.jtbd].map((x) => (x ?? "").trim()).filter(Boolean).join(" — ");
    if (text) rows.push({ id: m.id, kind: "market", provenance: "public_research", text });
  }

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
const KINDS_INPUT = ["signal", "own_word", "finding", "market", "delta"] as const;

// A SHORT-REF catalogue: an LLM cannot reliably echo dozens of 36-char uuids (it mangles them), so
// each input gets a stable, kind-prefixed ref token (S1, O1, F1, M1, D1) mapped to its real id. The
// model cites refs; we validate refs against the map (unknown ref → reject, fail loud) and translate
// accepted refs BACK to the real ledger ids for storage, so stored citations resolve to the ledger.
const REF_PREFIX: Record<string, string> = { signal: "S", own_word: "O", finding: "F", market: "M", delta: "D" };
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
    if (Array.isArray(v)) { if (key && /citation|cite|ids$/i.test(key)) { for (const x of v) if (typeof x === "string") out.push(x.trim()); } else for (const x of v) walk(x); }
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
      if (/citation|cite|ids$/i.test(k) && Array.isArray(v)) out[k] = v.map((x) => (typeof x === "string" ? (uuidByRef.get(x.trim()) ?? x) : x));
      else out[k] = translateCitations(v, uuidByRef);
    }
    return out;
  }
  return payload;
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

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // ── PROMOTE (accept): no generation, no model call. Per kind, flip the staged row (is_current
    //    false→true) and supersede the prior current row (is_current true→false, superseded_by=staged).
    //    The staged row is the unique is_current=false row with superseded_by NULL (staging created it).
    if (doPromote) {
      const promoted: Array<{ kind: Kind; staged: string; superseded: string | null }> = [];
      for (const kind of KINDS) {
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
      // look up what the probe id actually IS (its provenance) — expected internal, NOT public
      let probeFoundAs: string | null = null;
      const { data: c } = await supabase.from("claims").select("id").eq("id", probeId).maybeSingle();
      if (c) probeFoundAs = "claim(internal_declared side)";
      const { data: m } = await supabase.from("odi_market_definitions").select("id, provenance_type").eq("id", probeId).maybeSingle();
      if (m) probeFoundAs = `odi_market_definitions(provenance_type=${(m as { provenance_type?: string }).provenance_type})`;
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
    const CITE_RULE = `You may cite ONLY the short reference tokens that appear in the INPUTS list below, each in square brackets like [S1], [O3], [F2]. The ONLY valid tokens are exactly: ${tokenSummary}. There are NO other tokens — never cite a number outside these ranges, and never invent one. Every substantive claim must cite AT MOST 3 of these tokens in its "citations" array (copy the token EXACTLY as shown). If the public record does not support a field, return it as an empty string "" with an empty citations array — do not guess.`;

    // ── GENERATE each kind ───────────────────────────────────────────────────────────────────────
    const GEN_POSITIONING = `You read a company's PUBLIC record and state its positioning as a hypothesis for the room to test. ${CITE_RULE}
Return ONLY JSON:
{"market_category":"<a plain-language category this business ACTUALLY IS — e.g. 'neighborhood cafe & roaster', not a fancy or aspirational label>","market_category_citations":["<id>"],
 "value_for_customer":"<what a customer gets, in plain words>","value_citations":["<id>"],
 "best_fit_customers":"<who it's for>","best_fit_citations":["<id>"],
 "unique_attributes":[{"text":"<one differentiator>","citations":["<id>"]}]}
${US_ENGLISH_RULE}`;
    const GEN_STRATEGY = `You read a company's PUBLIC record and state its strategy as a hypothesis. ${CITE_RULE}
Return ONLY JSON:
{"winning_aspiration":"<what winning looks like, plainly>","winning_aspiration_citations":["<id>"],
 "where_to_play":"<the arena / who / where>","where_to_play_citations":["<id>"],
 "how_to_win":"<the edge>","how_to_win_citations":["<id>"]}
${US_ENGLISH_RULE}`;
    const GEN_PROMISE = `You read a company's PUBLIC record and state, in ONE sentence, what the customer is promised — stated ONLY as far as the record backs it. ${CITE_RULE}
Return ONLY JSON: {"promise":"<one sentence>","citations":["<id>"]}
${US_ENGLISH_RULE}`;

    const payloads: Record<Kind, Record<string, unknown>> = {} as Record<Kind, Record<string, unknown>>;
    const genSys: Record<Kind, string> = { positioning: GEN_POSITIONING, strategy: GEN_STRATEGY, promise: GEN_PROMISE };
    const citationErrors: Array<{ kind: Kind; bad_ids: string[] }> = [];
    for (const kind of KINDS) {
      const p = await run(genChoice, genSys[kind], `INPUTS:\n${CAT}\n\nProduce the ${kind} JSON.`, 0);
      payloads[kind] = p;
      const bad = citedRefs(p).filter((ref) => !uuidByRef.has(ref));
      if (bad.length) citationErrors.push({ kind, bad_ids: bad });
    }
    // FAIL LOUD: any citation outside the ledger → reject the whole read, write nothing.
    if (citationErrors.length) {
      return json({ ok: false, rejected: "citation_outside_ledger", citation_errors: citationErrors, payloads, ledger_count: ledger.count }, 200);
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
      KINDS.map((k) => [k, translateCitations(payloads[k], uuidByRef)]),
    ) as Record<Kind, Record<string, unknown>>;
    const citedUuids = [...new Set(KINDS.flatMap((k) => citedRefs(payloads[k]).map((ref) => uuidByRef.get(ref)).filter((x): x is string => !!x)))];
    const citationResolution = citedUuids.map((id) => ({
      id, in_ledger: ledgerIds.has(id), provenance: ledger.provenances[id] ?? null,
      public: require_public(ledger.provenances[id]), liveness: ledger.liveness[id] ?? null,
    }));
    const livePublic = citationsLivePublic(citedUuids, ledger.provenances, ledger.liveness);
    if (!livePublic.ok) {
      // A cited id that isn't live-public in the ledger is an integrity failure — reject, write nothing.
      return json({ ok: false, rejected: "citation_not_live_public", bad_ids: livePublic.bad, citation_resolution: citationResolution, payloads, ledger_count: ledger.count }, 200);
    }

    // ── JUDGE all three together: grounding + plain-sanity + consistency ────────────────────────────
    const JUDGE_SYS = `You judge a public-only "Our read" of a company (positioning, strategy, promise). Check THREE things:
(a) GROUNDING — every claim is supported by the cited inputs (the cited excerpts back it; nothing invented);
(b) PLAIN-SANITY — market_category names what this business ACTUALLY IS per its own words and outside signals (a coffee roaster is NOT "SaaS"; a clinic is NOT "marketplace"). Reject an absurd or aspirational category;
(c) CONSISTENCY — positioning, strategy, and promise describe the SAME business and don't contradict each other.
Respond with ONLY JSON:
{"grounding_ok":true|false,"sanity_ok":true|false,"consistency_ok":true|false,
 "per_kind":{"positioning":{"ok":true|false,"reason":"..."},"strategy":{"ok":true|false,"reason":"..."},"promise":{"ok":true|false,"reason":"..."}},
 "accept":true|false,"reason":"<one line>"}`;
    const judgeUser = `INPUTS (id-tagged):\n${CAT}\n\nTHE READ:\npositioning: ${JSON.stringify(payloads.positioning)}\nstrategy: ${JSON.stringify(payloads.strategy)}\npromise: ${JSON.stringify(payloads.promise)}\n\nJudge (a),(b),(c) and decide accept.`;
    const verdict = await run(judgeChoice, JUDGE_SYS, judgeUser, 0);
    const accept = verdict.grounding_ok === true && verdict.sanity_ok === true && verdict.consistency_ok === true && verdict.accept === true;
    const cost = { prompt_tokens: usage.prompt_tokens, completion_tokens: usage.completion_tokens, usd: usdCost(usage) };

    if (!accept) {
      // Reject → no write, verdict returned (nothing persisted).
      return json({ ok: false, rejected: "judge", judge_verdict: verdict, judge_model: judgeChoice.model, payloads, model: { generator: genChoice, judge: judgeChoice }, input_ledger: ledger, cost });
    }
    if (!doWrite && !doStage) {
      return json({ ok: true, dry_run: true, payloads, resolved_payloads: resolvedPayloads, citation_resolution: citationResolution, judge_verdict: verdict, model: { generator: genChoice, judge: judgeChoice }, input_ledger: ledger, cost });
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
      for (const kind of KINDS) {
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
    for (const kind of KINDS) {
      const { data: prior } = await supabase.from("public_reads").select("id").eq("company_id", company_id).eq("kind", kind).eq("is_current", true).maybeSingle();
      const priorId = (prior as { id?: string } | null)?.id ?? null;
      if (priorId) {
        // free the (company,kind) is_current uniqueness before inserting the new current row
        const { error: upErr } = await supabase.from("public_reads").update({ is_current: false }).eq("id", priorId);
        if (upErr) throw new Error(`supersede-prior failed (${kind}): ${upErr.message}`);
      }
      const { data: ins, error: insErr } = await supabase.from("public_reads").insert({
        company_id, kind, payload: translateCitations(payloads[kind], uuidByRef), input_ledger: ledger,
        model_provider: genChoice.provider, model_name: genChoice.model,
        judge_verdict: verdict, judge_model: judgeChoice.model,
        is_current: true, supersedes_legacy_row: legacyFor(kind),
      }).select("id").single();
      if (insErr) throw new Error(`insert failed (${kind}): ${insErr.message}`);
      const newId = (ins as { id: string }).id;
      if (priorId) await supabase.from("public_reads").update({ superseded_by: newId }).eq("id", priorId);
      written.push({ kind, id: newId, superseded: priorId });
    }

    return json({ ok: true, written, payloads, judge_verdict: verdict, judge_model: judgeChoice.model, model: { generator: genChoice, judge: judgeChoice }, input_ledger: ledger, cost });
  } catch (e) {
    return json({ error: `unexpected: ${(e as Error).message}` }, 500);
  }
});

function require_public(p: string | null | undefined): boolean {
  return p === "public_observed" || p === "public_inferred" || p === "public_research" || p === "market_read" || p === "publicly_declared";
}
