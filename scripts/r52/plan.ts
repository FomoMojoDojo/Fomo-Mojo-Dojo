#!/usr/bin/env -S deno run --allow-all
// ── R52 sweep — PLAN (zero model calls, zero writes) ───────────────────────────────────────────────────────────
//
//   deno run --allow-all scripts/r52/plan.ts --plan --reviewed=<a.tsv>,<b.tsv> --reviewed-md5=<md5a>,<md5b> [--company=<uuid>] [--out=<plan.tsv>]
//
// Reads the reviewed plan BY ID (md5 checked per file), re-derives each row's reach and expected judges through the
// shipped authority with stub judges (sweepCore.planCompany), and prints, per company in sweep order, rows, expected
// calls by judge and plan-equals-reviewed PASS/FAIL. The mode is named or refused (classifyBodyMode) — no default.
//
// ZERO WRITES, ENFORCED: the whole run is ONE `begin transaction read only` on the psql session. Any write errors;
// at the end the session proves no transaction id was assigned (pg_current_xact_id_if_assigned() is null) and rolls
// back. The judges are stubs: no transport is built, no model is reachable from this file.
import { companyOrder, namedMode, planCompany, R52_RULES, readReviewed, SweepRefusedError, type CompanyPlan } from "./sweepCore.ts";
import { makePsqlSweepStore, PsqlSession } from "./psqlSweepStore.ts";

const out = (o: unknown) => console.log(JSON.stringify(o));
const session = new PsqlSession();
const store = makePsqlSweepStore(session);
try {
  const { body } = namedMode(Deno.args, ["plan"] as const, ["plan", "reviewed", "reviewed_md5", "company", "out"]);
  const split = (v: unknown) => (typeof v === "string" && v ? v.split(",") : []);
  const reviewed = await readReviewed(split(body.reviewed), split(body.reviewed_md5));
  await session.exec("begin transaction read only;");
  const groups = companyOrder(reviewed.rows).filter((g) => !body.company || g.company_id === body.company);
  if (body.company && groups.length === 0) throw new SweepRefusedError("company_not_in_plan", `company ${String(body.company)} has no row in the reviewed plan`);
  const plans: CompanyPlan[] = [];
  for (const g of groups) plans.push(await planCompany(store, g));
  const xid = (await session.query<{ xid: string | null }>(`select pg_current_xact_id_if_assigned()::text xid`))[0].xid;
  await session.exec("rollback;");
  if (typeof body.out === "string" && body.out) {
    // The out file IS a reviewable plan (parseReviewedTsv reads it): judges = the shipped re-derivation, rules = R52,
    // preempted_by = the authority that decided; reviewed_judges / equal / why compare it with the plan it was run against.
    const hdr = ["seq", "company", "company_id", "signal_id", "era", "rules", "judges", "preempted_by", "replay", "no_page_words", "reviewed_judges", "equal", "why"];
    const lines = plans.flatMap((p) => p.rows.map((r) => [r.seq, p.company, p.company_id, r.signal_id, r.era, R52_RULES, r.fresh_judges, r.authority ?? "", r.replay, String(r.no_page_words), r.reviewed_judges, String(r.equal), r.why ?? ""].join("\t")));
    await Deno.writeTextFile(body.out, [hdr.join("\t"), ...lines].join("\n") + "\n");
  }
  for (const p of plans) {
    console.error(`${p.company.padEnd(30)} rows ${String(p.rows.length).padStart(3)}  band ${String(p.calls.band).padStart(3)}  speaker ${String(p.calls.speaker).padStart(3)}  authorship ${String(p.calls.authorship).padStart(3)}  ${p.refused ? `REFUSED ${p.refused}` : p.equal ? "PASS" : `FAIL (${p.rows.filter((r) => !r.equal).length} row(s))`}`);
    for (const r of p.rows.filter((x) => !x.equal)) console.error(`    ${r.seq.padStart(4)} ${r.signal_id} ${r.why}`);
  }
  const sum = (k: "band" | "speaker" | "authorship") => plans.reduce((a, p) => a + p.calls[k], 0);
  out({
    mode: "plan", read_only: true, xid_assigned: xid, companies: plans.length,
    rows: plans.reduce((a, p) => a + p.rows.length, 0),
    calls: { band: sum("band"), speaker: sum("speaker"), authorship: sum("authorship"), total: sum("band") + sum("speaker") + sum("authorship") },
    no_page_words: plans.reduce((a, p) => a + p.rows.filter((r) => r.no_page_words).length, 0),
    per_company: plans.map((p) => ({ company: p.company, company_id: p.company_id, rows: p.rows.length, calls: p.calls, no_page_words: p.rows.filter((r) => r.no_page_words).length, plan_equals_reviewed: p.refused ? `REFUSED:${p.refused}` : p.equal ? "PASS" : "FAIL", mismatches: p.rows.filter((r) => !r.equal).map((r) => ({ seq: r.seq, signal_id: r.signal_id, why: r.why })) })),
    all_pass: plans.length > 0 && plans.every((p) => p.equal),
  });
} catch (e) {
  try { await session.exec("rollback;"); } catch { /* none open */ }
  if (e instanceof SweepRefusedError) { out({ ok: false, refused: true, code: e.code, error: e.message }); await session.close(); Deno.exit(3); }
  console.error(String((e as Error)?.stack ?? e));
  await session.close();
  Deno.exit(1);
}
await session.close();
