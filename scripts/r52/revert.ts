#!/usr/bin/env -S deno run --allow-all
// ── R52 sweep — REVERT one company's rows of a run, or PROVE the revert inside BEGIN … ROLLBACK ────────────────
//
//   deno run --allow-all scripts/r52/revert.ts --prove  --run-ref=r52_<…> --company=<uuid>
//       The per-batch proof: inside ONE transaction that is ROLLED BACK, revert the run for the company from its audit
//       rows, then compare the md5 of the company's signal rows with the md5 apply recorded on the run's integrity row
//       BEFORE its first write (excluded_by_rule.signals_md5_before). Prints both md5s and whether they are equal.
//       Commits nothing.
//   deno run --allow-all scripts/r52/revert.ts --revert --run-ref=r52_<…> --company=<uuid>
//       The real revert (commits): class restored from each un-reverted audit row where the row still holds the new
//       class, audit rows marked reverted_at, the r52 / r52_unknown stamp keys removed from every row the run stamped.
// The mode is named or refused (classifyBodyMode) — there is no default. The company is refused by value as in apply.
import { namedMode, revertCompany, SweepRefusedError } from "./sweepCore.ts";
import { lit, makePsqlSweepStore, PsqlSession } from "./psqlSweepStore.ts";

const out = (o: unknown) => console.log(JSON.stringify(o));
const session = new PsqlSession();
const store = makePsqlSweepStore(session);
try {
  const { mode, body } = namedMode(Deno.args, ["revert", "prove"] as const, ["revert", "prove", "run_ref", "company"]);
  const runRef = typeof body.run_ref === "string" ? body.run_ref : "";
  const companyId = typeof body.company === "string" ? body.company : "";
  if (!/^r52_/.test(runRef)) throw new SweepRefusedError("no_run_ref", "--run-ref=r52_<…> is required");
  if (!companyId) throw new SweepRefusedError("no_company", "--company=<uuid> is required: one company per invocation");
  const opened = await session.query<{ id: number; md5: string | null }>(`select id, excluded_by_rule->>'signals_md5_before' md5 from integrity_runs
    where component='r52_voice_sweep' and run_ref=${lit(runRef)} and company_id=${lit(companyId)}::uuid order by id limit 1`);
  await session.exec("begin;");
  const md5Now = await store.companySignalsMd5(companyId);
  const r = await revertCompany(store, { runRef, companyId });
  if (mode === "prove") {
    await session.exec("rollback;");
    const md5Rolled = await store.companySignalsMd5(companyId);
    out({ mode: "prove", ...r, integrity_id: opened[0]?.id ?? null, md5_before_apply: opened[0]?.md5 ?? null, md5_before_revert: md5Now, md5_after_revert: r.md5_after, restores_pre_apply: !!opened[0]?.md5 && r.md5_after === opened[0].md5, rolled_back: md5Rolled === md5Now });
  } else {
    await session.exec("commit;");
    out({ mode: "revert", ...r, md5_before_apply: opened[0]?.md5 ?? null, restores_pre_apply: !!opened[0]?.md5 && r.md5_after === opened[0].md5 });
  }
} catch (e) {
  try { await session.exec("rollback;"); } catch { /* none open */ }
  if (e instanceof SweepRefusedError) { out({ ok: false, refused: true, code: e.code, error: e.message }); await session.close(); Deno.exit(3); }
  console.error(String((e as Error)?.stack ?? e));
  await session.close();
  Deno.exit(1);
}
await session.close();
