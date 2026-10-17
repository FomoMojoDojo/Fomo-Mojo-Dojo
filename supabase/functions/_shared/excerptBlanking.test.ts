// Backfill act b2 (operator ruling 2026-10-16) — plan / apply / revert against a fake store.
import { assert, assertEquals, assertRejects } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  BLANKING_APPLY_FLAG, BlankingRefusedError, applyExcerptBlanking, blankingStamp, planDiff, planExcerptBlanking,
  revertExcerptBlanking, verbatimOn, type BlankingAuditRow, type BlankingSignal, type BlankingSnapshot, type BlankingStore,
} from "./excerptBlanking.ts";

const CO = "00000000-0000-4000-8000-00000000b2c0";
const FROZEN = "58b2b15b-bada-4bcd-9c12-b7e66a37d0bc"; // CB1, in FROZEN_COMPANY_IDS
const PAGE = "About us. The roastery opened in 2011 on Magnolia Boulevard and roasts every bean in Burbank, three days a week.";

function sig(over: Partial<BlankingSignal> & { id: string }): BlankingSignal {
  return { company_id: CO, source_url: "https://crawl.test/about", voice_class: "outside_voice_about_client", claim_text: "x", evidence_excerpt: "x", quote_source_text: null, raw_payload: {}, ...over };
}

class FakeStore implements BlankingStore {
  companies = [{ id: CO, name: "Throwaway", frozen: false }, { id: FROZEN, name: "Cafe Barra", frozen: true }];
  signals: BlankingSignal[] = [];
  snapshots: BlankingSnapshot[] = [];
  audit: Array<BlankingAuditRow & Record<string, unknown>> = [];
  log: string[] = [];
  loadCompanies() { return Promise.resolve(this.companies); }
  loadCandidateSignals(ids: string[]) { return Promise.resolve(this.signals.filter((s) => ids.includes(s.company_id) && String(s.evidence_excerpt ?? "").trim() && s.source_url)); }
  loadSnapshots(pairs: Array<{ company_id: string; source_url: string }>) { const w = new Set(pairs.map((p) => `${p.company_id}|${p.source_url}`)); return Promise.resolve(this.snapshots.filter((s) => w.has(`${s.company_id}|${s.source_url}`))); }
  loadSignalsById(ids: string[]) { return Promise.resolve(this.signals.filter((s) => ids.includes(s.id))); }
  insertAudit(row: Omit<BlankingAuditRow, "id" | "reverted_at">) { const id = `audit-${this.audit.length + 1}`; this.audit.push({ ...row, id, reverted_at: null } as BlankingAuditRow); this.log.push(`audit:${row.signal_id}`); return Promise.resolve(id); }
  writeSignal(id: string, patch: { evidence_excerpt: string; raw_payload: Record<string, unknown> }) { const s = this.signals.find((x) => x.id === id)!; s.evidence_excerpt = patch.evidence_excerpt; s.raw_payload = patch.raw_payload; this.log.push(`write:${id}`); return Promise.resolve(); }
  loadAudit(runRef: string) { return Promise.resolve(this.audit.filter((a) => a.run_ref === runRef)); }
  markReverted(auditId: string) { const a = this.audit.find((x) => x.id === auditId)!; a.reverted_at = "now"; return Promise.resolve(); }
}

