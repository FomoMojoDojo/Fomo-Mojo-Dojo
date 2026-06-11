// B2.2b — LOCAL RECONCILER: the ODI-market-vs-external comparison layer.
//
// The internally-defined market (odi_market_definitions: job executor, chooser, jtbd,
// innovation strategy) is compared against what the outside world's evidence says the
// market is (accumulated market_context signals, the public category archetype, the
// discovered competitive set). The gap between internal direction and public reality
// is the finding.
//
// ENTIRELY LOCAL. The internal definition never leaves the machine: the only network
// calls are Postgres and the operator's local Ollama (llama3:70b) for the semantic
// band. This file deliberately imports NOTHING from openaiClient — the boundary is
// physical, not behavioral.
//
// Drift-family reuse, not a sibling mechanism: findings persist as ONE
// surface_drift_assessments row (surface_type='market_definition', surface_id =
// odi_market_definitions.id), updated in place per family convention. The row's
// assessment_basis carries: the BASELINE (first reconcile, never overwritten), the
// LATEST per-dimension findings with citations on both sides, and the VERDICT LEDGER
// (comparison identity → verdict, first-verdict-wins — re-runs read, never re-roll).
//
// Posture (job-steps-preserve law applied to market state): initial reconcile =
// baseline recorded quietly; later reconciles = compare; a CHANGED comparison with
// divergence ⇒ alert (drift_state != aligned ⇒ drift inbox); unchanged ⇒ quiet.
// NEVER a reset: odi_market_definitions and signals are read-only here; the only
// write is the drift row.
//
// "The market has no independent read on this yet" is a finding
// (insufficient_evidence), not a failure, and is never padded into a verdict.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildClientCorpus, resolveSyndicationDurable, type ClientCorpus } from "../_shared/syndication.ts";
import { recordIntegrityRun } from "../_shared/integrity.ts";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ── Text helpers (deterministic layer) ─────────────────────────────────────────
const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "of", "to", "in", "for", "with", "at", "on", "by", "is",
  "are", "be", "being", "been", "this", "that", "these", "those", "they", "their", "them",
  "it", "its", "as", "so", "can", "from", "when", "trying", "want", "wants", "complete",
  "completing", "job", "jobs", "achieve", "intended", "move", "moving", "all", "any",
  "such", "into", "out", "we", "our", "you", "your", "who", "than", "more", "most",
]);

