// THE NARROW CLIENT DOORS, resolved against a table fixture (test support only).
//
// U6-25 / U6-22 / U6-14 (2026-11-10) moved the First Read's findings, marks, mark notes and candidate
// outcomes — and Diagnose's interview people — off their tables and onto SECURITY DEFINER functions,
// so that the held/hidden predicate and the column projection live in the database rather than in a
// page query. The hooks therefore call `.rpc(...)` where they used to call `.from(...)`.
//
// The suite's fake supabase clients hold TABLE fixtures. This resolver lets them answer the doors
// from those same fixtures, applying the SAME predicate and the SAME projection the SQL applies —
// so a test cannot pass by reading a column the real door withholds, and a fixture row the real
// door would exclude stays excluded here too.
//
// It deliberately does NOT model membership: a unit test has no JWT, and the refusal side is proven
// where it is actually enforced, in the SQL refusal tests under the fixture JWTs.
import { marksDoorRpc } from "@/lib/firstReadMarks/marksDoors";

type Row = Record<string, unknown>;
type Tables = Record<string, Row[]>;

const pick = (r: Row, cols: readonly string[]): Row =>
  Object.fromEntries(cols.filter((c) => c in r).map((c) => [c, r[c]]));

/** The columns each door returns, mirroring the function signatures in 20261110180000. */
const FINDINGS_COLS = ["id", "company_id", "body", "created_at", "origin_signal_id"] as const;
const OUTCOMES_COLS = [
  "id", "candidate_index", "job_executor", "original_jtbd", "original_identity",
  "relationship_kind", "outcome", "reconstructed", "criterion_version",
] as const;
const PEOPLE_COLS = ["id", "company_id", "person_name", "person_role", "interviewed_at"] as const;

const ok = (data: Row[]) => Promise.resolve({ data, error: null });
const isNull = (v: unknown) => (v ?? null) === null;

export function clientDoorRpc(tables: Tables) {
  const rows = (t: string) => [...(tables[t] ?? [])];
  return (name: string, args: Record<string, unknown> = {}) => {
    // FM13 option A: the mark store is named ONLY inside src/lib/firstReadMarks/, so its two doors
    // are resolved there and delegated to here. This file must not name those tables.
    const marks = marksDoorRpc(tables, name, args);
    if (marks !== null) return ok(marks);
    switch (name) {
      // status='open' AND register='public_inferred' — the filter that used to sit on the page query.
      case "findings_client":
        return ok(rows("findings")
          .filter((r) => r.company_id === args.p_company_id && r.status === "open" && r.register === "public_inferred")
          .map((r) => pick(r, FINDINGS_COLS)));

      // Keyed by run, and judge_reasons is NOT in the projection — the version-aware outcome filter
      // stays in selectUnstatedRows, so no outcome predicate here either.
      case "market_candidate_outcomes_client":
        return ok(rows("market_candidate_outcomes")
          .filter((r) => r.run_id === args.p_run_id)
          .map((r) => pick(r, OUTCOMES_COLS)));

      // Tier 1: retracted_at IS NULL, any input_file_id, never the verbatim. null = every company.
      case "interview_people": {
        const ids = (args.p_company_ids ?? null) as string[] | null;
        return ok(rows("interview_records")
          .filter((r) => isNull(r.retracted_at) && (ids === null || ids.includes(String(r.company_id))))
          .map((r) => pick(r, PEOPLE_COLS)));
      }

      // Tier 2: a unit test holds no capability, so the door says no — which is the render path
      // S-U6-4 asserts. The allow side is proven in SQL, against a real sponsor row.
      case "interview_text":
      case "interview_item_text":
        return ok([]);

      default:
        return Promise.resolve({ data: null, error: { message: `unmocked rpc ${name}` } });
    }
  };
}
