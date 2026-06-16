// DECL-OPP-A2: per-opportunity potential-value judge. llama3:70b assigns each
// declared opportunity an ordinal band — Low / Medium / High — answering
// "how VALUABLE / promising is this outcome to the people doing this job?" weighed
// on centrality to their core job, size of the gap it addresses, fit to the JTBD,
// and how much solving it would matter.
//
// This is NOT b-ii's binary buyer/seller drop-gate. It ANNOTATES each retained
// opportunity with a band (the per-opportunity Torres potential-value), it never
// drops. Absolute per-opportunity scale — NO forced distribution (genuine clustering
// is allowed). Fail-safe direction: uncertain → Medium (never silently High or Low).
//
// Reuses the judgeOne HTTP skeleton (native /api/chat, format:json, abort timeout,
// regex parse) and content-identity hashing from the b-ii judge. The band lives in
// odi_needs.confidence on write (A2-2); A2-1 dry runs assign in-memory, write nothing.

import { normalizeForHash, sha256Hex } from "./contentIdentity.ts";

const JUDGE_TIMEOUT_MS = 120_000;
const DEFAULT_JUDGE_MODEL = "llama3:70b";

export type LikelihoodBand = "Low" | "Medium" | "High";

export type OpportunityLikelihoodVerdict = {
  outcome: string;
  content_hash: string;
  band: LikelihoodBand;
};

async function judgeOne(args: {
  ollamaUrl: string;
  judgeModel: string;
  outcome: string;
  stepLabel: string;
  executorBrief: string;
}): Promise<LikelihoodBand> {
  const nativeBase = args.ollamaUrl.replace(/\/v1\/?$/, "");
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), JUDGE_TIMEOUT_MS);
  try {
    const resp = await fetch(`${nativeBase}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer ollama" },
      body: JSON.stringify({
        model: args.judgeModel,
        format: "json",
        stream: false,
        options: { num_ctx: 4096 },
        messages: [
          {
            role: "system",
            content:
              "You judge how VALUABLE / promising a proposed opportunity is to the people doing this job (the buying side) — how worth pursuing it is for them. " +
              "Answer with JSON only: {\"band\":\"high\"} or {\"band\":\"medium\"} or {\"band\":\"low\"}. " +
              "Weigh four things: (1) CENTRALITY — is this outcome central to their core job, or peripheral? (2) GAP — how big is the gap it addresses? (3) FIT — how well does it fit what they are fundamentally trying to get done (the JTBD described below)? (4) STAKES — how much would solving it actually matter to them? " +
              "'high' = central to the core job, addresses a big gap, strong JTBD fit, and solving it matters a lot. " +
              "'medium' = useful but secondary, a moderate gap or fit, or uncertain importance. " +
              "'low' = peripheral to their job, a small gap, weak JTBD fit, or low importance to them. " +
              "Judge each opportunity on its OWN merits — do NOT force a spread; if several are genuinely high-value, say so, and if several are genuinely low, say so. " +
              "If you are not sure, answer 'medium'.",
          },
          {
            role: "user",
            content:
              `The people doing this job, and what they are fundamentally trying to get done (the JTBD): ${args.executorBrief}\n` +
              `Step in their job: ${args.stepLabel}\n` +
              `Proposed opportunity (a desired outcome): ${args.outcome}\n` +
              `How valuable / promising is this opportunity to these people?`,
          },
        ],
      }),
      signal: controller.signal,
    });
    if (!resp.ok) return "Medium"; // fail-safe: uncertain → Medium
    const data = await resp.json().catch(() => ({}));
    const content = String(data?.message?.content ?? "");
    const match = content.match(/"band"\s*:\s*"(low|medium|high)"/i);
    if (!match) return "Medium";
    const b = match[1].toLowerCase();
    return b === "high" ? "High" : b === "low" ? "Low" : "Medium";
  } catch {
    return "Medium"; // fail-safe
  } finally {
    clearTimeout(timeoutId);
  }
}

// Assign a likelihood band to each opportunity. Content-identity hash is computed
// for future store reuse (band → confidence on write); A2-1 does not persist.
export async function judgeOpportunityLikelihood(args: {
  opportunities: Array<{ outcome: string; stepLabel: string }>;
  executorBrief: string;
  ollamaUrl: string;
  judgeModel?: string;
}): Promise<OpportunityLikelihoodVerdict[]> {
  const judgeModel = args.judgeModel ?? DEFAULT_JUDGE_MODEL;
  const out: OpportunityLikelihoodVerdict[] = [];
  for (const opp of args.opportunities) {
    const contentHash = await sha256Hex(normalizeForHash(opp.outcome));
    const band = await judgeOne({
      ollamaUrl: args.ollamaUrl,
      judgeModel,
      outcome: opp.outcome,
      stepLabel: opp.stepLabel,
      executorBrief: args.executorBrief,
    });
    console.log(`[opp-likelihood-judge] "${opp.outcome.slice(0, 60)}" → ${band}`);
    out.push({ outcome: opp.outcome, content_hash: contentHash, band });
  }
  return out;
}
