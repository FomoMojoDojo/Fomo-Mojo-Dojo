// restamp-aggregator-self-voice — AUDITED, REVERSIBLE re-stamp of stored outside-band rows whose
// voice_class was stamped by HOST (operator ruling 2026-09-03, B). Precedent: supersede-old-client-voice.
//
// The outside ingest path now judges AUTHORSHIP on aggregator company-profile URLs
// (_shared/aggregatorAuthorship.ts, forward-only). This function brings the ALREADY-STORED rows in
// line — never by deletion, always with an audit row per change (preserve + audit law).
//
// MODES (body):
//   { dry_run: true (DEFAULT), company_id? }
//       Select every stored row under the predicate (signal_band='outside',
//       voice_class='outside_voice_about_client', not superseded, URL matches an aggregator
//       company-profile pattern), run the SAME local authorship judge on each, and RETURN the plan.
//       ZERO writes — no ledger row, no audit row, no signal write. The operator reviews every row.
//   { dry_run: false, plan: PlanRow[], run_ref? }
//       Apply EXACTLY the reviewed rows (the operator may strike rows from the dry-run plan): for each
//       row whose stored class still equals the plan's `from`, insert one signal_voice_restamps audit
//       row (old, new, judge verdict/entity/reason/model, run_ref) THEN write voice_class through the
//       service-role door with raw_payload.voice_restamp provenance. One long_runner_runs row per
//       company (run_kind='selfvoice_restamp', request_id=run_ref). Returns audit-row count == changed.
//   { revert_run_ref }
//       Restore old_voice_class for every un-reverted audit row of that run; marks reverted_at.
//
// FROZEN GUARD — refused (403) BEFORE any judge call or write: an explicit frozen company_id in
// dry-run; any planned row of a frozen company in apply; any audited row of a frozen company in
// revert. In the all-companies dry-run, frozen companies are never loaded or judged (skipped_frozen).
// The DB trigger enforce_company_freeze remains the real boundary; this is the courtesy fast-fail.
//
// LOCAL-ONLY judge: qwen2.5:14b-instruct on the operator's Ollama (same criterion, same transport
// as classify-upload-voice). ZERO external model calls.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  applyRestamp,
  judgeAggregatorAuthorship,
  makeSupabaseRestampStore,
  planRestamp,
  resolveLocalOllamaUrl,
  RestampRefusedError,
  revertRestamp,
  type PlanRow,
} from "../_shared/aggregatorAuthorship.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const body = await req.json().catch(() => ({})) as {
      dry_run?: unknown; company_id?: unknown; plan?: unknown; run_ref?: unknown; revert_run_ref?: unknown;
    };
    const supabase = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");
    const store = makeSupabaseRestampStore(supabase as unknown as { from: (t: string) => unknown });
    const log = (s: string) => console.log(`[restamp-aggregator-self-voice] ${s}`);

    // ── revert ──────────────────────────────────────────────────────────────────
    if (typeof body.revert_run_ref === "string" && body.revert_run_ref) {
      const out = await revertRestamp(store, { runRef: body.revert_run_ref, log });
      return json({ ok: true, mode: "revert", ...out });
    }

    const dryRun = body.dry_run !== false;

    // ── apply (reviewed plan only) ──────────────────────────────────────────────
    if (!dryRun) {
      const plan = Array.isArray(body.plan) ? (body.plan as PlanRow[]) : [];
      if (plan.length === 0) return json({ ok: false, error: "apply mode requires a non-empty reviewed `plan` (from a dry run)" }, 400);
      for (const p of plan) {
        if (!p || typeof p.signal_id !== "string" || (p.to !== "client_voice" && p.to !== "competitor_voice")) {
          return json({ ok: false, error: `malformed plan row: ${JSON.stringify(p).slice(0, 200)}` }, 400);
        }
      }
      const out = await applyRestamp(store, { plan, runRef: typeof body.run_ref === "string" && body.run_ref ? body.run_ref : undefined, log });
      return json({ ok: true, mode: "apply", audit_rows: out.applied, ...out });
    }

    // ── dry run (default): judge, return the plan, write NOTHING ────────────────
    const ollamaUrl = resolveLocalOllamaUrl();
    if (!ollamaUrl) {
      return json({ ok: false, error: "Local-only policy violation: the Ollama base URL must resolve to localhost/host.docker.internal." }, 500);
    }
    const model = Deno.env.get("OLLAMA_MODEL") || undefined;
    const companyId = typeof body.company_id === "string" && body.company_id ? body.company_id : undefined;
    const out = await planRestamp(store, {
      companyId,
      judge: (input) => judgeAggregatorAuthorship(input, { ollamaUrl, model }),
      log,
    });
    const changing = out.proposals.filter((p) => p.to !== null);
    return json({
      ok: true,
      mode: "dry_run",
      dry_run: true,
      scanned: out.scanned,
      gated: out.proposals.length,
      proposed_changes: changing.length,
      skipped_frozen: out.skipped_frozen,
      // Rows whose judged text came from quote_source_text / evidence_excerpt AND differed from claim_text.
      cleaner_text_available: out.cleaner_text_available,
      proposals: out.proposals,
      // The apply payload for the rows that WOULD change — the operator strikes rows, then posts it back.
      plan: changing.map<PlanRow>((p) => ({
        signal_id: p.signal_id, from: p.from, to: p.to as "client_voice" | "competitor_voice",
        judge_verdict: p.judge.verdict, judge_entity: p.judge.entity, judge_reason: p.judge.reason, judge_model: p.judge.model,
      })),
    });
  } catch (err) {
    if (err instanceof RestampRefusedError) return json({ ok: false, error: err.message, frozen: true }, 403);
    console.error("[restamp-aggregator-self-voice] error:", String((err as Error)?.message ?? err));
    return json({ ok: false, error: String((err as Error)?.message ?? err) }, 500);
  }
});
