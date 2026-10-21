#!/usr/bin/env -S deno run --allow-all
// ── R52 sweep — APPLY one company, or run a guard PROBE inside BEGIN … ROLLBACK ───────────────────────────────
//
//   deno run --allow-all scripts/r52/apply.ts --apply --company=<uuid> --run-ref=r52_<…> --reviewed=<a,b> --reviewed-md5=<a,b>
//       ONE company per invocation. Refused unless: the company is writable by value (not held, not frozen, not CB1,
//       not a Client Portals id); plan-equals-reviewed for every one of its rows; every row handed to the executor is in
//       the reviewed plan. Then the integrity row is OPENED running, each row is decided by the shipped authority under
//       keep_label with the local LEDGERED judges, and the row is FINISHED with judged / changed / unknown / ledger_failed.
//   deno run --allow-all scripts/r52/apply.ts --dry-judge --company=<uuid> --signals=<id,id,…>
//       R54 LIVE PROOF, DRY: the named rows of ONE company are derived through the shipped authority with the LOCAL ledgered
//       judges — real model calls, each writing its model_calls row — and each authorship prompt's CONTEXT block, verdict
//       and reason are printed. Writes NOTHING else: no integrity row, no audit row, no stamp, no class.
//   deno run --allow-all scripts/r52/apply.ts --probe --name=<p1|p2|p3|p4|p5|p6|p8|p9|p10|plan-seed|apply-revert>
//       GUARD PROBES on a throwaway company SEEDED INSIDE the probe's transaction, with FAKE local transports (no model
//       is reachable): everything — seed, ledger rows, audit rows, integrity rows — is ROLLED BACK. One JSON line out.
// The mode is named or refused (classifyBodyMode) — there is no default.
import {
  applyCompany, assertCompanyWritable, assertInPlan, companyCtx, companyOrder, deriveRow, emptyTally, ledgeredJudges, localTransports, namedMode, planCompany, readReviewed, revertCompany,
  SweepRefusedError, type ReviewedRow, type Transports,
} from "./sweepCore.ts";
import { lit, makePsqlSweepStore, PsqlSession } from "./psqlSweepStore.ts";

const out = (o: unknown) => console.log(JSON.stringify(o));
const session = new PsqlSession();
const store = makePsqlSweepStore(session);