function seeded(): FakeStore {
  const st = new FakeStore();
  st.snapshots = [
    { company_id: CO, source_url: "https://crawl.test/about", clean_text: PAGE, text_sha256: "sha-old", crawled_at: "2026-08-26T00:00:00Z" },
    { company_id: CO, source_url: "https://crawl.test/about", clean_text: PAGE + " Updated.", text_sha256: "sha-new", crawled_at: "2026-09-14T00:00:00Z" },
    { company_id: CO, source_url: "https://widget.test/p", clean_text: '{"bg_color":"#001936"}', text_sha256: "sha-widget", crawled_at: "2026-09-14T00:00:00Z" },
  ];
  st.signals = [
    sig({ id: "verbatim-1", claim_text: "roasts every bean in Burbank", evidence_excerpt: "roasts every bean in Burbank" }),                         // verified by snapshot
    sig({ id: "para-1", claim_text: "the roastery roasts in Burbank thrice weekly", evidence_excerpt: "the roastery roasts in Burbank thrice weekly" }), // blanked
    sig({ id: "para-guarded", evidence_excerpt: "an older summary", claim_text: "an older summary", raw_payload: { excerpt_guard: { basis: "none", guard_version: 1 }, keep: 1 } }), // blanked, old guard restored on revert
    sig({ id: "qst-1", claim_text: "Updated by the roastery", evidence_excerpt: "Updated by the roastery", quote_source_text: "Mint page: Updated by the roastery at dawn." }), // verified by quote_source_text
    sig({ id: "analysis-1", voice_class: "analysis", claim_text: "Our read: wholesale emphasis.", evidence_excerpt: "Our read: wholesale emphasis." }),                 // stamped_only
    sig({ id: "nosnap-1", source_url: "https://nosnap.test/x", claim_text: "no page", evidence_excerpt: "no page" }),                                 // b4's, never planned
    sig({ id: "widget-1", source_url: "https://widget.test/p", claim_text: "4/4 Star rating", evidence_excerpt: "4/4 Star rating" }),                   // blanked: the widget JSON is not the words
    sig({ id: "frozen-1", company_id: FROZEN, claim_text: "cb1", evidence_excerpt: "cb1" }),                                                           // frozen, skipped
  ];
  return st;
}

Deno.test("plan — verified rows (snapshot, quote_source_text) and no-snapshot rows are never planned; a paraphrase is blanked; an analysis row is stamped only; the newest snapshot names the basis", async () => {
  const st = seeded();
  const plan = await planExcerptBlanking(st);
  assertEquals(plan.rows.map((r) => [r.signal_id, r.action]).sort(), [["analysis-1", "stamped_only"], ["para-1", "blanked"], ["para-guarded", "blanked"], ["widget-1", "blanked"]]);
  assertEquals({ scanned: plan.scanned, snap: plan.verified_by_snapshot, qst: plan.verified_by_quote_source_text, nosnap: plan.no_snapshot, frozen: plan.skipped_frozen }, { scanned: 7, snap: 1, qst: 1, nosnap: 1, frozen: [FROZEN] });
  const p1 = plan.rows.find((r) => r.signal_id === "para-1")!;
  assertEquals([p1.basis_sha, p1.basis_at, p1.snapshots_tested], ["sha-new", "2026-09-14T00:00:00Z", 2]);
  assertEquals(plan.per_company, [{ company_id: CO, company_name: "Throwaway", blanked: 3, stamped_only: 1, urls: 2 }]);
  assert(verbatimOn("ROASTS   every bean", PAGE) && !verbatimOn("roasts no bean", PAGE));
});

Deno.test("plan — an explicit frozen company is refused before any read of its rows", async () => {
  const st = seeded();
  await assertRejects(() => planExcerptBlanking(st, { companyId: FROZEN }), BlankingRefusedError, "frozen");
});

Deno.test("apply — refuses: no plan; not confirmed with the flag named in source; a frozen row; a plan that differs from a re-plan by id or action. Nothing written on refusal", async () => {
  const st = seeded();
  const plan = (await planExcerptBlanking(st)).rows;
  await assertRejects(() => applyExcerptBlanking(st, { plan: [], confirm: BLANKING_APPLY_FLAG }), BlankingRefusedError, "REVIEWED plan");
  await assertRejects(() => applyExcerptBlanking(st, { plan, confirm: "apply" }), BlankingRefusedError, "BLANKING_APPLY_FLAG");
  const withFrozen = [...plan, { ...plan[0], signal_id: "frozen-1", company_id: FROZEN }];
  const e = await assertRejects(() => applyExcerptBlanking(st, { plan: withFrozen, confirm: BLANKING_APPLY_FLAG }), BlankingRefusedError);
  assertEquals((e as BlankingRefusedError).code, "frozen_company");
  const struck = plan.slice(1);                                          // the operator struck a row: not the reviewed plan any more
  const e2 = await assertRejects(() => applyExcerptBlanking(st, { plan: struck, confirm: BLANKING_APPLY_FLAG }), BlankingRefusedError);
  assertEquals((e2 as BlankingRefusedError).code, "plan_drift");
  const flipped = plan.map((r) => r.signal_id === "analysis-1" ? { ...r, action: "blanked" as const } : r);
  const e3 = await assertRejects(() => applyExcerptBlanking(st, { plan: flipped, confirm: BLANKING_APPLY_FLAG }), BlankingRefusedError);
  assertEquals((e3 as BlankingRefusedError).code, "plan_drift");
  assertEquals(st.audit.length, 0);
  assertEquals(st.log, []);
});

