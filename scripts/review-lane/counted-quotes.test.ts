// A5 (2026-11-18): scripts/review-lane/counted-quotes.sql against the database, inside ONE rolled-back transaction on a
// throwaway company: only a live, unheld lane row quoted from a fetched page (quote_basis web_fetch_page_text) is counted.
// Needs the local stack (docker). Run: deno test --allow-all scripts/review-lane/counted-quotes.test.ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

const SQL = (await Deno.readTextFile(new URL("./counted-quotes.sql", import.meta.url))).split("\n").filter((l) => !/^\s*--/.test(l)).join("\n");
const CO = "00000000-0000-4000-8000-0000000c0001", CALL = "00000000-0000-4000-8000-0000000c00c1";
const sig = (id: string, extra: string, cols = "", vals = "") =>
  `insert into signals (id, company_id, source_type, signal_band, evidence_type, claim_text, evidence_excerpt, voice_class, review_lane_call_id${cols}) values ('${id}', '${CO}', 'public_baseline_run', 'outside', 'market_signal', 'x', 'x', 'outside_voice_about_client', '${CALL}'${vals});${extra}`;
const Q = "'My bill went up.'", QST = "'Nov 2, 2026 My bill went up.'";
const script = `
begin;
insert into companies (id, name, created_by, fixture_hold) values ('${CO}', 'counted-quotes test (rolled back)', (select id from auth.users where email='bob2@fomomojodojo.com' limit 1), 'CQT:test');
insert into review_lane_calls (id, company_id, target_key, host, model, response) values ('${CALL}', '${CO}', 't', 'p.test', 'none', '{}');
${sig("00000000-0000-4000-8000-0000000c00a1", "", ", quote, quote_source_text, raw_payload", `, ${Q}, ${QST}, '{"quote_basis":"web_fetch_page_text"}'`)}
${sig("00000000-0000-4000-8000-0000000c00a2", "", ", held_at, held_reason", ", now(), 'search summary, not checked against the page'")}
${sig("00000000-0000-4000-8000-0000000c00a3", "", ", quote, quote_source_text, raw_payload, held_at, held_reason", `, ${Q}, ${QST}, '{"quote_basis":"web_fetch_page_text"}', now(), 'search summary, not checked against the page'`)}
${sig("00000000-0000-4000-8000-0000000c00a4", "", ", quote, quote_source_text, raw_payload, superseded_at", `, ${Q}, ${QST}, '{"quote_basis":"web_fetch_page_text"}', now()`)}
${sig("00000000-0000-4000-8000-0000000c00a5", "", ", quote, quote_source_text, raw_payload", `, ${Q}, ${QST}, '{"quote_basis":"something_else"}'`)}
insert into signals (id, company_id, source_type, signal_band, evidence_type, claim_text, evidence_excerpt, voice_class, quote, quote_source_text, raw_payload)
  values ('00000000-0000-4000-8000-0000000c00a6', '${CO}', 'public_baseline_run', 'outside', 'market_signal', 'x', 'x', 'outside_voice_about_client', ${Q}, ${QST}, '{"quote_basis":"web_fetch_page_text"}');
select 'COUNTED ' || coalesce(string_agg(right(c.id::text, 3), ',' order by c.id), '') from (${SQL}) c where c.company_id = '${CO}';
rollback;
select 'AFTER ' || count(*) from companies where id = '${CO}';
`;

Deno.test("counted-quotes.sql counts only a live, unheld lane row quoted from a fetched page", async () => {
  const p = new Deno.Command("docker", { args: ["exec", "-i", "supabase_db_dzlgyxcvuwiulgifbmew", "psql", "-U", "postgres", "-At", "-v", "ON_ERROR_STOP=1"], stdin: "piped", stdout: "piped", stderr: "piped" }).spawn();
  const w = p.stdin.getWriter(); await w.write(new TextEncoder().encode(script)); await w.close();
  const r = await p.output();
  const out = new TextDecoder().decode(r.stdout), err = new TextDecoder().decode(r.stderr);
  assertEquals(r.code, 0, err);
  // a1 counted; a2 held lead, a3 held although quoted, a4 superseded, a5 not quoted from a fetched page, a6 not a lane row
  assertEquals(out.split("\n").find((l) => l.startsWith("COUNTED ")), "COUNTED 0a1");
  assertEquals(out.split("\n").find((l) => l.startsWith("AFTER ")), "AFTER 0");
});
