#!/usr/bin/env -S deno run --allow-all
// ── SIGNAL HOLDS (operator ruling 2026-10-21, re-run brief ruling 2) — the one writer of an operator hold ──────────────
//
// A hold sets signals.held_at / held_reason on a named set of rows and writes ONE signal_hold_audit row per signal
// (before / after, reason, actor, run_ref) in ONE transaction. A revert releases exactly the rows a run_ref held, restoring
// each row's before values from its audit row and writing a release audit row. Holding changes no class, no payload, no
// excerpt: the row stays in the record and off the client surface.
//
//   deno run --allow-all scripts/signal-holds.ts --plan   --company=<uuid> --source-id=<run id> --source-type=<raw_payload.source_type> --expect=<n>
//                                                          (or --ids=<uuid,uuid,…> in place of --source-id/--source-type)
//   deno run --allow-all scripts/signal-holds.ts --write  --company=… --source-id=… --source-type=… --expect=<n> --reason=<text> --actor=<name> --run-ref=<ref>
//   deno run --allow-all scripts/signal-holds.ts --revert --company=… --run-ref=<ref> --actor=<name> [--prove]   (--prove: revert, verify, ROLL BACK)
// The mode is named or refused (classifyBodyMode); unknown keys refused. --plan is one read-only transaction (no xid).
// Refused: a selection whose count is not --expect; any selected row already held, superseded, or of another company.
import { classifyBodyMode } from "../supabase/functions/_shared/bodyMode.ts";
import { argvBody } from "./r52/sweepCore.ts";
import { lit, PsqlSession } from "./lib/psqlBlankingStore.ts";

const out = (o: unknown) => console.log(JSON.stringify(o, null, 1));
const body = argvBody(Deno.args);
const v = classifyBodyMode(body, ["plan", "write", "revert"] as const, ["plan", "write", "revert", "company", "source_id", "source_type", "ids", "expect", "reason", "actor", "run_ref", "prove"]);
if (!v.ok) { out({ ok: false, refused: true, code: "mode_unnamed", error: v.detail }); Deno.exit(3); }
const str = (k: string) => (typeof body[k] === "string" ? String(body[k]).trim() : "");
const company = str("company");
if (!/^[0-9a-f-]{36}$/.test(company)) { out({ ok: false, refused: true, code: "args", error: "--company=<uuid> is required" }); Deno.exit(3); }

type Row = { id: string; company_id: string; voice_class: string | null; held_at: string | null; held_reason: string | null; superseded_at: string | null; source_url: string | null };
const s = new PsqlSession();
// selection: --ids=<uuid,uuid,…> (explicit rows of this company) OR --source-id + --source-type
const idList = str("ids") ? str("ids").split(",").map((x) => x.trim()).filter(Boolean) : [];
if (idList.some((x) => !/^[0-9a-f-]{36}$/.test(x))) { out({ ok: false, refused: true, code: "args", error: "--ids must be full uuids" }); Deno.exit(3); }
const select = () => idList.length
  ? s.query<Row>(`select id, company_id, voice_class, held_at::text, held_reason, superseded_at::text, source_url from signals
      where company_id=${lit(company)}::uuid and id in (${idList.map((x) => `${lit(x)}::uuid`).join(",")}) order by id`)
  : s.query<Row>(`select id, company_id, voice_class, held_at::text, held_reason, superseded_at::text, source_url from signals
      where company_id=${lit(company)}::uuid and source_id=${lit(str("source_id"))} and raw_payload->>'source_type'=${lit(str("source_type"))} order by id`);
