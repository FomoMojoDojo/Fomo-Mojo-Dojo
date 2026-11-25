// ── SP-565: THE LOADER NEVER OVERWRITES A LABEL IT DID NOT WRITE ─────────────────────────────────
//
// load-need-evidence.ts upserts `bears` and `polarity` from the frozen corpus. Until 2026-11-23 it did
// so for every row, so a later `--apply` would have put a need's OLD labels back over a link that had
// since been re-judged against a new wording (SP-602) or corrected by the operator — while leaving the
// new `judged_by` in place, which reads as the new judge having said the old thing.
//
// The rule: an existing row is updated only while it is still the loader's own — judged_by
// 'cc_read_unchecked' AND the rubric the corpus was read under. Any other row is the database's, and
// the corpus no longer speaks for it. One statement, so the loader and its test cannot drift.
export const LOADER_JUDGED_BY = "cc_read_unchecked";

/** `values` is the rendered VALUES list, in the column order below. */
export function upsertSql(values: string): string {
  return `insert into public.need_evidence
    (company_id, need_id, signal_id, bears, polarity, brand, judged_by, rubric_version, rubric_md5, label_source)
    values ${values}
    on conflict (need_id, signal_id) do update set
      bears = excluded.bears, polarity = excluded.polarity, brand = excluded.brand,
      rubric_version = excluded.rubric_version, rubric_md5 = excluded.rubric_md5,
      label_source = excluded.label_source
    where need_evidence.judged_by = '${LOADER_JUDGED_BY}' and need_evidence.rubric_md5 = excluded.rubric_md5`;
}

/** Rows the corpus would touch that are no longer the loader's, per need. `needIds` are quoted SQL literals. */
export function protectedRowsSql(company: string, needIds: string[], rubricMd5: string): string {
  return `select need_id, count(*) from public.need_evidence
    where company_id = ${company} and need_id in (${needIds.join(",")})
      and not (judged_by = '${LOADER_JUDGED_BY}' and rubric_md5 = ${rubricMd5})
    group by need_id order by need_id`;
}
