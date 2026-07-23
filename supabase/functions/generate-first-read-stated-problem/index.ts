// V2-2 — generate-first-read-stated-problem (Act 1 "What You Say").
//
// Distills the client's PUBLICLY STATED PROBLEM from their OWN-DOMAIN public content
// (client_voice declared register) — never internal uploads, the company-creation
// form, or outside voices. 14b generates, 70b judges (faithful to the source's own
// claims, no invented substance, no framework jargon). A verbatim own-domain line is
// lifted where one exists (CV-2e), else honest-quote-less.
//
// Discipline (non-negotiable, mirrors generate-first-read-proposal):
//   * MODEL PINS: gen qwen2.5:14b-instruct, judge llama3:70b — hard-pinned here.
//   * LOCAL ONLY: OLLAMA_BASE_URL must pass isLocalOllamaUrl or we refuse (412).
//   * require_model: a failed/unparseable model call THROWS (loud), no canned text,
//     no template fallback. A judge REJECT persists nothing.
//   * REGISTER LOCK: reads voice_class='client_voice' signals ONLY.
//   * HONEST-EMPTY: no own-domain content → structured empty, no model call, no write.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { contentIdentity } from "../_shared/contentIdentity.ts";
import { liftVerbatimQuote } from "../../../src/lib/verbatimQuote.ts";
import { US_ENGLISH_RULE, flagBritishisms } from "../_shared/languageRule.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const LOCAL_HOST_ALLOWLIST = new Set(["localhost", "127.0.0.1", "::1", "host.docker.internal"]);
const GEN_MODEL = "qwen2.5:14b-instruct"; // HARD PIN
const JUDGE_MODEL = "llama3:70b"; // HARD PIN

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

    // ── Source: own-domain client_voice signals ONLY (register lock) ────────────
    const { data: sigData, error: sErr } = await supabase
      .from("signals")
      .select("claim_text, raw_payload, source_url, created_at")
      .eq("company_id", company_id)
      .eq("voice_class", "client_voice")
      .order("created_at", { ascending: true });
    if (sErr) return json({ error: `signals load failed: ${sErr.message}` }, 500);

    const signals = (sigData ?? []) as Array<{ claim_text?: string; raw_payload?: { snippet?: string }; source_url?: string }>;
    const claims = signals.map((s) => (s.claim_text || "").trim()).filter(Boolean);
    // Retained own-domain source text (the crawl snippets) — the ONLY quote-lift source.
    const snippets = signals.map((s) => (s.raw_payload?.snippet || "").trim()).filter((t) => t.length > 20);
    const sourceText = snippets.join("\n");

    if (claims.length === 0) {
      return json({ status: "empty", empty_reason: "No own-domain public content for this company — nothing they publicly state.", trace });
    }
    // Cap the prompt: a very long claim list makes the models ignore tool_choice and
    // answer in prose (breaking the require_model tool-call contract). The core stated
    // problem recurs across the own-site claims, so the first ~12 distinct lines suffice.
    const promptClaims = claims.slice(0, 12);

    // ── (1) GEN — distill the stated problem + a candidate verbatim quote ────────
    const systemPrompt = `You distill the ONE core problem a company says — ON THEIR OWN PUBLIC WEBSITE — that they solve, in THEIR words. You are given ONLY their own-site content.

HARD RULES:
- Use ONLY the provided own-site content. Invent NO scope, market, or claim not present.
- Plain language. NO framework jargon (never "Jobs-to-be-Done", "ODI", "value proposition", "positioning"). Say it the way they say it.
- One or two sentences. If their statement is long, simplify — never add.
- 'quote' MUST be an EXACT substring copied verbatim from the provided content, one short quotable line, or "" if none is quotable.
- Respond with ONLY a JSON object: {"stated_problem": "...", "quote": "..."}. No other text.

${US_ENGLISH_RULE}`;
    const userPrompt = `This company's own-site content (each line is their own public claim):
${promptClaims.map((c) => `- ${c}`).join("\n")}

Own-site source text (for the verbatim quote — copy an EXACT line, or ""):
${sourceText.slice(0, 2000)}`;

    // Plain-completion JSON (qwen's tool_choice is unreliable on longer prompts; this
    // mirrors the judge). require_model: unparseable → throw (no canned fallback).
    const callGen = async () => {
      const res = await fetch(`${OLLAMA_BASE_URL}/chat/completions`, {
        method: "POST",
        headers: { Authorization: "Bearer ollama", "Content-Type": "application/json" },
        body: JSON.stringify({
          model: GEN_MODEL, temperature: 0.2,
          messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userPrompt }],
        }),
      });
      if (!res.ok) throw new Error(`ollama gen ${res.status}: ${(await res.text()).slice(0, 300)}`);
      const data = await res.json();
      const content = String(data?.choices?.[0]?.message?.content ?? "");
      const m = content.match(/\{[\s\S]*\}/);
      if (!m) throw new Error(`gen returned no JSON: ${content.slice(0, 200)}`);
      return JSON.parse(m[0]) as { stated_problem: string; quote: string };
    };

    let gen: { stated_problem: string; quote: string };
    try { gen = await callGen(); }
    catch (e) { return json({ error: `stated-problem generation failed: ${(e as Error).message}`, trace }, 502); }

    const statement = String(gen.stated_problem ?? "").trim();
    if (!statement) return json({ status: "empty", empty_reason: "The model produced no stated problem from the available content.", trace });

    // ── (2) JUDGE (70b) — faithful, no invention, no jargon ─────────────────────
    // 70b judge — plain-completion JSON (llama3:70b does not support OpenAI tool_choice
    // in Ollama; this mirrors the claim-delta judge). require_model: unparseable → throw.
    const callJudge = async () => {
      const res = await fetch(`${OLLAMA_BASE_URL}/chat/completions`, {
        method: "POST",
        headers: { Authorization: "Bearer ollama", "Content-Type": "application/json" },
        body: JSON.stringify({
          model: JUDGE_MODEL, temperature: 0,
          messages: [
            { role: "system", content: 'You judge whether a one-line "stated problem" is FAITHFUL to a company\'s own-site content: it invents no scope/claim not present, and uses no framework jargon. Respond with ONLY a JSON object: {"faithful": true|false, "reason": "..."}. No other text.' },
            { role: "user", content: `Own-site claims:\n${promptClaims.map((c) => `- ${c}`).join("\n")}\n\nCandidate stated problem: "${statement}"\n\nIs it faithful (no invention, no jargon)?` },
          ],
        }),
      });
      if (!res.ok) throw new Error(`ollama judge ${res.status}: ${(await res.text()).slice(0, 300)}`);
      const data = await res.json();
      const content = String(data?.choices?.[0]?.message?.content ?? "");
      const m = content.match(/\{[\s\S]*\}/);
      if (!m) throw new Error(`judge returned no JSON: ${content.slice(0, 200)}`);
      return JSON.parse(m[0]) as { faithful: boolean; reason: string };
    };

    let verdict: { faithful: boolean; reason: string };
    try { verdict = await callJudge(); }
    catch (e) { return json({ error: `stated-problem judge failed: ${(e as Error).message}`, trace }, 502); }
    if (!verdict.faithful) {
      return json({ status: "rejected", reject_reason: verdict.reason || "judge found the distillation unfaithful", trace });
    }

    // ── (3) Verbatim quote — lift ONLY a byte-exact substring of retained source ─
    const lifted = liftVerbatimQuote(sourceText, String(gen.quote ?? "").trim());

    // ── Persist (upsert; one per company) ───────────────────────────────────────
    const statement_identity = await contentIdentity(statement);
    const { error: upErr } = await supabase
      .from("first_read_stated_problem")
      .upsert({
        company_id, statement, statement_identity, register: "client_voice",
        quote: lifted?.quote ?? null, quote_source_text: lifted?.quote_source_text ?? null,
        gen_model: GEN_MODEL, judge_model: JUDGE_MODEL, generated_at: new Date().toISOString(),
      }, { onConflict: "company_id" });
    if (upErr) return json({ error: `persist failed: ${upErr.message}`, trace }, 500);

    return json({
      status: "generated", statement, statement_identity,
      quote: lifted?.quote ?? null,
      language_flags: flagBritishisms(statement),
      trace,
    });
  } catch (e) {
    return json({ error: `unexpected: ${(e as Error).message}` }, 500);
  }
});
