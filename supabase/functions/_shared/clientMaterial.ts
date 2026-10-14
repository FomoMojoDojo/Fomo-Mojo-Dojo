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
  { kind: "upload_signal", table: "signals", column: "source_type ∈ {uploaded_file, file, file_proposal, intake, interview}",
    query: (sb, c) => sb.from("signals").select("id", { count: "exact", head: true }).eq("company_id", c).in("source_type", ["uploaded_file", "file", "file_proposal", "intake", "interview"]) },
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

// ── W1 (operator ruling, 2026-10-13): the public-read wall, as ONE predicate ────────────────────
//
// The wall check for Q4 found that nothing kept client-provided material out of a public read.
// selectPublicInputs filters signals on signal_band, voice_class and liveness and NEVER on
// source_type, and liveRecordCandidates (the PASS 2 / carry lane) applies the same predicates minus
// source_type. So a signal the client uploaded could enter a read's ledger, and a carried span could
// be lifted from one verbatim into the ALREADY WRITTEN notice. Measured on 2026-10-13: 13 Edgewood
// signals — source_type='uploaded_file', band outside, voice market_context, live — satisfied every
// predicate both selectors applied. None had reached a stored read, but only because of the cap and
// the selection order.
//
// ALLOWLIST, NOT DENYLIST. A denylist of the five client source_types would pass anything new: a
// lane added next month, a NULL, a typo. This names the source_types that are PUBLIC by
// construction and excludes everything else, so an unrecognised value fails CLOSED — it is kept out
// of the read and the read is poorer, rather than let in and the read is wrong.
//
// `mojo_analysis` is OURS, not the client's, and is listed: excluding it here would be a different
// ruling (1a-4 put our analysis in the base, labelled as ours). It carries no outside-band rows
// today, so the band filter is what keeps it out of the public base, as before.
export const PUBLIC_SIGNAL_SOURCE_TYPES: readonly string[] = [
  "public_baseline_run",        // the public baseline crawl
  "competitor_discovery_run",   // competitor discovery, public web
  "outside_recrawl_regen",      // a recrawl of an outside page
  "outside_listing_regen",      // a regenerated outside listing row
  "client_voice_regen",         // the company's own PUBLIC site, re-extracted
  "website",                    // a public page
  "mojo_analysis",              // OUR analysis of the public record — ours, never the client's
];

/** The source_types that mean a human handed us the material. The authority is the upload_signal
 *  entry of CLIENT_PROVIDED_SOURCE_KINDS above; this is the same set, named once for the filters. */
export const CLIENT_PROVIDED_SIGNAL_SOURCE_TYPES: readonly string[] = [
  "uploaded_file", "file", "file_proposal", "intake", "interview",
];

/**
 * W1: the ONE predicate both public-read selectors apply. May this signal's source_type enter a
 * public read — as a pool row, as a PASS 2 admission, or as a carried span?
 *
 * Fails closed: an unrecognised source_type (a new lane, a NULL, a typo) is NOT public.
 */
export function isPublicSignalSourceType(sourceType: unknown): boolean {
  return typeof sourceType === "string" && PUBLIC_SIGNAL_SOURCE_TYPES.includes(sourceType);
}