// ── the probe seed: two throwaway companies, created and destroyed inside one rolled-back transaction ──────────
const Z = "00000000-0000-4000-8000-0000000052a0";      // writable
const H = "00000000-0000-4000-8000-0000000052a1";      // fixture_hold set
const URL_A = "https://www.chamberofcommerce.com/business-directory/massachusetts/medford/consultant/1-zz-r52-guard";
const PAGE_A = "Directory listing. ZZ R52 Guard is an engineering consultancy serving Medford and the surrounding towns with careful structural work. Contact details below.";
const EX_A = "ZZ R52 Guard is an engineering consultancy serving Medford and the surrounding towns with careful structural work.";
const URL_B = "https://news.zz-other.test/story";
const PAGE_B = "Local programs. Within the new program, our counselors serve youth ages six to eighteen across the county every single week. More text follows.";
const EX_B = "Within the new program, our counselors serve youth ages six to eighteen across the county every single week.";
const EX_C = "ZZ R52 Guard also maintains a small office near the town hall for clients who prefer to meet in person.";
type Seeded = { a: string; b: string; c: string; h: string };
async function seed(): Promise<Seeded> {
  const by = `(select id from auth.users order by created_at limit 1)`;
  await session.exec(`insert into companies (id, name, website, created_by) values (${lit(Z)}::uuid, 'ZZ R52 Guard', 'https://zz-r52-guard.test', ${by});`);
  await session.exec(`insert into companies (id, name, website, created_by, fixture_hold) values (${lit(H)}::uuid, 'ZZ R52 Held', 'https://zz-r52-held.test', ${by}, 'R39:test_fixture');`);
  for (const [co, url, page, sha] of [[Z, URL_A, PAGE_A, "sha-r52-a"], [Z, URL_B, PAGE_B, "sha-r52-b"], [H, URL_A, PAGE_A, "sha-r52-h"]]) {
    await session.exec(`insert into outside_page_snapshots (company_id, source_url, signal_id, clean_text, text_sha256, fetch_status, http_status) values (${lit(co)}::uuid, ${lit(url)}, null, ${lit(page)}, ${lit(sha)}, 'ok', 200);`);
  }
  const sig = async (co: string, url: string, ex: string, sha: string, page: string) => {
    const rp = { run_id: "r52-guard-run", snapshot_text_sha256: sha, excerpt_offset: page.indexOf(ex), excerpt_length: ex.length, source: "outside_recrawl_regen" };
    const r = await session.mutate<{ id: string }>(`insert into signals (company_id, source_id, source_type, source_title, source_url, signal_band, evidence_type, claim_text, evidence_excerpt, topic, directness, framing_fit, structure_level, validation_status, confidence_to_use, raw_payload, voice_class)
      values (${lit(co)}::uuid, 'r52-guard', 'public_baseline_run', 'guard', ${lit(url)}, 'outside', 'market_signal', ${lit(ex)}, ${lit(ex)}, 'strategy', 'direct', 'partial', 'extracted', 'directional', 'medium', ${lit(JSON.stringify(rp))}::jsonb, 'outside_voice_about_client') returning id`);
    return r[0].id;
  };
  const a = await sig(Z, URL_A, EX_A, "sha-r52-a", PAGE_A);
  const b = await sig(Z, URL_B, EX_B, "sha-r52-b", PAGE_B);
  const c = await sig(Z, URL_A, EX_C, "sha-r52-a", PAGE_A);   // not in the probe's reviewed plan
  const h = await sig(H, URL_A, EX_A, "sha-r52-h", PAGE_A);
  return { a, b, c, h };
}
/** Fake local transports: authorship says the company wrote it, speaker cannot tell, band says no. Counted. */
function fakeTransports(counter: { n: number }, authorshipVerdict: "subject_company" | "third_party" = "subject_company"): Transports {
  const tok = { prompt_tokens: 300, completion_tokens: 20 };
  return {
    authorship: () => { counter.n++; return Promise.resolve({ content: JSON.stringify({ verdict: authorshipVerdict, entity: null, reason: authorshipVerdict === "third_party" ? P8_REASON : "guard: the listing's own description text" }), ...tok }); },
    speaker: () => { counter.n++; return Promise.resolve({ content: JSON.stringify({ speaker_name: null, speaker_role: null, speaker_class: "unknown", reason: "guard: the paragraph does not say who speaks" }), ...tok }); },
    band: () => { counter.n++; return Promise.resolve({ content: "NO", ...tok }); },
  };
}
const P8_REASON = "guard p8: the directory's own contact line, written by the platform";
const reviewedRow = (company_id: string, company: string, signal_id: string, judges: string): ReviewedRow => ({ seq: "g", company, company_id, signal_id, era: "b3", rules: "guard", judges, preempted_by: "" });
async function refusal(fn: () => Promise<unknown>): Promise<{ refused: boolean; code: string | null; message: string | null }> {
  try { await fn(); return { refused: false, code: null, message: null }; } catch (e) {
    if (e instanceof SweepRefusedError) return { refused: true, code: e.code, message: e.message };
    return { refused: true, code: `error:${(e as Error).name}`, message: String((e as Error).message).slice(0, 300) };
  }
}
const count = async (sql: string) => (await session.query<{ n: number }>(`select count(*)::int n from (${sql}) t`))[0].n;

