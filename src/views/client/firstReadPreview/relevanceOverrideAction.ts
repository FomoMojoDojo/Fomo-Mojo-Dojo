// OPERATOR RELEVANCE OVERRIDE — the ONE client write path (stage 3, 2026-09-03). Writes through the
// admin RPC set_relevance_override (migration 20260903170000): identity-keyed, reversal = new row,
// the DB trigger derives the claim_deltas stamp. This module is pure (client injected) so the guards
// can prove: an empty reason never reaches the RPC; the frozen company is refused before any call.
export type RelevanceOverrideVerdict = "relevant" | "orthogonal" | "withdrawn";

export const PUBLIC_PAIRING_KIND = "public_vs_public";
/** CB1 — frozen; every guard refuses it before a read or a write. */
export const FROZEN_COMPANY_ID = "58b2b15b-bada-4bcd-9c12-b7e66a37d0bc";

export type OverrideRpcClient = {
  rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
};

export type SetRelevanceOverrideArgs = {
  companyId: string;
  contentIdentity: string | null | undefined;
  verdict: RelevanceOverrideVerdict;
  reason: string;
};

export type SetRelevanceOverrideResult =
  | { ok: true; result: unknown }
  | { ok: false; skipped: "empty_reason" | "no_identity" | "frozen_company" }
  | { ok: false; error: string };

export async function setRelevanceOverride(client: OverrideRpcClient, args: SetRelevanceOverrideArgs): Promise<SetRelevanceOverrideResult> {
  const reason = args.reason.trim();
  if (reason.length === 0) return { ok: false, skipped: "empty_reason" };
  if (!args.contentIdentity) return { ok: false, skipped: "no_identity" };
  if (args.companyId === FROZEN_COMPANY_ID) return { ok: false, skipped: "frozen_company" };
  const { data, error } = await client.rpc("set_relevance_override", {
    p_company_id: args.companyId,
    p_pairing_kind: PUBLIC_PAIRING_KIND,
    p_content_identity: args.contentIdentity,
    p_verdict: args.verdict,
    p_reason: reason,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true, result: data };
}

/** Human-readable failure for a non-ok result; null when the write succeeded. */
export function overrideFailureMessage(res: SetRelevanceOverrideResult): string | null {
  if (res.ok) return null;
  const failed = res as { skipped?: string; error?: string };
  return failed.error ?? `not written: ${failed.skipped ?? "unknown"}`;
}

/** The edge-function invoker shape (supabase.functions) — injected so the guard can count calls. */
export type StepInvoker = {
  invoke: (fn: string, opts: { body: Record<string, unknown> }) => PromiseLike<{ data: unknown; error: unknown }>;
};

export const RELEVANCE_STEP_FN = "refresh-relevance-step";

export type DecideRelevanceResult = SetRelevanceOverrideResult & { restamped: boolean };

/** The full operator decision (withdraw follow-up, 2026-09-03): write the override; if it was a
 *  WITHDRAWAL, the delta row is now unstamped, so hand it straight back to the machine — POST the same
 *  self-gating relevance step the delta finalize fires (it skips when nothing is unstamped) and await it,
 *  so the caller's refresh renders the machine verdict, not a transiently-active row. Spare/Strike never
 *  fire it (the trigger already derived their stamp). */
export async function decideRelevance(client: OverrideRpcClient, functions: StepInvoker, args: SetRelevanceOverrideArgs): Promise<DecideRelevanceResult> {
  const written = await setRelevanceOverride(client, args);
  if (!written.ok || args.verdict !== "withdrawn") return { ...written, restamped: false };
  const { error } = await functions.invoke(RELEVANCE_STEP_FN, { body: { company_id: args.companyId } });
  if (error) return { ok: false, error: `override written; re-stamp failed: ${error instanceof Error ? error.message : String(error)}`, restamped: false };
  return { ...written, restamped: true };
}
