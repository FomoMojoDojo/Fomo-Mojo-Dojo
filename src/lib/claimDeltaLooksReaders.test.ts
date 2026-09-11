// Gate 9a — READER CENSUS (source guard). A look (claim_delta_looks) is an integrity record: NO reader
// of claim_delta_rejections or claim_deltas may read, join or count it — not the finalize's orphan
// prune, not feed-first-read-corrections, not the First Read data hook (which sums the integrity_runs
// record only), not the sweep/SQL surface. The ONLY table access is the worker's own: one load
// (the plan's fourth class) and one insert (bankLook). Idiom: gate3Exclusion.test.ts / homeOperatorDefault.
//
// RED ON REVERT: the worker load/insert do not exist; the string-level census then fails on count.
import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { execSync } from "node:child_process";

const ROOT = path.resolve(__dirname, "../..");
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), "utf8");
const WORKER = "supabase/functions/_shared/claimDeltaSynthesis.ts";

/** Every non-test source file that mentions the table (tracked + untracked, git-aware). */
function filesMentioning(needle: string): string[] {
  const out = execSync(`git grep -l --untracked -- ${JSON.stringify(needle)} -- src supabase/functions supabase/migrations`, { cwd: ROOT, encoding: "utf8" });
  return out.split("\n").filter((f) => f && !/\.test\.tsx?$/.test(f) && !/\.snap$/.test(f));
}

describe("Gate 9a — no reader of rejections/deltas reads the looks table", () => {
  it("the worker is the ONLY code that touches claim_delta_looks: exactly one load and one insert", () => {
    const src = read(WORKER);
    const accesses = src.match(/\.from\(["']claim_delta_looks["']\)/g) ?? [];
    expect(accesses).toHaveLength(2);
    // the load is keyed by the current span-gate version (the re-open key) …
    expect(src).toMatch(/\.from\("claim_delta_looks"\)[\s\S]{0,300}\.eq\("span_gate_version", SPAN_GATE_VERSION\)/);
    // … and the insert carries version + judge model + run provenance
    expect(src).toMatch(/\.from\("claim_delta_looks"\)\.insert\(\{[\s\S]{0,600}span_gate_version: SPAN_GATE_VERSION[\s\S]{0,600}run_id: args\.runId \?\? null/);
    // no delete / update / rpc against it anywhere (looks are never pruned)
    expect(src).not.toMatch(/claim_delta_looks["']\)\s*\.(delete|update|upsert)/);
  });

  it("no other TS/TSX source, and no SQL other than its own migration, accesses the table", () => {
    const tableAccess = (f: string) => /(from|FROM|JOIN|join|UPDATE|DELETE FROM|INSERT INTO)\s*\(?["'\s]*claim_delta_looks/.test(read(f));
    const offenders = filesMentioning("claim_delta_looks")
      .filter((f) => f !== WORKER && f !== "supabase/migrations/20260911120000_claim_delta_looks.sql")
      .filter(tableAccess);
    expect(offenders).toEqual([]);
  });

  it("the known rejection readers never join looks: prune (worker), feed-first-read-corrections, useFirstReadPreviewData", () => {
    // the worker's prune block reads rejections only
    const worker = read(WORKER);
    const pruneAt = worker.indexOf("rejections_pruned");
    expect(pruneAt).toBeGreaterThan(-1);
    const pruneBlock = worker.slice(worker.lastIndexOf("if (", pruneAt), pruneAt + 2500);
    expect(pruneBlock).not.toMatch(/claim_delta_looks["']\)/);
    // feed-first-read-corrections: the attestation-wins prune touches rejections, never looks
    const feed = read("supabase/functions/feed-first-read-corrections/index.ts");
    expect(feed).toMatch(/claim_delta_rejections/);
    expect(feed).not.toMatch(/claim_delta_looks/);
    // the First Read hook reads the integrity RECORD (component = 'claim_delta_looks'), not the table
    const hook = read("src/views/client/firstReadPreview/useFirstReadPreviewData.ts");
    expect(hook).toMatch(/\.from\("integrity_runs"\)[\s\S]{0,400}\.eq\("component", "claim_delta_looks"\)/);
    expect(hook).not.toMatch(/\.from\(["']claim_delta_looks["']\)/);
  });

  it("the migration mirrors claim_delta_rejections' posture: freeze trigger, unique on (company, identity, kind, version), reason CHECK, no RLS", () => {
    const sql = read("supabase/migrations/20260911120000_claim_delta_looks.sql");
    expect(sql).toMatch(/enforce_company_freeze/);
    expect(sql).toMatch(/unique\s*\(\s*company_id\s*,\s*content_identity\s*,\s*pairing_kind\s*,\s*span_gate_version\s*\)/i);
    expect(sql).toMatch(/check\s*\(\s*reason\s+in\s*\(\s*'span_not_in_observed'\s*,\s*'span_missing'\s*\)\s*\)/i);
    expect(sql).not.toMatch(/enable row level security/i);
    const statements = sql.split("\n").filter((l) => !l.trimStart().startsWith("--")).join("\n");
    expect(statements).not.toMatch(/claim_delta_rejections/);   // touches nothing of the rejection cache (comments aside)
  });
});