try {
  if (v.mode === "plan" || v.mode === "write") {
    const expect = Number(str("expect"));
    if ((!idList.length && (!str("source_id") || !str("source_type"))) || !Number.isInteger(expect) || expect < 1) { out({ ok: false, refused: true, code: "args", error: "--ids (or --source-id + --source-type) and --expect=<n> are required" }); Deno.exit(3); }
    if (v.mode === "write" && (!str("reason") || !str("actor") || !str("run_ref"))) { out({ ok: false, refused: true, code: "args", error: "--write needs --reason, --actor and --run-ref" }); Deno.exit(3); }
    await s.exec(v.mode === "plan" ? "begin transaction read only;" : "begin;");
    const rows = await select();
    const refusals: string[] = [];
    if (rows.length !== expect) refusals.push(`selection is ${rows.length} rows, --expect=${expect}`);
    for (const r of rows) {
      if (r.held_at) refusals.push(`${r.id.slice(0, 8)} already held (${r.held_reason})`);
      if (r.superseded_at) refusals.push(`${r.id.slice(0, 8)} superseded`);
    }
    if (v.mode === "plan" || refusals.length) {
      const xid = (await s.query<{ x: string | null }>(`select pg_current_xact_id_if_assigned()::text x`))[0].x;
      await s.exec("rollback;");
      out({ mode: v.mode, ok: refusals.length === 0, refused: refusals.length > 0, refusals, xid_assigned: xid, rows: rows.map((r) => ({ id: r.id, voice_class: r.voice_class, source_url: r.source_url })) });
      Deno.exit(refusals.length ? 3 : 0);
    }
    const audit: string[] = [];
    for (const r of rows) {
      const before = { held_at: r.held_at, held_reason: r.held_reason };
      const [u] = await s.mutate<{ held_at: string }>(`update signals set held_at=now(), held_reason=${lit(str("reason"))} where id=${lit(r.id)}::uuid and held_at is null returning held_at::text`);
      const [a] = await s.mutate<{ id: string }>(`insert into signal_hold_audit (signal_id, company_id, action, reason, before, after, actor, run_ref)
        values (${lit(r.id)}::uuid, ${lit(company)}::uuid, 'hold', ${lit(str("reason"))}, ${lit(JSON.stringify(before))}::jsonb, ${lit(JSON.stringify({ held_at: u.held_at, held_reason: str("reason") }))}::jsonb, ${lit(str("actor"))}, ${lit(str("run_ref"))}) returning id`);
      audit.push(a.id);
    }
    await s.exec("commit;");
    out({ mode: "write", ok: true, held: rows.length, run_ref: str("run_ref"), audit_ids: audit });
  } else {
    if (!str("run_ref") || !str("actor")) { out({ ok: false, refused: true, code: "args", error: "--revert needs --run-ref and --actor" }); Deno.exit(3); }
    const prove = body["prove"] === true || str("prove") === "true";
    await s.exec("begin;");
    const holds = await s.query<{ signal_id: string; before: { held_at: string | null; held_reason: string | null }; reason: string }>(`select signal_id, before, reason from signal_hold_audit a
      where a.company_id=${lit(company)}::uuid and a.run_ref=${lit(str("run_ref"))} and a.action='hold'
        and not exists (select 1 from signal_hold_audit b where b.signal_id=a.signal_id and b.run_ref=a.run_ref and b.action='release' and b.at >= a.at)`);
    for (const h of holds) {
      const b = h.before ?? { held_at: null, held_reason: null };
      const [cur] = await s.query<{ held_at: string | null; held_reason: string | null }>(`select held_at::text, held_reason from signals where id=${lit(h.signal_id)}::uuid`);
      await s.mutate(`update signals set held_at=${b.held_at ? `${lit(b.held_at)}::timestamptz` : "null"}, held_reason=${b.held_reason ? lit(b.held_reason) : "null"} where id=${lit(h.signal_id)}::uuid returning id`);
      await s.mutate(`insert into signal_hold_audit (signal_id, company_id, action, reason, before, after, actor, run_ref)
        values (${lit(h.signal_id)}::uuid, ${lit(company)}::uuid, 'release', ${lit(`revert of ${str("run_ref")}`)}, ${lit(JSON.stringify(cur))}::jsonb, ${lit(JSON.stringify(b))}::jsonb, ${lit(str("actor"))}, ${lit(str("run_ref"))}) returning id`);
    }
    const ids = holds.map((h) => h.signal_id);
    const still = ids.length ? (await s.query<{ n: string }>(`select count(*) n from signals where id in (${ids.map((i) => `${lit(i)}::uuid`).join(",")}) and held_at is not null`))[0].n : "0";
    if (prove) {
      await s.exec("rollback;");
      out({ mode: "revert", proved: true, rolled_back: true, released_in_txn: ids.length, still_held_in_txn: Number(still) });
    } else {
      await s.exec("commit;");
      out({ mode: "revert", ok: true, released: ids.length, still_held: Number(still) });
    }
  }
} catch (e) {
  try { await s.exec("rollback;"); } catch { /* none open */ }
  out({ ok: false, error: String((e as Error)?.message ?? e) });
  await s.close();
  Deno.exit(1);
}
await s.close();
