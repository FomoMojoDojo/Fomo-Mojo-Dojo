// A2B-3 — MANUAL-PRESERVATION TRIPWIRE.
//
// Guards the one thread protecting the rescued row. odi_needs c46f9741
// ("Maximize the clarity of identified mental health challenges") is Edgewood's
// ONLY evidence-backed need — 204 evidence_baseline_signal_ids — and A2B-2
// rehomed it out of the dead a2b set into the LIVE customer declared set. The
// only thing standing between it and a force-regenerate delete is one branch in
// writeDeclaredOpportunities:
//
//     if (manualEdited || !isGenerated) { editedPreserved++; continue; }
//     //   ^ manualEdited = source_path LIKE 'manual_%'
//
// The hash-staleness marker (!isGenerated) structurally CANNOT protect it: the
// row is un-edited, so its stored content_identity equals the recomputed hash of
// its desired_outcome, making isGenerated true. source_path is the whole defence.
//
// If a future change removes or inverts that branch, this file fails and names
// the row. That is its entire job.
//
// ── WHAT "PRESERVE" MEANS AT FIELD LEVEL (established by code read, A2B-3) ────
// "Preserve" means preserved-from-DELETE. It does NOT mean byte-identical.
// writeDeclaredOpportunities has five writes to odi_needs; three can legitimately
// touch a surviving row:
//   • content_identity        — written iff it starts NULL/empty (lazy backfill)
//   • last_confirmed_run_id   — written whenever the row is consumed as a "keep"
//   • odi_canonical_statement — written iff canonical is empty AND ollamaUrl passed
// So we assert byte-identity ONLY on the fields the code actually guarantees, and
// we deliberately do NOT assert whole-row identity. last_confirmed_run_id and
// odi_canonical_statement moving on a preserved row is DESIGN, not a defect —
// asserting them frozen would encode a guarantee this code never made.
//
// Ratified assertion set (A2B-3): survival · byte-identity on guaranteed fields ·
// near-duplicate suppressed in the TRUE direction (the manual row absorbs the
// generated one, never the reverse) · NULL-identity backfill pinned · not-a-no-op.

import { describe, expect, it } from "vitest";
import { writeDeclaredOpportunities, type StepOpportunitiesOutcome } from "../../supabase/functions/_shared/opportunitySynthesis.ts";
import { contentIdentity } from "../../supabase/functions/_shared/contentIdentity.ts";

type Row = Record<string, unknown>;

const CO = "3dd2cfbb-0792-4bf1-9cd4-15db9646874b"; // Edgewood
const USER = "5860c99a-e6f8-4feb-9997-992e3654f181";
const JOURNEY = "customer";
const RUN = "a2b3-tripwire-run";

// The real row this gate exists to protect. Text and identity are pinned to the
// live values so the test is tied to production reality, not a paraphrase.
const MANUAL_ID = "c46f9741-c1cb-431f-8d1f-9f0f632d1b44";
const MANUAL_OUTCOME = "Maximize the clarity of identified mental health challenges";
const MANUAL_IDENTITY = "5601c138f37d55ff6fee337b2e5cbb60948092397369a5712a0c947004f39b3e";
const MANUAL_SOURCE_PATH = "manual_98c42743-8d1e-43a3-a378-d903055c5762";
const MANUAL_STEP_LABEL = "Determine what a successful outcome looks like";
// Stand-in for the 204 live ids — the assertion is that the array is untouched.
const MANUAL_BASELINE_IDS = ["sig-a", "sig-b", "sig-c"];

