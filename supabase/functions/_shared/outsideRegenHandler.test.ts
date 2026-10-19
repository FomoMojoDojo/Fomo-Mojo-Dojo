// R8 (2026-10-18) — the regen handler obeys no-write-by-default. Fake database, fake transport, fake ledger.
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  CALLS_PER_URL, EST_PROMPT_OVERHEAD_TOKENS, REGEN_BODY_KEYS, REGEN_MODE_FLAGS, SNAPSHOT_CAP_CHARS, estimateUrl, runOutsideRegen,
  type RegenDeps, type RegenJudge, REGEN_TEXT_GATES } from "./outsideRegenHandler.ts";
import { classifyBodyMode } from "./bodyMode.ts";
import type { RegenLedgerEntry, RegenTransport } from "./outsideRegenModel.ts";

export const CO = "00000000-0000-4000-8000-00000000c0de";
const RUN = "11111111-1111-4111-8111-111111111111";
export const U1 = "https://reviews.example/acme", U2 = "https://directory.example/acme", U3 = "https://press.example/acme", U4 = "https://walled.example/acme";
const UOWN = "https://www.acmecoffee.com/wholesale", UGATED = "https://www.crunchbase.com/organization/acme-coffee";
const POWN = "Acme Coffee wholesale: we roast every bean in Burbank and supply 40 cafes across Los Angeles.";
const PGATED = "Acme Coffee is a specialty roaster supplying 40 cafes across Los Angeles since 2011. Founded 2011. Employees 11-50.";
const P1 = "Acme Coffee roasts every bean in Burbank and supplies 40 cafes across Los Angeles. Reviewers praise the espresso and the staff.";
const P2 = "Acme Coffee is listed as a wholesale roaster serving the San Fernando Valley since 2011.";
const P3 = "A press note: Acme Coffee opened a second roastery in Glendale.";
const CAND = "Acme Coffee roasts every bean in Burbank and supplies 40 cafes across Los Angeles.";
const EMPTY_SHA = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

type Row = Record<string, unknown>;
/** A chainable fake of the supabase query builder: eq / is / in filter; order is a no-op (seed rows newest first);
 *  maybeSingle returns the first match; insert appends and records; awaiting the builder yields { data, error }. */
export function fakeDb(seed: Record<string, Row[]>) {
  const tables: Record<string, Row[]> = JSON.parse(JSON.stringify(seed));
  const inserts: Record<string, Row[]> = {};
  const from = (t: string) => {
    const filters: Array<(r: Row) => boolean> = [];
    const run = () => (tables[t] ?? []).filter((r) => filters.every((f) => f(r)));
    // deno-lint-ignore no-explicit-any
    const b: any = {
      select: () => b, order: () => b,
      eq: (k: string, v: unknown) => { filters.push((r) => r[k] === v); return b; },
      is: (k: string, v: unknown) => { filters.push((r) => (v === null ? r[k] == null : r[k] === v)); return b; },
      in: (k: string, vs: unknown[]) => { filters.push((r) => vs.includes(r[k])); return b; },
      maybeSingle: () => Promise.resolve({ data: run()[0] ?? null, error: null }),
      insert: (rows: Row | Row[]) => { const arr = Array.isArray(rows) ? rows : [rows]; (tables[t] ??= []).push(...arr); (inserts[t] ??= []).push(...arr); return Promise.resolve({ error: null }); },
      then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve({ data: run(), error: null }).then(res, rej),
    };
    return b;
  };
  return { from, tables, inserts };
}

