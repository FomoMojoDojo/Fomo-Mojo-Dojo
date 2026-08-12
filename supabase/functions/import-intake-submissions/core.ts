// ============================================================================
// import-intake-submissions/core — the importer's testable core (R6/R8).
//
// Pure of HTTP/admin/env concerns: given a local service-role client, a hosted
// mailbox client, and an acting user, it does the company match (Fix A) and
// reproduces launch-site-intake's writes for each pending submission. index.ts
// is the thin Deno.serve shell (env plumbing + admin gate) that calls in here;
// the falsification harness and the Cafe Barra backfill drive this same code
// directly, so what is proven is exactly what the edge function runs.
// ============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  createIntakeFile,
  deriveCompanyName,
  ensureIntakeInput,
  insertIntakeResponse,
  invokeRunAgentFlow,
  normalizeWebsite,
  stampStrategicProblemBrief,
  upsertStrategicProblem,
  type IntakeRequest,
} from "../_shared/intakeWrites.ts";

// Signed refusal string (design gate 2026-08-12).
export const FROZEN_REFUSAL =
  "This submission matched a frozen reference company — import refused, resolve manually.";

export type CompanyMatch =
  | { kind: "company"; companyId: string; created: boolean }
  | { kind: "frozen"; frozenId: string; frozenName: string };

// Fix A (R8): website-exact then name-ilike, ALWAYS filter frozen=false,
// tiebreaker created_at asc + id asc. A match that exists ONLY as a frozen
// company is returned as { kind: "frozen" } for the caller to refuse loudly —
// this fn never returns a frozen company as usable, and never writes to one.
export async function matchCompanyFixA(
  local: ReturnType<typeof createClient>,
  companyName: string,
  website: string,
  userId: string,
): Promise<CompanyMatch> {
  // 1. non-frozen by exact website
  if (website) {
    const { data } = await local
      .from("companies")
      .select("id,website")
      .eq("website", website)
      .eq("frozen", false)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (data) return { kind: "company", companyId: String((data as { id: string }).id), created: false };
  }

  // 2. non-frozen by name (ilike)
  {
    const { data } = await local
      .from("companies")
      .select("id,website")
      .ilike("name", companyName)
      .eq("frozen", false)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (data) {
      const row = data as { id: string; website: string | null };
      if (website && !String(row.website || "").trim()) {
        await local.from("companies").update({ website }).eq("id", row.id);
      }
      return { kind: "company", companyId: String(row.id), created: false };
    }
  }

  // 3. FROZEN match (website or name) -> refuse loudly (caller decides)
  if (website) {
    const { data } = await local
      .from("companies")
      .select("id,name")
      .eq("website", website)
      .eq("frozen", true)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (data) {
      const r = data as { id: string; name: string };
      return { kind: "frozen", frozenId: String(r.id), frozenName: String(r.name) };
    }
  }
  {
    const { data } = await local
      .from("companies")
      .select("id,name")
      .ilike("name", companyName)
      .eq("frozen", true)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (data) {
      const r = data as { id: string; name: string };
      return { kind: "frozen", frozenId: String(r.id), frozenName: String(r.name) };
    }
  }

  // 4. no match at all -> create a new (non-frozen) company
  const { data, error } = await local
    .from("companies")
    .insert({ name: companyName, website, created_by: userId, frozen: false })
    .select("id")
    .single();
  if (error || !data) throw new Error(error?.message || "Failed to create company.");
  return { kind: "company", companyId: String((data as { id: string }).id), created: true };
}

export type ActingUser = { userId: string; authHeader: string | null; sessionReady: boolean };

export type ImportResult = Record<string, unknown>;

