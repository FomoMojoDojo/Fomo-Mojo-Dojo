// GATE (2026-08-22) — generate-conflict-explanation. A client-facing "what differs" one-liner per
// DIVERGENT public_vs_public pair, grounded STRICTLY to the pair's two texts (the declared own-words
// claim + the contra public excerpt). Replaces the circular judge_reason on the First Read surface;
// judge_reason is left intact. Shape: "You {declared claim in brief}; {these sources} {what they
// allege that differs}." — states BOTH sides in plain language, no verdict word, cites nothing outside
// the two texts. Model via the provenance router: both sides public_observed → external gpt-4.1-mini;
// any non-public input forces local (reported). Every explanation passes a GROUNDING JUDGE (declared
// half supported by declared text, contra half supported by contra excerpt, no new host/entity/claim)
// AND a deterministic host guard before it is stored. Reject → store nothing (render falls back).
// CB1 (58b2b15b) is refused by id here and by the claim_deltas freeze trigger.

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { US_ENGLISH_RULE } from "../_shared/languageRule.ts";
import { resolveModel, callOpenAIJson, withRetry429, usdCost, type OpenAIUsage } from "../_shared/modelRouter.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const LOCAL_HOST_ALLOWLIST = new Set(["localhost", "127.0.0.1", "::1", "host.docker.internal"]);
const CB1_FROZEN_ID = "58b2b15b-bada-4bcd-9c12-b7e66a37d0bc";
const DOMAIN_RE = /\b[a-z0-9][a-z0-9-]*\.(?:com|org|net|io|gov|edu|co|us|ai|info|biz)\b/g;
// Canned generic-valence mood words — banned as the allegation (the gate's explicit list). A pure-
// valence excerpt must yield the honest sentinel instead, never a hedged "declining in quality".
const BANNED_VALENCE = /\b(going\s+down\s?hill|down\s?hill|declining|in\s+decline|worse\s+than\s+before|not\s+what\s+it\s+(?:used\s+to\s+be|once\s+was)|going\s+under)\b/i;

function isLocalOllamaUrl(rawUrl: string) {
  try { return LOCAL_HOST_ALLOWLIST.has(String(new URL(rawUrl).hostname || "").trim().toLowerCase()); }
  catch { return false; }
}
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
function bareHost(url: string | null | undefined): string | null {
  if (!url) return null;
  try { return new URL(url.includes("://") ? url : `https://${url}`).hostname.replace(/^www\./, "") || null; }
  catch { return null; }
}

type Pair = {
  id: string;
  declaredText: string; declaredProv: string | null; declaredHost: string | null;
  contraText: string; contraProv: string | null; contraHost: string | null;
};

// Newest outside-band signal host per claim id (for the "these sources" context — NOT for claims).
async function hostsByClaim(supabase: SupabaseClient, claimIds: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!claimIds.length) return out;
  const { data: refs } = await supabase.from("claim_signal_refs").select("claim_id, signal_id").in("claim_id", claimIds);
  const refRows = (refs ?? []) as Array<{ claim_id: string; signal_id: string }>;
  const sigIds = [...new Set(refRows.map((r) => r.signal_id))];
  if (!sigIds.length) return out;
  const { data: sigs } = await supabase.from("signals").select("id, source_url, event_date").eq("signal_band", "outside").in("id", sigIds);
  const byId = new Map(((sigs ?? []) as Array<{ id: string; source_url: string | null; event_date: string | null }>).map((s) => [s.id, s]));
  const newest = new Map<string, { host: string | null; date: string }>();
  for (const r of refRows) {
    const s = byId.get(r.signal_id); if (!s) continue;
    const prev = newest.get(r.claim_id);
    if (!prev || (s.event_date ?? "") > prev.date) newest.set(r.claim_id, { host: bareHost(s.source_url), date: s.event_date ?? "" });
  }
  for (const [cid, v] of newest) if (v.host) out.set(cid, v.host);
  return out;
}

