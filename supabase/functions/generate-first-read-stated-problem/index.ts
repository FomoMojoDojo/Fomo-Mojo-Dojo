// V2-2 / V2-2b — generate-first-read-stated-problem (Act 1 "What You Say").
//
// SOURCE INVERSION (V2-2b): the stated problem comes FIRST from the company's OWN
// declared brief (companies.strategic_problem_brief — internal register, the problem
// the client brought at creation), lightly distilled in their words. ONLY when that's
// blank is it INFERRED from their public own-domain site (public register, the V2-2
// pipeline), preferring a PROBLEM FRAMING over an offerings description — and when the
// source supports only a description, it is stamped descriptive_fallback and labeled
// honestly at render. The two sources NEVER blend; the row is stamped with which register.
//
// Discipline: gen qwen2.5:14b-instruct, judge llama3:70b — hard-pinned; local-only;
// require_model (loud fail, no canned, judge-reject persists nothing); plain-JSON
// completion (qwen tool_choice is flaky on long prompts, llama3:70b has no Ollama tool
// support). HONEST-EMPTY only when BOTH sources are blank.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { contentIdentity } from "../_shared/contentIdentity.ts";
import { liftVerbatimQuote } from "../../../src/lib/verbatimQuote.ts";
import { isLongBrief } from "../../../src/lib/firstRead/statedProblem.ts";
import { US_ENGLISH_RULE, flagBritishisms } from "../_shared/languageRule.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const LOCAL_HOST_ALLOWLIST = new Set(["localhost", "127.0.0.1", "::1", "host.docker.internal"]);
const GEN_MODEL = "qwen2.5:14b-instruct";
const JUDGE_MODEL = "llama3:70b";