// Process pending hosted rows: match (Fix A) -> reuse launch-site-intake writes
// -> optional pipeline -> write status AFTER the work. A per-row throw lands
// that row in 'failed' with the message; the loop continues.
export async function processPendingRows(args: {
  local: ReturnType<typeof createClient>;
  hosted: ReturnType<typeof createClient>;
  actingUser: ActingUser;
  allowPipeline: boolean;
  supabaseUrl: string;
  anonKey: string;
  ids?: string[];
  limit?: number;
}): Promise<ImportResult[]> {
  const { local, hosted, actingUser, allowPipeline, supabaseUrl, anonKey } = args;
  const limit = Math.min(Math.max(Number(args.limit) || 25, 1), 100);

  let query = hosted
    .from("intake_submissions")
    .select("id,payload,submitted_at")
    .eq("status", "pending")
    .order("received_at", { ascending: true })
    .limit(limit);
  if (Array.isArray(args.ids) && args.ids.length > 0) query = query.in("id", args.ids);

  const { data: rows, error: rowsErr } = await query;
  if (rowsErr) throw new Error(`Failed to read hosted mailbox: ${rowsErr.message}`);
  if (!rows || rows.length === 0) return [];

  const results: ImportResult[] = [];

  for (const row of rows as Array<{ id: string; payload: IntakeRequest }>) {
    const rowId = String(row.id);
    // lock: mark importing (best-effort; work-status written after)
    await hosted.from("intake_submissions").update({ status: "importing" }).eq("id", rowId);

    try {
      const payload = (row.payload || {}) as IntakeRequest;
      const website = normalizeWebsite(payload.website_url);
      const companyName = deriveCompanyName(payload, website);

      const match = await matchCompanyFixA(local, companyName, website, actingUser.userId);

      if (match.kind === "frozen") {
        const detail = `${FROZEN_REFUSAL} (matched: ${match.frozenName} ${match.frozenId})`;
        await hosted
          .from("intake_submissions")
          .update({ status: "failed", status_detail: detail, processed_at: new Date().toISOString() })
          .eq("id", rowId);
        results.push({ id: rowId, status: "failed", reason: "frozen_match", company: match.frozenName });
        continue;
      }

      const companyId = match.companyId;
      const inputId = await ensureIntakeInput({ supabase: local, companyId, userId: actingUser.userId });
      const intakeFile = await createIntakeFile({
        supabase: local,
        inputId,
        userId: actingUser.userId,
        companyName,
        payload,
      });
      await upsertStrategicProblem({
        supabase: local,
        companyId,
        userId: actingUser.userId,
        statement: String(payload.explicit_strategic_problem || ""),
      });

      // Gate S — structured capture (keyed to the hosted submission id, idempotent on re-import)
      await insertIntakeResponse({
        supabase: local,
        companyId,
        userId: actingUser.userId,
        submissionKey: rowId,
        payload,
      });
      // R5 — seed Act-1's stated problem, empty-only (never clobber an operator edit)
      await stampStrategicProblemBrief({
        supabase: local,
        companyId,
        problem: String(payload.explicit_strategic_problem || ""),
      });

      // pipeline ONLY when requested by payload AND explicitly allowed by caller
      const wantPipeline = payload.run_initial_public_signal_pass !== false && allowPipeline;
      const automation = wantPipeline
        ? await invokeRunAgentFlow({
            supabaseUrl,
            anonKey,
            authHeader: actingUser.authHeader,
            companyId,
            companyName,
            website,
            runRequested: true,
          })
        : { attempted: false, triggered: false, status: null, message: "Pipeline not run (allow_pipeline=false)." };

      // status written AFTER the work
      await hosted
        .from("intake_submissions")
        .update({
          status: "imported",
          status_detail: null,
          processed_at: new Date().toISOString(),
          imported_company_id: companyId,
        })
        .eq("id", rowId);

      results.push({
        id: rowId,
        status: "imported",
        company_id: companyId,
        company_created: match.created,
        input_id: inputId,
        file_id: intakeFile.fileId,
        pipeline: automation.triggered ? "triggered" : "skipped",
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown import error.";
      await hosted
        .from("intake_submissions")
        .update({ status: "failed", status_detail: message, processed_at: new Date().toISOString() })
        .eq("id", rowId);
      results.push({ id: rowId, status: "failed", error: message });
    }
  }

  return results;
}
