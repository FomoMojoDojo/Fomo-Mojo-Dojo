// supabase/functions/retain-quote-supply/index.ts
//
// V2-6d — FETCH-AND-RETAIN quote supply (the deterministic receipts pass).
//
// WHY A STANDALONE FUNCTION (not an extension of public-baseline):
//  1. The operator ruling keeps the fragile public-baseline generator UNTOUCHED. Adding a
//     second long-running phase inside it would extend a run that already lands its writes
//     behind the ~150s edge response cut.
//  2. Resume-by-reclick must be cheap and idempotent. A standalone pass re-runs in seconds
//     over only the still-quote-less signals — no re-synthesis, no model, no cost.
//  3. It is source-agnostic, so the SAME pass covers competitor-discovery-minted signals
//     (source URLs with no fetched body — the gap named at V2-6), not just public-baseline.
//
// WHAT IT DOES: selects the company's quote-less signals that carry an http(s) source_url,
// fetches each one with the crawl's own fetch/extract path (_shared/fetchAndExtract.ts —
// reuse, don't fork), retains what actually comes back, and runs the SHIPPED producer
// (produceQuote → liftVerbatimQuote) to lift a byte-exact line. Bot-walled/failed fetches
// and pages with no quotable prose are recorded as honest absence and NEVER padded.
//
// SCOPE OF WRITES: quote / quote_source_text / event_date on existing signal rows ONLY.
// No claim writes, no identity changes, no verdict effects — quotes are render-side
// receipts (Act 4 joins claim_deltas → claim_signal_refs → signals.quote at read time),
// and neither the score nor claim-state nor delta generation reads these columns.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { fetchAndExtract } from "../_shared/fetchAndExtract.ts";
import { liftQuoteFromFetch, signalQuoteUpdate, FETCH_RATE_SHAPE, type QuoteDisposition } from "../../../src/lib/firstRead/quoteSupply.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Jittered polite delay within the configured rate shape (SRCH-1: never a burst). */
function politeDelayMs(): number {
  const { minDelayMs, maxDelayMs } = FETCH_RATE_SHAPE;
  return minDelayMs + Math.floor(Math.random() * Math.max(1, maxDelayMs - minDelayMs));
}

interface SignalRow {
  id: string;
  source_url: string | null;
  claim_text: string | null;
  raw_payload: Record<string, unknown> | null;
  source_type: string | null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  if (!supabaseUrl || !serviceRoleKey || !anonKey) return json({ ok: false, error: "Missing Supabase env vars" }, 500);