function seed(): Record<string, Row[]> {
  return {
    companies: [{ id: CO, name: "Acme Coffee", website: "https://www.acmecoffee.com", frozen: false, entity_anchors_json: ["Acme Coffee"] }, { id: "frozen-co", name: "Frozen", website: null, frozen: true, entity_anchors_json: [] }, { id: "nameless-co", name: "", website: null, frozen: false, entity_anchors_json: ["Only An Anchor"] }],
    outside_page_snapshots: [
      { id: "snap-1", company_id: CO, source_url: U1, signal_id: "sig-kept", clean_text: P1, text_sha256: "sha1", crawled_at: "2026-09-14T00:00:00Z", fetch_status: "ok" },
      { id: "snap-1-old", company_id: CO, source_url: U1, signal_id: null, clean_text: "older text", text_sha256: "sha1old", crawled_at: "2026-08-01T00:00:00Z", fetch_status: "ok" },
      { id: "snap-2", company_id: CO, source_url: U2, signal_id: null, clean_text: P2, text_sha256: "sha2", crawled_at: "2026-09-14T00:00:00Z", fetch_status: "ok" },
      { id: "snap-3", company_id: CO, source_url: U3, signal_id: null, clean_text: P3, text_sha256: "sha3", crawled_at: "2026-09-14T00:00:00Z", fetch_status: "ok" },
      { id: "snap-4", company_id: CO, source_url: U4, signal_id: null, clean_text: "", text_sha256: EMPTY_SHA, crawled_at: "2026-09-14T00:00:00Z", fetch_status: "ok" },
    ],
    outside_recrawl_review: [
      { company_id: CO, run_id: RUN, source_url: U1, operator_decision: "approve" },
      { company_id: CO, run_id: RUN, source_url: U2, operator_decision: "reject" },
      { company_id: CO, run_id: "another-run", source_url: U3, operator_decision: "approve" },
    ],
    signals: [
      { id: "sig-b1", company_id: CO, source_url: U1, signal_band: "outside", voice_class: "client_voice", superseded_at: null, held_at: null, evidence_excerpt: "", source_title: "Reviews", raw_payload: { excerpt_guard: { backfill_run_ref: "b2-run", action: "blanked" } } },
      { id: "sig-kept", company_id: CO, source_url: U1, signal_band: "outside", voice_class: "outside_voice_about_client", superseded_at: null, held_at: null, evidence_excerpt: "Reviewers praise the espresso and the staff.", source_title: "Reviews", raw_payload: { content_identity: "ci-kept" } },
      { id: "sig-b2", company_id: CO, source_url: U2, signal_band: "outside", voice_class: "outside_voice_about_client", superseded_at: "2026-10-01", held_at: null, evidence_excerpt: "", raw_payload: { excerpt_guard: { backfill_run_ref: "b2-run" } } },
    ],
    integrity_runs: [],
  };
}

export function deps(db: ReturnType<typeof fakeDb>, transport?: RegenTransport, judge: RegenJudge | null = null) {
  const ledgerRows: RegenLedgerEntry[] = [];
  let constructions = 0;
  const d: RegenDeps = {
    supabase: db,
    makeTransport: () => { constructions += 1; if (!transport) throw new Error("no transport in this test"); return transport; },
    makeJudge: () => judge,
    makeLedger: () => (e) => { ledgerRows.push(e); return Promise.resolve(true); },
    models: ["gpt-4.1-mini", "gpt-4.1-nano"],
    genSystem: () => "GEN", judgeSystem: () => "JUDGE", quoteMaxWords: 60, perUrlCap: 12, wallMs: 140_000,
    nowIso: () => "2026-10-18T12:00:00.000Z",
  };
  return { d, ledgerRows, constructions: () => constructions };
}

Deno.test("the regen lists: two modes, five keys", () => {
  assertEquals([...REGEN_MODE_FLAGS], ["plan", "write"]);
  assertEquals([...REGEN_BODY_KEYS].sort(), ["company_id", "plan", "run_id", "urls", "write"]);
});

Deno.test("classifier with the regen lists: {} / no mode / two modes / unknown key refused; plan alone and write alone accepted", () => {
  for (const body of [{}, { company_id: CO }, { company_id: CO, run_id: RUN }, { company_id: CO, write: false }]) {
    const v = classifyBodyMode(body, REGEN_MODE_FLAGS, REGEN_BODY_KEYS);
    assertEquals(v.ok, false, JSON.stringify(body));
    if (!v.ok) assert(/no mode flag set to true \(one of: plan, write\)/.test(v.detail), v.detail);
  }
  const two = classifyBodyMode({ company_id: CO, plan: true, write: true }, REGEN_MODE_FLAGS, REGEN_BODY_KEYS);
  assertEquals(two.ok, false); if (!two.ok) assertEquals(two.modes_named, ["plan", "write"]);
  const unk = classifyBodyMode({ company_id: CO, plan: true, mode: "plan" }, REGEN_MODE_FLAGS, REGEN_BODY_KEYS);
  assertEquals(unk.ok, false); if (!unk.ok) assertEquals(unk.unknown_keys, ["mode"]);
  // a generator-only mode is an UNKNOWN KEY here, not a mode
  const stage = classifyBodyMode({ company_id: CO, stage: true }, REGEN_MODE_FLAGS, REGEN_BODY_KEYS);
  assertEquals(stage.ok, false); if (!stage.ok) { assertEquals(stage.unknown_keys, ["stage"]); assertEquals(stage.modes_named, []); }
  for (const m of REGEN_MODE_FLAGS) {
    const v = classifyBodyMode({ company_id: CO, run_id: RUN, urls: [U1], [m]: true }, REGEN_MODE_FLAGS, REGEN_BODY_KEYS);
    assertEquals(v.ok, true, m); if (v.ok) assertEquals(v.mode, m);
  }
});

