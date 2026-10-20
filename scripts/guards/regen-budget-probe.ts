// R41 probe — 10 approved URLs on a fake db/transport: generator calls per write call (expected 8, 2, 0), remaining (2, 0, 0).
// Plant: drop the "no signal under this run" filter → the continuation re-runs 10 (calls 8, 10, 10).
import { runOutsideRegen } from "../../supabase/functions/_shared/outsideRegenHandler.ts";
import { fakeDb, seed10, deps, pageTransport, pageTransportEmpty3, CO, RUN2 } from "../../supabase/functions/_shared/outsideRegenHandler.test.ts";
const db = fakeDb(seed10()); const calls = { gen: 0 }; const { d } = deps(db, pageTransport(calls), null);
const out: Array<{ call: number; generator_calls_this_call: number; remaining: number; done_before: number }> = []; let prev = 0;
for (let i = 1; i <= 3; i++) { const r = await runOutsideRegen({ company_id: CO, run_id: RUN2, write: true }, d); out.push({ call: i, generator_calls_this_call: calls.gen - prev, remaining: (r.body.remaining as string[] | undefined)?.length ?? 0, done_before: Number(r.body.done_before ?? r.body.done ?? 0) }); prev = calls.gen; }
// R43: the same run where page 3 yields nothing — the continuation must make 2 generator calls, never 3
const db2 = fakeDb(seed10()); const calls2 = { gen: 0 }; const { d: d2 } = deps(db2, pageTransportEmpty3(calls2), null);
await runOutsideRegen({ company_id: CO, run_id: RUN2, write: true }, d2); const after1 = calls2.gen;
const plan = await runOutsideRegen({ company_id: CO, run_id: RUN2, plan: true }, d2);
await runOutsideRegen({ company_id: CO, run_id: RUN2, write: true }, d2);
console.log(JSON.stringify({ calls: out, generator_calls_total: calls.gen, minted: (db.inserts.signals ?? []).length, r43_empty_page: { first_call_generator: after1, plan_done_after_first: plan.body.done, continuation_generator_calls: calls2.gen - after1 } }));