  try {
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const company_id = String(body?.company_id || "").trim();
    if (!company_id) return json({ ok: false, error: "company_id required" }, 400);

    // plan:true → report what WOULD be fetched. Zero fetches, zero writes.
    const plan = body?.plan === true;
    // Optional cap for chunked driving; defaults to the whole quote-less set (the run
    // time budget below is the real stop, and re-click resumes).
    const rawLimit = Number(body?.limit);
    const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.floor(rawLimit) : 500;

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ ok: false, error: "No auth header" }, 401);
    const anonClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: userRes, error: authError } = await anonClient.auth.getUser();
    if (authError || !userRes?.user) return json({ ok: false, error: "Unauthorized" }, 401);

    // SELECTION: quote-less signals with an http(s) source_url. `quote is null` is what
    // makes the pass IDEMPOTENT — an already-quoted signal is never re-fetched or
    // overwritten, so re-clicking resumes rather than redoing. Optional run_id scopes to
    // one baseline run; omitted = the company's whole quote-less backlog (which is how
    // competitor-discovery signals get covered by the same pass).
    const run_id = body?.run_id === undefined || body?.run_id === null ? null : String(body.run_id);
    let query = supabase
      .from("signals")
      .select("id, source_url, claim_text, raw_payload, source_type")
      .eq("company_id", company_id)
      .is("quote", null)
      .not("source_url", "is", null)
      .limit(limit);
    if (run_id) query = query.eq("source_id", run_id);
    const { data: rows, error: selErr } = await query;
    if (selErr) return json({ ok: false, error: "signal select failed", details: selErr.message }, 500);

    const candidates = ((rows ?? []) as SignalRow[]).filter((r) => /^https?:\/\//i.test(String(r.source_url || "")));

    if (plan) {
      const byHost: Record<string, number> = {};
      for (const r of candidates) {
        try {
          const h = new URL(String(r.source_url)).hostname.replace(/^www\./, "").toLowerCase();
          byHost[h] = (byHost[h] ?? 0) + 1;
        } catch { /* unparseable url — excluded by the regex above anyway */ }
      }
      return json({
        ok: true,
        plan: true,
        company_id,
        run_id,
        candidates: candidates.length,
        by_host: byHost,
        rate_shape: FETCH_RATE_SHAPE,
      });
    }

    // START-of-run ledger row (wall-clock law): written BEFORE any fetch, so a run cut by
    // the edge response wall still leaves a durable, pollable record. Non-fatal on error.
    let ledgerRowId: string | null = null;
    {
      const { data: ledgerRow, error: ledgerErr } = await supabase
        .from("long_runner_runs")
        .insert({ run_kind: "quote_supply", company_id, status: "running", target_count: candidates.length })
        .select("id")
        .single();
      if (ledgerErr) console.log("[quote-supply] ledger start insert error", ledgerErr.message);
      else ledgerRowId = (ledgerRow as { id?: unknown } | null)?.id ? String((ledgerRow as { id: unknown }).id) : null;
    }

    const counters: Record<QuoteDisposition | "skipped_budget", number> = {
      lifted: 0,
      fetch_failed: 0,
      fetched_no_quote: 0,
      skipped_budget: 0,
    };
    const failureStatuses: Record<string, number> = {};
    const samples: Array<{ signal_id: string; source_url: string; quote: string; event_date: string | null }> = [];
    let dated = 0;

    const startedAt = Date.now();
    const budgetExpired = () => Date.now() - startedAt > FETCH_RATE_SHAPE.runTimeBudgetMs;

    // RATE SHAPE (SRCH-1 lesson — a burst trips bot detection): `concurrency` lanes pull
    // from one shared queue, each lane sleeping a jittered delay between fetches. Modest
    // and steady, never a burst.
    let cursor = 0;
    const nextIndex = () => (cursor < candidates.length ? cursor++ : -1);

    async function lane() {
      for (;;) {
        const i = nextIndex();
        if (i < 0) return;
        if (budgetExpired()) {
          counters.skipped_budget++;
          continue; // drain the queue as skipped — resume-by-reclick picks these up
        }
        const row = candidates[i];
        const url = String(row.source_url);
        const fetched = await fetchAndExtract(url);
        if (!fetched.ok) {
          const key = `status_${fetched.status}`;
          failureStatuses[key] = (failureStatuses[key] ?? 0) + 1;
        }
        // Date candidate comes from what the SIGNAL already carried (the model's
        // evidence_ledger date), routed through pickEventDate inside produceQuote —
        // never inferred from the fetched page.
        const rawDate = (row.raw_payload ?? {}) as { date?: unknown };
        const dateCandidate = typeof rawDate.date === "string" ? rawDate.date : null;
        const outcome = liftQuoteFromFetch(fetched, dateCandidate, row.claim_text || "");
        counters[outcome.disposition]++;

        if (outcome.disposition === "lifted") {
          // WRITE SCOPE: signalQuoteUpdate is the single source of the write shape (quote /
          // quote_source_text / event_date only). Guarded by `is("quote", null)` so a
          // concurrent/second pass can never overwrite an existing receipt.
          const { error: upErr } = await supabase
            .from("signals")
            .update(signalQuoteUpdate(outcome)!)
            .eq("id", row.id)
            .is("quote", null);
          if (upErr) {
            // A refused write (e.g. the signals_quote_verbatim CHECK) is HONEST ABSENCE,
            // never a retry into synthesis. Count it back out of `lifted`.
            console.log("[quote-supply] write refused", { signal_id: row.id, error: upErr.message });
            counters.lifted--;
            counters.fetched_no_quote++;
          } else {
            if (outcome.event_date) dated++;
            if (samples.length < 3) {
              samples.push({
                signal_id: row.id,
                source_url: url,
                quote: outcome.quote!,
                event_date: outcome.event_date ?? null,
              });
            }
          }
        }
        await sleep(politeDelayMs());
      }
    }

    await Promise.all(
      Array.from({ length: Math.min(FETCH_RATE_SHAPE.concurrency, Math.max(1, candidates.length)) }, () => lane()),
    );

    const elapsed_ms = Date.now() - startedAt;
    if (ledgerRowId) {
      const { error: finErr } = await supabase
        .from("long_runner_runs")
        .update({
          status: "completed",
          done_count: counters.lifted,
          finished_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", ledgerRowId);
      if (finErr) console.log("[quote-supply] ledger terminal update error", finErr.message);
    }

    const report = {
      ok: true,
      company_id,
      run_id,
      candidates: candidates.length,
      counters,
      failure_statuses: failureStatuses,
      dated,
      elapsed_ms,
      rate_shape: FETCH_RATE_SHAPE,
      samples,
    };
    console.log("[quote-supply] DONE", JSON.stringify({ ...report, samples: samples.length }));
    return json(report);
  } catch (err) {
    console.error("[quote-supply] error:", err);
    return json({ ok: false, error: String((err as { message?: unknown })?.message || err) }, 500);
  }
});