Deno.test("apply — audit row BEFORE each signal write; blanked rows lose the excerpt and keep claim_text; the analysis row keeps its text; a drifted row is skipped; revert restores every row and marks the audit", async () => {
  const st = seeded();
  const plan = (await planExcerptBlanking(st)).rows;
  const before = new Map(st.signals.map((s) => [s.id, structuredClone({ e: s.evidence_excerpt, c: s.claim_text, rp: s.raw_payload })]));
  st.signals.find((s) => s.id === "widget-1")!.evidence_excerpt = "4/4 Star rating — edited after the plan"; // drift
  const out = await applyExcerptBlanking(st, { plan, confirm: BLANKING_APPLY_FLAG, runRef: "run-b2", now: () => "2026-10-16T20:00:00Z" });
  assertEquals({ b: out.blanked, s: out.stamped_only, a: out.audit_rows, skipped: out.skipped.map((x) => x.signal_id) }, { b: 2, s: 1, a: 3, skipped: ["widget-1"] });
  // ordering: every write is preceded by its own audit entry
  for (let i = 0; i < st.log.length; i += 2) { assertEquals(st.log[i].startsWith("audit:"), true); assertEquals(st.log[i + 1], st.log[i].replace("audit:", "write:")); }
  const para = st.signals.find((s) => s.id === "para-1")!;
  assertEquals(para.evidence_excerpt, "");
  assertEquals(para.claim_text, "the roastery roasts in Burbank thrice weekly");
  assertEquals(para.raw_payload!.excerpt_guard, blankingStamp({ row: plan.find((r) => r.signal_id === "para-1")!, excerpt: "the roastery roasts in Burbank thrice weekly", runRef: "run-b2", at: "2026-10-16T20:00:00Z" }));
  assertEquals((para.raw_payload!.excerpt_guard as Record<string, unknown>).reason, "not_on_retained_page");
  assertEquals((para.raw_payload!.excerpt_guard as Record<string, unknown>).unverified_excerpt, "the roastery roasts in Burbank thrice weekly");
  const an = st.signals.find((s) => s.id === "analysis-1")!;
  assertEquals(an.evidence_excerpt, "Our read: wholesale emphasis.", "the carve-out keeps an analysis row's text");
  assertEquals((an.raw_payload!.excerpt_guard as Record<string, unknown>).analysis_carve_out, true);
  assertEquals("unverified_excerpt" in (an.raw_payload!.excerpt_guard as Record<string, unknown>), false);
  const guarded = st.audit.find((a) => a.signal_id === "para-guarded")!;
  assertEquals(guarded.old_excerpt_guard, { basis: "none", guard_version: 1 });
  // revert
  const rv = await revertExcerptBlanking(st, { runRef: "run-b2", now: () => "2026-10-16T21:00:00Z" });
  assertEquals({ reverted: rv.reverted, skipped: rv.skipped }, { reverted: 3, skipped: [] });
  for (const id of ["para-1", "para-guarded", "analysis-1"]) {
    const s = st.signals.find((x) => x.id === id)!;
    const { excerpt_blanking_reverted, ...rp } = s.raw_payload as Record<string, unknown>;
    assertEquals({ e: s.evidence_excerpt, c: s.claim_text, rp }, before.get(id), `${id} restored (but for the reverted note)`);
    assertEquals(excerpt_blanking_reverted, { run_ref: "run-b2", at: "2026-10-16T21:00:00Z" });
  }
  assert(st.audit.filter((a) => a.run_ref === "run-b2").every((a) => a.reverted_at), "every audit row of the run is marked reverted");
  // a second revert finds nothing to do
  assertEquals((await revertExcerptBlanking(st, { runRef: "run-b2" })).reverted, 0);
});

Deno.test("planDiff — same plan ⇒ empty; a struck row, an added row and a flipped action each show", () => {
  const a = [{ signal_id: "1", action: "blanked" }, { signal_id: "2", action: "stamped_only" }] as never;
  const b = [{ signal_id: "2", action: "blanked" }, { signal_id: "3", action: "blanked" }] as never;
  assertEquals(planDiff(a, a), { missing_in_fresh: [], new_in_fresh: [], action_changed: [] });
  assertEquals(planDiff(a, b), { missing_in_fresh: ["1"], new_in_fresh: ["3"], action_changed: ["2"] });
});
