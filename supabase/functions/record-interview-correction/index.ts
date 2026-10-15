// ── record-interview-correction (Act 1, signed 2026-10-08) ──────────────────────────────────────
//
// The ONE write path for a client's fact correction. See _shared/interviewCorrection.ts for the
// three laws this obeys (Option B wall, public-only base, every data act audited).
//
// WRITE FLAG: `write: true`. Anything else — including a bare {} — is a DRY RUN that reports the
// row it would write and touches nothing. Read the flag here before calling this function.
//
// LOCAL ONLY. No model call, local or external. The statement is the operator's wording, frozen in
// CORRECTION_STATEMENT; there is nothing for a model to produce or judge.
//
// REFUSALS come before any write: the item must exist, belong to the company, be kind 'correction'
// and not be retracted. The item read goes through _shared/interviewItems.ts (loadCorrectionItem) so
// this file never names the items table and the census wall keeps its original four allowances.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { IntegrityWriteRefused } from "../_shared/integrityWrite.ts";
import { loadCorrectionItem } from "../_shared/interviewItems.ts";
import {
  AUDIT_COMPONENT, CORRECTION_STATEMENT, correctionClaimFor, existingClaimIdFor, reversalSqlFor,
} from "../_shared/interviewCorrection.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

/** CB1 is the frozen reference company — never written. */
const CB1_FROZEN_ID = "58b2b15b-0000-0000-0000-000000000000";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const body = await req.json().catch(() => ({}));
    const company_id = String(body?.company_id ?? "").trim();
    const interview_item_id = String(body?.interview_item_id ?? "").trim();
    if (!company_id) return json({ ok: false, error: "company_id required" }, 400);
    if (!interview_item_id) return json({ ok: false, error: "interview_item_id required" }, 400);
    if (company_id === CB1_FROZEN_ID) return json({ ok: false, error: "frozen reference company — never written" }, 403);
    const doWrite = body?.write === true;   // THE WRITE FLAG — default is a dry run

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // ── REFUSALS, all before any write ──────────────────────────────────────────────────────────
    const lookup = await loadCorrectionItem(supabase, company_id, interview_item_id);
    if (!lookup.ok) {
      return json({ ok: false, refused: lookup.refusal, error: lookup.detail, wrote: false }, 409);
    }
    const item = lookup.item;

    // The interview's date and the person, for the "You told us · {name} · {date}" frame.
    const { data: rec } = await supabase.from("interview_records")
      .select("id, interviewed_at, person_name").eq("id", item.interview_record_id).maybeSingle();
    const record = (rec ?? null) as { interviewed_at?: string | null; person_name?: string | null } | null;

    const claim = correctionClaimFor({
      companyId: company_id,
      item,
      attestedAt: record?.interviewed_at ?? null,
      personName: record?.person_name ?? null,
    });

    // ── IDEMPOTENT ON THE ITEM ID ───────────────────────────────────────────────────────────────
    const { data: priorRows } = await supabase.from("claims")
      .select("id, raw_payload").eq("company_id", company_id).eq("provenance", "client_attested");
    const already = existingClaimIdFor((priorRows ?? []) as Array<{ id: string; raw_payload?: unknown }>, interview_item_id);
    if (already) {
      return json({
        ok: true, wrote: false, idempotent: true, claim_id: already,
        reason: `item ${interview_item_id} already minted claim ${already}`,
      });
    }

    if (!doWrite) {
      return json({
        ok: true, dry_run: true, wrote: false,
        would_write: { table: "claims", row: claim },
        statement: CORRECTION_STATEMENT,
        model_calls: 0,
      });
    }

    // ── THE WRITE: one claims row ───────────────────────────────────────────────────────────────
    const { data: ins, error: cErr } = await supabase.from("claims").insert(claim).select("id").single();
    if (cErr) return json({ ok: false, error: `claim insert failed: ${cErr.message}`, wrote: false }, 500);
    const claimId = String((ins as { id: string }).id);

    // ── THE AUDIT ROW, after the write, carrying its own reversal ───────────────────────────────
    let audit_id: number | null = null;
    try {
      // A1: this one needs the inserted id back, so it reads { data, error } itself; a refusal
      // throws rather than returning a correction with a null audit id.
      const { data: aud, error: audErr } = await supabase.from("integrity_runs").insert({
        company_id, component: AUDIT_COMPONENT, surface_type: "claims", surface_id: company_id,
        status: "completed", examined: 1, admitted: 1,
        excluded_by_rule: {
          mode: "write",
          interview_item_id, interview_record_id: item.interview_record_id,
          claim_id: claimId, provenance: claim.provenance,
          statement: CORRECTION_STATEMENT,
          model_calls: 0,
          reversal_sql: reversalSqlFor(claimId),
        },
      }).select("id").single();
      if (audErr) throw new IntegrityWriteRefused(AUDIT_COMPONENT, "completed", String(audErr.message ?? audErr));
      audit_id = (aud as { id: number } | null)?.id ?? null;
      // A1 (2026-10-15): the catch no longer swallows a REFUSED audit write. It still swallows
      // anything else thrown here, because an unrelated fault in building the row must not take down
      // the correction — but a row the database refused is a hole in the record, and this correction
      // reports its own audit_id, so returning a null one would have been a lie nobody could see.
    } catch (e) { if (e instanceof IntegrityWriteRefused) throw e; /* observability must never break the write it describes */ }

    return json({
      ok: true, wrote: true, claim_id: claimId, audit_id,
      statement: CORRECTION_STATEMENT, model_calls: 0,
      reversal_sql: reversalSqlFor(claimId),
    });
  } catch (e) {
    return json({ ok: false, error: String((e as Error)?.message ?? e) }, 500);
  }
});
