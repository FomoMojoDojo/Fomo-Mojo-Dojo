// Test-only in-memory supabase fake (Deno tests). Supports the query surface the
// synthesizers use up to their refusal / generation call: select/eq/neq/is/in/order/limit/
// maybeSingle/single, and insert/update/delete/upsert which MUTATE `tables` and are logged in
// `writes` — so a regression that writes shows up as a snapshot diff, never as a swallowed call.
export type Row = Record<string, unknown>;

// ── In-memory supabase fake ────────────────────────────────────────────────────────────
// Supports the query surface the handler uses up to (and including) the refusal:
// select/eq/is/in/order/limit/range/maybeSingle/single, and insert/update/delete/upsert which
// mutate `tables` and are logged in `writes`.
export function fakeDb(tables: Record<string, Row[]>) {
  const writes: Array<{ table: string; op: string }> = [];
  const snapshot = () => JSON.stringify(tables);
  function from(table: string) {
    if (!tables[table]) tables[table] = [];
    const filters: Array<(r: Row) => boolean> = [];
    let orderBy: { col: string; asc: boolean } | null = null;
    let limitN: number | null = null;
    let rangeWin: { from: number; to: number } | null = null; // .range(from, to) — inclusive, like PostgREST
    let single = false;
    let op: "select" | "insert" | "update" | "delete" | "upsert" = "select";
    let payload: Row | Row[] | null = null;
    const q: Record<string, unknown> = {};
    const chain = (fn: () => void) => { fn(); return q; };
    let head = false;
    q.select = (_cols?: string, opts?: { head?: boolean; count?: string }) => { head = Boolean(opts?.head); return q; };
    q.eq = (col: string, val: unknown) => chain(() => filters.push((r) => r[col] === val));
    q.neq = (col: string, val: unknown) => chain(() => filters.push((r) => r[col] !== val));
    q.is = (col: string, val: unknown) => chain(() => filters.push((r) => (val === null ? r[col] == null : r[col] === val)));
    q.in = (col: string, vals: unknown[]) => chain(() => filters.push((r) => vals.includes(r[col])));
    q.order = (col: string, o?: { ascending?: boolean }) => chain(() => { orderBy = { col, asc: o?.ascending !== false }; });
    q.limit = (n: number) => chain(() => { limitN = n; });
    q.range = (from: number, to: number) => chain(() => { rangeWin = { from, to }; });
    q.maybeSingle = () => chain(() => { single = true; });
    q.single = () => chain(() => { single = true; });
    q.insert = (p: Row | Row[]) => chain(() => { op = "insert"; payload = p; });
    q.upsert = (p: Row | Row[]) => chain(() => { op = "upsert"; payload = p; });
    q.update = (p: Row) => chain(() => { op = "update"; payload = p; });
    q.delete = () => chain(() => { op = "delete"; });
    q.then = (resolve: (v: unknown) => void, reject?: (e: unknown) => void) => {
      try {
        const matching = tables[table].filter((r) => filters.every((f) => f(r)));
        if (op === "select") {
          let rows = [...matching];
          if (orderBy) {
            const { col, asc } = orderBy;
            rows.sort((a, b) => (String(a[col]) < String(b[col]) ? -1 : 1) * (asc ? 1 : -1));
          }
          if (rangeWin) rows = rows.slice(rangeWin.from, rangeWin.to + 1);
          if (limitN != null) rows = rows.slice(0, limitN);
          const data = head ? null : single ? (rows[0] ?? null) : rows;
          return Promise.resolve({ data, error: null, count: matching.length }).then(resolve, reject);
        }
        writes.push({ table, op });
        if (op === "insert" || op === "upsert") {
          const rows = Array.isArray(payload) ? payload : [payload as Row];
          tables[table].push(...rows.map((r) => ({ id: crypto.randomUUID(), ...r })));
        } else if (op === "update") {
          for (const r of matching) Object.assign(r, payload as Row);
        } else if (op === "delete") {
          tables[table] = tables[table].filter((r) => !matching.includes(r));
        }
        return Promise.resolve({ data: null, error: null }).then(resolve, reject);
      } catch (e) {
        return Promise.reject(e).then(resolve, reject);
      }
    };
    return q;
  }
  return { from, writes, tables, snapshot, auth: { getUser: async () => ({ data: { user: null } }) } };
}
