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
const loose = () => supabase as unknown as { from: (t: string) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any

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
  let records = loose().from("interview_records").select("company_id").is("retracted_at", null);
  if (companyIds !== undefined) {
    files = files.in("inputs.company_id", companyIds);
    records = records.in("company_id", companyIds);
  }

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
