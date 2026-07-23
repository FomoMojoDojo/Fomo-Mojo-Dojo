// First Read Gate 4 — generate-first-read-proposal.
//
// Builds the live one-screen engagement proposal for a First Read session from
// ONLY that company/session's real data, phrases it with a local model, and — on
// success — issues it: open -> proposal_issued, caches the tally counts, persists
// the proposal object on the session so it re-renders deterministically.
//
// Discipline (non-negotiable):
//   * MODEL PIN: qwen2.5:14b-instruct, hard-pinned here. The deep-dive template's
//     7b default must not survive — this constant is explicit and env cannot lower
//     it below the pin (env may only be read for an equal/greater override; we do
//     not read it, we pin).
//   * LOCAL ONLY: OLLAMA_BASE_URL must pass isLocalOllamaUrl or we refuse (412).
//   * DISPLAY HONESTY: no canned text, no template fallback. If questions AND tally
//     AND score are all empty -> structured honest-empty, no prose, no model call,
//     no freeze. If the model call fails or is unparseable -> loud error (session
//     stays open, client retries). Prose is NEVER substituted.
//   * SOURCES ARE SERVER TRUTH: the per-block sources manifest is built here from
//     the real ids/indices that fed each block — never authored by the model.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { US_ENGLISH_RULE, flagBritishisms } from "../_shared/languageRule.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const LOCAL_HOST_ALLOWLIST = new Set(["localhost", "127.0.0.1", "::1", "host.docker.internal"]);

// HARD PIN. Not read from env — the 7b default must not survive.
const OLLAMA_MODEL = "qwen2.5:14b-instruct";