async function loadDivergentPairs(supabase: SupabaseClient, companyId: string, pairIds?: string[]): Promise<Pair[]> {
  let q = supabase.from("claim_deltas").select("id, declared_claim_id, public_claim_id")
    .eq("company_id", companyId).eq("pairing_kind", "public_vs_public").eq("delta_type", "divergent");
  if (pairIds && pairIds.length) q = q.in("id", pairIds);
  const { data: rows } = await q;
  const deltas = (rows ?? []) as Array<{ id: string; declared_claim_id: string | null; public_claim_id: string | null }>;
  const claimIds = [...new Set(deltas.flatMap((d) => [d.declared_claim_id, d.public_claim_id]).filter((x): x is string => !!x))];
  const claimById = new Map<string, { statement: string; provenance: string | null }>();
  if (claimIds.length) {
    const { data: cl } = await supabase.from("claims").select("id, statement, provenance").in("id", claimIds);
    for (const c of (cl ?? []) as Array<{ id: string; statement: string | null; provenance: string | null }>) {
      claimById.set(c.id, { statement: (c.statement ?? "").trim(), provenance: c.provenance });
    }
  }
  const hosts = await hostsByClaim(supabase, claimIds);
  const pairs: Pair[] = [];
  for (const d of deltas) {
    const decl = d.declared_claim_id ? claimById.get(d.declared_claim_id) : null;
    const pub = d.public_claim_id ? claimById.get(d.public_claim_id) : null;
    if (!decl?.statement || !pub?.statement) continue;
    pairs.push({
      id: d.id,
      declaredText: decl.statement, declaredProv: decl.provenance, declaredHost: d.declared_claim_id ? hosts.get(d.declared_claim_id) ?? null : null,
      contraText: pub.statement, contraProv: pub.provenance, contraHost: d.public_claim_id ? hosts.get(d.public_claim_id) ?? null : null,
    });
  }
  return pairs;
}

// Deterministic host guard: the explanation may cite ONLY domains that appear in the pair's hosts.
function citesOnlyPairHosts(explanation: string, pairHosts: Set<string>): boolean {
  const cited = (explanation.toLowerCase().match(DOMAIN_RE) ?? []);
  return cited.every((h) => pairHosts.has(h));
}

// The honest line for a CONTRA excerpt that is pure valence with no concrete claim. Its distinctive
// tail ("critical without specifics") is the sentinel the render uses to prefer a SPECIFIC pair.
const NON_SPECIFIC_ALLEGE = "a public review is critical without specifics";

const GEN_SYS = `You are given ONE claim a company makes about itself (DECLARED) and ONE public statement that DIFFERS from it (CONTRA), plus the source host for context. Write ONE sentence, at most ~30 words, that says WHAT DIFFERS — state the company's claim in brief, then what the source SPECIFICALLY alleges that differs.

The "alleges" half MUST name the concrete substance the CONTRA excerpt actually raises — the real topic and claim (e.g. "allege safety concerns for clients and staff", "report a decline in food quality after an ownership change", "list the location as closed"). Stay close to the excerpt's wording; do NOT quote more than 15 words.

FORBIDDEN: a generic-valence summary with no concrete claim. Never use only a mood word — "going downhill", "declining", "worse than before", "not what it used to be", "bad", "terrible" — as the allegation. If the excerpt raises a specific topic, name that topic.

If the CONTRA excerpt GENUINELY contains no specific claim — it is pure valence with no concrete topic (e.g. "1 star, terrible", "going downhill", "not what it used to be") — do NOT invent one and do NOT paraphrase it into "declining in quality" or similar. The alleges half must then be VERBATIM: "${NON_SPECIFIC_ALLEGE}" — nothing added, no hedge.

Shape: "You {declared claim in brief}; {these sources} {specific allegation, OR the honest non-specific line}." Plain language, no verdict word (contradicts/disputes/conflicts). Cite nothing not in the two texts (you may name the given source host). Respond with ONLY JSON: {"explanation":"..."}. No other text.

${US_ENGLISH_RULE}`;

