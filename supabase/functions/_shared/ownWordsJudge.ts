// OWN-WORDS JUDGE — the prompt + the model call, shared by extract-own-words (birth) and
// retype-own-words (backfill) so the typed question is asked ONE way. Edge-only (Deno.env); the pure
// vocabulary/eligibility lives in ownWordsKinds.ts.
import { JUDGE_KIND_QUESTION, parseOwnWordsKind } from "./ownWordsKinds.ts";
import type { JudgeVerdict } from "./ownWordsExtract.ts";

const USE_LOCAL = Deno.env.get("OWN_WORDS_LOCAL") === "1";
const OLLAMA_BASE_URL = Deno.env.get("OLLAMA_BASE_URL") ?? "http://host.docker.internal:11434/v1";
const LOCAL_MODEL = Deno.env.get("OWN_WORDS_LOCAL_MODEL") ?? "qwen2.5:14b-instruct";
const GEN_MODEL = Deno.env.get("OWN_WORDS_MODEL") ?? "gpt-4.1-mini";
const GEN_FALLBACK = "gpt-4o-mini";

export const JUDGE_SYSTEM =
  `You judge candidate own-words quotes pulled from a company's OWN web page. For each candidate decide: ` +
  `keep (true ONLY if it is the company asserting something about itself — positioning, promise, who it serves, why it wins); ` +
  `selfAssertion (is the company speaking about ITSELF, not a third party, review, menu item, or navigation); ` +
  `fidelity ('verbatim' if an exact copy from the page, else 'paraphrased'). Reject third-party quotes, navigation, menus, prices, legal. ` +
  `ALSO reject: (i) PRODUCT/SKU descriptions — tasting notes, roast profiles, or format/price copy describing a SPECIFIC item ` +
  `(e.g. "This medium roast is fruity and full-bodied", "our Pour-Over packs let you…"); ` +
  `(ii) RECRUITING/JOB copy — hiring calls, benefits lists, role descriptions ("we're looking for…", "competitive compensation", "as a X you'll…"). ` +
  `But KEEP offering-model statements — what the company provides, to whom, and how (e.g. "we provide crisis stabilization to Bay Area youth", "all of our coffees are available in 12oz bags for wholesale partners"). ` +
  `For EVERY candidate also give ${JUDGE_KIND_QUESTION} ` +
  `Respond with ONLY JSON: {"verdicts":[{"quote":"...","keep":true,"selfAssertion":true,"fidelity":"verbatim","reason":"...","kind":"positioning","kindReason":"..."}]}. No other text.`;

/** Backfill prompt: kind + reason ONLY, over statements already admitted as own words (no re-judging keep). */
export const RETYPE_SYSTEM =
  `You classify statements a company has published about itself on its own channels. The statements are already ` +
  `verified verbatim; do NOT rewrite, merge, or drop any. For EVERY statement give ${JUDGE_KIND_QUESTION} ` +
  `Respond with ONLY JSON: {"verdicts":[{"quote":"...","kind":"positioning","kindReason":"..."}]}. No other text.`;

export async function callModel(system: string, user: string): Promise<Record<string, unknown>> {
  const endpoint = USE_LOCAL ? `${OLLAMA_BASE_URL}/chat/completions` : "https://api.openai.com/v1/chat/completions";
  const apiKey = USE_LOCAL ? "ollama" : Deno.env.get("OPENAI_API_KEY");
  if (!USE_LOCAL && !apiKey) throw new Error("OPENAI_API_KEY not set");
  const models = USE_LOCAL ? [LOCAL_MODEL] : [GEN_MODEL, GEN_FALLBACK];
  let lastErr: unknown = null;
  for (const model of models) {
    try {
      const resp = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model, temperature: 0,
          response_format: { type: "json_object" },
          messages: [{ role: "system", content: system }, { role: "user", content: user }],
        }),
      });
      if (!resp.ok) { lastErr = new Error(`${model} ${resp.status}: ${(await resp.text()).slice(0, 200)}`); continue; }
      const data = await resp.json();
      const content = String(data?.choices?.[0]?.message?.content ?? "");
      const m = content.match(/\{[\s\S]*\}/);
      if (!m) { lastErr = new Error(`${model} returned no JSON`); continue; }
      return JSON.parse(m[0]) as Record<string, unknown>;
    } catch (e) { lastErr = e; }
  }
  throw lastErr ?? new Error("all models failed");
}

/** Parse the judge's verdicts (typed kind + reason) keyed by trimmed quote. */
export function parseJudgeVerdicts(j: Record<string, unknown>): Map<string, JudgeVerdict> {
  const verdicts = (Array.isArray(j.verdicts) ? j.verdicts : []) as Array<Record<string, unknown>>;
  return new Map(
    verdicts.map((v) => [String(v.quote ?? "").trim(), {
      keep: v.keep === true,
      fidelity: v.fidelity === "paraphrased" ? "paraphrased" : "verbatim",
      selfAssertion: v.selfAssertion === true,
      reason: v.reason ? String(v.reason) : undefined,
      kind: parseOwnWordsKind(v.kind),
      kindReason: v.kindReason ? String(v.kindReason) : undefined,
    } as JudgeVerdict]),
  );
}
