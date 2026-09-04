// retype-own-words — the SANCTIONED DOOR for re-typing existing own_words claims by statement kind
// (operator ruling 2026-09-03). mode:'dry_run' (default) returns the plan and writes NOTHING; mode:'apply'
// writes claims.statement_kind + declared_eligible with one own_words_retypes audit row per change under a
// long_runner_runs row (own_words_retype). Frozen companies refused. Never deletes, never rewrites.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { runOwnWordsRetype, type RetypeJudgeVerdict, type RetypePreset } from "../_shared/ownWordsRetype.ts";
import { RETYPE_SYSTEM, callModel } from "../_shared/ownWordsJudge.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const body = await req.json().catch(() => ({}));
    const company_id = String(body.company_id ?? "");
    const mode = body.mode === "apply" ? "apply" : "dry_run";
    if (!company_id) return json({ ok: false, error: "company_id required" }, 400);
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const judge = async (pageText: string | null, statements: string[]): Promise<RetypeJudgeVerdict[]> => {
      const user = `${pageText ? `PAGE TEXT:\n${pageText.slice(0, 12_000)}\n\n` : "PAGE TEXT: (not available)\n\n"}STATEMENTS:\n${statements.map((s) => `- ${s}`).join("\n")}`;
      const j = await callModel(RETYPE_SYSTEM, user);
      return (Array.isArray(j.verdicts) ? j.verdicts : []) as RetypeJudgeVerdict[];
    };

    // Reviewed plan (apply with edits): [{claim_id, kind, reason, decided_by:'judge'|'operator'}]. Operator rows
    // are audited as operator decisions; a fully preset page is never re-judged.
    const presets: RetypePreset[] = Array.isArray(body.plan)
      ? (body.plan as Array<Record<string, unknown>>).map((r) => ({
          claim_id: String(r.claim_id ?? ""), kind: r.kind, reason: r.reason == null ? null : String(r.reason),
          decided_by: (r.decided_by === "operator" ? "operator" : "judge") as RetypePreset["decided_by"],
        })).filter((r) => r.claim_id)
      : [];
    const res = await runOwnWordsRetype({ supabase, companyId: company_id, mode, judge, nowIso: new Date().toISOString(), runId: typeof body.run_id === "string" ? body.run_id : null, presets });
    if (!res.ok && "skipped" in res) {
      if (res.skipped === "frozen_company") return json({ ok: false, error: "This is a frozen reference company — its record is preserved and is not modified." }, 403);
      return json({ ok: false, error: "company not found" }, 404);
    }
    if (!res.ok) return json(res, 500);
    return json(res);
  } catch (e) {
    return json({ ok: false, error: (e as Error).message }, 500);
  }
});
