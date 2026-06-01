import { supabase } from '@/integrations/supabase/client';

export interface ActiveEvidenceFile {
  id: string;
  input_id: string;
  file_name: string;
  file_type: string;
  file_path: string;
  uploaded_at: string;
  input_key: string;
  input_label: string;
}

export interface SelectActiveEvidenceOptions {
  /** Only include files uploaded on or after this date. */
  uploadedAfter?: Date;
  /** Restrict to specific input areas (e.g. ['comp-alt', 'brand-narrative']). */
  inputKeys?: string[];
  /** Max files to return. */
  limit?: number;
}

/**
 * Returns active (non-archived) evidence files for a company.
 * Excluded by default: files where archived_at IS NOT NULL.
 * Used as the source list for strategy/job map/route regeneration.
 *
 * Usage note: "Using active evidence files only."
 */
export async function selectActiveEvidenceFiles(
  companyId: string,
  options: SelectActiveEvidenceOptions = {},
): Promise<ActiveEvidenceFile[]> {
  const { uploadedAfter, inputKeys, limit = 200 } = options;

  let inputsQ = supabase
    .from('inputs')
    .select('id, input_key, input_label')
    .eq('company_id', companyId);

  if (inputKeys && inputKeys.length > 0) {
    inputsQ = inputsQ.in('input_key', inputKeys);
  }

  const { data: inputRows, error: e1 } = await inputsQ;
  if (e1) throw e1;
  if (!inputRows || inputRows.length === 0) return [];

  const inputById = new Map(
    inputRows.map((r) => [r.id, { input_key: r.input_key, input_label: r.input_label }]),
  );
  const inputIds = inputRows.map((r) => r.id);

  let filesQ = supabase
    .from('input_files')
    .select('id, input_id, file_name, file_type, file_path, uploaded_at')
    .in('input_id', inputIds)
    .is('archived_at', null)
    .order('uploaded_at', { ascending: false })
    .limit(limit);

  if (uploadedAfter) {
    filesQ = filesQ.gte('uploaded_at', uploadedAfter.toISOString());
  }

  const { data: files, error: e2 } = await filesQ;
  if (e2) throw e2;

  return (files ?? []).map((f) => ({
    ...f,
    input_key: inputById.get(f.input_id)?.input_key ?? '',
    input_label: inputById.get(f.input_id)?.input_label ?? '',
  }));
}
