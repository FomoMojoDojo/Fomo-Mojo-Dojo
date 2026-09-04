// ── crawl-outside-pages (Gate 3 / J1 step 1) ─────────────────────────────────
//
// The explicit outside-fetch pass. For a company's OUTSIDE signals, fetch each
// distinct source URL once, clean it, and write an honest snapshot per signal into
// outside_page_snapshots — ok with clean_text, or blocked/gone with NULL clean_text
// + http_status (a failed outside fetch is data, not a skip). Idempotent: the
// (company_id, signal_id, text_sha256) unique index makes a re-run a no-op and lets
// page drift accrue as new rows. Writes ONLY to outside_page_snapshots — no claims,
// deltas, signals, or render-feeding table; drops/supersedes nothing (that is step 2).
//
// FROZEN REFUSAL: never runs for a frozen company (CB1). The DB trigger is the
// backstop; this is the loud app-level refusal.
//
// Option-B: outside pages are PUBLIC — fetch/clean is fine; nothing internal/uploaded
// is ever sent anywhere external here (this pass sends nothing to any model at all).

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { structuredBackfillTargets } from "../_shared/structuredBackfill.ts";
import { fetchOutsidePage } from "../_shared/outsidePageStore.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
};
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { company_id, run_id } = await req.json();
    if (!company_id || typeof company_id !== "string") return json({ ok: false, error: "company_id required" }, 400);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    // FROZEN REFUSAL (loud) — the frozen fixture is never fetched or written.
    const { data: companyRow } = await supabase.from("companies").select("frozen").eq("id", company_id).maybeSingle();
    if ((companyRow as { frozen?: boolean } | null)?.frozen) {
      return json({ ok: false, error: "This is a frozen reference company — it is never re-crawled." }, 403);
    }

    // OUTSIDE signals with a fetchable URL.
    const { data: sigRows, error: sigErr } = await supabase
      .from("signals")
      .select("id, source_url")
      .eq("company_id", company_id)
      .eq("voice_class", "outside_voice_about_client")
      .not("source_url", "is", null);
    if (sigErr) return json({ ok: false, error: `signal load: ${sigErr.message}` }, 500);
    const signals = ((sigRows ?? []) as Array<{ id: string; source_url: string | null }>)
      .filter((s) => (s.source_url ?? "").trim().length > 0);

    // Fetch each distinct URL once; fan the result out to every signal on that URL.
    const byUrl = new Map<string, Awaited<ReturnType<typeof fetchOutsidePage>>>();
    const totals = { signals: signals.length, urls: 0, ok: 0, blocked: 0, gone: 0, rows_written: 0, rows_skipped: 0 };
    for (const url of new Set(signals.map((s) => s.source_url as string))) {
      byUrl.set(url, await fetchOutsidePage(url));
      totals.urls++;
    }
    for (const d of byUrl.values()) totals[d.fetch_status]++;

    for (const s of signals) {
      const d = byUrl.get(s.source_url as string)!;
      const row = {
        company_id,
        source_url: s.source_url,
        signal_id: s.id,
        clean_text: d.clean_text,
        text_sha256: d.text_sha256,
        run_id: run_id ?? null,
        fetch_status: d.fetch_status,
        http_status: d.http_status,
        structured: d.structured, // LISTING CLASS (2026-09-04): raw structured block, prose body unchanged
      };
      // Idempotent: ON CONFLICT (company_id, signal_id, text_sha256) DO NOTHING.
      const { error, count } = await supabase
        .from("outside_page_snapshots")
        .upsert(row, { onConflict: "company_id,signal_id,text_sha256", ignoreDuplicates: true, count: "exact" });
      if (error) return json({ ok: false, error: `write: ${error.message}` }, 500);
      if (count && count > 0) totals.rows_written++; else {
        totals.rows_skipped++;
        // STRUCTURED BACKFILL (ruling 1, 2026-09-04): identical hash already stored → backfill structured where NULL.
        if (d.structured) {
          const { data: ex } = await supabase.from("outside_page_snapshots").select("id, text_sha256, structured").eq("company_id", company_id).eq("signal_id", s.id).eq("text_sha256", d.text_sha256);
          const ids = structuredBackfillTargets((ex ?? []) as Array<{ id: string; text_sha256: string; structured: unknown | null }>, d.text_sha256, d.structured);
          if (ids.length) await supabase.from("outside_page_snapshots").update({ structured: d.structured }).in("id", ids).is("structured", null);
        }
      }
    }

    return json({ ok: true, company_id, totals });
  } catch (err) {
    console.error("[crawl-outside-pages] error:", err);
    return json({ ok: false, error: String((err as { message?: unknown })?.message ?? err) }, 500);
  }
});
