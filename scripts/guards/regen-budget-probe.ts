// R41 probe — 10 approved URLs on a fake db/transport: generator calls per write call (expected 8, 2, 0), remaining (2, 0, 0).
// Plant: drop the "no signal under this run" filter → the continuation re-runs 10 (calls 8, 10, 10).
import { runOutsideRegen } from "../../supabase/functions/_shared/outsideRegenHandler.ts";
import { fakeDb, seed10, deps, pageTransport, CO, RUN2 } from "../../supabase/functions/_shared/outsideRegenHandler.test.ts";
const db = fakeDb(seed10()); const calls = { gen: 0 }; const { d } = deps(db, pageTransport(calls), null);
const out: Array<{ call: number; generator_calls_this_call: number; remaining: number; done_before: number }> = []; let prev = 0;
for (let i = 1; i <= 3; i++) { const r = await runOutsideRegen({ company_id: CO, run_id: RUN2, write: true }, d); out.push({ call: i, generator_calls_this_call: calls.gen - prev, remaining: (r.body.remaining as string[] | undefined)?.length ?? 0, done_before: Number(r.body.done_before ?? r.body.done ?? 0) }); prev = calls.gen; }
console.log(JSON.stringify({ calls: out, generator_calls_total: calls.gen, minted: (db.inserts.signals ?? []).length }));