Deno.test("{} is refused 400 with guard body_mode_unnamed, keys named, nothing read, nothing written, no transport", async () => {
  const db = fakeDb(seed()); const { d, constructions } = deps(db);
  const r = await runOutsideRegen({}, d);
  assertEquals(r.status, 400);
  assertEquals(r.body.guard, "body_mode_unnamed");
  assertEquals(r.body.keys_sent, []); assertEquals(r.body.modes_named, []);
  assertEquals(r.body.audit, { ledgered: false }, "no company named ⇒ nothing to ledger to");
  assertEquals(db.inserts, {}); assertEquals(constructions(), 0);
  // a non-object body is the empty body
  assertEquals((await runOutsideRegen("nope", d)).body.guard, "body_mode_unnamed");
});

Deno.test("two modes / unknown key with a company ⇒ 400 AND an integrity refusal row naming the keys; run_id missing ⇒ 400 ledgered with the mode", async () => {
  const db = fakeDb(seed()); const { d, constructions } = deps(db);
  const two = await runOutsideRegen({ company_id: CO, run_id: RUN, plan: true, write: true }, d);
  assertEquals(two.status, 400); assertEquals(two.body.modes_named, ["plan", "write"]); assertEquals(two.body.audit, { ledgered: true });
  const unk = await runOutsideRegen({ company_id: CO, run_id: RUN, plan: true, mode: "plan" }, d);
  assertEquals(unk.status, 400); assertEquals((unk.body as { keys_sent: string[] }).keys_sent, ["company_id", "mode", "plan", "run_id"]);
  const noRun = await runOutsideRegen({ company_id: CO, plan: true }, d);
  assertEquals(noRun.status, 400); assert(/run_id is required/.test(String(noRun.body.error)));
  const rows = db.inserts.integrity_runs ?? [];
  assertEquals(rows.length, 3);
  const ex0 = rows[0].excluded_by_rule as Record<string, unknown>;
  assertEquals(ex0.guard, "body_mode_unnamed"); assertEquals(ex0.modes_named, ["plan", "write"]); assertEquals(ex0.keys_known, [...REGEN_BODY_KEYS].sort());
  assertEquals((rows[1].excluded_by_rule as Record<string, unknown>).unknown_keys, ["mode"]);
  assertEquals((rows[2].excluded_by_rule as Record<string, unknown>).refused, "run_id_required");
  assertEquals((rows[2].excluded_by_rule as Record<string, unknown>).mode, "plan");
  assertEquals(db.inserts.signals, undefined); assertEquals(constructions(), 0);
  // a refusal row that cannot be written stays a 400 and says so
  const broken = fakeDb(seed()); broken.from = ((t: string) => t === "integrity_runs" ? { insert: () => Promise.resolve({ error: { message: "fk" } }) } : fakeDb(seed()).from(t)) as typeof broken.from;
  const r = await runOutsideRegen({ company_id: "unknown-co", plan: true, write: true }, { ...d, supabase: broken });
  assertEquals(r.status, 400); assertEquals((r.body.audit as { ledgered: boolean }).ledgered, false);
});