function isLocalOllamaUrl(rawUrl: string) {
  try {
    const url = new URL(rawUrl);
    return LOCAL_HOST_ALLOWLIST.has(String(url.hostname || "").trim().toLowerCase());
  } catch {
    return false;
  }
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

type ResponseRow = {
  id: string;
  item_kind: string;
  item_text: string;
  verdict: "confirmed" | "corrected" | "rejected";
  correction_text: string | null;
};

type Sources = {
  open_question_indices?: number[];
  response_ids?: string[];
  score_ref?: string;
};

type ProposalBlock = { key: string; heading: string; body: string; sources: Sources };

const BLOCK_HEADINGS: Record<string, string> = {
  where_you_are: "Where you are",
  what_the_read_shows: "What the outside read shows",
  what_we_would_answer: "What we'd answer together",
  the_engagement: "The engagement",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const OLLAMA_BASE_URL = Deno.env.get("OLLAMA_BASE_URL") ?? "http://host.docker.internal:11434/v1";
    if (!isLocalOllamaUrl(OLLAMA_BASE_URL)) {
      return json({ error: "Local-only policy violation: OLLAMA_BASE_URL must be localhost/host.docker.internal." }, 412);
    }
    const trace = { provider: "local_ollama", model: OLLAMA_MODEL, endpoint: OLLAMA_BASE_URL };

    const { session_id } = await req.json().catch(() => ({}));
    if (!session_id) return json({ error: "session_id is required" }, 400);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // ── Load the session ──────────────────────────────────────────────────────
    const { data: session, error: sErr } = await supabase
      .from("first_read_sessions")
      .select("id, company_id, status, proposal_json")
      .eq("id", session_id)
      .maybeSingle();
    if (sErr) return json({ error: `session load failed: ${sErr.message}` }, 500);
    if (!session) return json({ error: "session not found" }, 404);

    // Idempotent: an already-issued session returns ITS persisted proposal. Never
    // regenerate.
    if (session.status !== "open") {
      if (session.proposal_json) return json({ status: "issued", proposal: session.proposal_json, replayed: true });
      return json({ error: `session is ${session.status} without a persisted proposal` }, 409);
    }

    // ── Assemble the real-data bundle ─────────────────────────────────────────
    // Open questions — the preferred (most recent with questions) public baseline run.
    const { data: runs } = await supabase
      .from("public_baseline_runs")
      .select("id, created_at, result_json")
      .eq("company_id", session.company_id)
      .order("created_at", { ascending: false })
      .limit(12);
    let openQuestions: string[] = [];
    for (const r of runs ?? []) {
      const list = (r?.result_json as { open_questions?: unknown })?.open_questions;
      const qs = Array.isArray(list) ? list.filter((q): q is string => typeof q === "string" && q.trim().length > 0).map((q) => q.trim()) : [];
      if (qs.length > 0) { openQuestions = qs; break; }
    }

    // Session responses — tally + corrections + rejections + confirmations.
    const { data: respData } = await supabase
      .from("first_read_responses")
      .select("id, item_kind, item_text, verdict, correction_text")
      .eq("session_id", session_id);
    const responses = (respData as ResponseRow[]) ?? [];
    const confirmed = responses.filter((r) => r.verdict === "confirmed");
    const corrected = responses.filter((r) => r.verdict === "corrected");
    const rejected = responses.filter((r) => r.verdict === "rejected");

    // Score spread.
    const { data: company } = await supabase
      .from("companies")
      .select("mojo_score, potential_score, projected_score")
      .eq("id", session.company_id)
      .maybeSingle();
    const score = company?.mojo_score ?? null;
    const potential = company?.potential_score ?? null;
    const projected = company?.projected_score ?? null;

    const hasQuestions = openQuestions.length > 0;
    const hasResponses = responses.length > 0;
    const hasScore = score !== null && score !== undefined;

    // ── Write-time guard — honest-empty, no model call, no freeze ─────────────
    if (!hasQuestions && !hasResponses && !hasScore) {
      return json({
        status: "empty",
        empty_reason: "No open questions, no captured verdicts, and no score — nothing real to propose from yet.",
        generated_at: new Date().toISOString(),
        trace,
      });
    }

    // ── Model call — phrase ONLY the provided data ────────────────────────────
    const bundle = {
      score: hasScore ? { current: score, potential, projected } : null,
      verdicts: hasResponses
        ? {
            confirmed_count: confirmed.length,
            corrected_count: corrected.length,
            rejected_count: rejected.length,
            confirmed_items: confirmed.map((r) => r.item_text),
            corrections: corrected.map((r) => ({ was: r.item_text, correction: r.correction_text })),
            rejected_items: rejected.map((r) => r.item_text),
          }
        : null,
      open_questions: hasQuestions ? openQuestions : null,
    };

    const systemPrompt = `You write a ONE-SCREEN engagement proposal for a first meeting with a prospect. You are given ONLY real data gathered about this company. Phrase it into a crisp, plain, non-hyperbolic offer.

HARD RULES:
- Use ONLY the data provided. Do NOT invent scope, deliverables, prices, timelines, team, guarantees, or any fact not present in the data.
- If a field's data is absent (null), return an EMPTY STRING for its block. Never fabricate to fill a gap.
- No hype, no filler, no canned consulting language. Short sentences.
- The engagement block is the offer: what the next phase (Diagnose) would establish, grounded only in the questions/gaps and the score spread provided. It ends where the meeting hands off to Diagnose; do not name a price or a duration unless one is in the data (none is — so never).

${US_ENGLISH_RULE}`;

    const userPrompt = `Real data for this company (JSON):
${JSON.stringify(bundle, null, 2)}

Produce the proposal fields:
- headline: one plain sentence framing the offer from this data.
- where_you_are: from the score spread (current -> potential -> projected). Empty string if score is null.
- what_the_read_shows: from the verdicts (what the prospect confirmed, refined, rejected). Empty string if verdicts is null.
- what_we_would_answer: frame the open questions as what the engagement would answer. Empty string if open_questions is null.
- the_engagement: the one-screen offer synthesized from the above. Always present if any data exists.`;

    const callModel = async () => {
      const res = await fetch(`${OLLAMA_BASE_URL}/chat/completions`, {
        method: "POST",
        headers: { Authorization: "Bearer ollama", "Content-Type": "application/json" },
        body: JSON.stringify({
          model: OLLAMA_MODEL,
          temperature: 0.3,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          tools: [{
            type: "function",
            function: {
              name: "first_read_proposal",
              description: "A one-screen first-meeting engagement proposal phrased strictly from the provided data.",
              parameters: {
                type: "object",
                properties: {
                  headline: { type: "string" },
                  where_you_are: { type: "string" },
                  what_the_read_shows: { type: "string" },
                  what_we_would_answer: { type: "string" },
                  the_engagement: { type: "string" },
                },
                required: ["headline", "where_you_are", "what_the_read_shows", "what_we_would_answer", "the_engagement"],
                additionalProperties: false,
              },
            },
          }],
          tool_choice: { type: "function", function: { name: "first_read_proposal" } },
        }),
      });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(`ollama ${res.status}: ${t.slice(0, 300)}`);
      }
      const data = await res.json();
      const args = data?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
      if (!args) throw new Error("model returned no tool call");
      return JSON.parse(args) as Record<string, string>;
    };

    let fields: Record<string, string>;
    try {
      fields = await callModel();
    } catch (e) {
      // Loud failure — never substitute prose. Session stays open, client retries.
      return json({ error: `proposal generation failed: ${(e as Error).message}`, trace }, 502);
    }

    // ── Assemble blocks + server-built sources (model text, server truth) ─────
    const unionSources: Sources = {};
    if (hasQuestions) unionSources.open_question_indices = openQuestions.map((_, i) => i);
    if (hasResponses) unionSources.response_ids = responses.map((r) => r.id);
    if (hasScore) unionSources.score_ref = "companies.mojo_score";

    const blocks: ProposalBlock[] = [];
    const push = (key: string, body: string | undefined, sources: Sources) => {
      const text = String(body ?? "").trim();
      if (!text) return; // model produced nothing for this block — drop, never pad
      if (!sources.open_question_indices?.length && !sources.response_ids?.length && !sources.score_ref) return;
      blocks.push({ key, heading: BLOCK_HEADINGS[key] ?? key, body: text, sources });
    };
    if (hasScore) push("where_you_are", fields.where_you_are, { score_ref: "companies.mojo_score" });
    if (hasResponses) push("what_the_read_shows", fields.what_the_read_shows, { response_ids: responses.map((r) => r.id) });
    if (hasQuestions) push("what_we_would_answer", fields.what_we_would_answer, { open_question_indices: openQuestions.map((_, i) => i) });
    push("the_engagement", fields.the_engagement, unionSources);

    if (blocks.length === 0) {
      // Model produced no usable prose for any data-backed block — honest, not canned.
      return json({
        status: "empty",
        empty_reason: "The model returned no usable text for the available data.",
        generated_at: new Date().toISOString(),
        trace,
      });
    }

    const headline = String(fields.headline ?? "").trim();
    // LANGUAGE JUDGE CRITERION (CV-2e): flag British spellings the US-English rule
    // forbids — surfaced honestly in the trace, NEVER silently rewritten. (Present as
    // signal for the operator; not a hard refusal — a spelling must not kill a real
    // proposal.)
    const language_flags = flagBritishisms(
      [headline, ...blocks.map((b) => b.body)].join(" "),
    );
    const proposal = {
      status: "generated" as const,
      language_flags,
      headline: headline || null,
      headline_sources: headline ? unionSources : null,
      blocks,
      bundle_summary: {
        question_count: openQuestions.length,
        confirmed_count: confirmed.length,
        corrected_count: corrected.length,
        rejected_count: rejected.length,
        score: hasScore ? { current: score, potential, projected } : null,
      },
      generated_at: new Date().toISOString(),
      trace,
    };

    // ── Issue: freeze + cache counts + persist (one update) ───────────────────
    const { error: upErr } = await supabase
      .from("first_read_sessions")
      .update({
        status: "proposal_issued",
        proposal_json: proposal,
        confirmed_count: confirmed.length,
        corrected_count: corrected.length,
        rejected_count: rejected.length,
      })
      .eq("id", session_id);
    if (upErr) return json({ error: `issuance failed: ${upErr.message}`, trace }, 500);

    return json({ status: "generated", proposal });
  } catch (e) {
    return json({ error: `unexpected: ${(e as Error).message}` }, 500);
  }
});
