// fixtureClient.ts — a fixture-backed mock of the Supabase client used ONLY for
// the Lovable static-snapshot design exploration. It is swapped in at the single
// client.ts seam when HAS_SUPABASE_CREDENTIALS === false (no real backend present),
// and is UNREACHABLE when creds are present — prod / local Tailscale dev always
// carry creds and get the real client untouched.
//
// It renders the whole client-refine app from a committed, point-in-time snapshot
// of ONE company (Edgewood), with NO network. Reads resolve against the in-memory
// snapshot; writes mutate the in-memory copy (so the route-choose control works in
// session, never touching a real DB); functions.invoke / rpc return benign nulls
// so action buttons render but no-op silently.
//
// Operator coverage (see the makeFixtureClient audit note): eq, neq, in, is,
// gt/gte/lt/lte, like/ilike, match, order, limit, range, select(+count), single,
// maybeSingle, insert, update, delete, upsert are honored. or / not / contains /
// containedBy / overlaps / textSearch / filter are PERMISSIVE NO-OPS (they do not
// filter) — none of them sit on the resting-state mount render of the preview
// surfaces (they appear only on action/conditional paths), so the styled layout is
// faithful. Unknown tables resolve to [] rather than throwing.

type Row = Record<string, unknown>;
type Store = Record<string, Row[]>;

interface SnapshotFile {
  _meta?: unknown;
  data: Store;
}

function likeToRegExp(pattern: string, flags: string): RegExp {
  // PostgREST LIKE: % => .*, _ => . ; escape regex specials.
  const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const body = escaped.replace(/%/g, ".*").replace(/_/g, ".");
  return new RegExp(`^${body}$`, flags);
}

function compare(a: unknown, b: unknown): number {
  if (a == null && b == null) return 0;
  if (a == null) return -1;
  if (b == null) return 1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0;
}

type Predicate = (row: Row) => boolean;
type QueryOp = "select" | "insert" | "update" | "delete" | "upsert";

class FixtureQuery implements PromiseLike<{ data: unknown; error: null; count?: number }> {
  private predicates: Predicate[] = [];
  private orders: { col: string; asc: boolean }[] = [];
  private limitN: number | null = null;
  private rangeFromTo: [number, number] | null = null;
  private op: QueryOp = "select";
  private patch: Row | null = null;
  private writeRows: Row[] = [];
  private wantCount = false;
  private singleMode: "one" | "maybe" | null = null;

  constructor(private store: Store, private table: string) {}

  // ── filters honored ──────────────────────────────────────────────────────
  eq(col: string, val: unknown) { this.predicates.push((r) => r[col] === val); return this; }
  neq(col: string, val: unknown) { this.predicates.push((r) => r[col] !== val); return this; }
  in(col: string, arr: unknown[]) { this.predicates.push((r) => arr.includes(r[col])); return this; }
  is(col: string, val: unknown) {
    this.predicates.push((r) => (val === null ? r[col] === null || r[col] === undefined : r[col] === val));
    return this;
  }
  gt(col: string, val: unknown) { this.predicates.push((r) => compare(r[col], val) > 0); return this; }
  gte(col: string, val: unknown) { this.predicates.push((r) => compare(r[col], val) >= 0); return this; }
  lt(col: string, val: unknown) { this.predicates.push((r) => compare(r[col], val) < 0); return this; }
  lte(col: string, val: unknown) { this.predicates.push((r) => compare(r[col], val) <= 0); return this; }
  like(col: string, pattern: string) { const re = likeToRegExp(pattern, ""); this.predicates.push((r) => re.test(String(r[col] ?? ""))); return this; }
  ilike(col: string, pattern: string) { const re = likeToRegExp(pattern, "i"); this.predicates.push((r) => re.test(String(r[col] ?? ""))); return this; }
  match(obj: Row) { for (const [c, v] of Object.entries(obj)) this.predicates.push((r) => r[c] === v); return this; }

  // ── permissive no-ops (cannot be expressed by the in-memory engine) ───────
  or() { return this; }
  not() { return this; }
  contains() { return this; }
  containedBy() { return this; }
  overlaps() { return this; }
  textSearch() { return this; }
  filter() { return this; }
  abortSignal() { return this; }