Deno.test("PLAN: one row per URL with snapshot, cap, b2-blanked ids, estimate and review-gate state — zero writes, zero model calls, transport never built", async () => {
  const db = fakeDb(seed()); const { d, ledgerRows, constructions } = deps(db);
  const r = await runOutsideRegen({ company_id: CO, run_id: RUN, plan: true }, d);
  assertEquals(r.status, 200);
  assertEquals(r.body.mode, "plan"); assertEquals(r.body.model_calls, 0); assertEquals(r.body.writes, 0);
  assertEquals(constructions(), 0, "transport constructions on plan"); assertEquals(ledgerRows.length, 0);
  assertEquals(db.inserts, {}, "a plan inserts nothing — no signal, no integrity row");
  const rows = r.body.rows as Array<Record<string, unknown>>;
  assertEquals(rows.map((x) => x.url), [U1, U2, U3], "the walled URL (empty sha) is not a basis; the older U1 snapshot is not a second row");
  assertEquals(rows.map((x) => (x.review as { state: string }).state), ["approved", "rejected", "no_review_row"]);
  assert(/approve/.test((rows[0].review as { reason: string }).reason));
  assert(/another run|no outside_recrawl_review row/.test((rows[2].review as { reason: string }).reason));
  assertEquals(rows[0].snapshot_id, "snap-1"); assertEquals(rows[0].chars, P1.length); assertEquals(rows[0].at_cap, false);
  assertEquals(rows[0].blanked_signal_ids, ["sig-b1"], "only the live b2-blanked row; the kept row and the superseded row are not listed");
  assertEquals(rows[1].blanked_signal_ids, []);
  assertEquals(rows[0].est_input_tokens, CALLS_PER_URL * (Math.ceil(P1.length / 4) + EST_PROMPT_OVERHEAD_TOKENS));
  assertEquals(r.body.review, { approved: 1, rejected: 1, undecided: 0, no_review_row: 1 });
  assertEquals(r.body.would_run, 1);
  const est = r.body.estimate as Record<string, number>;
  assertEquals(est.calls, 6); assertEquals(est.calls_if_approved_only, 2);
  assert(est.est_usd > 0);
  // the urls filter narrows the plan
  const one = await runOutsideRegen({ company_id: CO, run_id: RUN, plan: true, urls: [U2] }, d);
  assertEquals((one.body.rows as unknown[]).length, 1);
  // at-cap is a measured fact
  assertEquals(estimateUrl(SNAPSHOT_CAP_CHARS).est_input_tokens, CALLS_PER_URL * (3000 + EST_PROMPT_OVERHEAD_TOKENS));
});

Deno.test("frozen company ⇒ 403; unknown company ⇒ 404; neither builds a transport", async () => {
  const db = fakeDb(seed()); const { d, constructions } = deps(db);
  assertEquals((await runOutsideRegen({ company_id: "frozen-co", run_id: RUN, write: true }, d)).status, 403);
  assertEquals((await runOutsideRegen({ company_id: "nobody", run_id: RUN, plan: true }, d)).status, 404);
  assertEquals(constructions(), 0);
});

Deno.test("WRITE: only approved URLs run; one transport; two ledger rows per page; admitted rows minted; the integrity row carries mode and tally", async () => {
  const db = fakeDb(seed());
  const transport: RegenTransport = ({ system }) =>
    Promise.resolve(system === "GEN"
      ? { content: JSON.stringify({ statements: [CAND, "Navigation Home About"] }), usage: { prompt_tokens: 100, completion_tokens: 20 } }
      : { content: JSON.stringify({ verdicts: [{ quote: CAND, keep: true }, { quote: "Navigation Home About", keep: false }] }), usage: { prompt_tokens: 120, completion_tokens: 30 } });
  const { d, ledgerRows, constructions } = deps(db, transport);
  const r = await runOutsideRegen({ company_id: CO, run_id: RUN, write: true }, d);
  assertEquals(r.status, 200, JSON.stringify(r.body));
  assertEquals(r.body.mode, "write");
  assertEquals(constructions(), 1);
  assertEquals(r.body.urls_total, 1, "U2 rejected and U3 without a review row never run");
  assertEquals((r.body.review_refused as Array<{ url: string; reason: string }>).map((x) => `${x.url}:${x.reason}`), [`${U2}:rejected`, `${U3}:no_review_row`]);
  assertEquals(ledgerRows.map((e) => e.role), ["generator", "judge"]);
  const tally = r.body.model_calls as Record<string, number>;
  assertEquals(tally.generator, 1); assertEquals(tally.judge, 1); assertEquals(tally.ledger_failed, 0); assert(tally.usd > 0);
  const page = (r.body.pages as Array<Record<string, unknown>>)[0];
  assertEquals(page.admitted, 1, JSON.stringify(page));
  const minted = db.inserts.signals ?? [];
  assertEquals(minted.length, 1);
  assertEquals(minted[0].evidence_excerpt, minted[0].claim_text);
  assert(P1.includes(String(minted[0].evidence_excerpt)), "the minted excerpt is byte-present in its snapshot");
  assertEquals(minted[0].source_type, "outside_recrawl_regen"); assertEquals(minted[0].source_title, "Reviews");
  const integ = (db.inserts.integrity_runs ?? [])[0];
  assertEquals(integ.component, "r3_outside_regen"); assertEquals(integ.status, "completed");
  const ex = integ.excluded_by_rule as Record<string, unknown>;
  assertEquals(ex.mode, "write"); assertEquals(ex.pages, 1);
  assertEquals((ex.model_calls as Record<string, number>).generator, 1); assertEquals((ex.model_calls as Record<string, number>).judge, 1);
});

