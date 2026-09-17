// ── fetchAllRows (client mirror of supabase/functions/_shared/fetchAllRows.ts, 2026-09-17) ──────────
//
// supabase/config.toml caps every PostgREST response at max_rows = 1000, so an unranged
// `.from(t).select(...)` silently returns the FIRST PAGE of a large table — and a client-visible count
// on a partial read is a fabricated number. This pages with .range() until a short page so the caller
// sees every row. The caller supplies the query builder for a [from, to] window and MUST apply a stable
// order (an indexed column such as id) so pages never overlap. Same contract as the Deno helper; kept as
// a mirror because src/ cannot import from supabase/functions/_shared at runtime.
//
// Behaviour-neutral for result sets under one page (one round trip, same rows).
export type PagedQuery<T> = (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>;

export const FETCH_ALL_PAGE_SIZE = 1000;
/** Hard stop: a query that ignores .range() would return the same full page forever. */
export const FETCH_ALL_MAX_PAGES = 1000;

export async function fetchAllRows<T>(query: PagedQuery<T>, pageSize: number = FETCH_ALL_PAGE_SIZE): Promise<T[]> {
  if (!Number.isInteger(pageSize) || pageSize < 1) throw new Error(`fetchAllRows: pageSize must be a positive integer (got ${pageSize})`);
  const out: T[] = [];
  for (let from = 0, pageNo = 0; ; from += pageSize, pageNo++) {
    if (pageNo >= FETCH_ALL_MAX_PAGES) throw new Error(`fetchAllRows: exceeded ${FETCH_ALL_MAX_PAGES} pages — does the query apply .range()?`);
    const { data, error } = await query(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    const page = data ?? [];
    out.push(...page);
    if (page.length < pageSize) return out;
  }
}
