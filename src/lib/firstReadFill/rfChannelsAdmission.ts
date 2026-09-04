// RF (operator ruling 2026-09-04) — inference claims in the "Your channels, as we read them" block go through
// the SAME admission criterion as own-words claims: a testable assertion that POSITIONS (kind ∈ positioning /
// offer / audience / proof) passes; slogan / tone / instruction / product note / policy / story / recruiting /
// other is no assertion and fails. DRY-RUN ONLY in this brief: this module classifies and plans; it never
// writes. Pure (no Deno, no DB, no network) — the judge is injected so vitest proves the mapping.
import { DECLARED_ELIGIBLE_KINDS, JUDGE_KIND_QUESTION, parseOwnWordsKind, type OwnWordsKind } from "../../../supabase/functions/_shared/ownWordsKinds";
// Operator ruling (2026-09-04, RF review): the extractor's SAME deterministic product-description check runs
// BEFORE the kind question (as it does at own-words birth). ownWordsExtract.ts is pure (no Deno) — imported directly.
import { isProductDescription } from "../../../supabase/functions/_shared/ownWordsExtract";

export type RfVerdict = "PASS" | "FAIL" | "UNTYPED";
export type RfRow = { id: string; statement: string; pageUrl: string | null };
export type RfJudgeVerdict = { quote: string; kind: unknown; kindReason?: string };
/** Injected judge: optional page text + the page's statements → typed verdicts (one call per page). */
export type RfJudge = (pageText: string | null, statements: string[]) => Promise<RfJudgeVerdict[]>;
export type RfPlanRow = RfRow & { verdict: RfVerdict; kind: OwnWordsKind | null; reason: string | null };
/** The pre-judge FAIL reason — byte-exact, the table's vocabulary. */
export const RF_REASON_PRODUCT_DESCRIPTION = "product description";

/** The system prompt — the SAME typed question the own-words judge asks (ownWordsKinds.JUDGE_KIND_QUESTION).
 *  Node-side copy of the retype prompt's shape: ownWordsJudge.ts reads Deno.env at module scope and cannot
 *  be imported here. Classify only; never rewrite, merge or drop. */
export const RF_SYSTEM =
  `You classify statements that OUR reader inferred from a company's OWN web pages (they may be paraphrases, not ` +
  `verbatim). Do NOT rewrite, merge, or drop any. For EVERY statement give ${JUDGE_KIND_QUESTION} ` +
  `Respond with ONLY JSON: {"verdicts":[{"quote":"...","kind":"positioning","kindReason":"..."}]}. No other text.`;

/** PASS iff the judged kind is declared-eligible; a missing/invalid kind is UNTYPED (never PASS — no
 *  fail-toward-eligible here: the operator decides, nothing is inferred from a glitch). */
export function rfVerdictForKind(kind: OwnWordsKind | null): RfVerdict {
  if (kind === null) return "UNTYPED";
  return DECLARED_ELIGIBLE_KINDS.has(kind) ? "PASS" : "FAIL";
}

/** Judge once per page over the block's rows; returns one plan row per input row (input order preserved).
 *  Product-description lines (isProductDescription) FAIL deterministically BEFORE the judge and are never sent. */
export async function planRfAdmission(rows: RfRow[], judge: RfJudge, pageText?: (url: string | null) => Promise<string | null>): Promise<{ plan: RfPlanRow[]; judgeCalls: number }> {
  const productDescription = new Set(rows.filter((r) => isProductDescription(r.statement)).map((r) => r.id));
  const byPage = new Map<string | null, RfRow[]>();
  for (const r of rows) {
    if (productDescription.has(r.id)) continue; // never reaches the judge
    const l = byPage.get(r.pageUrl); if (l) l.push(r); else byPage.set(r.pageUrl, [r]);
  }
  const verdictById = new Map<string, { kind: OwnWordsKind | null; reason: string | null }>();
  let judgeCalls = 0;
  for (const [url, list] of byPage) {
    const text = pageText ? await pageText(url) : null;
    const verdicts = await judge(text, list.map((r) => r.statement.trim()));
    judgeCalls++;
    const byQuote = new Map(verdicts.map((v) => [String(v.quote ?? "").trim(), v]));
    for (const r of list) {
      const v = byQuote.get(r.statement.trim());
      verdictById.set(r.id, { kind: v ? parseOwnWordsKind(v.kind) : null, reason: v?.kindReason ? String(v.kindReason) : null });
    }
  }
  const plan = rows.map((r): RfPlanRow => {
    if (productDescription.has(r.id)) return { ...r, verdict: "FAIL", kind: null, reason: RF_REASON_PRODUCT_DESCRIPTION };
    const v = verdictById.get(r.id) ?? { kind: null, reason: null };
    return { ...r, verdict: rfVerdictForKind(v.kind), kind: v.kind, reason: v.reason };
  });
  return { plan, judgeCalls };
}

export function rfTotals(plan: RfPlanRow[]): Record<RfVerdict, number> {
  const t: Record<RfVerdict, number> = { PASS: 0, FAIL: 0, UNTYPED: 0 };
  for (const p of plan) t[p.verdict]++;
  return t;
}