// ── In-memory supabase fake (mirrors claimDeltaSynthesis.test.ts) ─────────────
// Records every id passed to a DELETE so we can assert the manual row's id never
// appears in one — survival by absence-from-the-delete-set, not just by presence
// in the final table.
function fakeDb(seed: Row[]) {
  const tables: Record<string, Row[]> = { odi_needs: seed.map((r) => ({ ...r })) };
  const deletedIds: string[] = [];
  let nextId = 1;

  const db = {
    tables,
    deletedIds,
    from(table: string) {
      const chain = {
        _filters: [] as Array<(r: Row) => boolean>,
        _mode: "select" as "select" | "update" | "delete",
        _payload: null as Row | null,
        select() { this._mode = "select"; return this; },
        update(payload: Row) { this._mode = "update"; this._payload = payload; return this; },
        delete() { this._mode = "delete"; return this; },
        eq(col: string, v: unknown) { this._filters.push((r: Row) => r[col] === v); return this; },
        in(col: string, vals: unknown[]) { this._filters.push((r: Row) => vals.includes(r[col])); return this; },
        order() { return this; },
        insert(payload: Row) {
          tables[table].push({ id: `inserted-${nextId++}`, ...payload });
          return Promise.resolve({ data: null, error: null });
        },
        then(resolve: (v: { data: Row[] | null; error: null }) => void) {
          const match = (r: Row) => chain._filters.every((f) => f(r));
          if (chain._mode === "select") {
            resolve({ data: tables[table].filter(match), error: null });
            return;
          }
          if (chain._mode === "update") {
            for (const r of tables[table]) if (match(r)) Object.assign(r, chain._payload);
            resolve({ data: null, error: null });
            return;
          }
          for (const r of tables[table]) if (match(r)) deletedIds.push(String(r.id));
          tables[table] = tables[table].filter((r) => !match(r));
          resolve({ data: null, error: null });
        },
      };
      return chain;
    },
  };
  return db;
}

const existingRow = (over: Row): Row => ({
  company_id: CO,
  user_id: USER,
  journey_key: JOURNEY,
  provenance_type: "internal_declared",
  status: "active",
  tier: "need",
  confidence: 0.95,
  importance: 0,
  satisfaction: 0,
  opportunity_score: 0,
  odi_canonical_statement: "canonical placeholder", // non-empty ⇒ canonical backfill skipped
  last_confirmed_run_id: "prior-run",
  ...over,
});

// The manual row under protection — mirrors c46f9741's shape exactly.
const manualRow = (): Row => existingRow({
  id: MANUAL_ID,
  desired_outcome: MANUAL_OUTCOME,
  content_identity: MANUAL_IDENTITY,
  source_path: MANUAL_SOURCE_PATH,
  step_number: 1,
  step_label: MANUAL_STEP_LABEL,
  sort_order: 1,
  evidence_baseline_signal_ids: MANUAL_BASELINE_IDS,
});

// A manual row whose content_identity was never populated (A2B-3 ruling 2).
const MANUAL_NULL_ID = "manual-null-identity";
const MANUAL_NULL_OUTCOME = "Reduce the effort required to coordinate care across providers";
const manualNullIdentityRow = (): Row => existingRow({
  id: MANUAL_NULL_ID,
  desired_outcome: MANUAL_NULL_OUTCOME,
  content_identity: null,
  source_path: "manual_inline",
  step_number: 2,
  step_label: "Identify potential funding sources",
  sort_order: 2,
});

// Generated + STALE hash (row was edited after generation) ⇒ !isGenerated ⇒ preserved.
const GEN_STALE_ID = "generated-stale";
const genStaleRow = (): Row => existingRow({
  id: GEN_STALE_ID,
  desired_outcome: "Minimize the time it takes to gather supporting documents",
  content_identity: "0".repeat(64), // 64 chars but not the real hash ⇒ stale
  source_path: "internal_declared",
  step_number: 3,
  step_label: "Prepare necessary application documentation",
  sort_order: 3,
});

// Generated + CURRENT hash, not re-confirmed by the fresh roll ⇒ deleted.
const GEN_CURRENT_ID = "generated-current-unconfirmed";
const GEN_CURRENT_OUTCOME = "Increase the accuracy of eligibility screening";

const step = (n: number, label: string, outcomes: string[]): StepOpportunitiesOutcome => ({
  step_id: `step-${n}`,
  step_number: n,
  step_label: label,
  journey_key: JOURNEY,
  generated: [],
  rejectedWeak: [],
  rejectedOrgNamed: [],
  kept: outcomes.map((outcome) => ({ outcome, odi_canonical_statement: null, band: "High" })) as never,
});

// Jaccard vs MANUAL_OUTCOME: distinctive tokens {maximize, clarity, identified,
// mental, health, challenges} (stop-words "the"/"of" dropped). Adding one token
// gives 6/7 = 0.857 ≥ JACCARD_THRESHOLD (0.80), so Stage 2 matches it to the
// manual row — while the differing text keeps Stage 1 (exact identity) from firing.
const NEAR_DUPLICATE = "Maximize the clarity of identified mental health challenges quickly";
const GENUINELY_NEW = "Increase the share of families who receive timely referrals";