// ── R17: the voice class comes from the one authority; an unjudged gated row is refused ──────────────────────
export const RUN2 = "22222222-2222-4222-8222-222222222222";
export function seedR17(): Record<string, Row[]> {
  const s = seed();
  s.outside_page_snapshots.push(
    { id: "snap-own", company_id: CO, source_url: UOWN, signal_id: null, clean_text: POWN, text_sha256: "sha-own", crawled_at: "2026-09-14T00:00:00Z", fetch_status: "ok" },
    { id: "snap-gated", company_id: CO, source_url: UGATED, signal_id: null, clean_text: PGATED, text_sha256: "sha-gated", crawled_at: "2026-09-14T00:00:00Z", fetch_status: "ok" },
  );
  s.outside_recrawl_review.push(
    { company_id: CO, run_id: RUN2, source_url: UOWN, operator_decision: "approve" },
    { company_id: CO, run_id: RUN2, source_url: UGATED, operator_decision: "approve" },
    { company_id: CO, run_id: RUN2, source_url: U1, operator_decision: "approve" },
  );
  return s;
}
const CAND_OWN = "Acme Coffee wholesale: we roast every bean in Burbank and supply 40 cafes across Los Angeles.";
const CAND_GATED = "Acme Coffee is a specialty roaster supplying 40 cafes across Los Angeles since 2011.";
export function r17Transport(): RegenTransport {
  return ({ system, user }) => {
    const cand = user.includes(POWN) ? CAND_OWN : user.includes(PGATED) ? CAND_GATED : CAND;
    return Promise.resolve(system === "GEN"
      ? { content: JSON.stringify({ statements: [cand] }), usage: { prompt_tokens: 100, completion_tokens: 20 } }
      : { content: JSON.stringify({ verdicts: [{ quote: cand, keep: true }] }), usage: { prompt_tokens: 120, completion_tokens: 30 } });
  };
}

Deno.test("R17 PLAN reports per URL the class the authority would give: own domain client_voice, gated ⇒ judge decides with a refusal on plan, third party outside", async () => {
  const db = fakeDb(seedR17()); const { d } = deps(db);
  const r = await runOutsideRegen({ company_id: CO, run_id: RUN2, plan: true, urls: [UOWN, UGATED, U1] }, d);
  assertEquals(r.status, 200);
  const byUrl = new Map((r.body.rows as Array<Record<string, unknown>>).map((x) => [x.url, x.voice as Record<string, unknown>]));
  assertEquals(byUrl.get(UOWN), { class: "client_voice", authority: "own_domain", refusal: null });
  assertEquals((byUrl.get(UGATED) as { authority: string }).authority, "authorship_judge");
  assert(/refused, not minted/.test(String((byUrl.get(UGATED) as { refusal: string }).refusal)));
  assertEquals(byUrl.get(U1), { class: "outside_voice_about_client", authority: "extractor_label", refusal: null });
  assertEquals(db.inserts, {});
});

