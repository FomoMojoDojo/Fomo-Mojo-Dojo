// Shared LOCAL verdict-judge core (extracted from Phase-1 localAlignmentJudge so the
// opportunity AND route alignment judges share ONE 70b call / verdict-set / fail-closed
// definition instead of forking it).
//
// Imports NO OpenAI client — zero-OpenAI is structural. The 70b call FAILS CLOSED:
// any model error / unparseable output / invalid verdict / empty reason THROWS; the
// caller records its integrity row + skips, never writing a fabricated verdict, never
// falling back to OpenAI. Each judge supplies its OWN subject-specific system prompt +
// user text and does its own integrity record + DB write (so component/surface_type
// and the write target stay subject-specific). Closed verdict set + required cited
// reason are enforced HERE, once.

const JUDGE_TIMEOUT_MS = 120_000;
export const DEFAULT_JUDGE_MODEL = "llama3:70b";

export const ALIGNMENT_VERDICTS = ["aligned", "off_strategy", "unknown"] as const;
export type AlignmentVerdict = (typeof ALIGNMENT_VERDICTS)[number];

export type SupabaseLike = { from: (t: string) => any };

// The fail-closed 70b verdict call (system prompt supplied by the caller). Native
// /api/chat, format:json, num_ctx:4096 (measured to fit both subjects whole). Any
// failure THROWS — never returns a default/fabricated verdict.
export async function runVerdictJudge(opts: {
  ollamaUrl: string;
  judgeModel: string;
  system: string;
  userText: string;
}): Promise<{ classification: AlignmentVerdict; reason: string }> {
  const nativeBase = opts.ollamaUrl.replace(/\/v1\/?$/, "");
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), JUDGE_TIMEOUT_MS);
  try {
    const resp = await fetch(`${nativeBase}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer ollama" },
      body: JSON.stringify({
        model: opts.judgeModel,
        format: "json",
        stream: false,
        options: { num_ctx: 4096 },
        messages: [
          { role: "system", content: opts.system },
          { role: "user", content: opts.userText },
        ],
      }),
      signal: controller.signal,
    });
    if (!resp.ok) {
      throw new Error(`ollama HTTP ${resp.status}: ${(await resp.text().catch(() => "")).slice(0, 200)}`);
    }
    const data = await resp.json().catch(() => null);
    const content = String(data?.message?.content ?? "");
    let parsed: { classification?: string; reason?: string };
    try {
      parsed = JSON.parse(content);
    } catch {
      throw new Error(`unparseable judge output: ${content.slice(0, 200)}`);
    }
    const classification = String(parsed.classification ?? "").toLowerCase().trim();
    const reason = String(parsed.reason ?? "").trim();
    if (!(ALIGNMENT_VERDICTS as readonly string[]).includes(classification)) {
      throw new Error(`invalid verdict from judge: ${JSON.stringify(parsed.classification)}`);
    }
    if (!reason) {
      throw new Error("judge returned empty reason (a cited reason is required)");
    }
    return { classification: classification as AlignmentVerdict, reason };
  } finally {
    clearTimeout(timeoutId);
  }
}
