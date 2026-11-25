// ── refresh-mojo-score ────────────────────────────────────────────────────────
//
// Thin trigger endpoint: accepts { company_id } and fires snapshotMojoScore.
// Called from the frontend after any direct DB mutation that moves the live
// mojo score (currently: RouteInspectPanel leg-fill via Execution tab).
//
// Non-fatal — errors are logged but never surface to the client.
// Returns { ok: true } on success, { ok: false, error } on failure.
//
// SP-478 / SP-682 (2026-11-25) — THE TICK. { all: true } walks every company and calls the same
// writer for each. It exists because the score falls as evidence ages and nothing used to re-take the
// snapshot when it did, so the stored copies drifted from the live number on the calendar alone. The
// writer adds a row only when a total changed and skips frozen companies, so a tick over a fleet that
// has not moved writes nothing.
//   • SERVICE ROLE ONLY: the bearer must be the service-role key. It is reached by the scheduled job
//     public.tick_mojo_scores() and by an operator's own command, never by a browser.
//   • { all: true, dry_run: true } makes every read and NO write, and returns what a tick would do.
//   • An empty body is still 400 `company_id required` — it can never start a tick by accident.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { snapshotMojoScore, type SnapshotOutcome } from "../_shared/snapshotMojoScore.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { company_id } = body ?? {};

    if (body?.all === true) {
      const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
      const bearer = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
      if (!serviceKey || bearer !== serviceKey) {
        return new Response(
          JSON.stringify({ ok: false, error: "all: service role only" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      const dryRun = body?.dry_run === true;
      const db = createClient(Deno.env.get("SUPABASE_URL") ?? "", serviceKey);
      const companies: Array<{ id: string; frozen: boolean | null }> = [];
      for (let from = 0; ; from += 1000) {
        const { data, error } = await db.from("companies").select("id, frozen").order("id").range(from, from + 999);
        if (error) throw new Error(`companies read failed: ${error.message}`);
        companies.push(...((data ?? []) as Array<{ id: string; frozen: boolean | null }>));
        if ((data ?? []).length < 1000) break;
      }
      const outcomes: SnapshotOutcome[] = [];
      for (const c of companies) outcomes.push(await snapshotMojoScore(db, c.id, { dryRun, quietSkip: true }));
      const count = (f: (o: SnapshotOutcome) => boolean) => outcomes.filter(f).length;
      return new Response(
        JSON.stringify({
          ok: true,
          dry_run: dryRun,
          companies: outcomes.length,
          frozen_skipped: count((o) => o.skipped === "frozen"),
          no_evidence_skipped: count((o) => o.skipped === "no_evidence"),
          errors: count((o) => o.skipped === "error"),
          scored: count((o) => o.skipped === null),
          rows: count((o) => o.row === "inserted" || o.row === "would_insert"),
          cache: count((o) => o.cache === "updated" || o.cache === "would_update"),
          outcomes,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (!company_id || typeof company_id !== "string") {
      return new Response(
        JSON.stringify({ ok: false, error: "company_id required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    await snapshotMojoScore(supabase, company_id);

    return new Response(
      JSON.stringify({ ok: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[refresh-mojo-score] error:", String((err as Error)?.message ?? err));
    return new Response(
      JSON.stringify({ ok: false, error: String((err as Error)?.message ?? err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