Deno.test("R17 WRITE: own domain mints client_voice; a gated URL with NO judge is REFUSED (recorded, nothing minted); a third party mints outside; raw_payload carries the authority", async () => {
  const db = fakeDb(seedR17()); const { d } = deps(db, r17Transport(), null);
  const r = await runOutsideRegen({ company_id: CO, run_id: RUN2, write: true, urls: [UOWN, UGATED, U1] }, d);
  assertEquals(r.status, 200, JSON.stringify(r.body));
  const minted = (db.inserts.signals ?? []) as Array<Record<string, unknown>>;
  const byUrl = new Map(minted.map((m) => [m.source_url, m]));
  assertEquals(minted.length, 2, JSON.stringify(r.body.pages));
  assertEquals(byUrl.get(UOWN)?.voice_class, "client_voice");
  assertEquals((byUrl.get(UOWN)?.raw_payload as { voice_authority: { authority: string } }).voice_authority.authority, "own_domain");
  assertEquals(byUrl.get(U1)?.voice_class, "outside_voice_about_client");
  assertEquals(byUrl.has(UGATED), false, "the unjudged gated excerpt is not minted");
  const voice = r.body.voice as { policy: string; judge_wired: boolean; refused_total: number; refusals: Array<{ url: string; reason: string; excerpts: number }> };
  assertEquals(voice.policy, "refuse_mint"); assertEquals(voice.judge_wired, false); assertEquals(voice.refused_total, 1);
  assertEquals(voice.refusals[0].url, UGATED); assert(/no judge is wired/.test(voice.refusals[0].reason));
  const page = (r.body.pages as Array<Record<string, unknown>>).find((p) => p.url === UGATED)!;
  assert((page.rejected as Array<{ reason: string }>).some((x) => x.reason.startsWith("voice_refused:")));
  const integ = (db.inserts.integrity_runs ?? [])[0].excluded_by_rule as Record<string, unknown>;
  assertEquals(integ.voice_refused_total, 1); assertEquals(integ.judge_wired, false); assertEquals(integ.voice_policy, "refuse_mint");
});

Deno.test("R17 WRITE with a judge: subject_company on the gated URL mints client_voice with the stamp; judge_failed refuses", async () => {
  const subject: RegenJudge = () => Promise.resolve({ verdict: "subject_company", entity: null, reason: "company-supplied description", model: "fake" });
  const db = fakeDb(seedR17()); const { d } = deps(db, r17Transport(), subject);
  const r = await runOutsideRegen({ company_id: CO, run_id: RUN2, write: true, urls: [UGATED] }, d);
  const minted = (db.inserts.signals ?? []) as Array<Record<string, unknown>>;
  assertEquals(minted.length, 1, JSON.stringify(r.body.pages));
  assertEquals(minted[0].voice_class, "client_voice");
  const rp = minted[0].raw_payload as { voice_authority: { authority: string }; authorship_judge: { verdict: string; applied: string } };
  assertEquals(rp.voice_authority.authority, "authorship_judge"); assertEquals(rp.authorship_judge.applied, "client_voice");
  const failed: RegenJudge = () => Promise.resolve({ verdict: "judge_failed", entity: null, reason: "timeout", model: "fake" });
  const db2 = fakeDb(seedR17()); const { d: d2 } = deps(db2, r17Transport(), failed);
  const r2 = await runOutsideRegen({ company_id: CO, run_id: RUN2, write: true, urls: [UGATED] }, d2);
  assertEquals((db2.inserts.signals ?? []).length, 0);
  assertEquals((r2.body.voice as { refused_total: number }).refused_total, 1);
  assert(/judge failed: timeout/.test((r2.body.voice as { refusals: Array<{ reason: string }> }).refusals[0].reason));
});

// ── R22: the client is always named; anchors add; both absent refuses ──────────────────────────────────────
Deno.test("R22 PLAN reports the anchor set used (name, host, then entity anchors); WRITE records it on the integrity row and passes it to both prompts", async () => {
  const db = fakeDb(seedR17());
  db.tables.companies[0].entity_anchors_json = ["Acme Coffee", "acmecoffee.com", "Acme Roasters"]; // name and host repeated: deduped
  const seen: string[][] = [];
  const { d } = deps(db, r17Transport(), null);
  d.genSystem = (a) => { seen.push([...a]); return "GEN"; };
  d.judgeSystem = (a) => { seen.push([...a]); return "JUDGE"; };
  const plan = await runOutsideRegen({ company_id: CO, run_id: RUN2, plan: true, urls: [U1] }, d);
  assertEquals(plan.body.anchors_used, ["Acme Coffee", "acmecoffee.com", "Acme Roasters"]);
  assertEquals(plan.body.anchors_from_entity, 1);
  const w = await runOutsideRegen({ company_id: CO, run_id: RUN2, write: true, urls: [U1] }, d);
  assertEquals(w.status, 200);
  assertEquals(w.body.anchors_used, ["Acme Coffee", "acmecoffee.com", "Acme Roasters"]);
  assert(seen.length >= 2 && seen.every((a) => a[0] === "Acme Coffee" && a[1] === "acmecoffee.com"), "both prompts received the anchor set");
  const integ = (db.inserts.integrity_runs ?? [])[0].excluded_by_rule as Record<string, unknown>;
  assertEquals(integ.anchors_used, ["Acme Coffee", "acmecoffee.com", "Acme Roasters"]);
});

