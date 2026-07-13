// Poll the self-owned durable run-status row (long_runner_runs) that public-baseline
// writes at entry and updates to completed/failed at exit — REGARDLESS of caller.
//
// WHY: `supabase.functions.invoke("public-baseline")` returns an error when the 150s
// edge-isolate response wall cuts the browser. But the isolate finishes behind the cut
// and lands its write (proven via the SIAA/Wasabi births). So a failed invoke is NOT
// proof the run failed — the lying spinner. On invoke error, callers poll this row for
// the TRUE terminal state instead of trusting the cut.
//
// long_runner_runs is not in the generated Supabase types (server-written, newly added),
// so we use the established `supabase as any` access pattern (see useStrategicDecisions,
// CouncilRecommendationsPanel). Matched to the current invocation by recency: the newest
// row for (company_id, run_kind='public_baseline') started at/after we began, so a stale
// prior run is never mistaken for this one.

import { supabase } from "@/integrations/supabase/client";

export type BaselineTerminalState = "completed" | "failed" | "running" | "unknown";

export async function pollPublicBaselineTerminal(opts: {
  companyId: string;
  /** ISO timestamp captured immediately BEFORE invoking public-baseline. */
  sinceIso: string;
  /** Total time to keep polling before giving up (default 120s). */
  timeoutMs?: number;
  /** Delay between polls (default 3s). */
  intervalMs?: number;
}): Promise<BaselineTerminalState> {
  const timeoutMs = opts.timeoutMs ?? 120_000;
  const intervalMs = opts.intervalMs ?? 3_000;
  const deadline = Date.now() + timeoutMs;
  // Tolerate client/db clock skew when matching "this invocation's" row.
  const sinceCutoff = new Date(new Date(opts.sinceIso).getTime() - 15_000).toISOString();

  let sawRunning = false;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any;

  while (Date.now() < deadline) {
    const { data, error } = await sb
      .from("long_runner_runs")
      .select("status, started_at")
      .eq("company_id", opts.companyId)
      .eq("run_kind", "public_baseline")
      .gte("started_at", sinceCutoff)
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!error && data) {
      const status = String((data as { status?: unknown }).status || "");
      if (status === "completed" || status === "failed") return status;
      if (status === "running") sawRunning = true;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  // Timed out without a terminal row. If we ever saw `running`, it's still going in the
  // background (honest in-progress); otherwise we simply couldn't determine it.
  return sawRunning ? "running" : "unknown";
}
