// JOB MAP GENERATION — the workspace market door (item 2, signed 2026-09-15). Generates the job steps
// of ONE unmapped market from the Job Map page through local-jobmap-synthesis.
//
// Request (item 2 step 5, exact): { company_id, selected_job_maps: [{ journey_key, journey_title: <the
// switcher label>, journey_subtitle: "" }], selected_maps_only: true, require_model: true,
// trigger: "workspace_jobmap_generate:<key>" }. ONE key only — under selected_maps_only every listed key
// is regenerated (delete-per-key + insert), so customer is never sent as "support".
//
// Run state (R3): the run may outlive the Kong 150 s gateway. A 4xx/422 (or an ok:false body) fails
// immediately. A 5xx / transport error keeps Working… and polls job_steps for the key every 6 s (the
// useConditionsGeneration pattern): steps appear → done; nothing by the bound (330 s from the click) →
// failure. One run per company at a time. Silent inertness is prohibited — every path ends in a state.
import { useCallback, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { isFrozenCompany } from "@/lib/frozenCompanies";

export const JOBMAP_GENERATION_POLL_MS = 6_000;
const JOBMAP_GENERATION_BOUND_MS = 330_000;

/** The bound from the click. Test-only override: window.__FR_JOBMAP_GEN_BOUND_MS (set by the spec's init script). */
export function jobMapGenerationBoundMs(): number {
  const w = typeof window === "undefined" ? undefined : (window as unknown as { __FR_JOBMAP_GEN_BOUND_MS?: unknown }).__FR_JOBMAP_GEN_BOUND_MS;
  return typeof w === "number" && w > 0 ? w : JOBMAP_GENERATION_BOUND_MS;
}

export type JobMapGenerationArgs = {
  companyId?: string | null;
  /** The viewed (unmapped) market's key. */
  journeyKey: string | null;
  /** The switcher label (job_steps.journey_title → market_lens.title → null → the key). */
  journeyTitle: string | null;
  /** Re-read job_steps once the run has landed. */
  refetch: () => void | Promise<unknown>;
};

export type JobMapGenerationState = {
  run: () => Promise<void>;
  running: boolean;
  failed: boolean;
  /** Operator-only detail ("<status> <code> — <message>"); the client sees the signed note only. */
  failureDetail: string | null;
};

// One run per company at a time (module-level so two mounted pages cannot double-run).
const inFlight = new Set<string>();

type HttpErrorLike = { name?: string; context?: { status?: number; json?: () => Promise<unknown> } };

async function describeHttpError(err: HttpErrorLike): Promise<{ status: number; detail: string }> {
  const status = Number(err.context?.status ?? 0);
  let body: Record<string, unknown> | null = null;
  try { body = (await err.context?.json?.()) as Record<string, unknown> | null; } catch { body = null; }
  const code = String(body?.error ?? "");
  const message = String(body?.message ?? "");
  const detail = [status ? String(status) : "", code, message ? `— ${message}` : ""].filter(Boolean).join(" ").replace(/\s+—/, " —");
  return { status, detail: detail || `${status || "?"} request failed` };
}

export function useJobMapGeneration({ companyId, journeyKey, journeyTitle, refetch }: JobMapGenerationArgs): JobMapGenerationState {
  const [running, setRunning] = useState(false);
  const [failed, setFailed] = useState(false);
  const [failureDetail, setFailureDetail] = useState<string | null>(null);

  const run = useCallback(async () => {
    if (!companyId || !journeyKey) return;
    setFailed(false);
    setFailureDetail(null);
    if (isFrozenCompany(companyId)) {
      setFailed(true);
      setFailureDetail("frozen reference company — job maps are not generated for it");
      return;
    }
    if (inFlight.has(companyId)) return; // one run per company at a time; the other control already shows Working…
    inFlight.add(companyId);
    setRunning(true);
    const startedAt = Date.now();
    const fail = (detail: string | null) => { setFailed(true); setFailureDetail(detail); };
    try {
      const { data, error } = await supabase.functions.invoke("local-jobmap-synthesis", {
        body: {
          company_id: companyId,
          selected_job_maps: [{ journey_key: journeyKey, journey_title: journeyTitle || journeyKey, journey_subtitle: "" }],
          selected_maps_only: true,
          require_model: true,
          trigger: `workspace_jobmap_generate:${journeyKey}`,
        },
      });
      if (!error) {
        const body = (data ?? null) as Record<string, unknown> | null;
        if (body && !body.error && body.status !== "dry_run") {
          await refetch();
          return;
        }
        fail(body?.error ? String(body.message ?? body.error) : "empty response");
        return;
      }
      const e = error as HttpErrorLike;
      if (e.name === "FunctionsHttpError") {
        const { status, detail } = await describeHttpError(e);
        if (status >= 400 && status < 500) { fail(detail); return; }
        // 5xx (the 150 s gateway timeout is a 504) — the run may still be writing; poll.
      }
      // Transport error or 5xx: poll job_steps for the key until the bound.
      const bound = jobMapGenerationBoundMs();
      while (Date.now() - startedAt < bound) {
        await new Promise<void>((r) => setTimeout(r, JOBMAP_GENERATION_POLL_MS));
        const { data: rows } = await supabase
          .from("job_steps")
          .select("id")
          .eq("company_id", companyId)
          .eq("journey_key", journeyKey)
          .limit(1);
        if (Array.isArray(rows) && rows.length > 0) {
          await refetch();
          return;
        }
      }
      fail(`nothing written for '${journeyKey}' within ${Math.round(bound / 1000)} s of the click`);
    } catch (err) {
      fail(err instanceof Error ? err.message : String(err));
    } finally {
      inFlight.delete(companyId);
      setRunning(false);
    }
  }, [companyId, journeyKey, journeyTitle, refetch]);

  return { run, running, failed, failureDetail };
}
