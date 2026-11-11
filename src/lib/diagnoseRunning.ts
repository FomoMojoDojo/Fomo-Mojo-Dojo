// IS DIAGNOSE RUNNING FOR THIS COMPANY? (S2, signed 2026-11-09)
//
// ONE PREDICATE, TWO CALLERS. The Front Door shows a per-company "Diagnose" link (T1) and the First
// Read shows the client "Diagnose →" link (T3), and both must agree on what "running" means. That
// agreement lives here and nowhere else.
//
// THE RULE: a company has Diagnose running when it has at least one LIVE input_file — archived_at
// null, reached through inputs.company_id — or at least one LIVE interview_record, retracted_at
// null. Documents or people: either one means the inside read has started.
//
// READ-ONLY, NO NEW STORE (S2). Two SELECTs over tables that already exist. Nothing is written and
// no flag is persisted — the predicate is derived from the rows every time it is asked.
//
// WHY A SET AND NOT A BOOLEAN LOOP. The Front Door lists every company at once; asking per row
// would be 2N round trips. fetchDiagnoseRunning answers for the whole list in two queries, and
// isDiagnoseRunning is the same call for one id. Measured 2026-11-09: 67 live input_files across 7
// companies and 6 live interview_records across 4, fleet-wide — the unfiltered form is small.
//
// ONE ANSWER FOR EVERY READER (U6-14, 2026-11-10). The records arm used to read interview_records
// directly, whose only non-admin SELECT policy was gated on `input_file_id IS NULL` — so a member
// could not see a file-derived record and this predicate answered DIFFERENTLY for an operator and a
// client on the same company. Edgewood read "running" only because its 10 live input_files carried it;
// its one live interview record was invisible to a member. The arm now reads `interview_people`, the
// tier-1 door, which returns name/role/date for any input_file_id and resolves membership itself — so
// operator and client get the same answer from the same rows.
//
// U6-7 (signed 2026-11-10): interview_records stays MEMBER-BLIND for its text and its columns, and
// no migration here changes that. The FILES ARM ALONE used to carry members; it no longer has to,
// because tier 1 is role-independent. A role-independent check over the records themselves is filed,
// not built.
//
// THE EMBED IS VERIFIED UNDER RLS (T, 2026-11-09). `inputs!inner(company_id)` resolves in ONE round
// trip rather than the two-step select-inputs-then-files shape useCompanyFiles uses, and it was
// checked through the browser's own signed-in client, not with a service-role key: Edgewood
// returned a row for both tables, Wasabi returned none, and the fleet form returned all 67/6 rows
// with no RLS error. If a future policy narrows `inputs`, the two-step shape at
// src/hooks/useCompanyFiles.ts:28-40 is the proven fallback.
import { supabase } from "@/integrations/supabase/client";

/** The company ids with Diagnose running. Membership IS the predicate. */
export type DiagnoseRunning = ReadonlySet<string>;

// The embedded filter is not in the generated types, which know nothing of `inputs.company_id` as a
// column path. Same escape hatch the interview reads use.
const loose = () => supabase as unknown as { from: (t: string) => any; rpc: (n: string, a?: Record<string, unknown>, o?: { get?: boolean }) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any

type FileRow = { inputs?: { company_id?: string | null } | null };
type RecordRow = { company_id?: string | null };

function addIds(into: Set<string>, ids: ReadonlyArray<string | null | undefined>): void {
  for (const id of ids) if (typeof id === "string" && id.length > 0) into.add(id);
}

/** Every company with a live document or a live interview record. `companyIds` narrows both
 *  queries; omit it for the whole fleet (what the Front Door's list wants). A query that errors
 *  contributes nothing — the link is hidden rather than shown on a guess. */
export async function fetchDiagnoseRunning(companyIds?: readonly string[]): Promise<DiagnoseRunning> {
  if (companyIds !== undefined && companyIds.length === 0) return new Set<string>();

  let files = loose().from("input_files").select("inputs!inner(company_id)").is("archived_at", null);
  if (companyIds !== undefined) {
    files = files.in("inputs.company_id", companyIds);
  }
  // U6-14: tier 1. The function filters retracted rows and resolves membership itself, so there is
  // nothing to add here; OMITTING p_company_ids asks for every company this caller may see (the
  // Front Door's list).
  // U6-36: over GET the argument is OMITTED rather than sent as null. postgrest-js drops `undefined`
  // but stringifies `null`, and `?p_company_ids=null` reaches Postgres as the text "null" --
  // 400 malformed array literal. The function's own default covers the no-ids case.
  const records = loose().rpc("interview_people", companyIds === undefined ? {} : { p_company_ids: companyIds }, { get: true });

  const [fileRes, recordRes] = await Promise.all([files, records]);
  const running = new Set<string>();
  addIds(running, ((fileRes?.data ?? []) as FileRow[]).map((r) => r.inputs?.company_id));
  addIds(running, ((recordRes?.data ?? []) as RecordRow[]).map((r) => r.company_id));
  return running;
}

/** THE SHARED PREDICATE. One company, same rule. */
export async function isDiagnoseRunning(companyId: string | null | undefined): Promise<boolean> {
  if (!companyId) return false;
  const running = await fetchDiagnoseRunning([companyId]);
  return running.has(companyId);
}