const JUDGE_SYS = `You judge whether a one-line "what differs" explanation is GROUNDED and SPECIFIC. You are given DECLARED (the company's claim), CONTRA (the differing public statement), and the EXPLANATION. Accept ONLY if ALL hold:
(a) declared_supported — the explanation's account of what the COMPANY claims is supported by DECLARED;
(b) contra_supported — its account of what the SOURCES allege is supported by CONTRA;
(c) no_new — it introduces NO host, entity, number, or claim absent from DECLARED or CONTRA;
(d) specific_ok — SPECIFICITY: if CONTRA contains a concrete, specific allegation (a named topic: safety, staffing, academics, food, closure, pricing, etc.), the explanation's source half MUST name that specific substance. Reject (specific_ok=false) if it instead uses a generic negative ("going downhill", "declining", "bad", "worse") that drops the excerpt's specific topic. If CONTRA is pure valence with NO specific claim, the honest line "${NON_SPECIFIC_ALLEGE}" is CORRECT and passes.
Respond with ONLY JSON: {"declared_supported":true|false,"contra_supported":true|false,"no_new":true|false,"specific_ok":true|false,"accept":true|false,"reason":"..."}. No other text.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const OLLAMA_BASE_URL = Deno.env.get("OLLAMA_BASE_URL") ?? "http://host.docker.internal:11434/v1";
    if (!isLocalOllamaUrl(OLLAMA_BASE_URL)) return json({ error: "Local-only policy violation: OLLAMA_BASE_URL must be localhost/host.docker.internal." }, 412);
    const body = await req.json().catch(() => ({}));
    const company_id = String(body.company_id ?? "");
    if (!company_id) return json({ error: "company_id required" }, 400);
    if (company_id === CB1_FROZEN_ID) return json({ error: "frozen reference company — never written" }, 403);
    const doPlan = body.plan === true;
    const doWrite = body.write !== false && !doPlan;
    const pairIds: string[] | undefined = Array.isArray(body.pair_ids) ? body.pair_ids.filter((x: unknown): x is string => typeof x === "string") : undefined;

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const usage: OpenAIUsage = { prompt_tokens: 0, completion_tokens: 0 };
    const callLocal = async (model: string, system: string, user: string, temperature: number): Promise<Record<string, unknown>> => {
      const res = await fetch(`${OLLAMA_BASE_URL}/chat/completions`, {
        method: "POST", headers: { Authorization: "Bearer ollama", "Content-Type": "application/json" },
        body: JSON.stringify({ model, temperature, messages: [{ role: "system", content: system }, { role: "user", content: user }] }),
      });
      if (!res.ok) throw new Error(`ollama ${model} ${res.status}: ${(await res.text()).slice(0, 200)}`);
      const data = await res.json();
      const mm = String(data?.choices?.[0]?.message?.content ?? "").match(/\{[\s\S]*\}/);
      if (!mm) throw new Error(`${model} returned no JSON`);
      return JSON.parse(mm[0]) as Record<string, unknown>;
    };
    const routed = async (role: "generator" | "judge", provenances: Array<string | null>, system: string, user: string, temperature: number) => {
      const choice = resolveModel({ role, inputs: provenances.map((p) => ({ provenance: p })) });
      if (choice.provider === "external_openai") {
        const r = await withRetry429(() => callOpenAIJson({ model: choice.model, system, user, temperature, timeoutMs: 60_000 }));
        usage.prompt_tokens += r.usage.prompt_tokens; usage.completion_tokens += r.usage.completion_tokens;
        const mm = r.content.match(/\{[\s\S]*\}/);
        if (!mm) throw new Error(`openai ${choice.model} returned no JSON`);
        return { json: JSON.parse(mm[0]) as Record<string, unknown>, provider: choice.provider, model: choice.model };
      }
      return { json: await callLocal(choice.model, system, user, temperature), provider: choice.provider, model: choice.model };
    };

    // Run the grounding judge (+ deterministic host guard) on an explanation for a pair. Shared by the
    // real run and the vacuous-proof probe.
    const groundCheck = async (p: Pick<Pair, "declaredText" | "contraText" | "declaredProv" | "contraProv" | "declaredHost" | "contraHost">, explanation: string) => {
      const pairHosts = new Set([p.declaredHost, p.contraHost].filter((h): h is string => !!h).map((h) => h.toLowerCase()));
      const hostGuard = citesOnlyPairHosts(explanation, pairHosts);
      // Deterministic valence guard: a banned mood word anywhere (unless it IS the honest sentinel,
      // which carries none) → reject. Catches "declining in quality without specifics" the judge lets by.
      const valenceOk = !BANNED_VALENCE.test(explanation);
      const jr = await routed("judge", [p.declaredProv, p.contraProv], JUDGE_SYS,
        `DECLARED: "${p.declaredText}"\n\nCONTRA: "${p.contraText}"\n\nEXPLANATION: "${explanation}"\n\nJudge grounding.`, 0);
      const v = jr.json;
      const judgeAccept = v.declared_supported === true && v.contra_supported === true && v.no_new === true && v.specific_ok === true && v.accept === true;
      return { grounded: hostGuard && valenceOk && judgeAccept, hostGuard, valenceOk, judge: v, judgeModel: jr.model };
    };

    // ── VACUOUS PROOF probe: judge a PROVIDED explanation against provided texts; no write. ─────────
    if (body._probe) {
      const pr = body._probe as { declared: string; contra: string; explanation: string; declaredHost?: string; contraHost?: string };
      const res = await groundCheck(
        { declaredText: pr.declared, contraText: pr.contra, declaredProv: "public_observed", contraProv: "public_observed", declaredHost: pr.declaredHost ?? null, contraHost: pr.contraHost ?? null },
        pr.explanation,
      );
      return json({ ok: true, probe: true, grounded: res.grounded, hostGuard: res.hostGuard, valenceOk: res.valenceOk, judge: res.judge, judge_model: res.judgeModel });
    }

    const pairs = await loadDivergentPairs(supabase, company_id, pairIds);
    if (doPlan) return json({ ok: true, plan: true, count: pairs.length, pairs: pairs.map((p) => ({ id: p.id, declared: p.declaredText.slice(0, 60), contra: p.contraText.slice(0, 60) })) });
    if (pairs.length === 0) return json({ ok: true, status: "empty", reason: "no divergent public_vs_public pairs" });

    const genOnce = async (p: Pair, temperature: number): Promise<string> => {
      const gen = await routed("generator", [p.declaredProv, p.contraProv], GEN_SYS,
        `DECLARED: "${p.declaredText}"\n\nCONTRA: "${p.contraText}"\n\nSOURCE HOST (context only): ${p.contraHost ?? "unknown"}\n\nWrite the one-sentence "what differs".`, temperature);
      return String(gen.json.explanation ?? "").trim();
    };

    const results: Array<{ id: string; explanation: string | null; grounded: boolean; non_specific: boolean; model: string; reason?: string; router_forced_local?: boolean }> = [];
    for (const p of pairs) {
      try {
        const genChoice = resolveModel({ role: "generator", inputs: [p.declaredProv, p.contraProv].map((x) => ({ provenance: x })) });
        const forcedLocal = genChoice.provider !== "external_openai"; // report if a public_vs_public pair ever routes local
        // generate → judge → REGENERATE ONCE on reject (temp bumped) → judge → store or fall back.
        let explanation = await genOnce(p, 0.2);
        let check = explanation ? await groundCheck(p, explanation) : { grounded: false, hostGuard: false, judge: { reason: "empty generation" }, judgeModel: genChoice.model };
        if (!check.grounded) {
          explanation = await genOnce(p, 0.5);
          check = explanation ? await groundCheck(p, explanation) : check;
        }
        const nonSpecific = check.grounded && explanation.toLowerCase().includes(NON_SPECIFIC_ALLEGE);
        if (check.grounded && doWrite) {
          const { error } = await supabase.from("claim_deltas")
            .update({ conflict_explanation: explanation, conflict_explanation_model: genChoice.model, conflict_explanation_grounded: true })
            .eq("id", p.id).eq("company_id", company_id);
          if (error) throw new Error(`update failed (${p.id}): ${error.message}`);
        } else if (!check.grounded && doWrite) {
          // store nothing — clear any stale explanation so a rejected pair falls back cleanly
          await supabase.from("claim_deltas")
            .update({ conflict_explanation: null, conflict_explanation_model: null, conflict_explanation_grounded: false })
            .eq("id", p.id).eq("company_id", company_id);
        }
        results.push({ id: p.id, explanation: check.grounded ? explanation : null, grounded: check.grounded, non_specific: nonSpecific, model: genChoice.model, reason: check.grounded ? undefined : `rejected: ${JSON.stringify(check.judge).slice(0, 180)}`, router_forced_local: forcedLocal });
      } catch (e) {
        results.push({ id: p.id, explanation: null, grounded: false, non_specific: false, model: "error", reason: (e as Error).message.slice(0, 160) });
      }
    }
    const accepted = results.filter((r) => r.grounded).length;
    const nonSpecificCount = results.filter((r) => r.non_specific).length;
    return json({ ok: true, dry_run: !doWrite, total: pairs.length, accepted, specific: accepted - nonSpecificCount, honest_non_specific: nonSpecificCount, rejected: pairs.length - accepted, results, cost: { ...usage, usd: usdCost(usage) } });
  } catch (e) {
    return json({ error: `unexpected: ${(e as Error).message}` }, 500);
  }
});
