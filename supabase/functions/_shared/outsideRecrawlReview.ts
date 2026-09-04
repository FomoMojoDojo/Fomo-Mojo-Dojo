// R3 REVIEW GATE — pure (no Deno, no DB). Operator ruling 2026-09-04: extract-outside-evidence regenerates
// ONLY URLs whose outside_recrawl_review row for the run_id carries operator_decision='approve'. Everything
// else is refused with a named reason and ledgered. A missing run_id is refused before any URL is read.
export type ReviewGateRow = { source_url: string; operator_decision: string | null };
export type ReviewRefusal = { url: string; reason: "rejected" | "not_decided" | "no_review_row" };

/** The body's run_id, or null when absent / empty / not a string. */
export function requireRunId(body: Record<string, unknown>): string | null {
  const v = body?.run_id;
  return typeof v === "string" && v.trim().length > 0 ? v : null;
}

/** Split the candidate URLs into allowed (approved) and refused (with reason), in input order. */
export function gateRegenUrls(urls: string[], rows: ReviewGateRow[]): { allowed: string[]; refused: ReviewRefusal[] } {
  const byUrl = new Map(rows.map((r) => [r.source_url, r.operator_decision]));
  const allowed: string[] = [];
  const refused: ReviewRefusal[] = [];
  for (const url of urls) {
    if (!byUrl.has(url)) { refused.push({ url, reason: "no_review_row" }); continue; }
    const d = byUrl.get(url);
    if (d === "approve") allowed.push(url);
    else if (d === "reject") refused.push({ url, reason: "rejected" });
    else refused.push({ url, reason: "not_decided" });
  }
  return { allowed, refused };
}
