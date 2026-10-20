// R36 probe — fake db (refuses \\u0000 on integrity_runs like Postgres), fake transport, no network. Measured values:
//   nul_finish_ok        a candidate with U+0000 in text and reason: the run's finish succeeds (sanitized at parse)
//   nul_sanitized        the stored candidate carries sanitized: true
//   refused_open_mints   with the integrity insert refused: mints made before the refusal (expected 0)
//   finish_fail_status   with the finish update refused: the row's status (expected failed) and mints kept (expected 1)
//   emoji_units_minus_cp excerpt_offset − excerpt_offset_cp with two emoji before the span (expected 2); both_resolve true
// Plants: P1 drop the sanitizer → nul_finish_ok false; P2 open after the first mint → refused_open_mints 1; P3 drop _cp → both_resolve false.
import { runOutsideRegen } from "../../supabase/functions/_shared/outsideRegenHandler.ts";
import type { RegenTransport } from "../../supabase/functions/_shared/outsideRegenModel.ts";
import { fakeDb, seedR27, seedR17, deps, r27Transport, CO, RUN2, U1, EXACT27 } from "../../supabase/functions/_shared/outsideRegenHandler.test.ts";
const gen = (text: string, reason: string, quoteReason = "k"): RegenTransport => ({ system }) => Promise.resolve(system === "GEN"
  ? { content: JSON.stringify({ statements: [{ text, reason }] }), usage: { prompt_tokens: 1, completion_tokens: 1 } }
  : { content: JSON.stringify({ verdicts: [{ quote: text, keep: true, reason: quoteReason }] }), usage: { prompt_tokens: 1, completion_tokens: 1 } });
// NUL
const db1 = fakeDb(seedR27()); const r1 = await runOutsideRegen({ company_id: CO, run_id: RUN2, write: true, urls: [U1] }, deps(db1, gen(EXACT27 + "\u0000", "r\u0000"), null).d);
const row1 = (db1.tables.integrity_runs ?? []).find((x) => x.component === "r3_outside_regen") as { status?: string; excluded_by_rule?: { candidates?: Array<{ sanitized?: boolean }> } } | undefined;
// refused open
const db2 = fakeDb(seedR27()); db2.failures.integrity_insert = "refused"; await runOutsideRegen({ company_id: CO, run_id: RUN2, write: true, urls: [U1] }, deps(db2, r27Transport(), null).d);
// refused finish
const db3 = fakeDb(seedR27()); db3.failures.integrity_update = "refused"; await runOutsideRegen({ company_id: CO, run_id: RUN2, write: true, urls: [U1] }, deps(db3, r27Transport(), null).d);
const row3 = (db3.tables.integrity_runs ?? []).find((x) => x.component === "r3_outside_regen") as { status?: string } | undefined;
// emoji
const db4 = fakeDb(seedR17()); const page = "Insights 🟡🟡 " + EXACT27 + " and more."; for (const r of db4.tables.outside_page_snapshots) if (r.source_url === U1) r.clean_text = page;
await runOutsideRegen({ company_id: CO, run_id: RUN2, write: true, urls: [U1] }, deps(db4, gen(EXACT27, "r"), null).d);
const m4 = (db4.inserts.signals ?? [])[0] as { evidence_excerpt: string; raw_payload: { excerpt_offset: number; excerpt_length: number; excerpt_offset_cp?: number; excerpt_length_cp?: number } } | undefined;
const p = m4?.raw_payload; const cpOk = !!p && p.excerpt_offset_cp != null && Array.from(page).slice(p.excerpt_offset_cp, p.excerpt_offset_cp + (p.excerpt_length_cp ?? 0)).join("") === m4!.evidence_excerpt;
console.log(JSON.stringify({ nul_finish_ok: (r1.body as { integrity?: { finish?: string } }).integrity?.finish === "completed" && row1?.status === "completed", nul_sanitized: row1?.excluded_by_rule?.candidates?.[0]?.sanitized === true, refused_open_mints: (db2.inserts.signals ?? []).length, finish_fail_status: row3?.status ?? "(no row)", finish_fail_mints_kept: (db3.inserts.signals ?? []).length, emoji_units_minus_cp: p ? p.excerpt_offset - (p.excerpt_offset_cp ?? NaN) : null, both_resolve: !!p && page.substring(p.excerpt_offset, p.excerpt_offset + p.excerpt_length) === m4!.evidence_excerpt && cpOk }));