function normWords(text: string): string[] {
  return String(text || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function coreTokens(text: string): Set<string> {
  return new Set(normWords(text).filter((w) => w.length > 2 && !STOPWORDS.has(w)));
}

// Share of A's tokens present in B.
function containment(a: Set<string>, b: Set<string>): number {
  if (a.size === 0) return 0;
  let hit = 0;
  for (const t of a) if (b.has(t)) hit++;
  return hit / a.size;
}

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Comparison identity: dimension + both sides' normalized text. One identity, one
// verdict, persisted in the row's verdict ledger — no re-rolling.
async function comparisonIdentity(dimension: string, internalText: string, externalText: string): Promise<string> {
  return (await sha256Hex(`${dimension}::${normWords(internalText).join(" ")}::${normWords(externalText).join(" ")}`)).slice(0, 32);
}

// ── Local semantic band (llama3:70b via Ollama — never external) ───────────────
async function localLlmYesNo(prompt: string): Promise<boolean | null> {
  const base = Deno.env.get("OLLAMA_SYNDICATION_BASE_URL") || Deno.env.get("OLLAMA_BASE_URL");
  const model = Deno.env.get("OLLAMA_RECONCILE_MODEL") || Deno.env.get("OLLAMA_SYNDICATION_MODEL") || "llama3:70b";
  if (!base) {
    console.warn("[market-reconcile] local LLM: no base URL in runtime env — semantic band unavailable");
    return null;
  }
  try {
    const root = String(base).replace(/\/+$/, "").replace(/\/v1$/, "");
    const res = await fetch(`${root}/api/generate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model, stream: false, prompt }),
    });
    if (!res.ok) { console.warn("[market-reconcile] local LLM HTTP error", { status: res.status }); return null; }
    const data = await res.json();
    const answer = String((data as { response?: string })?.response || "").trim().toUpperCase();
    if (answer.startsWith("YES")) return true;
    if (answer.startsWith("NO")) return false;
    return null;
  } catch (error) {
    console.warn("[market-reconcile] local LLM fetch failed", { message: String(error instanceof Error ? error.message : error).slice(0, 200) });
    return null;
  }
}

// ── Locale extraction (deterministic) ──────────────────────────────────────────
// "City, ST" pairs plus hyphenated metros ("Dallas-Fort Worth"). Case-sensitive on
// the source text — locale names are capitalized in evidence prose.
function extractLocales(text: string): Set<string> {
  const out = new Set<string>();
  const cityState = /([A-Z][A-Za-z]+(?:[-–\s][A-Z][A-Za-z]+){0,3}),\s*(TX|Texas|[A-Z]{2})\b/g;
  for (const m of String(text || "").matchAll(cityState)) {
    out.add(m[1].toLowerCase().replace(/[–\s]+/g, "-"));
    out.add(m[2].toLowerCase() === "texas" ? "tx" : m[2].toLowerCase());
  }
  return out;
}

type DimensionFinding = {
  dimension: string;
  verdict: "aligned" | "divergent" | "insufficient_evidence";
  method: "deterministic" | "local_llm" | "stored";
  score: number | null;
  identity: string | null;
  internal_cited: string;
  external_cited: Array<{ source: string; text: string }>;
  detail: string;
  competitors?: Array<{ name: string; domain: string; verdict: string; method: string; score: number | null; identity: string }>;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    if (!supabaseUrl || !serviceRoleKey || !anonKey) return json({ error: "Missing Supabase env vars" }, 500);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "No auth header" }, 401);
    const bearerToken = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (bearerToken !== serviceRoleKey) {
      const anonClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
      const { data: userRes, error: authError } = await anonClient.auth.getUser();
      if (authError || !userRes?.user) return json({ error: "Unauthorized" }, 401);
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey) as unknown as { from: (t: string) => any };
    const body = await req.json().catch(() => ({}));
    const company_id = String((body as Record<string, unknown>)?.company_id || "").trim();
    const dry_run = !!(body as Record<string, unknown>)?.dry_run;
    if (!company_id) return json({ error: "company_id required" }, 400);

    // ── INTERNAL side (read-only, never leaves the machine) ────────────────────
    const { data: mktdefRows } = await supabase
      .from("odi_market_definitions")
      .select("id, jtbd, job_executor, chooser, innovation_strategy, updated_at")
      .eq("company_id", company_id)
      .order("updated_at", { ascending: false })
      .limit(1);
    const mktdef = (Array.isArray(mktdefRows) ? mktdefRows[0] : null) as
      | { id: string; jtbd?: string; job_executor?: string; chooser?: string; innovation_strategy?: string }
      | null;
    if (!mktdef) {
      console.log("[market-reconcile] no internal market definition — nothing to reconcile", { company_id });
      return json({ status: "no_internal_definition", company_id });
    }
    const internalJtbd = String(mktdef.jtbd || "");
    const internalExecutor = String(mktdef.job_executor || "");
    const internalChooser = String(mktdef.chooser || "");
    const internalStrategy = String(mktdef.innovation_strategy || "");
    const internalFull = [internalJtbd, internalExecutor, internalChooser, internalStrategy].filter(Boolean).join("\n");

    // ── EXTERNAL side (accumulated public evidence, read-only) ─────────────────
    const { data: company } = await supabase
      .from("companies").select("name, website").eq("id", company_id).maybeSingle();
    const companyHost = (() => {
      try { return new URL(String((company as { website?: string } | null)?.website || "")).hostname.replace(/^www\./, "").toLowerCase(); } catch { return ""; }
    })();

    const { data: baselineRun } = await supabase
      .from("public_baseline_runs")
      .select("id, result_json")
      .eq("company_id", company_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const archetype = String((baselineRun as { result_json?: { category_archetype?: string } } | null)?.result_json?.category_archetype || "").trim();
    const archetypeSource = baselineRun ? `public_baseline_runs ${(baselineRun as { id?: unknown }).id} category_archetype` : "";

    const { data: compRun } = await supabase
      .from("competitor_discovery_runs")
      .select("id, result_json")
      .eq("company_id", company_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const compJson = (compRun as { result_json?: unknown } | null)?.result_json as {
      competitors?: Array<{ name?: string; domain?: string; items?: Array<{ url?: string; snippet?: string }> }>;
      market_context_items?: Array<{ url?: string; snippet?: string }>;
    } | null;
    const competitors = Array.isArray(compJson?.competitors) ? compJson.competitors : [];

    const { data: mktSignals } = await supabase
      .from("signals")
      .select("source_url, claim_text, evidence_excerpt")
      .eq("company_id", company_id)
      .eq("voice_class", "market_context")
      .order("created_at", { ascending: true })
      .limit(40);
    const marketTextsRaw: Array<{ source: string; text: string }> = [
      ...(Array.isArray(mktSignals) ? mktSignals : []).map((s: { source_url?: string; claim_text?: string; evidence_excerpt?: string }) => ({
        source: String(s.source_url || ""),
        text: String(s.claim_text || s.evidence_excerpt || ""),
      })),
      ...(Array.isArray(compJson?.market_context_items) ? compJson.market_context_items : []).map((i) => ({
        source: String(i?.url || ""),
        text: String(i?.snippet || ""),
      })),
    ].filter((i) => i.text);

    // B2.2a admission discipline where it applies: syndicated items don't get to
    // describe the market either. Verdict store first; unresolved ⇒ excluded, loud.
    const corpus: ClientCorpus = await buildClientCorpus(supabase, company_id, companyHost);
    const clientSample = corpus.texts.slice(0, 3).join("\n").slice(0, 4000);
    const marketTexts: Array<{ source: string; text: string }> = [];
    let syndicatedExcluded = 0, unresolvedExcluded = 0;
    for (const item of marketTextsRaw.slice(0, 24)) {
      const verdict = await resolveSyndicationDurable({
        supabase, companyId: company_id, sourceUrl: item.source, itemText: item.text,
        corpus, clientSampleForLlm: clientSample, label: "market-reconcile/external",
      });
      if (verdict.syndicated === true) { syndicatedExcluded++; continue; }
      if (verdict.syndicated === null) { unresolvedExcluded++; continue; }
      marketTexts.push(item);
    }
    const externalMarketBlob = [archetype, ...marketTexts.map((m) => m.text)].filter(Boolean).join("\n");

    // ── Prior row: baseline + verdict ledger (one row per surface, family law) ──
    const { data: existingRow } = await supabase
      .from("surface_drift_assessments")
      .select("id, assessment_basis, drift_state")
      .eq("company_id", company_id)
      .eq("surface_type", "market_definition")
      .eq("surface_id", mktdef.id)
      .maybeSingle();
    const priorBasis = (existingRow as { assessment_basis?: Record<string, unknown> } | null)?.assessment_basis ?? null;
    const verdictLedger: Record<string, { verdict: string; method: string; score: number | null }> =
      (priorBasis?.verdict_ledger as Record<string, { verdict: string; method: string; score: number | null }>) ?? {};

    // Band resolution through the ledger: one comparison identity, one verdict.
    async function bandVerdict(identity: string, prompt: string, detScore: number): Promise<{ aligned: boolean | null; method: "local_llm" | "stored"; score: number }> {
      const stored = verdictLedger[identity];
      if (stored && (stored.verdict === "aligned" || stored.verdict === "divergent")) {
        console.log("[market-reconcile] stored comparison verdict read", { identity, verdict: stored.verdict, original_method: stored.method });
        return { aligned: stored.verdict === "aligned", method: "stored", score: stored.score ?? detScore };
      }
      const llm = await localLlmYesNo(prompt);
      if (llm === null) return { aligned: null, method: "local_llm", score: detScore };
      return { aligned: llm, method: "local_llm", score: detScore };
    }

    const dimensions: DimensionFinding[] = [];

    // ── Dimension 1: locale/territory (string-level, deterministic only) ────────
    {
      const externalLocales = extractLocales([archetype, ...marketTexts.map((m) => m.text)].join("\n"));
      const internalLocales = extractLocales(internalFull);
      const internalLower = internalFull.toLowerCase();
      const externalCited = archetype ? [{ source: archetypeSource, text: archetype }] : [];
      let verdict: DimensionFinding["verdict"];
      let detail: string;
      if (externalLocales.size === 0) {
        verdict = "insufficient_evidence";
        detail = "Public evidence names no recognizable territory — the market has no independent locale read yet.";
      } else {
        const mentioned = Array.from(externalLocales).some((loc) => internalLower.includes(loc.replace(/-/g, " ")) || internalLower.includes(loc));
        if (internalLocales.size === 0 && !mentioned) {
          verdict = "insufficient_evidence";
          detail = `Internal definition names no territory; public evidence places the market in: ${Array.from(externalLocales).join(", ")}. No contradiction — the internal side is silent.`;
        } else if (mentioned || Array.from(internalLocales).some((l) => externalLocales.has(l))) {
          verdict = "aligned";
          detail = `Territory consistent: ${Array.from(externalLocales).join(", ")}.`;
        } else {
          verdict = "divergent";
          detail = `Internal territory (${Array.from(internalLocales).join(", ")}) does not match public territory (${Array.from(externalLocales).join(", ")}).`;
        }
      }
      dimensions.push({
        dimension: "locale_territory", verdict, method: "deterministic", score: null, identity: null,
        internal_cited: internalFull.slice(0, 200), external_cited: externalCited, detail,
      });
    }

    // ── Dimension 2: category frame (deterministic overlap, 70b band) ───────────
    {
      const internalCat = `${internalJtbd}\n${internalStrategy}`;
      if (!archetype && marketTexts.length === 0) {
        dimensions.push({
          dimension: "category_frame", verdict: "insufficient_evidence", method: "deterministic", score: null, identity: null,
          internal_cited: internalCat.slice(0, 200), external_cited: [],
          detail: "No public category archetype and no market-context evidence — the market has no independent category read yet.",
        });
      } else {
        const score = containment(coreTokens(internalCat), coreTokens(externalMarketBlob));
        const identity = await comparisonIdentity("category_frame", internalCat, externalMarketBlob);
        const externalCited = [
          ...(archetype ? [{ source: archetypeSource, text: archetype }] : []),
          ...marketTexts.slice(0, 4).map((m) => ({ source: m.source, text: m.text.slice(0, 160) })),
        ];
        // Calibration law (measured on IAQM): containment is reliable evidence of SAMENESS,
        // unreliable evidence of DIFFERENCE — process-language definitions share little
        // vocabulary with service-description prose even when the market is identical.
        // Deterministic shortcut concludes aligned ONLY; divergence requires the judge.
        let verdict: DimensionFinding["verdict"]; let method: DimensionFinding["method"] = "deterministic"; let detail: string;
        if (score >= 0.45) { verdict = "aligned"; detail = `Internal category vocabulary is substantially present in public market evidence (containment ${score.toFixed(3)}).`; }
        else {
          const band = await bandVerdict(identity,
            `Answer with exactly one word: YES or NO.\nDo these two descriptions refer to the SAME market category?\n\nINTERNAL (the company's own market definition):\n${internalCat.slice(0, 1200)}\n\nPUBLIC EVIDENCE (what outside sources say the market is):\n${externalMarketBlob.slice(0, 2400)}\n\nAnswer:`, score);
          method = band.method;
          if (band.aligned === null) { verdict = "insufficient_evidence"; detail = `Semantic band unresolved (local model unavailable) at containment ${score.toFixed(3)} — recorded as insufficient, not guessed.`; }
          else { verdict = band.aligned ? "aligned" : "divergent"; detail = `Semantic band (containment ${score.toFixed(3)}): ${band.aligned ? "same" : "different"} market category per ${band.method === "stored" ? "stored verdict" : "llama3:70b"}.`; }
        }
        dimensions.push({ dimension: "category_frame", verdict, method, score: Number(score.toFixed(4)), identity, internal_cited: internalCat.slice(0, 200), external_cited: externalCited, detail });
      }
    }

    // ── Dimension 3: competitive-set coherence (per-competitor) ─────────────────
    {
      const internalCore = coreTokens(`${internalJtbd}\n${internalExecutor}`);
      if (competitors.length === 0) {
        dimensions.push({
          dimension: "competitive_set_coherence", verdict: "insufficient_evidence", method: "deterministic", score: null, identity: null,
          internal_cited: internalJtbd.slice(0, 200), external_cited: [],
          detail: "No discovered competitive set — the market has no independent competitor read yet.",
        });
      } else {
        const perCompetitor: NonNullable<DimensionFinding["competitors"]> = [];
        const incoherent: string[] = [];
        for (const comp of competitors) {
          const name = String(comp?.name || "unknown");
          const domain = String(comp?.domain || "");
          const compText = (Array.isArray(comp?.items) ? comp.items : []).map((i) => String(i?.snippet || "")).join("\n");
          const score = containment(internalCore, coreTokens(`${name}\n${compText}`));
          const identity = await comparisonIdentity(`competitor_coherence:${domain}`, `${internalJtbd}\n${internalExecutor}`, compText);
          let v: string; let method = "deterministic";
          // Same calibration law: low overlap escalates to the judge, never concludes.
          if (score >= 0.3) v = "coherent";
          else {
            const band = await bandVerdict(identity,
              `Answer with exactly one word: YES or NO.\nDoes this business compete for the job described?\n\nJOB (internal definition): ${internalJtbd.slice(0, 600)}\nJOB EXECUTOR: ${internalExecutor.slice(0, 200)}\n\nBUSINESS "${name}" (public evidence):\n${compText.slice(0, 1600)}\n\nAnswer:`, score);
            method = band.method;
            v = band.aligned === null ? "unresolved" : band.aligned ? "coherent" : "incoherent";
          }
          if (v === "incoherent") incoherent.push(name);
          perCompetitor.push({ name, domain, verdict: v, method, score: Number(score.toFixed(4)), identity });
        }
        const unresolvedCount = perCompetitor.filter((c) => c.verdict === "unresolved").length;
        // Majority rule: one exception in an otherwise-coherent set is a named finding,
        // not market drift — the dimension diverges when MOST of the discovered set
        // does not compete for the internally-defined job.
        const judged = perCompetitor.length - unresolvedCount;
        const verdict: DimensionFinding["verdict"] = judged === 0 ? "insufficient_evidence"
          : incoherent.length * 2 > judged ? "divergent" : "aligned";
        dimensions.push({
          dimension: "competitive_set_coherence", verdict,
          method: perCompetitor.some((c) => c.method !== "deterministic") ? "local_llm" : "deterministic",
          score: null, identity: null,
          internal_cited: `${internalJtbd.slice(0, 160)} | executor: ${internalExecutor.slice(0, 80)}`,
          external_cited: competitors.map((c) => ({ source: String(c?.domain || ""), text: String(c?.name || "") })),
          detail: verdict === "divergent"
            ? `Majority of the discovered set does not compete for the internally-defined job: ${incoherent.join(", ")}.`
            : verdict === "insufficient_evidence"
              ? "All per-competitor checks unresolved (local model unavailable) — insufficient, not guessed."
              : incoherent.length > 0
                ? `${perCompetitor.length - incoherent.length}/${perCompetitor.length} discovered competitors compete for the internally-defined job. Named exception(s): ${incoherent.join(", ")}.`
                : `All ${perCompetitor.length} discovered competitors compete for the internally-defined job.`,
          competitors: perCompetitor,
        });
      }
    }

    // ── Dimensions 4 & 5: buyer split (operator-signed, Living Memory 2026-06-11) ──
    // The compound buyer/executor question is retired: the 70b NO at containment 0.43
    // on IAQM conflated "who is served" with "who chooses/pays". Two narrower
    // questions replace it — no thresholds change, the deterministic layer still
    // concludes aligned only, and the judge's honest answer stands either way.
    {
      // Singular-stemmed role lexicon (homeowner ≡ homeowners). The external side is
      // ROLE-BEARING texts only — market-size reports and licensing prose describe the
      // industry, not its buyers (first IAQM calibration run proved the category error).
      const ROLE_LEXICON = new Set(["homeowner", "property", "owner", "manager", "resident", "occupant", "tenant", "employee", "business", "commercial", "residential", "family", "families", "buyer", "customer", "client", "realtor", "landlord"]);
      const stem = (w: string) => ROLE_LEXICON.has(w) ? w : (w.endsWith("s") && ROLE_LEXICON.has(w.slice(0, -1)) ? w.slice(0, -1) : null);
      const rolesIn = (text: string) => new Set(normWords(text).map(stem).filter((w): w is string => w !== null));
      const externalRoleTexts = [
        ...marketTexts,
        ...competitors.flatMap((c) => (Array.isArray(c?.items) ? c.items : []).map((i) => ({ source: String(i?.url || ""), text: String(i?.snippet || "") }))),
      ].filter((t) => t.text && rolesIn(t.text).size > 0);
      const externalRoles = rolesIn(externalRoleTexts.map((t) => t.text).join("\n"));
      const roleSample = externalRoleTexts.slice(0, 6).map((t) => t.text).join("\n").slice(0, 1800);
      const externalCited = externalRoleTexts.slice(0, 4).map((m) => ({ source: m.source, text: m.text.slice(0, 160) }));

      // One narrowed dimension per internal role set; identical machinery, narrower question.
      const evalRoleDimension = async (opts: {
        dimension: string;
        internalText: string;
        roleLabel: string;        // for detail strings
        question: string;         // the narrowed 70b question
        silentDetail: string;     // internal side names no roles
      }) => {
        const internalRoles = rolesIn(opts.internalText);
        if (internalRoles.size === 0 || externalRoles.size === 0) {
          dimensions.push({
            dimension: opts.dimension, verdict: "insufficient_evidence", method: "deterministic", score: null, identity: null,
            internal_cited: opts.internalText.slice(0, 200),
            external_cited: externalCited,
            detail: internalRoles.size === 0
              ? opts.silentDetail
              : "Public evidence names no recognizable buyer/executor roles — the market has no independent read on this yet.",
          });
          return;
        }
        const score = containment(internalRoles, externalRoles);
        // Identity follows the judged evidence: this dimension's internal side + the sample.
        const identity = await comparisonIdentity(opts.dimension, opts.internalText, roleSample);
        let verdict: DimensionFinding["verdict"]; let method: DimensionFinding["method"] = "deterministic"; let detail: string;
        if (score >= 0.5) {
          verdict = "aligned";
          detail = `Internal ${opts.roleLabel} roles (${Array.from(internalRoles).join(", ")}) substantially present in public evidence roles (${Array.from(externalRoles).join(", ")}); containment ${score.toFixed(3)}.`;
        } else {
          const band = await bandVerdict(identity,
            `Answer with exactly one word: YES or NO.\n${opts.question}\n\nINTERNAL ${opts.roleLabel.toUpperCase()}: ${opts.internalText.slice(0, 400)}\n\nPUBLIC EVIDENCE ROLES: ${Array.from(externalRoles).join(", ")}\nPUBLIC EVIDENCE (role-bearing items):\n${roleSample}\n\nAnswer:`, score);
          method = band.method;
          if (band.aligned === null) { verdict = "insufficient_evidence"; detail = `Semantic band unresolved at role containment ${score.toFixed(3)} — insufficient, not guessed.`; }
          else { verdict = band.aligned ? "aligned" : "divergent"; detail = `Semantic band (role containment ${score.toFixed(3)}): ${band.aligned ? "same" : "different"} ${opts.roleLabel} per ${band.method === "stored" ? "stored verdict" : "llama3:70b"}.`; }
        }
        dimensions.push({ dimension: opts.dimension, verdict, method, score: Number(score.toFixed(4)), identity, internal_cited: opts.internalText.slice(0, 200), external_cited: externalCited, detail });
      };

      await evalRoleDimension({
        dimension: "buyer_beneficiary_alignment",
        internalText: internalExecutor,
        roleLabel: "beneficiary",
        question: "Does the PUBLIC EVIDENCE below describe a market serving the people named as the INTERNAL BENEFICIARY (the people who experience and benefit from the job)?",
        silentDetail: "Internal definition names no recognizable beneficiary roles — internal side silent on this dimension.",
      });
      await evalRoleDimension({
        dimension: "buyer_chooser_alignment",
        internalText: internalChooser,
        roleLabel: "chooser",
        question: "Does the PUBLIC EVIDENCE below describe the same people choosing and paying for services as the INTERNAL CHOOSER (the buyer who makes the hire/purchase decision)?",
        silentDetail: "Internal definition names no recognizable chooser roles — internal side silent on this dimension.",
      });
    }

    // ── Aggregate + alert posture ───────────────────────────────────────────────
    const divergent = dimensions.filter((d) => d.verdict === "divergent");
    const assessable = dimensions.filter((d) => d.verdict !== "insufficient_evidence");
    const computedState = divergent.length === 0 ? "aligned" : divergent.length === 1 ? "slight_drift" : "material_drift";
    const computedScore = assessable.length ? Number((divergent.length / assessable.length).toFixed(4)) : 0;

    // Merge verdict ledger: first verdict wins — only ADD identities.
    const ledgerOut = { ...verdictLedger };
    const recordLedger = (identity: string | null, verdict: string, method: string, score: number | null) => {
      if (!identity || verdict === "insufficient_evidence") return; // unresolved is never persisted
      if (!ledgerOut[identity]) ledgerOut[identity] = { verdict, method, score };
    };
    for (const d of dimensions) {
      recordLedger(d.identity, d.verdict, d.method, d.score);
      for (const c of d.competitors ?? []) {
        if (c.verdict === "coherent") recordLedger(c.identity, "aligned", c.method, c.score);
        else if (c.verdict === "incoherent") recordLedger(c.identity, "divergent", c.method, c.score);
      }
    }

    const isBaseline = !priorBasis;
    // New-dimension baseline law (buyer split, 2026-06-11): the first evaluation of a
    // dimension with no prior verdict is DISCOVERY — findings and citations are
    // written, but that dimension contributes neither to "changed" nor to the alert.
    // Subsequent runs compare. (Falls out of comparing over the intersection of prior
    // and current dimension names; a removed dimension is retirement, not divergence.)
    const priorDimMap = new Map<string, string>(
      (((priorBasis?.latest as { dimensions?: DimensionFinding[] } | undefined)?.dimensions) ?? [])
        .map((d) => [String(d.dimension), String(d.verdict)]),
    );
    const newDimensions = dimensions.filter((d) => !priorDimMap.has(d.dimension)).map((d) => d.dimension);
    const comparedDims = dimensions.filter((d) => priorDimMap.has(d.dimension));
    const changed = !isBaseline && comparedDims.some((d) => priorDimMap.get(d.dimension) !== d.verdict);
    const alertDivergent = comparedDims.filter((d) => d.verdict === "divergent");
    // Alert law: baseline quiet; unchanged quiet; changed comparison WITH divergence
    // among COMPARED dimensions ⇒ alert. Discovery dimensions never alert alone.
    const driftState = isBaseline ? "aligned" : changed && alertDivergent.length > 0 ? computedState : "aligned";
    const driftScore = driftState === "aligned" ? 0 : computedScore;

    const basis = {
      reconciler: "market_definition_v1",
      baseline: isBaseline
        ? { recorded_at: new Date().toISOString(), computed_state: computedState, dimensions }
        : priorBasis?.baseline ?? null,
      latest: {
        computed_state: computedState,
        computed_score: computedScore,
        changed_since_prior: changed,
        new_dimensions_discovered: newDimensions,
        no_change: !isBaseline && !changed,
        dimensions,
        external_evidence: {
          archetype_source: archetypeSource || null,
          market_texts_used: marketTexts.length,
          syndicated_excluded: syndicatedExcluded,
          unresolved_excluded: unresolvedExcluded,
          competitors: competitors.length,
        },
      },
      verdict_ledger: ledgerOut,
    };

    console.log("[market-reconcile] composition", {
      company_id,
      surface_id: mktdef.id,
      baseline: isBaseline,
      changed_since_prior: changed,
      computed_state: computedState,
      drift_state_written: driftState,
      dimensions: dimensions.map((d) => ({ dimension: d.dimension, verdict: d.verdict, method: d.method, score: d.score })),
      external: basis.latest.external_evidence,
      ledger_size: Object.keys(ledgerOut).length,
    });

    await recordIntegrityRun(supabase, {
      company_id, component: "market_reconcile", surface_type: "market_definition",
      surface_id: String(mktdef.id), status: "completed",
      examined: dimensions.length, admitted: dimensions.filter((d) => d.verdict === "aligned").length,
      excluded_by_rule: {
        dimensions: dimensions.map((d) => ({ dimension: d.dimension, verdict: d.verdict, method: d.method, score: d.score })),
        external_evidence: basis.latest.external_evidence,
        computed_state: computedState, baseline: isBaseline, changed_since_prior: changed,
      },
      run_ref: archetypeSource || null,
    });

    if (dry_run) return json({ status: "dry_run", company_id, drift_state: driftState, basis });

    const payload = {
      company_id,
      surface_type: "market_definition",
      surface_id: mktdef.id,
      drift_score: driftScore,
      drift_state: driftState,
      llm_confirmation: divergent.length ? divergent.map((d) => `${d.dimension}: ${d.detail}`).join(" ") : null,
      assessment_basis: basis,
      last_assessed_at: new Date().toISOString(),
      // Council Q5 (2026-06-11): acceptance is PER-ASSESSMENT. A changed comparison
      // that alerts is a NEW assessment — a prior "accept as aligned" must not mute
      // it, and the operator hasn't seen it yet. Quiet updates leave operator state
      // untouched.
      ...(driftState !== "aligned" ? { accepted_as_aligned_at: null, operator_seen_at: null } : {}),
    };
    if ((existingRow as { id?: string } | null)?.id) {
      await supabase.from("surface_drift_assessments").update(payload).eq("id", (existingRow as { id: string }).id);
    } else {
      await supabase.from("surface_drift_assessments").insert(payload);
    }

    return json({ status: "ok", company_id, surface_id: mktdef.id, baseline: isBaseline, drift_state: driftState, computed_state: computedState, dimensions: dimensions.map((d) => ({ dimension: d.dimension, verdict: d.verdict })) });
  } catch (error) {
    console.error("[market-reconcile] error", error);
    return json({ error: String(error instanceof Error ? error.message : error) }, 500);
  }
});