function isLocalOllamaUrl(rawUrl: string) {
  try { return LOCAL_HOST_ALLOWLIST.has(String(new URL(rawUrl).hostname || "").trim().toLowerCase()); }
  catch { return false; }
}
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const OLLAMA_BASE_URL = Deno.env.get("OLLAMA_BASE_URL") ?? "http://host.docker.internal:11434/v1";
    if (!isLocalOllamaUrl(OLLAMA_BASE_URL)) {
      return json({ error: "Local-only policy violation: OLLAMA_BASE_URL must be localhost/host.docker.internal." }, 412);
    }
    const trace = { provider: "local_ollama", gen_model: GEN_MODEL, judge_model: JUDGE_MODEL, endpoint: OLLAMA_BASE_URL };

    const { company_id } = await req.json().catch(() => ({}));
    if (!company_id) return json({ error: "company_id is required" }, 400);

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // ── Shared model helpers (plain-JSON completion; require_model) ──────────────
    const callModel = async (model: string, system: string, user: string, temperature: number) => {
      const res = await fetch(`${OLLAMA_BASE_URL}/chat/completions`, {
        method: "POST",
        headers: { Authorization: "Bearer ollama", "Content-Type": "application/json" },
        body: JSON.stringify({ model, temperature, messages: [{ role: "system", content: system }, { role: "user", content: user }] }),
      });
      if (!res.ok) throw new Error(`ollama ${model} ${res.status}: ${(await res.text()).slice(0, 300)}`);
      const data = await res.json();
      const content = String(data?.choices?.[0]?.message?.content ?? "");
      const m = content.match(/\{[\s\S]*\}/);
      if (!m) throw new Error(`${model} returned no JSON: ${content.slice(0, 200)}`);
      return JSON.parse(m[0]) as Record<string, unknown>;
    };

    // Generation stages a PENDING row (V2-3): it never overwrites the signed row the
    // client is shown. The operator signs pending → signed out of band. onConflict on
    // (company_id, status) replaces only a prior pending, never the signed one.
    const persist = async (statement: string, register: string, descriptive_fallback: boolean, quoteCandidate: string, sourceText: string, supporting_points: string[] = []) => {
      const lifted = liftVerbatimQuote(sourceText, String(quoteCandidate ?? "").trim());
      const statement_identity = await contentIdentity(statement);
      const { error: upErr } = await supabase.from("first_read_stated_problem").upsert({
        company_id, statement, statement_identity, register, descriptive_fallback,
        supporting_points, status: "pending",
        quote: lifted?.quote ?? null, quote_source_text: lifted?.quote_source_text ?? null,
        gen_model: GEN_MODEL, judge_model: JUDGE_MODEL, generated_at: new Date().toISOString(),
      }, { onConflict: "company_id,status" });
      if (upErr) throw new Error(`persist failed: ${upErr.message}`);
      return { statement, statement_identity, register, descriptive_fallback, supporting_points, status: "pending", quote: lifted?.quote ?? null, language_flags: flagBritishisms(statement) };
    };

    // ── SOURCE 1 (preferred): the company's own declared brief ──────────────────
    const { data: company } = await supabase.from("companies").select("strategic_problem_brief").eq("id", company_id).maybeSingle();
    const brief = String((company as { strategic_problem_brief?: string } | null)?.strategic_problem_brief ?? "").trim();

    if (brief.length > 0) {
      // ── LONG BRIEF (V2-3): parse into a headline + up to 4 supporting points ──────
      if (isLongBrief(brief)) {
        const gen = await callModel(GEN_MODEL, `You parse a company's OWN written problem brief into a PARSEABLE shape, in THEIR words. Give ONE short headline problem statement, plus UP TO 4 short supporting points — each a distinct dimension of the SAME problem, faithful to the brief, in their words, plain. Use ONLY the brief. Invent nothing not in the brief. No framework jargon. Each point one sentence. 'quote' MUST be an EXACT substring of the brief, one short line, or "". Respond with ONLY JSON: {"headline":"...","points":["...","..."],"quote":"..."}. No other text.

${US_ENGLISH_RULE}`, `The company's own strategic problem brief:\n${brief.slice(0, 3500)}`, 0.2);
        const headline = String(gen.headline ?? "").trim();
        const points = (Array.isArray(gen.points) ? gen.points : [])
          .map((p) => String(p ?? "").trim()).filter(Boolean).slice(0, 4);
        if (!headline) return json({ status: "empty", empty_reason: "The brief produced no distillable headline.", trace });
        const verdict = await callModel(JUDGE_MODEL, 'You judge whether a parsed problem (a headline + supporting points) is FAITHFUL to a company\'s own brief: EVERY line must be supported by the brief (invents nothing not in it) and use no framework jargon. If ANY line invents content absent from the brief, faithful is false. Respond with ONLY JSON: {"faithful": true|false, "reason": "..."}. No other text.', `Brief:\n${brief.slice(0, 3500)}\n\nHeadline: "${headline}"\nPoints:\n${points.map((p) => `- ${p}`).join("\n")}\n\nIs every line faithful?`, 0);
        if (!verdict.faithful) return json({ status: "rejected", reject_reason: String(verdict.reason ?? ""), source: "company_declared", shape: "parsed", trace });
        return json({ status: "generated", source: "company_declared", shape: "parsed", ...(await persist(headline, "internal_declared", false, String(gen.quote ?? ""), brief, points)), trace });
      }

      // ── SHORT BRIEF: the single distilled statement (unchanged) ──────────────────
      const gen = await callModel(GEN_MODEL, `You distill the ONE core problem a company brought to us, from THEIR OWN written problem brief, in THEIR words — lightly compressed, one or two sentences. Use ONLY the brief. Invent nothing. No framework jargon. 'quote' MUST be an EXACT substring of the brief, one short line, or "". Respond with ONLY JSON: {"stated_problem":"...","quote":"..."}. No other text.

${US_ENGLISH_RULE}`, `The company's own strategic problem brief:\n${brief.slice(0, 3500)}`, 0.2);
      const statement = String(gen.stated_problem ?? "").trim();
      if (!statement) return json({ status: "empty", empty_reason: "The brief produced no distillable problem.", trace });
      const verdict = await callModel(JUDGE_MODEL, 'You judge whether a one-line problem is FAITHFUL to a company\'s own brief: it invents nothing not in the brief and uses no framework jargon. Respond with ONLY JSON: {"faithful": true|false, "reason": "..."}. No other text.', `Brief:\n${brief.slice(0, 3500)}\n\nCandidate: "${statement}"\n\nFaithful?`, 0);
      if (!verdict.faithful) return json({ status: "rejected", reject_reason: String(verdict.reason ?? ""), source: "company_declared", shape: "single", trace });
      return json({ status: "generated", source: "company_declared", shape: "single", ...(await persist(statement, "internal_declared", false, String(gen.quote ?? ""), brief)), trace });
    }

    // ── SOURCE 2 (fallback): infer from the public own-domain site ──────────────
    const { data: sigData, error: sErr } = await supabase
      .from("signals").select("claim_text, raw_payload, created_at")
      .eq("company_id", company_id).eq("voice_class", "client_voice").order("created_at", { ascending: true });
    if (sErr) return json({ error: `signals load failed: ${sErr.message}` }, 500);
    const signals = (sigData ?? []) as Array<{ claim_text?: string; raw_payload?: { snippet?: string } }>;
    const claims = signals.map((s) => (s.claim_text || "").trim()).filter(Boolean).slice(0, 12);
    const sourceText = signals.map((s) => (s.raw_payload?.snippet || "").trim()).filter((t) => t.length > 20).join("\n");

    if (claims.length === 0) {
      // BOTH sources blank → honest-empty.
      return json({ status: "empty", empty_reason: "No declared brief and no own-domain public content — nothing they state.", trace });
    }

    const gen = await callModel(GEN_MODEL, `You read a company's OWN public website content and state the ONE core PROBLEM they solve, in their words, plain, no jargon. PREFER a problem framing ("the problem is …") over a description of their offerings. If the content only supports a description of what they do (no problem is stated), set is_problem_framing=false and give the faithful description. 'quote' MUST be an EXACT substring of the content, one short line, or "". Respond with ONLY JSON: {"stated_problem":"...","quote":"...","is_problem_framing":true|false}. No other text.

${US_ENGLISH_RULE}`, `Own-site content:\n${claims.map((c) => `- ${c}`).join("\n")}\n\nSource text (for the verbatim quote):\n${sourceText.slice(0, 2000)}`, 0.2);
    const statement = String(gen.stated_problem ?? "").trim();
    if (!statement) return json({ status: "empty", empty_reason: "The model produced no statement from the site content.", trace });
    const verdict = await callModel(JUDGE_MODEL, 'You judge whether a one-line statement is FAITHFUL to a company\'s own-site content (invents nothing, no jargon) AND whether it is a PROBLEM framing or merely a DESCRIPTION of offerings. Respond with ONLY JSON: {"faithful": true|false, "is_problem_framing": true|false, "reason": "..."}. No other text.', `Own-site claims:\n${claims.map((c) => `- ${c}`).join("\n")}\n\nCandidate: "${statement}"\n\nFaithful? Problem framing or description?`, 0);
    if (!verdict.faithful) return json({ status: "rejected", reject_reason: String(verdict.reason ?? ""), source: "site_inferred", trace });
    const descriptive_fallback = !(verdict.is_problem_framing === true && gen.is_problem_framing === true);
    return json({ status: "generated", source: "site_inferred", ...(await persist(statement, "public_observed", descriptive_fallback, String(gen.quote ?? ""), sourceText)), trace });
  } catch (e) {
    return json({ error: `unexpected: ${(e as Error).message}` }, 500);
  }
});