  // ── shaping ───────────────────────────────────────────────────────────────
  order(col: string, opts?: { ascending?: boolean }) { this.orders.push({ col, asc: opts?.ascending !== false }); return this; }
  limit(n: number) { this.limitN = n; return this; }
  range(from: number, to: number) { this.rangeFromTo = [from, to]; return this; }
  select(_cols?: string, opts?: { count?: string | null; head?: boolean }) {
    if (opts?.count) this.wantCount = true;
    return this;
  }

  // ── writes (mutate the in-memory copy only) ───────────────────────────────
  insert(rows: Row | Row[]) { this.op = "insert"; this.writeRows = Array.isArray(rows) ? rows : [rows]; return this; }
  update(patch: Row) { this.op = "update"; this.patch = patch; return this; }
  delete() { this.op = "delete"; return this; }
  upsert(rows: Row | Row[]) { this.op = "upsert"; this.writeRows = Array.isArray(rows) ? rows : [rows]; return this; }

  // ── terminal resolvers ────────────────────────────────────────────────────
  single() { this.singleMode = "one"; return this.resolve(); }
  maybeSingle() { this.singleMode = "maybe"; return this.resolve(); }
  then<TResult1 = unknown, TResult2 = never>(
    onfulfilled?: ((value: { data: unknown; error: null; count?: number }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return this.resolve().then(onfulfilled, onrejected);
  }

  private table_(): Row[] {
    if (!this.store[this.table]) this.store[this.table] = [];
    return this.store[this.table];
  }
  private matched(): Row[] {
    return this.table_().filter((r) => this.predicates.every((p) => p(r)));
  }

  private resolve(): Promise<{ data: unknown; error: null; count?: number }> {
    let data: unknown = null;
    const table = this.table_();

    if (this.op === "insert" || this.op === "upsert") {
      for (const row of this.writeRows) {
        if (this.op === "upsert" && row.id != null) {
          const idx = table.findIndex((r) => r.id === row.id);
          if (idx >= 0) { table[idx] = { ...table[idx], ...row }; continue; }
        }
        table.push({ ...row });
      }
      data = this.writeRows;
    } else if (this.op === "update") {
      for (const r of this.matched()) Object.assign(r, this.patch);
      data = this.matched();
    } else if (this.op === "delete") {
      const kill = new Set(this.matched());
      this.store[this.table] = table.filter((r) => !kill.has(r));
      data = [];
    } else {
      // select
      let rows = this.matched();
      for (const o of [...this.orders].reverse()) {
        rows = rows.slice().sort((a, b) => (o.asc ? compare(a[o.col], b[o.col]) : -compare(a[o.col], b[o.col])));
      }
      if (this.rangeFromTo) rows = rows.slice(this.rangeFromTo[0], this.rangeFromTo[1] + 1);
      if (this.limitN != null) rows = rows.slice(0, this.limitN);
      data = rows;
    }

    if (this.singleMode) {
      const arr = Array.isArray(data) ? data : [];
      const result: { data: unknown; error: null; count?: number } = { data: arr[0] ?? null, error: null };
      return Promise.resolve(result);
    }
    const result: { data: unknown; error: null; count?: number } = { data, error: null };
    if (this.wantCount) result.count = Array.isArray(data) ? data.length : 0;
    return Promise.resolve(result);
  }
}

function makeAuthStub() {
  const noSession = { data: { session: null }, error: null };
  return {
    getSession: async () => noSession,
    getUser: async () => ({ data: { user: null }, error: null }),
    onAuthStateChange: (_cb: unknown) => ({ data: { subscription: { unsubscribe() {} } } }),
    setSession: async () => ({ data: { session: null, user: null }, error: null }),
    signInWithPassword: async () => ({ data: { session: null, user: null }, error: null }),
    signOut: async () => ({ error: null }),
  };
}

export function makeFixtureClient(snapshot: SnapshotFile) {
  // Deep-clone so in-session writes never mutate the imported module object.
  const store: Store = JSON.parse(JSON.stringify(snapshot.data ?? {}));
  return {
    from(table: string) { return new FixtureQuery(store, table); },
    rpc: async (_fn: string, _params?: unknown) => ({ data: null, error: null }),
    functions: { invoke: async (_name: string, _opts?: unknown) => ({ data: null, error: null }) },
    channel: () => ({ on() { return this; }, subscribe() { return this; }, unsubscribe() {} }),
    removeChannel: () => {},
    auth: makeAuthStub(),
    storage: { from: () => ({ upload: async () => ({ data: null, error: null }), download: async () => ({ data: null, error: null }), getPublicUrl: () => ({ data: { publicUrl: "" } }) }) },
  };
}