try {
  const { mode, body } = namedMode(Deno.args, ["apply", "probe", "dry_judge"] as const, ["apply", "probe", "dry_judge", "name", "company", "run_ref", "reviewed", "reviewed_md5", "signals"]);
  if (mode === "dry_judge") {
    if (typeof body.company !== "string" || !body.company) throw new SweepRefusedError("no_company", "--company=<uuid> is required");
    const ids = typeof body.signals === "string" && body.signals ? body.signals.split(",") : [];
    if (ids.length === 0) throw new SweepRefusedError("no_signals", "--signals=<id,…> is required: the dry judge names its rows");
    const [co] = await store.loadCompanies([body.company]);
    assertCompanyWritable(co, body.company);
    const sigs = await store.loadSignals(ids);
    if (sigs.length !== ids.length || sigs.some((s) => s.company_id !== body.company)) throw new SweepRefusedError("signals_not_company", "every --signals row must exist and belong to --company");
    const ctx = await companyCtx(store, co);
    const tally = emptyTally();
    const t = localTransports();
    const prompts: string[] = [];
    const judges = ledgeredJudges(store, co.id, tally, { ...t, authorship: (a) => { prompts.push(a.user); return t.authorship(a); } });
    const rows = [];
    for (const id of ids) {
      const s = sigs.find((x) => x.id === id)!;
      const before = prompts.length;
      const d = await deriveRow(store, ctx, s, s.raw_payload?.run_id ? "b3" : "baseline", judges);
      const user = prompts.length > before ? prompts[prompts.length - 1] : null;
      const dec = d.decision.ok ? d.decision : null;
      rows.push({ signal_id: id, class_now: s.voice_class, basis: d.basis, calls: d.calls, decision: dec ? { voice_class: dec.voice_class, authority: dec.authority, detail: dec.detail } : d.decision,
        authorship: dec?.authorship_judge ? { verdict: dec.authorship_judge.verdict, entity: dec.authorship_judge.entity, reason: dec.authorship_judge.reason, model: dec.authorship_judge.model } : null,
        context_block: user ? user.slice(user.indexOf("CONTEXT —"), user.indexOf("TEXT (verbatim")).trim() : null });
    }
    out({ mode: "dry_judge", company_id: co.id, writes: "model_calls only (one ledger row per call)", model_calls: tally, rows });
  } else if (mode === "apply") {
    const split = (v: unknown) => (typeof v === "string" && v ? v.split(",") : []);
    if (typeof body.company !== "string" || !body.company) throw new SweepRefusedError("no_company", "--company=<uuid> is required: one company per invocation");
    const reviewed = await readReviewed(split(body.reviewed), split(body.reviewed_md5));
    const group = companyOrder(reviewed.rows).find((g) => g.company_id === body.company);
    if (!group) throw new SweepRefusedError("company_not_in_plan", `company ${body.company} has no row in the reviewed plan`);
    const r = await applyCompany(store, { group, runRef: String(body.run_ref ?? ""), reviewedMd5s: reviewed.md5s, transports: localTransports(), nested: false, log: (s) => console.error(s) });
    out({ mode: "apply", ...r, outcomes: undefined, outcome_counts: { changed: r.changed, unknown: r.unknown, unchanged: r.rows - r.changed - r.unknown - r.refused, refused: r.refused } });
  } else {
    if (typeof body.name !== "string" || !body.name) throw new SweepRefusedError("no_probe_name", "--probe needs --name=<p1|p2|p3|p4|p5|p6|p8|p9|p10|plan-seed|apply-revert>");
    const probe = body.name;
    await session.exec("begin;");
    const before = { model_calls: await count("select 1 from model_calls"), integrity_runs: await count("select 1 from integrity_runs"), restamps: await count("select 1 from signal_voice_restamps"), signals: await count("select 1 from signals") };
    const s = await seed();
    const RUN = "r52_guard_probe";
    const counter = { n: 0 };
    const group = { company_id: Z, company: "ZZ R52 Guard", rows: [reviewedRow(Z, "ZZ R52 Guard", s.a, "authorship"), reviewedRow(Z, "ZZ R52 Guard", s.b, "speaker")] };
    const sigRow = async (id: string) => (await session.query<{ voice_class: string; superseded_at: string | null; held_at: string | null; r52: unknown; r52_unknown: string | null }>(`select voice_class, superseded_at, held_at, raw_payload->'r52' r52, raw_payload->>'r52_unknown' r52_unknown from signals where id=${lit(id)}::uuid`))[0];
    let result: Record<string, unknown>;
    if (probe === "plan-seed") {
      // the seeded rows' shipped expectations — the probe plan the others rely on
      const p = await planCompany(store, group);
      result = { equal: p.equal, rows: p.rows.map((r) => ({ id: r.signal_id === s.a ? "A" : "B", fresh: r.fresh_judges, reviewed: r.reviewed_judges })) };
    } else if (probe === "p1") {
      // an un-mint attempt through the only signal door, and a refused decision: both refused, the row stays live
      const r = await refusal(() => store.writeSignal(s.a, RUN, { superseded_at: new Date().toISOString() }));
      const row = await sigRow(s.a);
      result = { ...r, row_live: row.superseded_at === null && row.held_at === null, class_kept: row.voice_class === "outside_voice_about_client" };
    } else if (probe === "p3") {
      // a class change with no audit row behind it: refused, the class stands
      const r = await refusal(() => store.writeSignal(s.a, RUN, { voice_class: "client_voice" }));
      const row = await sigRow(s.a);
      result = { ...r, class_after: row.voice_class, audit_rows: await count(`select 1 from signal_voice_restamps where signal_id=${lit(s.a)}::uuid`) };
    } else if (probe === "p4") {
      // a fixture_hold company: refused before any integrity row, any judge call, any write
      const hgroup = { company_id: H, company: "ZZ R52 Held", rows: [reviewedRow(H, "ZZ R52 Held", s.h, "authorship")] };
      const ir0 = await count(`select 1 from integrity_runs where company_id=${lit(H)}::uuid`);
      const r = await refusal(() => applyCompany(store, { group: hgroup, runRef: RUN, reviewedMd5s: ["probe"], transports: fakeTransports(counter), nested: true }));
      const cb1 = await refusal(() => applyCompany(store, { group: { company_id: "58b2b15b-bada-4bcd-9c12-b7e66a37d0bc", company: "Cafe Barra", rows: [] }, runRef: RUN, reviewedMd5s: ["probe"], transports: fakeTransports(counter), nested: true }));
      result = { ...r, integrity_rows_written: (await count(`select 1 from integrity_runs where company_id=${lit(H)}::uuid`)) - ir0, judge_calls: counter.n, held_row_r52: (await sigRow(s.h)).r52 !== null, cb1_refused: cb1.refused, cb1_code: cb1.code };
    } else if (probe === "p5") {
      // (a) a row not in the plan handed to the executor; (b) a reviewed row whose judges differ from the shipped re-derivation
      const notInPlan = await refusal(() => applyCompany(store, { group, runRef: RUN, reviewedMd5s: ["probe"], transports: fakeTransports(counter), nested: true, executeIds: [s.a, s.b, s.c] }));
      const cStamped = (await sigRow(s.c)).r52 !== null;
      const drifted = { ...group, rows: [reviewedRow(Z, "ZZ R52 Guard", s.a, "speaker"), group.rows[1]] };
      const mismatch = await refusal(() => applyCompany(store, { group: drifted, runRef: RUN, reviewedMd5s: ["probe"], transports: fakeTransports(counter), nested: true }));
      let direct: { refused: boolean; code: string | null } = { refused: false, code: null };
      try { assertInPlan([s.c], new Set([s.a, s.b])); } catch (e) { direct = { refused: true, code: (e as SweepRefusedError).code }; }
      result = { not_in_plan: notInPlan, extra_row_stamped: cStamped, plan_mismatch: mismatch, direct, judge_calls: counter.n, integrity_rows_written: await count(`select 1 from integrity_runs where company_id=${lit(Z)}::uuid`) };
    } else if (probe === "p8") {
      // an UNCHANGED row (the judge answers third_party, the label stands): its stamp keeps the judge's verdict and FULL
      // reason in the audit row's field shape — the reason is not lost because no audit row was written
      const g8 = { company_id: Z, company: "ZZ R52 Guard", rows: [reviewedRow(Z, "ZZ R52 Guard", s.a, "authorship")] };
      const r = await applyCompany(store, { group: g8, runRef: RUN, reviewedMd5s: ["probe"], transports: fakeTransports(counter, "third_party"), nested: true });
      const A = await sigRow(s.a);
      const js = ((A.r52 as { judgments?: Array<Record<string, unknown>> } | null)?.judgments ?? []);
      const aj = js.find((j) => j.judge === "authorship") ?? null;
      result = { kind: r.outcomes[0]?.kind ?? null, class: A.voice_class, audit_rows: await count(`select 1 from signal_voice_restamps where company_id=${lit(Z)}::uuid and run_ref=${lit(RUN)}`), judgments: js.length, authorship: aj, reason_kept: !!aj && aj.judge_reason === P8_REASON && aj.judge_verdict === "third_party" && typeof aj.judge_model === "string" && "judge_entity" in aj };
    } else if (probe === "p9") {
      // the revert record: (i) a restore with NO revert audit row of its own is refused — the class stays applied;
      // (ii) the real revert writes one integrity row and one audit row per restored row (apply_audit:<id>) and per
      // stamp-only row, each before its write, and leaves the company md5 where it was before apply
      const md5_0 = await store.companySignalsMd5(Z);
      await applyCompany(store, { group, runRef: RUN, reviewedMd5s: ["probe"], transports: fakeTransports(counter), nested: true });
      const applyAudit = (await store.loadAudit(RUN, Z))[0];
      const bare = await store.restoreClass(s.a, applyAudit.old_voice_class, applyAudit.new_voice_class, RUN, applyAudit.id);
      const afterBare = (await sigRow(s.a)).voice_class;
      const rv = await revertCompany(store, { runRef: RUN, companyId: Z });
      const ir = await session.query<{ status: string; examined: number; admitted: number; mode: string }>(`select status, examined, admitted, excluded_by_rule->>'mode' mode from integrity_runs where id=${rv.integrity_id}`);
      result = {
        bare_restore_refused: bare === false, class_after_bare: afterBare,
        revert_audit: rv.revert_audit.map((w) => ({ row: w.signal_id === s.a ? "A" : w.signal_id === s.b ? "B" : "?", from: w.old_voice_class, to: w.new_voice_class, entity: w.judge_entity === `apply_audit:${applyAudit.id}` ? "apply_audit:<A>" : w.judge_entity })),
        restored: rv.restored, unstamped: rv.unstamped, integrity: ir[0] ?? null, md5_after_revert_equal: rv.md5_after === md5_0,
      };
    } else if (probe === "p10") {
      // R54: a baseline-era row on a gated URL with NO stored page — no page words: recorded unknown:no_page_words, the
      // label stands, and ZERO model calls (no transport call, no model_calls row)
      const URL_NP = "https://www.chamberofcommerce.com/business-directory/massachusetts/medford/consultant/2-zz-r52-nopage";
      const np = (await session.mutate<{ id: string }>(`insert into signals (company_id, source_id, source_type, source_title, source_url, signal_band, evidence_type, claim_text, evidence_excerpt, topic, directness, framing_fit, structure_level, validation_status, confidence_to_use, raw_payload, voice_class)
        values (${lit(Z)}::uuid, 'r52-guard', 'public_baseline_run', 'guard', ${lit(URL_NP)}, 'outside', 'market_signal', 'ChamberofCommerce.com lists ZZ R52 Guard at 1 Main St under Consultant category.', '', 'strategy', 'direct', 'partial', 'extracted', 'directional', 'medium', '{}'::jsonb, 'outside_voice_about_client') returning id`))[0].id;
      const g10 = { company_id: Z, company: "ZZ R52 Guard", rows: [{ ...reviewedRow(Z, "ZZ R52 Guard", np, "none"), era: "baseline" as const }] };
      const planned = (await planCompany(store, g10)).rows[0]?.fresh_judges ?? null;
      let r: Awaited<ReturnType<typeof applyCompany>> | null = null;
      const refused = await refusal(async () => { r = await applyCompany(store, { group: g10, runRef: RUN, reviewedMd5s: ["probe"], transports: fakeTransports(counter), nested: true }); });
      const row = await sigRow(np);
      const done = r as Awaited<ReturnType<typeof applyCompany>> | null;
      result = { planned_judges: planned, refused: refused.code, kind: done?.outcomes[0]?.kind ?? null, class: row.voice_class, unknown_reason: row.r52_unknown, transport_calls: counter.n, model_calls_rows: await count(`select 1 from model_calls where company_id=${lit(Z)}::uuid`), tally: done?.model_calls ?? null };
    } else if (probe === "p2" || probe === "p6" || probe === "apply-revert") {
      // the full path on the seed: apply (fake transports, real ledgered judges), then revert, md5 before / after
      const md5_0 = await store.companySignalsMd5(Z);
      const r = await applyCompany(store, { group, runRef: RUN, reviewedMd5s: ["probe"], transports: fakeTransports(counter), nested: true });
      const md5_1 = await store.companySignalsMd5(Z);
      const A = await sigRow(s.a), B = await sigRow(s.b), C = await sigRow(s.c);
      const ledgerRows = await count(`select 1 from model_calls where company_id=${lit(Z)}::uuid and call_site like 'r52-voice-sweep:%'`);
      const auditRows = await count(`select 1 from signal_voice_restamps where company_id=${lit(Z)}::uuid and run_ref=${lit(RUN)}`);
      const ir = (await session.query<{ status: string; examined: number; admitted: number; e: Record<string, unknown> }>(`select status, examined, admitted, excluded_by_rule e from integrity_runs where company_id=${lit(Z)}::uuid and component='r52_voice_sweep'`));
      const rv = await revertCompany(store, { runRef: RUN, companyId: Z });
      const md5_2 = await store.companySignalsMd5(Z);
      result = {
        applied: { rows: r.rows, judged: r.judged, changed: r.changed, unknown: r.unknown, refused: r.refused, ledger_failed: r.ledger_failed, model_calls: r.model_calls },
        transport_calls: counter.n, ledger_rows: ledgerRows, audit_rows: auditRows,
        A: { class: A.voice_class, stamped: A.r52 !== null }, B: { class: B.voice_class, unknown_reason: B.r52_unknown, stamped: B.r52 !== null }, C_untouched: C.r52 === null,
        integrity: ir.map((x) => ({ status: x.status, examined: x.examined, admitted: x.admitted, judged: x.e.judged, changed: x.e.changed, unknown: x.e.unknown, ledger_failed: x.e.ledger_failed, opened_at: !!x.e.opened_at, finished_at: !!x.e.finished_at })),
        revert: { audit_rows: rv.audit_rows, restored: rv.restored, skipped: rv.skipped.length, unstamped: rv.unstamped },
        md5_before: md5_0, md5_after_apply_differs: md5_1 !== md5_0, md5_after_revert_equal: md5_2 === md5_0,
      };
    } else {
      throw new Error(`unknown probe ${probe}`);
    }
    await session.exec("rollback;");
    const after = { model_calls: await count("select 1 from model_calls"), integrity_runs: await count("select 1 from integrity_runs"), restamps: await count("select 1 from signal_voice_restamps"), signals: await count("select 1 from signals") };
    out({ mode: "probe", probe, ...result, rolled_back: JSON.stringify(before) === JSON.stringify(after), before, after });
  }
} catch (e) {
  try { await session.exec("rollback;"); } catch { /* none open */ }
  if (e instanceof SweepRefusedError) { out({ ok: false, refused: true, code: e.code, error: e.message }); await session.close(); Deno.exit(3); }
  console.error(String((e as Error)?.stack ?? e));
  await session.close();
  Deno.exit(1);
}
await session.close();
