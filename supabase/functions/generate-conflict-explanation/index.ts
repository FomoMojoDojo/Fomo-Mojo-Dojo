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

const GEN_SYS = `You are given ONE claim a company makes about itself (DECLARED) and ONE public statement that DIFFERS from it (CONTRA), plus the source host for context. Write ONE sentence, at most ~30 words, that says WHAT DIFFERS between the two — state the company's claim in brief, then what the source alleges that differs. Shape: "You {declared claim in brief}; {these sources} {what they allege that differs}." Plain language. Do NOT use a verdict word (contradicts/disputes/conflicts). Cite NOTHING that is not in the two texts (you may name the source host given). Respond with ONLY JSON: {"explanation":"..."}. No other text.

${US_ENGLISH_RULE}`;

const JUDGE_SYS = `You judge whether a one-line "what differs" explanation is GROUNDED in a claim pair. You are given DECLARED (the company's claim), CONTRA (the differing public statement), and the EXPLANATION. Accept ONLY if ALL hold: (a) the explanation's account of what the COMPANY claims is supported by DECLARED; (b) its account of what the SOURCES allege is supported by CONTRA; (c) it introduces NO host, entity, number, or claim that is absent from DECLARED or CONTRA. Respond with ONLY JSON: {"declared_supported":true|false,"contra_supported":true|false,"no_new":true|false,"accept":true|false,"reason":"..."}. No other text.`;

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
      const jr = await routed("judge", [p.declaredProv, p.contraProv], JUDGE_SYS,
        `DECLARED: "${p.declaredText}"\n\nCONTRA: "${p.contraText}"\n\nEXPLANATION: "${explanation}"\n\nJudge grounding.`, 0);
      const v = jr.json;
      const judgeAccept = v.declared_supported === true && v.contra_supported === true && v.no_new === true && v.accept === true;
      return { grounded: hostGuard && judgeAccept, hostGuard, judge: v, judgeModel: jr.model };
    };

    // ── VACUOUS PROOF probe: judge a PROVIDED explanation against provided texts; no write. ─────────
    if (body._probe) {
      const pr = body._probe as { declared: string; contra: string; explanation: string; declaredHost?: string; contraHost?: string };
      const res = await groundCheck(
        { declaredText: pr.declared, contraText: pr.contra, declaredProv: "public_observed", contraProv: "public_observed", declaredHost: pr.declaredHost ?? null, contraHost: pr.contraHost ?? null },
        pr.explanation,
      );
      return json({ ok: true, probe: true, grounded: res.grounded, hostGuard: res.hostGuard, judge: res.judge, judge_model: res.judgeModel });
    }

    const pairs = await loadDivergentPairs(supabase, company_id, pairIds);
    if (doPlan) return json({ ok: true, plan: true, count: pairs.length, pairs: pairs.map((p) => ({ id: p.id, declared: p.declaredText.slice(0, 60), contra: p.contraText.slice(0, 60) })) });
    if (pairs.length === 0) return json({ ok: true, status: "empty", reason: "no divergent public_vs_public pairs" });

    const results: Array<{ id: string; explanation: string | null; grounded: boolean; model: string; reason?: string; router_forced_local?: boolean }> = [];
    for (const p of pairs) {
      try {
        const provs = [p.declaredProv, p.contraProv];
        const genChoice = resolveModel({ role: "generator", inputs: provs.map((x) => ({ provenance: x })) });
        const forcedLocal = genChoice.provider !== "external_openai"; // report if a public_vs_public pair ever routes local
        const gen = await routed("generator", provs, GEN_SYS,
          `DECLARED: "${p.declaredText}"\n\nCONTRA: "${p.contraText}"\n\nSOURCE HOST (context only): ${p.contraHost ?? "unknown"}\n\nWrite the one-sentence "what differs".`, 0.2);
        const explanation = String(gen.json.explanation ?? "").trim();
        if (!explanation) { results.push({ id: p.id, explanation: null, grounded: false, model: gen.model, reason: "empty generation" }); continue; }
        const check = await groundCheck(p, explanation);
        if (check.grounded && doWrite) {
          const { error } = await supabase.from("claim_deltas")
            .update({ conflict_explanation: explanation, conflict_explanation_model: gen.model, conflict_explanation_grounded: true })
            .eq("id", p.id).eq("company_id", company_id);
          if (error) throw new Error(`update failed (${p.id}): ${error.message}`);
        }
        results.push({ id: p.id, explanation: check.grounded ? explanation : null, grounded: check.grounded, model: gen.model, reason: check.grounded ? undefined : `rejected: ${JSON.stringify(check.judge).slice(0, 160)}`, router_forced_local: forcedLocal });
      } catch (e) {
        results.push({ id: p.id, explanation: null, grounded: false, model: "error", reason: (e as Error).message.slice(0, 160) });
      }
    }
    const accepted = results.filter((r) => r.grounded).length;
    return json({ ok: true, dry_run: !doWrite, total: pairs.length, accepted, rejected: pairs.length - accepted, results, cost: { ...usage, usd: usdCost(usage) } });
  } catch (e) {
    return json({ error: `unexpected: ${(e as Error).message}` }, 500);
  }
});
