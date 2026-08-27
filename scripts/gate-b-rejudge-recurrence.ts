// ── Gate B — full re-judge + finalize chunk-loop driver (long-runner) ───────────
//
// Drives supabase/functions/generate-signal-recurrence through its canonical
// chunk-run-finalize shape for ONE company: plan → judge fresh pairs in bounded
// chunks (frozen pairs skip) → finalize (union-find re-cluster + the shipped
// Gate-5a distinctive membership floor + finding_recurrence reconcile). NO logic
// lives here that isn't already in the edge core — this is only the chunk loop.
//
//   • per-company — one company_id per invocation; never a fan-out.
//   • frozen-refusal — explicit CB1 guard here; the edge core + DB trigger refuse
//     independently (a frozen company judges nothing and reconciles nothing).
//   • ledger per chunk — the edge fn opens long_runner_runs 'running' on the first
//     writing chunk (run_target = plan fresh count), advances done_count per chunk,
//     and the finalize terminal-marks it 'completed'. This driver does not write it.
//   • resumable — a kill leaves banked verdicts (frozen by pair_identity) and an
//     UNtouched finding_recurrence (only finalize writes it). Re-running re-plans:
//     already-banked pairs come back 'frozen' and are skipped. No false success.
//   • router as-designed — the edge fn routes each pair by provenance (all-public →
//     external gpt-4.1-mini; any non-public/NULL → local 70b). This driver only
//     chunks route-homogeneously so a chunk's wall-clock stays under the gateway
//     ceiling (local 70b is the slow path).
//
// Run:  SUPABASE_URL=http://127.0.0.1:54321 SRK=<service_role_key> \
//         deno run --allow-net --allow-env scripts/gate-b-rejudge-recurrence.ts <company_id> [--finalize-only]
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CB1 = "58b2b15b-bada-4bcd-9c12-b7e66a37d0bc";
const PUBLIC_VOICES = new Set(["outside_voice_about_client", "client_voice", "market_context", "competitor_voice"]);
const EXT_CHUNK = 20; // all-public pairs → fast external model
const LOC_CHUNK = 4;  // any non-public pair → local 70b (~26s worst case); stay under the 150s gateway
const MAX_RETRY = 3;

const url = Deno.env.get("SUPABASE_URL");
const key = Deno.env.get("SRK") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
if (!url || !key) throw new Error("SUPABASE_URL and SRK (service role key) are required.");
const companyId = Deno.args[0];
if (!companyId) throw new Error("usage: <company_id> [--finalize-only]");
if (companyId === CB1) { console.error("REFUSED: CB1 is frozen — never re-judged."); Deno.exit(2); }
const finalizeOnly = Deno.args.includes("--finalize-only");

const fnUrl = `${url}/functions/v1/generate-signal-recurrence`;
const headers = { "Authorization": `Bearer ${key}`, "Content-Type": "application/json" };
const sb = createClient(url, key) as any;

async function call(body: unknown): Promise<any> {
  const r = await fetch(fnUrl, { method: "POST", headers, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({ ok: false, error: `non-json ${r.status}` }));
  if (!r.ok || !j.ok) throw new Error(`HTTP ${r.status}: ${JSON.stringify(j).slice(0, 300)}`);
  return j;
}
const ts = () => new Date().toISOString().slice(11, 19);
const log = (m: string) => console.log(`[${ts()}] ${m}`);

// ── 1. PLAN (zero writes/model) ──
const plan = await call({ company_id: companyId, plan: true });
const fresh = plan.pairs.filter((p: any) => p.status === "fresh");
log(`PLAN eligible=${plan.eligible_signals} candidates=${plan.candidates_total} frozen=${plan.candidates_frozen} fresh=${plan.candidates_fresh}`);

if (!finalizeOnly && fresh.length) {
  // ── 2. classify fresh pairs by route (voice_class → provenance) ──
  const { data: sigRows } = await sb.from("signals").select("id, voice_class").eq("company_id", companyId).eq("signal_band", "outside");
  const vc = new Map<string, string | null>((sigRows as Array<{ id: string; voice_class: string | null }>).map((s) => [s.id, s.voice_class]));
  const isPublic = (id: string) => PUBLIC_VOICES.has(String(vc.get(id) ?? ""));
  const ext: Array<{ a: string; b: string }> = [];
  const loc: Array<{ a: string; b: string }> = [];
  for (const p of fresh) {
    const pair = { a: p.signal_a_id, b: p.signal_b_id };
    (isPublic(p.signal_a_id) && isPublic(p.signal_b_id) ? ext : loc).push(pair);
  }
  log(`fresh split: external=${ext.length} local=${loc.length}`);

  // ── 3. judge chunks (route-homogeneous; frozen pairs skip inside the core) ──
  const runTarget = plan.candidates_fresh;
  const totals = { judged: 0, accepted: 0, rejected: 0, cached: 0, skipped: 0, chunks: 0, failed_chunks: 0 };
  const buckets: Array<{ pairs: Array<{ a: string; b: string }>; size: number; kind: string }> = [
    { pairs: ext, size: EXT_CHUNK, kind: "ext" },
    { pairs: loc, size: LOC_CHUNK, kind: "loc" },
  ];
  for (const bkt of buckets) {
    for (let i = 0; i < bkt.pairs.length; i += bkt.size) {
      const chunk = bkt.pairs.slice(i, i + bkt.size);
      let ok = false;
      for (let attempt = 1; attempt <= MAX_RETRY && !ok; attempt++) {
        try {
          const res = await call({ company_id: companyId, pairs: chunk, write: true, run_target: runTarget });
          totals.judged += res.totals.judged; totals.accepted += res.totals.accepted;
          totals.rejected += res.totals.rejected; totals.cached += res.totals.cached;
          totals.skipped += res.totals.skipped_ineligible; totals.chunks++;
          ok = true;
        } catch (e) {
          log(`  chunk ${bkt.kind} @${i} attempt ${attempt} FAILED: ${String((e as Error).message).slice(0, 160)}`);
          if (attempt === MAX_RETRY) totals.failed_chunks++;
          else await new Promise((r) => setTimeout(r, 2000 * attempt));
        }
      }
      if (totals.chunks % 10 === 0 || bkt.kind === "loc") {
        log(`  ${bkt.kind} progress @${i + chunk.length}/${bkt.pairs.length} — judged=${totals.judged} acc=${totals.accepted} rej=${totals.rejected} cached=${totals.cached} failed_chunks=${totals.failed_chunks}`);
      }
    }
  }
  log(`JUDGE done: chunks=${totals.chunks} judged=${totals.judged} accepted=${totals.accepted} rejected=${totals.rejected} cached=${totals.cached} skipped=${totals.skipped} failed_chunks=${totals.failed_chunks}`);
  if (totals.failed_chunks > 0) {
    log(`NOTE: ${totals.failed_chunks} chunk(s) failed after retries — banked verdicts persist; re-run to resume before finalize. NOT finalizing.`);
    Deno.exit(1);
  }
}

// ── 4. FINALIZE (union-find re-cluster + distinctive floor + reconcile; ledger completed) ──
log("FINALIZE…");
const fin = await call({ company_id: companyId, write: true });
log(`FINALIZE done: ${JSON.stringify(fin.totals)}`);
console.log(JSON.stringify({ company_id: companyId, finalize_totals: fin.totals }));
