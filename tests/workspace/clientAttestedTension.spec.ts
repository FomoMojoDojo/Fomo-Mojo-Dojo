// ── R-A5 (operator ruling, 2026-10-12): an attestation IS evidence ──────────────────────────────
//
// Act 1's correction claim landed in derived_tensions_structural as under_evidenced_diagnose,
// because the branch asks only "is there a supporting organization signal?" and a correction the
// client spoke in a meeting has none. That is the view's question being wrong, not a real gap: the
// client telling us the record is wrong IS the evidence.
//
// This guard fixes the intent. It plants a client_attested claim in each of the two under_evidenced
// states on a throwaway company, asserts the view never counts it, and — so the guard cannot pass
// vacuously — plants an internal_declared twin in the same state and asserts the view DOES count
// that one. A view that returned nothing would fail the second half.
//
// PLANT PROOF: drop `and c.provenance <> 'client_attested'` from either branch of the view and the
// first two legs go red.
import { execFileSync } from "node:child_process";
import { expect, test } from "playwright/test";

const PGC = process.env.PGC || "supabase_db_dzlgyxcvuwiulgifbmew";
const psql = (sql: string) =>
  execFileSync("docker", ["exec", "-i", PGC, "psql", "-U", "postgres", "-d", "postgres", "-At", "-q", "-v", "ON_ERROR_STOP=1", "-c", sql], { encoding: "utf8" }).trim();

const CO = "77777777-7777-4777-8777-777777777701";

function seed() {
  // companies.created_by is NOT NULL with no default — the operator's admin id, as the other
  // throwaway-company specs do.
  psql(`insert into public.companies (id, name, created_by)
        values ('${CO}', 'R-A5 throwaway', 'fd766480-d2ef-4794-a79a-b849a91df024')
        on conflict (id) do nothing`);
  // four claims: client_attested and internal_declared, in each under_evidenced state.
  // None gets a supporting signal, so every one of them qualifies on the evidence test alone.
  for (const [state, prov, tag] of [
    ["diagnose", "client_attested", "att-diag"],
    ["focus", "client_attested", "att-focus"],
    ["diagnose", "internal_declared", "dec-diag"],
    ["focus", "internal_declared", "dec-focus"],
  ]) {
    psql(`insert into public.claims (company_id, statement, provenance, claim_type, state, status, confidence)
          values ('${CO}', 'R-A5 ${tag}', '${prov}', 'observation', '${state}', 'active', 'high')`);
  }
}
const drop = () => psql(`delete from public.claims where company_id='${CO}'; delete from public.companies where id='${CO}'`);

test("(R-A5) a client_attested claim is never under_evidenced; an internal_declared twin still is", async () => {
  seed();
  try {
    const rows = psql(
      `select tension_type || '|' || statement from public.derived_tensions_structural where company_id='${CO}' order by 1`
    ).split("\n").filter(Boolean);

    // 1. no client_attested claim appears, in either state
    const attested = rows.filter((r) => r.includes("att-"));
    expect(attested, `a client_attested claim reached the tension view: ${attested.join(", ")}`).toEqual([]);

    // 2. NOT VACUOUS — the identically-unevidenced internal_declared twins DO appear
    expect(rows.some((r) => r === "under_evidenced_diagnose|R-A5 dec-diag"), "the declared diagnose twin is still counted").toBe(true);
    expect(rows.some((r) => r === "under_evidenced_focus|R-A5 dec-focus"), "the declared focus twin is still counted").toBe(true);

    // 3. the exclusion is in the view's own text ONCE PER under_evidenced branch — two branches,
    //    two occurrences. Counting beats slicing: the branch names appear twice each (as the AS
    //    alias and in the predicate), so an index-based slice reads the wrong half.
    const def = psql(`select definition from pg_views where viewname='derived_tensions_structural'`);
    const occurrences = def.split("client_attested").length - 1;
    expect(occurrences, "one exclusion per under_evidenced branch (diagnose + focus)").toBe(2);
    // and the flow/stale branch must NOT have gained one: staleness is about dependencies, not
    // about how well evidenced a claim is. Anchor on its own predicate — "stale_reason" also
    // appears as a NULL alias in the earlier branches, so indexOf on that would slice too wide.
    expect(def.slice(def.indexOf("c.state = 'flow'"))).not.toContain("client_attested");
  } finally {
    drop();
  }
});
