// OWN-WORDS RETYPE BACKFILL — core (operator ruling 2026-09-03). The 486 existing own_words claims were
// admitted before the kind question existed; this re-types them through the SAME typed judge question,
// per company, per page (one judge call over the page's existing own-words statements). DRY-RUN by
// default: returns the plan and WRITES NOTHING. Apply: sets claims.statement_kind + declared_eligible,
// one own_words_retypes audit row per change, under a long_runner_runs row (run_kind own_words_retype).
// Frozen companies are refused before any read. Never deletes, never rewrites a statement.
import { FROZEN_COMPANY_IDS } from "./stepConditionsSynthesis.ts";
import { declaredEligibleFor, parseOwnWordsKind, type OwnWordsKind } from "./ownWordsKinds.ts";

export type RetypeMode = "dry_run" | "apply";
export type RetypeJudgeVerdict = { quote: string; kind: unknown; kindReason?: string };
/** Injected judge: page text (null when no snapshot is stored) + the page's statements → typed verdicts. */
export type RetypeJudge = (pageText: string | null, statements: string[]) => Promise<RetypeJudgeVerdict[]>;

export type RetypePlanRow = {
  claim_id: string;
  page_url: string | null;
  statement: string;
  from_kind: string | null;
  from_eligible: boolean;
  proposed_kind: OwnWordsKind | null;
  proposed_eligible: boolean;
  kind_missing: boolean;
  reason: string | null;
  changed: boolean;
};

export type RetypeResult =
  | { ok: false; skipped: "frozen_company" | "company_not_found" }
  | { ok: false; error: string }
  | {
      ok: true; mode: RetypeMode; run_id: string | null;
      totals: { claims: number; pages: number; judge_calls: number; changed: number; kind_missing: number; by_kind: Record<string, number>; applied: number; audited: number };
      plan: RetypePlanRow[];
    };

// deno-lint-ignore no-explicit-any
type Store = { from: (t: string) => any };

export async function runOwnWordsRetype(args: {
  supabase: Store; companyId: string; mode: RetypeMode; judge: RetypeJudge; nowIso: string; runId?: string | null;
}): Promise<RetypeResult> {
  // Frozen fixtures are refused BEFORE any read (CB1 by law).
  if (FROZEN_COMPANY_IDS.has(args.companyId)) return { ok: false, skipped: "frozen_company" };
  const { data: co } = await args.supabase.from("companies").select("id, frozen").eq("id", args.companyId).maybeSingle();
  if (!co) return { ok: false, skipped: "company_not_found" };
  if ((co as { frozen?: boolean }).frozen) return { ok: false, skipped: "frozen_company" };

  const { data: rows, error } = await args.supabase.from("claims")
    .select("id, statement, raw_payload, statement_kind, declared_eligible")
    .eq("company_id", args.companyId).eq("claim_type", "own_words").eq("status", "active");
  if (error) return { ok: false, error: String(error.message ?? error) };
  type Row = { id: string; statement: string | null; raw_payload?: { page_url?: string } | null; statement_kind: string | null; declared_eligible: boolean | null };
  const claims = ((rows ?? []) as Row[]).filter((r) => (r.statement ?? "").trim().length > 0);

  // Group by page (raw_payload.page_url); a claim without a page judges in the "(no page)" group.
  const byPage = new Map<string | null, Row[]>();
  for (const c of claims) {
    const url = c.raw_payload?.page_url ? String(c.raw_payload.page_url) : null;
    const list = byPage.get(url);
    if (list) list.push(c); else byPage.set(url, [c]);
  }

  const plan: RetypePlanRow[] = [];
  const byKind: Record<string, number> = {};
  let judgeCalls = 0, kindMissing = 0;
  for (const [url, list] of byPage) {
    let pageText: string | null = null;
    if (url) {
      const { data: snap } = await args.supabase.from("own_words_page_snapshots")
        .select("clean_text").eq("company_id", args.companyId).eq("source_url", url)
        .order("fetched_at", { ascending: false }).limit(1).maybeSingle();
      pageText = (snap as { clean_text?: string } | null)?.clean_text ?? null;
    }
    const statements = list.map((c) => (c.statement ?? "").trim());
    const verdicts = await args.judge(pageText, statements);
    judgeCalls++;
    const byQuote = new Map(verdicts.map((v) => [String(v.quote ?? "").trim(), v]));
    for (const c of list) {
      const st = (c.statement ?? "").trim();
      const v = byQuote.get(st);
      const kind = v ? parseOwnWordsKind(v.kind) : null;
      const missing = kind === null;
      if (missing) kindMissing++;
      const eligible = declaredEligibleFor(kind); // fail-toward-eligible
      const fromEligible = c.declared_eligible !== false;
      byKind[kind ?? "(missing)"] = (byKind[kind ?? "(missing)"] ?? 0) + 1;
      plan.push({
        claim_id: c.id, page_url: url, statement: st,
        from_kind: c.statement_kind ?? null, from_eligible: fromEligible,
        proposed_kind: kind, proposed_eligible: eligible, kind_missing: missing,
        reason: v?.kindReason ? String(v.kindReason) : null,
        // A missing kind proposes NO change (nothing is written from a glitch).
        changed: !missing && (kind !== (c.statement_kind ?? null) || eligible !== fromEligible),
      });
    }
  }
  const changed = plan.filter((p) => p.changed);
  const totals = { claims: claims.length, pages: byPage.size, judge_calls: judgeCalls, changed: changed.length, kind_missing: kindMissing, by_kind: byKind, applied: 0, audited: 0 };

  if (args.mode !== "apply") return { ok: true, mode: "dry_run", run_id: null, totals, plan };

  // ── APPLY: ledger row → per-change update + audit → ledger completed ──────────────────────
  const runId = args.runId ?? crypto.randomUUID();
  const { error: ledErr } = await args.supabase.from("long_runner_runs").insert({
    id: runId, run_kind: "own_words_retype", company_id: args.companyId, status: "running", target_count: changed.length, done_count: 0, started_at: args.nowIso,
  });
  if (ledErr) return { ok: false, error: `ledger insert failed: ${ledErr.message}` };
  for (const p of changed) {
    const { error: upErr } = await args.supabase.from("claims")
      .update({ statement_kind: p.proposed_kind, declared_eligible: p.proposed_eligible })
      .eq("id", p.claim_id).eq("company_id", args.companyId);
    if (upErr) return { ok: false, error: `claim update failed for ${p.claim_id}: ${upErr.message}` };
    totals.applied++;
    const { error: audErr } = await args.supabase.from("own_words_retypes").insert({
      company_id: args.companyId, claim_id: p.claim_id, run_id: runId,
      from_kind: p.from_kind, to_kind: p.proposed_kind, from_eligible: p.from_eligible, to_eligible: p.proposed_eligible,
      reason: p.reason ?? "(no reason returned)", applied_at: args.nowIso,
    });
    if (audErr) return { ok: false, error: `audit insert failed for ${p.claim_id}: ${audErr.message}` };
    totals.audited++;
  }
  await args.supabase.from("long_runner_runs").update({ status: "completed", done_count: totals.applied, finished_at: args.nowIso }).eq("id", runId);
  return { ok: true, mode: "apply", run_id: runId, totals, plan };
}
