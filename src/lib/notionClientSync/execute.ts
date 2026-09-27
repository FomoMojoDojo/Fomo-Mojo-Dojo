// B2b — the executor. Both sides are INJECTED, so the failure-isolation and planned-row behaviour
// R11 specifies can be exercised against fakes, with no Notion and no database. That is what the
// guard's script plants drive; sync.ts passes the real write client and a real RPC caller.
import type { PlanStep } from "./plan";

export type Writer = {
  createRow: (args: { name: string; mojoMapId: string; status: string | null }) => Promise<{ pageId: string }>;
  patchStatus: (pageId: string, status: string | null, expectLastEditedTime?: string) => Promise<void>;
};

/** Calls a named Postgres RPC. The executor never builds a URL or a method of its own. */
export type Rpc = (fn: string, args: Record<string, unknown>) => Promise<unknown>;

export type CompanyWork = {
  companyId: string;
  companyName: string;
  action: string;
  steps: PlanStep[];
};

export type Outcome = {
  company: string;
  companyId: string;
  result: "done" | "nothing" | "STALE" | "FAILED" | "NEEDS-OPERATOR";
  action: string;
  detail: string;
  auditId?: number;
};

const STALE_SENTINEL = "__handled_stale__";

/**
 * R11, per company: planned row → Notion → the DB RPC that writes the columns, the audit row and the
 * closure of the planned row in one transaction.
 *
 * FAILURE ISOLATION is the whole point of the try/catch being INSIDE the loop: a company whose Notion
 * write fails records itself through sync_fail_notion_write (which sets last_sync_error and closes the
 * planned row as failed) and the loop moves to the next company. One bad row must never stop the rest.
 *
 * A stale compare-and-set is not a failure — the operator moved first and won by design — so it is
 * reported without a failure row.
 */
export async function executePlan(work: readonly CompanyWork[], deps: { writer: Writer; rpc: Rpc }): Promise<Outcome[]> {
  const out: Outcome[] = [];

  for (const w of work) {
    if (w.steps.length === 0) {
      out.push({ company: w.companyName, companyId: w.companyId, result: "nothing", action: w.action, detail: "nothing to do" });
      continue;
    }

    let plannedId: number | null = null;
    // A per-company copy, so threading the new page id cannot leak between companies.
    const steps: PlanStep[] = w.steps.map((s) => ({ ...s, args: { ...s.args } }) as PlanStep);

    try {
      for (const st of steps) {
        if (st.kind === "rpc" && st.fn === "sync_plan_notion_write") {
          const id = await deps.rpc("sync_plan_notion_write", st.args);
          plannedId = typeof id === "number" ? id : Number(id);
        } else if (st.kind === "notion" && st.op === "createRow") {
          const { pageId } = await deps.writer.createRow(st.args);
          for (const later of steps) {
            if (later.kind === "rpc" && later.fn === "sync_client_portal_link") later.args.p_notion_page_id = pageId;
          }
        } else if (st.kind === "notion" && st.op === "patchStatus") {
          await deps.writer.patchStatus(st.args.pageId, st.args.status, st.args.expectLastEditedTime);
        } else if (st.kind === "rpc" && st.fn === "sync_fail_notion_write") {
          // R13's failed reconciliation is a PLANNED step: the plan says to close the row as failed
          // and stop, so it is executed, not thrown.
          const res = (await deps.rpc("sync_fail_notion_write", st.args)) as { audit_id?: number } | null;
          out.push({
            company: w.companyName,
            companyId: w.companyId,
            result: "NEEDS-OPERATOR",
            action: w.action,
            detail: `the plan was closed as failed and last_sync_error recorded (audit_id ${res?.audit_id ?? "?"}) — nothing was pushed`,
            auditId: res?.audit_id,
          });
        } else if (st.kind === "rpc" && st.fn === "sync_client_portal_link") {
          const res = (await deps.rpc("sync_client_portal_link", { ...st.args, p_planned_audit_id: plannedId })) as {
            ok?: boolean;
            kind?: string;
            stored_status?: string | null;
            audit_id?: number;
          } | null;
          if (res && res.ok === false && res.kind === "stale") {
            out.push({
              company: w.companyName,
              companyId: w.companyId,
              result: "STALE",
              action: w.action,
              detail: `the operator moved the status to ${JSON.stringify(res.stored_status ?? null)} first — nothing was written on the MojoMap side`,
            });
            throw new Error(STALE_SENTINEL);
          }
          out.push({
            company: w.companyName,
            companyId: w.companyId,
            result: "done",
            action: w.action,
            detail: `audit_id ${res?.audit_id ?? "(none returned)"}`,
            auditId: res?.audit_id,
          });
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg === STALE_SENTINEL) continue; // already reported; not a failure
      try {
        await deps.rpc("sync_fail_notion_write", {
          p_company_id: w.companyId,
          p_action: w.action,
          p_error: msg,
          p_planned_audit_id: plannedId,
        });
      } catch {
        // the failure could not even be recorded — say so, but still do not abandon the run
        out.push({
          company: w.companyName,
          companyId: w.companyId,
          result: "FAILED",
          action: w.action,
          detail: `${msg.slice(0, 140)} (and the failure could not be recorded)`,
        });
        continue;
      }
      out.push({ company: w.companyName, companyId: w.companyId, result: "FAILED", action: w.action, detail: msg.slice(0, 160) });
    }
  }

  return out;
}
