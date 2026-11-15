// F3′ (2026-11-14): council-review runs in the BACKGROUND on the local model — the function answers 202 with
// {run_id, status:"running"} and the run reports through its council_review_runs row. These helpers are the one
// place the browser waits for a run and the one rule for which run rows a reader shows.

export type CouncilRunRow = { id?: string; status?: string | null; summary?: string | null; source_snapshot_json?: unknown };

/** A no-write ({write:false}) run: it wrote no recommendations and is never shown in a run list. */
export function isDryRunCouncilRun(run: CouncilRunRow | null | undefined): boolean {
  const snap = (run?.source_snapshot_json ?? null) as { dry_run?: unknown } | null;
  return snap?.dry_run === true;
}

/** The run rows a reader shows: every row except no-write runs. */
export function visibleCouncilRuns<T extends CouncilRunRow>(runs: readonly T[] | null | undefined): T[] {
  return (runs ?? []).filter((r) => !isDryRunCouncilRun(r));
}

type RunReader = {
  from: (t: string) => {
    select: (c: string) => { eq: (c: string, v: string) => { maybeSingle: () => PromiseLike<{ data: unknown; error: unknown }> } };
  };
};

/**
 * Poll one run until it leaves 'running'. Resolves with the final row; rejects when the run failed (its summary
 * carries the reason) or when it is still running after `timeoutMs`.
 */
export async function waitForCouncilRun(
  sb: RunReader,
  runId: string,
  opts: { intervalMs?: number; timeoutMs?: number; sleep?: (ms: number) => Promise<void> } = {},
): Promise<CouncilRunRow> {
  const intervalMs = opts.intervalMs ?? 5_000;
  const timeoutMs = opts.timeoutMs ?? 9 * 60_000;
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  for (let waited = 0; waited <= timeoutMs; waited += intervalMs) {
    const { data, error } = await sb.from("council_review_runs").select("id, status, summary, source_snapshot_json").eq("id", runId).maybeSingle();
    const row = (data ?? null) as CouncilRunRow | null;
    if (!error && row && row.status && row.status !== "running") {
      if (row.status === "failed") throw new Error(row.summary || "Council review failed");
      return row;
    }
    await sleep(intervalMs);
  }
  throw new Error("The council review is still running on the local model — refresh in a minute.");
}
