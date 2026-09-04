// REVIEW ROW UPSERT (operator ruling 2026-09-04): a page re-crawled under a run that already holds a review row
// UPDATES the fetch / hash / disposition / anchor / dependency columns and PRESERVES operator_decision, decided_at,
// decided_by; a fresh row gets a NULL decision. The runner's SQL is built from the SAME column list the pure
// semantics use, so the DO UPDATE SET clause can never touch a decision column. RED before the module exists.
import { describe, expect, it } from "vitest";
import { applyReviewUpsert, REVIEW_UPDATABLE_COLUMNS, REVIEW_DECISION_COLUMNS, reviewUpsertSql } from "../../../supabase/functions/_shared/reviewRowUpsert";

const KEY = { company_id: "co", run_id: "run-1", source_url: "https://wineandeggs.com/p" };
const existing = [{ ...KEY, disposition: "unchanged", fetch_path: "plain", http_status: 200, anchor_present: false, new_sha256: "old", operator_decision: "approve", decided_at: "2026-09-04T17:57:31Z", decided_by: "operator" }];
const incoming = { ...KEY, disposition: "changed", fetch_path: "headless", http_status: 200, anchor_present: true, new_sha256: "new" };

describe("applyReviewUpsert", () => {
  it("re-review under a run with an existing approve row: disposition/anchor/hash updated, decision preserved", () => {
    const out = applyReviewUpsert(existing, incoming);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ disposition: "changed", fetch_path: "headless", anchor_present: true, new_sha256: "new", operator_decision: "approve", decided_at: "2026-09-04T17:57:31Z", decided_by: "operator" });
  });
  it("a fresh row (different url) is inserted with a NULL decision", () => {
    const out = applyReviewUpsert(existing, { ...incoming, source_url: "https://joe.coffee/x" });
    expect(out).toHaveLength(2);
    const fresh = out.find((r) => r.source_url === "https://joe.coffee/x")!;
    expect(fresh.operator_decision).toBeNull(); expect(fresh.decided_at).toBeNull(); expect(fresh.decided_by).toBeNull();
  });
  it("the SQL DO UPDATE SET names exactly the updatable columns and never a decision column", () => {
    const sql = reviewUpsertSql();
    expect(sql).toContain("on conflict (company_id, run_id, source_url) do update set");
    for (const c of REVIEW_UPDATABLE_COLUMNS) expect(sql).toContain(`${c} = excluded.${c}`);
    for (const c of REVIEW_DECISION_COLUMNS) expect(sql).not.toContain(`${c} = excluded.${c}`);
  });
});
