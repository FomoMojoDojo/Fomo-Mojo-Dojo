// ── IS THE STORED MOJO SCORE IN STEP WITH THE LIVE ONE? (SP-478 / SP-682, 2026-11-25) ────────────
//
// READ-ONLY BY CONSTRUCTION. For every company this runs the ONE server writer — snapshotMojoScore —
// in its own dry-run mode, through a database client that can only issue GET and HEAD requests. A
// write is not merely skipped: the client has no way to send one, and any attempt throws. So this
// reports exactly what the daily tick would write, by the tick's own code, and cannot write it.
//
// Used by mojo-score-authority-guard (check a5) and for the dry count before the first tick.
//
//   SERVICE_ROLE_KEY=… deno run -A scripts/mojo-score-mirror.ts            # JSON on stdout
//
// The key is read from the environment and never printed.
import { snapshotMojoScore, type SnapshotOutcome } from "../supabase/functions/_shared/snapshotMojoScore.ts";

const REST = (Deno.env.get("SUPABASE_REST_URL") ?? "http://127.0.0.1:54321/rest/v1").replace(/\/$/, "");
const KEY = Deno.env.get("SERVICE_ROLE_KEY") ?? "";
if (!KEY) { console.error("mojo-score-mirror: SERVICE_ROLE_KEY not set"); Deno.exit(2); }

const refuse = (op: string) => () => { throw new Error(`READ-ONLY CLIENT: ${op} refused — this harness cannot write`); };

/** A PostgREST query that can only be read. The subset of the supabase-js builder the writer uses. */
class ReadOnlyQuery {
  private params: string[] = [];
  private cols = "*";
  private head = false;
  private count = false;
  private one = false;
  private win: [number, number] | null = null;
  constructor(private table: string) {}
  select(cols = "*", opts?: { count?: string; head?: boolean }) { this.cols = cols.replace(/\s+/g, ""); this.head = opts?.head === true; this.count = Boolean(opts?.count); return this; }
  private add(col: string, expr: string) { this.params.push(`${encodeURIComponent(col)}=${expr}`); return this; }
  private val(v: unknown) { return encodeURIComponent(String(v)); }
  eq(col: string, v: unknown) { return this.add(col, `eq.${this.val(v)}`); }
  neq(col: string, v: unknown) { return this.add(col, `neq.${this.val(v)}`); }
  is(col: string, v: unknown) { return this.add(col, `is.${v === null ? "null" : this.val(v)}`); }
  not(col: string, op: string, v: unknown) { return this.add(col, `not.${op}.${v === null ? "null" : this.val(v)}`); }
  like(col: string, v: string) { return this.add(col, `like.${this.val(v)}`); }
  in(col: string, vals: unknown[]) { return this.add(col, `in.(${vals.map((v) => this.val(v)).join(",")})`); }
  order(col: string, o?: { ascending?: boolean }) { this.params.push(`order=${encodeURIComponent(col)}.${o?.ascending === false ? "desc" : "asc"}`); return this; }
  limit(n: number) { this.params.push(`limit=${n}`); return this; }
  range(from: number, to: number) { this.win = [from, to]; return this; }
  maybeSingle() { this.one = true; return this; }
  single() { this.one = true; return this; }
  insert = refuse("insert"); update = refuse("update"); upsert = refuse("upsert"); delete = refuse("delete");
  then(resolve: (v: unknown) => void, reject?: (e: unknown) => void) {
    const url = `${REST}/${this.table}?select=${encodeURIComponent(this.cols)}${this.params.length ? "&" + this.params.join("&") : ""}`;
    const headers: Record<string, string> = { apikey: KEY, Authorization: `Bearer ${KEY}` };
    if (this.count) headers.Prefer = "count=exact";
    if (this.win) { headers["Range-Unit"] = "items"; headers.Range = `${this.win[0]}-${this.win[1]}`; }
    return fetch(url, { method: this.head ? "HEAD" : "GET", headers }).then(async (res) => {
      if (!res.ok && res.status !== 206 && res.status !== 416) return { data: null, error: { message: `${res.status} ${await res.text().catch(() => "")}`.slice(0, 300) }, count: null };
      const range = res.headers.get("content-range");
      const count = range && range.includes("/") ? Number(range.split("/")[1]) : null;
      if (this.head) { await res.body?.cancel(); return { data: null, error: null, count }; }
      const rows = res.status === 416 ? [] : await res.json();
      return { data: this.one ? (rows[0] ?? null) : rows, error: null, count };
    }).then(resolve, reject);
  }
}
const db = { from: (table: string) => new ReadOnlyQuery(table), rpc: refuse("rpc") };

type Co = { id: string; name: string; frozen: boolean | null; fixture_hold: string | null };
const companies: Co[] = [];
for (let from = 0; ; from += 1000) {
  const { data, error } = await (db.from("companies").select("id, name, frozen, fixture_hold").order("id").range(from, from + 999) as unknown as Promise<{ data: Co[] | null; error: { message: string } | null }>);
  if (error) { console.error("mojo-score-mirror: companies read failed:", error.message); Deno.exit(2); }
  companies.push(...(data ?? []));
  if ((data ?? []).length < 1000) break;
}

// The writer logs each skip; keep stdout for the JSON.
const log = console.log; console.log = () => {};
const outcomes: Array<SnapshotOutcome & { name: string; held: boolean }> = [];
let next = 0;
await Promise.all(Array.from({ length: 6 }, async () => {
  for (;;) {
    const c = companies[next++]; if (!c) return;
    // deno-lint-ignore no-explicit-any
    const o = await snapshotMojoScore(db as any, c.id, { dryRun: true, quietSkip: true });
    outcomes.push({ ...o, name: c.name, held: c.fixture_hold !== null });
  }
}));
console.log = log;
outcomes.sort((a, b) => a.company_id.localeCompare(b.company_id));
const n = (f: (o: SnapshotOutcome) => boolean) => outcomes.filter(f).length;
console.log(JSON.stringify({
  computed_at: new Date().toISOString(), read_only: true,
  companies: outcomes.length,
  frozen_skipped: n((o) => o.skipped === "frozen"),
  no_evidence_skipped: n((o) => o.skipped === "no_evidence"),
  errors: n((o) => o.skipped === "error" || o.skipped === "no_company"),
  scored: n((o) => o.skipped === null),
  rows_would_be_added: n((o) => o.row === "would_insert"),
  cache_would_change: n((o) => o.cache === "would_update"),
  out_of_step: outcomes.filter((o) => o.row === "would_insert" || o.cache === "would_update").map((o) => o.company_id),
  outcomes,
}));