Deno.test("R22: a company with neither name nor website host is REFUSED (client_unnamed), ledgered, no transport, even with entity anchors", async () => {
  const db = fakeDb(seedR17()); const { d, constructions } = deps(db, r17Transport(), null);
  const r = await runOutsideRegen({ company_id: "nameless-co", run_id: RUN2, write: true }, d);
  assertEquals(r.status, 400); assertEquals(r.body.guard, "client_unnamed");
  assertEquals(constructions(), 0);
  const integ = (db.inserts.integrity_runs ?? [])[0];
  assertEquals((integ.excluded_by_rule as Record<string, unknown>).refused, "client_unnamed");
  assertEquals(db.inserts.signals, undefined);
});

// ── R27: the copying rule's recording — every candidate stored with reasons; an e4 refusal names its nearest span ──
export const P27 = "Insights\n🟡 This company has maintained an active DOT status for 1 year but had no inspections .\n2025\n9 changes\nAcme Coffee roasts every bean in Burbank.";
export const EXACT27 = "This company has maintained an active DOT status for 1 year but had no inspections";
export const PARA27 = "The company has maintained an active DOT status for 1 year but had no inspections";
export function r27Transport(): RegenTransport {
  return ({ system }) => Promise.resolve(system === "GEN"
    ? { content: JSON.stringify({ statements: [{ text: EXACT27, reason: "the source rates the company's DOT record" }, { text: PARA27, reason: "same sentence, restated" }] }), usage: { prompt_tokens: 100, completion_tokens: 40 } }
    : { content: JSON.stringify({ verdicts: [{ quote: EXACT27, keep: true, reason: "about the business" }, { quote: PARA27, keep: true, reason: "about the business too" }] }), usage: { prompt_tokens: 120, completion_tokens: 30 } });
}
export function seedR27(): Record<string, Row[]> {
  const s = seedR17();
  for (const r of s.outside_page_snapshots) if (r.source_url === U1) { r.clean_text = P27; r.text_sha256 = "sha-27"; }
  return s;
}

Deno.test("R27 WRITE: one exact span and one paraphrase → admitted 1, e4_not_verbatim 1; both candidates stored in full on the integrity row with generator and judge reasons; the paraphrase names its nearest page span with offset; the minted row's raw_payload carries both reasons", async () => {
  const db = fakeDb(seedR27()); const { d } = deps(db, r27Transport(), null);
  const r = await runOutsideRegen({ company_id: CO, run_id: RUN2, write: true, urls: [U1] }, d);
  assertEquals(r.status, 200, JSON.stringify(r.body));
  const page = (r.body.pages as Array<Record<string, unknown>>)[0];
  assertEquals(page.candidates, 2, "the count keeps its key"); assertEquals((page.candidate_records as unknown[]).length, 2); assertEquals(page.admitted, 1);
  const integ = (db.inserts.integrity_runs ?? [])[0].excluded_by_rule as { candidates: Array<Record<string, unknown>>; reject_reasons: Record<string, number> };
  assertEquals(integ.reject_reasons, { e4_not_verbatim: 1 });
  assertEquals(integ.candidates.length, 2, "both candidates stored");
  const [a, b] = integ.candidates;
  assertEquals(a, { url: U1, text: EXACT27, code: "admitted", generator_reason: "the source rates the company's DOT record", judge_reason: "about the business", nearest_span: null });
  assertEquals(b.code, "e4_not_verbatim"); assertEquals(b.text, PARA27, "stored in full, no 80-char prefix");
  assertEquals(b.generator_reason, "same sentence, restated"); assertEquals(b.judge_reason, "about the business too");
  const ns = b.nearest_span as { text: string; offset: number; length: number };
  assertEquals(ns.text, "company has maintained an active DOT status for 1 year but had no inspections");
  assertEquals(P27.slice(ns.offset, ns.offset + ns.length), ns.text, "the offset indexes the raw page");
  const minted = (db.inserts.signals ?? []) as Array<{ evidence_excerpt: string; raw_payload: Record<string, unknown> }>;
  assertEquals(minted.length, 1); assertEquals(minted[0].evidence_excerpt, EXACT27);
  assertEquals(minted[0].raw_payload.generator_reason, "the source rates the company's DOT record");
  assertEquals(minted[0].raw_payload.judge_reason, "about the business");
});