async function seedAll(): Promise<Row[]> {
  return [
    manualRow(),
    manualNullIdentityRow(),
    genStaleRow(),
    existingRow({
      id: GEN_CURRENT_ID,
      desired_outcome: GEN_CURRENT_OUTCOME,
      content_identity: await contentIdentity(GEN_CURRENT_OUTCOME), // current ⇒ isGenerated
      source_path: "internal_declared",
      step_number: 3,
      step_label: "Prepare necessary application documentation",
      sort_order: 4,
    }),
  ];
}

// The regenerate under test: force-replace ON (the only mode that deletes).
// ollamaUrl deliberately omitted ⇒ canonical backfill lane not exercised.
async function runRegenerate(seed: Row[], perStep: StepOpportunitiesOutcome[]) {
  const db = fakeDb(seed);
  const result = await writeDeclaredOpportunities({
    supabase: db as never,
    companyId: CO,
    userId: USER,
    journeyKey: JOURNEY,
    perStep,
    runId: RUN,
    nowIso: "2026-07-21T12:00:00Z",
    replaceGenerated: true, // ← force-replace: the delete path is live
  });
  const rows = db.tables.odi_needs;
  return { db, result, rows, manual: rows.find((r) => r.id === MANUAL_ID) };
}

// ── Two scenarios, and WHY the distinction is load-bearing ───────────────────
//
// UNCONFIRMED: nothing incoming matches the manual row, so it is NOT consumed
// into keptExistingIds. `manualEdited` is then the ONLY thing standing between it
// and the delete list. Every survival/field assertion MUST run here.
//
// NEAR_DUP: an incoming near-duplicate matches it via Stage-2 Jaccard, which puts
// it in keptExistingIds — and `if (keptSet.has(id)) continue;` shields it from
// deletion INDEPENDENTLY of the manual guard. Asserting survival here is vacuous:
// the A2B-3 falsification run proved it passes even with `manualEdited` deleted
// from the guard. This scenario therefore tests suppression ONLY.
const UNCONFIRMED: StepOpportunitiesOutcome[] = [
  step(4, "Confirm eligibility for mental health programs", [GENUINELY_NEW]),
];
const NEAR_DUP: StepOpportunitiesOutcome[] = [
  step(1, MANUAL_STEP_LABEL, [NEAR_DUPLICATE]),
  step(4, "Confirm eligibility for mental health programs", [GENUINELY_NEW]),
];

