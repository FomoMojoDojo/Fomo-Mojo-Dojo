// gateway-resume-step — the SELF-CHAINING stepper that finishes work the 150s gateway wall cut off.
//
// A worker behind Kong can outrun its own response: the caller is cut at 150s while the isolate keeps
// going and writes its own integrity row. Gate B polled for that row inside the CALLER, which cost
// Brand AI its entire downstream chain when the caller's wall clock ran out mid-wait.
//
// Here the wait is its own stepper. ONE check per invocation, state banked on a `long_runner_runs`
// row (run_kind 'gateway_resume', chain_state = ResumeChainState), self-re-invoked after the check
// interval. Callers create the row, dispatch once, and CONTINUE — they never wait.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  RESUME_INTERVAL_MS, resumePendingNote, resumeStepDecision, type ResumeChainState,
} from "../_shared/gatewayResume.ts";

const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
function json(body: unknown, status = 200) { return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } }); }
function waitUntil(p: Promise<unknown>) {
  const edge = (globalThis as unknown as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } }).EdgeRuntime;
  if (edge?.waitUntil) edge.waitUntil(p); else void p;
}
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export const RUN_KIND = "gateway_resume";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  // deno-lint-ignore no-explicit-any
  const supabase = createClient(url, key) as unknown as { from: (t: string) => any };

  let company_id = ""; let row_id: string | null = null;
  try {
    const b = await req.json();
    company_id = String(b.company_id ?? "");
    row_id = b.row_id != null ? String(b.row_id) : null;
  } catch { /* */ }
  if (!company_id || !row_id) return json({ ok: false, error: "company_id and row_id required" }, 400);

  const { data: row } = await supabase.from("long_runner_runs")
    .select("id, status, chain_state").eq("id", row_id).maybeSingle();
  if (!row) return json({ ok: false, error: "resume row not found" }, 404);
  if ((row as { status?: string }).status !== "running") {
    return json({ ok: true, skipped: "already_closed", status: (row as { status?: string }).status });
  }
  const state = ((row as { chain_state?: ResumeChainState | null }).chain_state ?? null) as ResumeChainState | null;
  if (!state) return json({ ok: false, error: "resume row has no chain_state" }, 422);

  // ── ONE CHECK ────────────────────────────────────────────────────────────────────────────────
  const { data: intg } = await supabase.from("integrity_runs").select("status")
    .eq("company_id", company_id).eq("component", state.component)
    .order("ran_at", { ascending: false }).limit(1);
  const observedStatus = ((intg ?? []) as Array<{ status: string }>)[0]?.status ?? null;

  const decision = resumeStepDecision({ observedStatus, state, now: Date.now() });
  const checks = state.checks + 1;

  const close = async (status: "completed" | "failed", note: string, patch: Partial<ResumeChainState> = {}) => {
    await supabase.from("long_runner_runs").update({
      status, error_text: note, finished_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      chain_state: { ...state, ...patch, checks },
    }).eq("id", row_id);
  };

  if (decision.action === "noop") {
    await close("completed", "resume already fired — duplicate invoke ignored");
    return json({ ok: true, decision: decision.action, checks });
  }

  if (decision.action === "exhausted") {
    // NEVER 'failed' for the WORK — the worker may still be running. The row is closed so the ledger
    // is honest about the resume giving up, and the artifact remains the source of truth.
    await close("failed", `resume exhausted after ${checks} checks (${decision.reason}) — component ${state.component} never reached a terminal`);
    return json({ ok: true, decision: decision.action, reason: decision.reason, checks });
  }

  if (decision.action === "fire") {
    let followUpOk = true; let detail = "";
    // Close a caller's stranded run row FIRST — the gateway cut it, the work finished, and the row
    // should read what actually happened rather than 'running' forever (agent_flow_runs 03942b7a).
    if (state.closeRow) {
      try {
        await supabase.from(state.closeRow.table).update(state.closeRow.patch).eq("id", state.closeRow.id);
      } catch (e) { detail = `closeRow failed: ${(e as Error).message}`; }
    }
    if (state.followUp) {
      try {
        const res = await fetch(`${url}/functions/v1/${state.followUp.fn}`, {
          method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${key}` },
          body: JSON.stringify(state.followUp.body),
        });
        followUpOk = res.ok;
        if (!res.ok) detail = `follow-up ${state.followUp.fn} responded ${res.status}`;
      } catch (e) { followUpOk = false; detail = `follow-up threw: ${(e as Error).message}`; }
    }
    // Mark fired BEFORE the un-gate fan-out so a duplicate invoke can never double-fire it.
    await close(
      followUpOk ? "completed" : "failed",
      followUpOk
        ? `resumed after gateway cut · ${state.component} · check ${checks}`
        : `resume fired but ${detail}`,
      { followUpFired: true },
    );
    if (followUpOk) {
      for (const d of state.onDone) {
        waitUntil(fetch(`${url}/functions/v1/${d.fn}`, {
          method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${key}` },
          body: JSON.stringify(d.body),
        }).catch(() => {}));
      }
    }
    return json({ ok: true, decision: "fire", checks, follow_up_ok: followUpOk, detail: detail || undefined });
  }

  // ── RESCHEDULE: bank the check and hand off to a fresh isolate. This invocation ends here. ────
  await supabase.from("long_runner_runs").update({
    chain_state: { ...state, checks },
    error_text: resumePendingNote(state.component, checks, state.maxChecks),
    updated_at: new Date().toISOString(),
  }).eq("id", row_id);

  waitUntil(
    sleep(state.intervalMs ?? RESUME_INTERVAL_MS).then(() =>
      fetch(`${url}/functions/v1/gateway-resume-step`, {
        method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${key}` },
        body: JSON.stringify({ company_id, row_id }),
      }).catch(() => {})
    ),
  );
  return json({ ok: true, decision: "reschedule", checks, next_in_ms: state.intervalMs ?? RESUME_INTERVAL_MS });
});