Deno.test("R27: a judge reject and a bare-string statement (pre-R27 shape) are both recorded; the string carries no generator reason", async () => {
  const db = fakeDb(seedR27());
  const t: RegenTransport = ({ system }) => Promise.resolve(system === "GEN"
    ? { content: JSON.stringify({ statements: [EXACT27, { text: "9 changes", reason: "a count" }] }), usage: { prompt_tokens: 1, completion_tokens: 1 } }
    : { content: JSON.stringify({ verdicts: [{ quote: EXACT27, keep: true, reason: "kept" }, { quote: "9 changes", keep: false, reason: "a bare number, not about the business" }] }), usage: { prompt_tokens: 1, completion_tokens: 1 } });
  const { d } = deps(db, t, null);
  const r = await runOutsideRegen({ company_id: CO, run_id: RUN2, write: true, urls: [U1] }, d);
  assertEquals(r.status, 200);
  const integ = (db.inserts.integrity_runs ?? [])[0].excluded_by_rule as { candidates: Array<Record<string, unknown>> };
  assertEquals(integ.candidates.map((c) => [c.code, c.generator_reason, c.judge_reason]), [["admitted", null, "kept"], ["judge_reject", "a count", "a bare number, not about the business"]]);
});

// ── R28: the regen handler names the first_person gate; a first-person candidate on a gated profile URL mints client_voice with no judge call ──
export const TAGLINE28 = "We help people and businesses thrive with the power of AI.";
Deno.test("R28 WRITE: on the judge-gated crunchbase URL a first-person candidate mints client_voice by rule (authority first_person_self_description, rule stamped in raw_payload) and the judge is NOT called; the handler names REGEN_TEXT_GATES", async () => {
  const db = fakeDb(seedR17());
  for (const r of db.tables.outside_page_snapshots) if (r.source_url === UGATED) r.clean_text = `Acme Coffee profile. ${TAGLINE28} Founded 2011.`;
  let judgeCalls = 0;
  const judge: RegenJudge = () => { judgeCalls++; return Promise.resolve({ verdict: "third_party", entity: null, reason: "platform", model: "m" }); };
  const t: RegenTransport = ({ system }) => Promise.resolve(system === "GEN"
    ? { content: JSON.stringify({ statements: [{ text: TAGLINE28, reason: "describes the offering" }] }), usage: { prompt_tokens: 1, completion_tokens: 1 } }
    : { content: JSON.stringify({ verdicts: [{ quote: TAGLINE28, keep: true, reason: "about the business" }] }), usage: { prompt_tokens: 1, completion_tokens: 1 } });
  const { d } = deps(db, t, judge);
  const r = await runOutsideRegen({ company_id: CO, run_id: RUN2, write: true, urls: [UGATED] }, d);
  assertEquals(r.status, 200, JSON.stringify(r.body));
  const minted = (db.inserts.signals ?? []) as Array<{ voice_class: string; raw_payload: { voice_authority: Record<string, unknown> } }>;
  assertEquals(minted.length, 1); assertEquals(minted[0].voice_class, "client_voice");
  assertEquals(minted[0].raw_payload.voice_authority.authority, "first_person_self_description");
  assertEquals(minted[0].raw_payload.voice_authority.rule, "first_person");
  assertEquals(judgeCalls, 0, "the authorship judge was never called for the first-person candidate");
  assertEquals([...REGEN_TEXT_GATES], ["first_person"]);
});