describe("A2B-3 manual-preservation tripwire — odi_needs c46f9741", () => {
  it("the manual_% row SURVIVES a force-replace regenerate and is never deleted", async () => {
    // UNCONFIRMED: manualEdited is the only protection in play. See scenario note.
    const { db, manual } = await runRegenerate(await seedAll(), UNCONFIRMED);

    expect(
      manual,
      `REGRESSION: odi_needs ${MANUAL_ID} ("${MANUAL_OUTCOME}") was DELETED by a ` +
      `force-replace regenerate. This row is the company's only evidence-backed need. ` +
      `Its sole protection is the source_path LIKE 'manual_%' branch in ` +
      `writeDeclaredOpportunities (opportunitySynthesis.ts) — check that guard.`,
    ).toBeDefined();

    expect(
      db.deletedIds,
      `REGRESSION: odi_needs ${MANUAL_ID} appeared in a DELETE. Manual rows must be ` +
      `preserved before the keep/replace decision is ever reached.`,
    ).not.toContain(MANUAL_ID);
  });

  it("every code-guaranteed field on the manual row is byte-identical after regenerate", async () => {
    const { manual } = await runRegenerate(await seedAll(), UNCONFIRMED);
    const named = `odi_needs ${MANUAL_ID}`;

    // The four the A2B-3 brief names, plus the rest the code guarantees.
    expect(manual?.desired_outcome, `${named}: desired_outcome was rewritten`).toBe(MANUAL_OUTCOME);
    expect(manual?.source_path, `${named}: source_path was rewritten — this IS the protection marker`).toBe(MANUAL_SOURCE_PATH);
    expect(manual?.evidence_baseline_signal_ids, `${named}: the evidence baseline was rewritten`).toEqual(MANUAL_BASELINE_IDS);
    expect(manual?.content_identity, `${named}: content_identity moved on a populated row`).toBe(MANUAL_IDENTITY);
    expect(manual?.step_label, `${named}: step_label was rewritten`).toBe(MANUAL_STEP_LABEL);
    expect(manual?.sort_order, `${named}: sort_order was rewritten`).toBe(1);
    expect(manual?.status, `${named}: status was rewritten (e.g. superseded)`).toBe("active");
    expect(manual?.confidence, `${named}: confidence was rewritten`).toBe(0.95);

    // Deliberately NOT asserted as frozen — see the field-level note in the header.
    // last_confirmed_run_id and odi_canonical_statement may legitimately move on a
    // preserved row; freezing them would encode a guarantee the code never made.
    // Here (UNCONFIRMED) the row is not consumed, so the stamp simply stays put.
    expect(manual?.last_confirmed_run_id).toBe("prior-run");
  });

  it("last_confirmed_run_id MAY move on a preserved row — documented, not a defect", async () => {
    // When a near-duplicate consumes the manual row as a "keep", the run stamp is
    // rewritten. Pinned so the distinction between "content frozen" and "whole row
    // frozen" stays explicit rather than becoming folklore.
    const { manual } = await runRegenerate(await seedAll(), NEAR_DUP);
    expect(manual?.last_confirmed_run_id).toBe(RUN);
    expect(manual?.desired_outcome, "content must still be untouched").toBe(MANUAL_OUTCOME);
  });

  it("a near-duplicate generated opportunity is SUPPRESSED, not applied to the manual row", async () => {
    const { rows, manual } = await runRegenerate(await seedAll(), NEAR_DUP);

    // TRUE direction (A2B-3 ruling 1): the manual row absorbs the generated
    // near-duplicate. The generated text must never land as its own row, and must
    // never overwrite the curated statement.
    expect(
      rows.some((r) => r.desired_outcome === NEAR_DUPLICATE),
      `REGRESSION: the near-duplicate "${NEAR_DUPLICATE}" was inserted alongside ` +
      `odi_needs ${MANUAL_ID}, duplicating curated content instead of being absorbed by it.`,
    ).toBe(false);

    expect(
      manual?.desired_outcome,
      `REGRESSION: the near-duplicate overwrote the curated statement on ${MANUAL_ID}.`,
    ).toBe(MANUAL_OUTCOME);

    expect(rows.filter((r) => r.id === MANUAL_ID)).toHaveLength(1);
  });

  it("a manual_% row with NULL content_identity receives one (pinned current behavior)", async () => {
    // A2B-3 ruling 2. This documents what the lazy backfill does today. Deletion
    // protection rests on source_path alone either way — before the backfill the
    // row is also covered by the staleness marker, after it only by source_path.
    // Any future change to this backfill must consciously break this test.
    const { rows, db } = await runRegenerate(await seedAll(), UNCONFIRMED);
    const nullRow = rows.find((r) => r.id === MANUAL_NULL_ID);

    expect(nullRow, `manual row ${MANUAL_NULL_ID} was deleted`).toBeDefined();
    expect(db.deletedIds).not.toContain(MANUAL_NULL_ID);
    expect(nullRow?.content_identity).toBe(await contentIdentity(MANUAL_NULL_OUTCOME));
    expect(nullRow?.source_path, "the protection marker must survive the backfill").toBe("manual_inline");
    expect(nullRow?.desired_outcome).toBe(MANUAL_NULL_OUTCOME);
  });

  it("generated rows still follow designed keep/replace behavior (the reconcile is NOT a no-op)", async () => {
    const { result, rows, db } = await runRegenerate(await seedAll(), UNCONFIRMED);

    // Without this block the tripwire could pass merely because reconcile did nothing.
    expect(rows.some((r) => r.id === GEN_STALE_ID), "generated+STALE must be preserved").toBe(true);
    expect(db.deletedIds).not.toContain(GEN_STALE_ID);

    expect(rows.some((r) => r.id === GEN_CURRENT_ID), "generated+CURRENT+unconfirmed must be replaced").toBe(false);
    expect(db.deletedIds).toContain(GEN_CURRENT_ID);

    expect(rows.some((r) => r.desired_outcome === GENUINELY_NEW), "a genuinely-new opportunity must be inserted").toBe(true);

    // Full UNCONFIRMED signature: 1 added (genuinely-new), 0 kept (nothing matched
    // an existing row), 4 preserved (all existing unconsumed), 1 deleted
    // (gen-current), 3 editedPreserved (both manual rows + gen-stale).
    expect(result).toMatchObject({ added: 1, kept: 0, preserved: 4, deleted: 1, editedPreserved: 3 });
  });
});
