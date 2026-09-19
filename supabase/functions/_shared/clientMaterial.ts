// ── The WALL predicate: does this company have client-provided material? (operator ruling 1a, 2026-09-18)
//
// Operator correction 2026-09-18: a provenance LABEL is not the wall. The wall protects CLIENT-PROVIDED material —
// uploads, files, intake, interviews, client-attested claims, internal_declared / manual definitions, and anything
// the operator entered from private knowledge. For a company with none of these, every upstream source is public
// and our own hypotheses about it may go to an external model; "internal_hypothesis" and the organization band do
// not by themselves mean confidential.
//
// ONE predicate, ONE place. Every client-provided source kind is listed explicitly below with its table and column.
// FAIL CLOSED: a lookup error on any kind counts as "has material" (and is named in the result).
//
// Not in the list (filed): rows of the `inputs` table — research-company generates them from the public baseline
// (research_artifact_runs) and the table has no provenance column, so an operator-typed input cannot be told from a
// generated one today; listing the table would mark every company as walled.

// deno-lint-ignore no-explicit-any
type AnySupabase = { from: (t: string) => any };

export type ClientMaterialKind = {
  kind: string;
  table: string;
  column: string;
  /** Build the count query for a company (head:true, count:'exact'). */
  query: (sb: AnySupabase, companyId: string) => any;
};

export const CLIENT_PROVIDED_SOURCE_KINDS: readonly ClientMaterialKind[] = [
  { kind: "upload_signal", table: "signals", column: "source_type ∈ {uploaded_file, file, file_proposal, intake}",
    query: (sb, c) => sb.from("signals").select("id", { count: "exact", head: true }).eq("company_id", c).in("source_type", ["uploaded_file", "file", "file_proposal", "intake"]) },
  { kind: "uploaded_file", table: "input_files", column: "input_id → inputs.company_id (any row, archived included)",
    query: (sb, c) => sb.from("input_files").select("id, inputs!inner(company_id)", { count: "exact", head: true }).eq("inputs.company_id", c) },
  { kind: "file_proposal", table: "file_proposals", column: "file_id IS NOT NULL (a Dify analysis of an uploaded file; the file-less mojo-analysis proposal is not client material)",
    query: (sb, c) => sb.from("file_proposals").select("id", { count: "exact", head: true }).eq("company_id", c).not("file_id", "is", null) },
  { kind: "intake", table: "intake_responses", column: "company_id (any row)",
    query: (sb, c) => sb.from("intake_responses").select("id", { count: "exact", head: true }).eq("company_id", c) },
  { kind: "interview", table: "interview_records", column: "company_id (any row, retracted included)",
    query: (sb, c) => sb.from("interview_records").select("id", { count: "exact", head: true }).eq("company_id", c) },
  { kind: "client_attested_claim", table: "claims", column: "provenance ∈ {client_attested, internal_declared} (any status)",
    query: (sb, c) => sb.from("claims").select("id", { count: "exact", head: true }).eq("company_id", c).in("provenance", ["client_attested", "internal_declared"]) },
  { kind: "declared_market_definition", table: "odi_market_definitions", column: "provenance_type ∈ {internal_declared, manual} (retracted included)",
    query: (sb, c) => sb.from("odi_market_definitions").select("id", { count: "exact", head: true }).eq("company_id", c).in("provenance_type", ["internal_declared", "manual"]) },
];

export type ClientMaterialVerdict = {
  has: boolean;
  /** The kinds that hold rows, with counts. */
  found: Array<{ kind: string; count: number }>;
  /** Lookup errors — each one forces has=true (fail closed). */
  errors: Array<{ kind: string; message: string }>;
};

/** True iff the company has any client-provided material — or the lookup could not prove it has none. */
export async function companyHasClientProvidedMaterial(sb: AnySupabase, companyId: string): Promise<ClientMaterialVerdict> {
  const found: Array<{ kind: string; count: number }> = [];
  const errors: Array<{ kind: string; message: string }> = [];
  for (const k of CLIENT_PROVIDED_SOURCE_KINDS) {
    try {
      const { count, error } = await k.query(sb, companyId);
      if (error) { errors.push({ kind: k.kind, message: String(error.message ?? error) }); continue; }
      if (typeof count !== "number") { errors.push({ kind: k.kind, message: "count unavailable" }); continue; }
      if (count > 0) found.push({ kind: k.kind, count });
    } catch (e) {
      errors.push({ kind: k.kind, message: String(e instanceof Error ? e.message : e) });
    }
  }
  return { has: found.length > 0 || errors.length > 0, found, errors };
}

/** A market definition whose provenance is PUBLIC — its job_executor may frame an external prompt for any company. */
export const PUBLIC_DEFINITION_PROVENANCES: ReadonlySet<string> = new Set(["public_research"]);
export function isPublicDefinition(def: { provenance_type?: string | null }): boolean {
  return PUBLIC_DEFINITION_PROVENANCES.has(String(def?.provenance_type ?? ""));
}
