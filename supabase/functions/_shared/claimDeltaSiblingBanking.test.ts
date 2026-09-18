// SIBLING-SAFE BANKING (2026-09-18) — causeway 09-17: two generate-claim-deltas runs of the same kind
// started within 10 ms (the fill's in-chain gap-pairs step + its own-words-write re-entry). Each read
// an EMPTY identity cache, judged the same pairs, and the trailing run's plain insert tripped the
// UNIQUE (company_id, content_identity, pairing_kind) key → throw → 500 → fr_public_gap_pairs FAILED
// while the sibling completed.
//
// The fake here ENFORCES that unique key (the vitest fakes do not — they push unconditionally, which is
// exactly why the collision never surfaced in a test). A rendezvous barrier on the judge guarantees the
// production interleaving: BOTH runs have loaded the cache before EITHER inserts.
//
// Scenarios:
//   two concurrent runs, same identities → both ok; one inserts each identity, the other counts it
//     banked_by_sibling; the table holds each identity ONCE; sum(rows_new) == rows in table; no throw;
//     the integrity row of each run carries its own rows_new / banked_by_sibling.
//   a non-unique insert error still throws (the 23505 tolerance is not a blanket swallow).
// NON-VACUITY (run by hand, reported): make bankDeltaRow throw on every error (the pre-fix plain insert)
//   → the trailing run rejects with "duplicate key value violates unique constraint".
import { assert, assertEquals, assertRejects } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { computeDeltasForCompany } from "./claimDeltaSynthesis.ts";

type Row = Record<string, unknown>;
const CO = "11111111-1111-1111-1111-111111111111";
const UNIQUE_MSG = 'duplicate key value violates unique constraint "claim_deltas_company_id_content_identity_pairing_kind_key"';

/** In-memory supabase fake shared by BOTH runs. claim_deltas enforces the production unique key. */
function fakeDb(seed: Record<string, Row[]>, opts: { insertError?: (table: string, row: Row) => { code?: string; message: string } | null } = {}) {
  const tables: Record<string, Row[]> = {};
  for (const [t, rows] of Object.entries(seed)) tables[t] = [...rows];
  let nextId = 1;
  const from = (table: string) => {
    tables[table] ??= [];
    let rows = [...tables[table]];
    const b: Record<string, unknown> = {};
    const chain = (fn: (r: Row[]) => Row[]) => { rows = fn(rows); return b; };
    Object.assign(b, {
      select: () => b,
      eq: (c: string, v: unknown) => chain((r) => r.filter((x) => x[c] === v)),
      neq: (c: string, v: unknown) => chain((r) => r.filter((x) => x[c] !== v)),
      in: (c: string, vs: unknown[]) => chain((r) => r.filter((x) => vs.includes(x[c]))),
      is: (c: string, v: unknown) => chain((r) => r.filter((x) => (x[c] ?? null) === v)),
      like: () => b, not: () => b, gte: () => b, order: () => b, abortSignal: () => b,
      limit: (n: number) => chain((r) => r.slice(0, n)),
      range: (a: number, z: number) => chain((r) => r.slice(a, z + 1)),
      maybeSingle: () => Promise.resolve({ data: rows[0] ?? null, error: null }),
      then: (res: (v: { data: Row[]; error: null }) => unknown) => Promise.resolve({ data: rows, error: null }).then(res),
      insert: (payload: Row) => {
        const forced = opts.insertError?.(table, payload);
        if (forced) return Promise.resolve({ data: null, error: forced });
        const row: Row = { id: `row-${nextId++}`, ...payload };
        if (table === "claim_deltas") {
          // THE PRODUCTION CONSTRAINT: UNIQUE (company_id, content_identity, pairing_kind).
          const dup = tables[table].some((r) => r.company_id === row.company_id && r.content_identity === row.content_identity && r.pairing_kind === row.pairing_kind);
          if (dup) return Promise.resolve({ data: null, error: { code: "23505", message: UNIQUE_MSG } });
        }
        tables[table].push(row);
        return Promise.resolve({ data: null, error: null });
      },
      delete: () => ({
        in: (c: string, ids: unknown[]) => { tables[table] = tables[table].filter((r) => !ids.includes(r[c])); return Promise.resolve({ error: null }); },
      }),
    });
    return b;
  };
  const rpc = (fn: string, a: { p_company_id?: string; p_ids?: string[]; p_reason?: string }) => {
    if (fn !== "delete_claim_deltas_audited") return Promise.resolve({ data: null, error: { message: `unknown rpc ${fn}` } });
    const ids = a.p_ids ?? [];
    tables.claim_deltas = tables.claim_deltas.filter((r) => !(ids.includes(r.id as string) && r.company_id === a.p_company_id));
    return Promise.resolve({ data: ids.length, error: null });
  };
  return { tables, from, rpc };
}

// public_vs_public seed: two own-words declared statements (client_voice backing on the own host),
// two outside-voice public claims (third-party hosts) — d1×p1 and d2×p2 share tokens, the cross pairs do not.
const claim = (id: string, statement: string, extra: Row = {}): Row =>
  ({ id, company_id: CO, provenance: "public_observed", status: "active", statement, topic: null, claim_type: "observation", proof_category: null, raw_payload: null, ...extra });
function seed(): Record<string, Row[]> {
  return {
    companies: [{ id: CO, website: "https://co-1.com" }],
    claims: [
      claim("d1", "evidence score visible always", { claim_type: "own_words", declared_eligible: true }),
      claim("d2", "weekly release cadence shipping fast", { claim_type: "own_words", declared_eligible: true }),
      claim("p1", "score visible on the site"),
      claim("p2", "shipping weekly release cadence observed"),
    ],
    signals: [
      { id: "s-own", company_id: CO, voice_class: "client_voice", source_url: "https://co-1.com/about", evidence_class: "prose" },
      { id: "s-p1", company_id: CO, voice_class: "outside_voice_about_client", source_url: "https://yelp.com/x", evidence_class: "prose" },
      { id: "s-p2", company_id: CO, voice_class: "outside_voice_about_client", source_url: "https://news.example.com/y", evidence_class: "prose" },
    ],
    claim_signal_refs: [
      { company_id: CO, claim_id: "d1", signal_id: "s-own" }, { company_id: CO, claim_id: "d2", signal_id: "s-own" },
      { company_id: CO, claim_id: "p1", signal_id: "s-p1" }, { company_id: CO, claim_id: "p2", signal_id: "s-p2" },
    ],
    claim_deltas: [], claim_delta_rejections: [], claim_delta_looks: [], claim_delta_relevance_overrides: [], integrity_runs: [],
  };
}

/** A routed model whose JUDGE calls rendezvous: the first `parties` judge calls all wait until every party has
 *  arrived, so both runs have loaded their (empty) identity caches and proposed before either inserts. */
function routedWithBarrier(parties: number) {
  let arrived = 0;
  let release: (() => void) | null = null;
  const gate = new Promise<void>((r) => { release = r; });
  return async (a: { role: "generator" | "judge"; user: string }) => {
    const observed = a.user.match(/OBSERVED \(public\)[^:]*: ([\s\S]*?)\nAre these/)?.[1]?.trim() ?? "";
    if (a.role === "generator") return { content: JSON.stringify({ same_subject: true, relation: "echo", reason: "same subject" }), provider: "test", model: "gen" };
    arrived++;
    if (arrived >= parties) release!(); else await gate;
    return { content: JSON.stringify({ same_subject: true, relation: "echo", confident: true, span: observed, reason: "echo" }), provider: "test", model: "judge" };
  };
}

const runArgs = (db: ReturnType<typeof fakeDb>, nowIso: string, routedCall: ReturnType<typeof routedWithBarrier>) => ({
  supabase: db as never, companyId: CO, ollamaUrl: "http://127.0.0.1:11434/v1", nowIso, write: true,
  pairingKind: "public_vs_public" as const, routedCall: routedCall as never,
});

Deno.test("two concurrent runs over the same identities → both complete; one inserts, the other counts banked_by_sibling; no throw", async () => {
  const db = fakeDb(seed());
  const routed = routedWithBarrier(2);
  const [a, b] = await Promise.all([
    computeDeltasForCompany(runArgs(db, "2026-09-17T17:40:22.805Z", routed)),
    computeDeltasForCompany(runArgs(db, "2026-09-17T17:40:22.812Z", routed)),
  ]);
  if (!a.ok || !b.ok) throw new Error(`expected both ok: ${JSON.stringify([a, b])}`);
  const ta = (a as { totals: Record<string, number> }).totals;
  const tb = (b as { totals: Record<string, number> }).totals;
  // Each identity is in the table exactly once: 2 echoed pairs + 0 silences (every side paired).
  const ids = db.tables.claim_deltas.map((r) => `${r.content_identity}|${r.pairing_kind}`);
  assertEquals(new Set(ids).size, ids.length, "no duplicate identity rows");
  assertEquals(db.tables.claim_deltas.filter((r) => r.delta_type === "echoed").length, 2);
  // Ledger truth: the inserts across both runs are exactly the rows in the table; the collisions are counted apart.
  assertEquals(ta.rows_new + tb.rows_new, db.tables.claim_deltas.length);
  assertEquals(ta.banked_by_sibling + tb.banked_by_sibling, 2 * 2 - db.tables.claim_deltas.length, "every identity the pair of runs computed twice was banked once and found-banked once");
  assert(ta.banked_by_sibling + tb.banked_by_sibling >= 1, "the barrier produced at least one collision");
  // Both runs' integrity rows exist (one per run) and carry their own counters.
  const integ = db.tables.integrity_runs.filter((r) => r.component === "first_read_gap_pairs");
  assertEquals(integ.map((r) => r.status), ["completed", "completed"]);
  for (const r of integ) {
    const rule = r.excluded_by_rule as Record<string, number>;
    assert(typeof rule.rows_new === "number" && typeof rule.banked_by_sibling === "number");
  }
  assertEquals(integ.map((r) => (r.excluded_by_rule as Record<string, number>).rows_new).reduce((x, y) => x + y, 0), db.tables.claim_deltas.length);
});

Deno.test("silences collide too: a sibling that banked the silence rows first is found-banked at end-of-run, not a throw", async () => {
  // d2 has no candidate (no shared tokens with p1) and p2 is absent → publicly_silent for d2 in both runs.
  const s = seed();
  s.claims = s.claims.filter((c) => c.id !== "p2");
  s.claim_signal_refs = s.claim_signal_refs.filter((r) => r.claim_id !== "p2");
  const db = fakeDb(s);
  const routed = routedWithBarrier(2);
  const [a, b] = await Promise.all([
    computeDeltasForCompany(runArgs(db, "2026-09-17T17:40:22.805Z", routed)),
    computeDeltasForCompany(runArgs(db, "2026-09-17T17:40:22.812Z", routed)),
  ]);
  if (!a.ok || !b.ok) throw new Error("expected both ok");
  const ta = (a as { totals: Record<string, number> }).totals;
  const tb = (b as { totals: Record<string, number> }).totals;
  assertEquals(db.tables.claim_deltas.filter((r) => r.delta_type === "publicly_silent").length, 1);
  assertEquals(db.tables.claim_deltas.filter((r) => r.delta_type === "echoed").length, 1);
  assertEquals(ta.rows_new + tb.rows_new, 2);
  assertEquals(ta.banked_by_sibling + tb.banked_by_sibling, 2);
});

Deno.test("a NON-unique insert error still throws — 23505 tolerance is not a blanket swallow", async () => {
  const db = fakeDb(seed(), { insertError: (t) => (t === "claim_deltas" ? { code: "42501", message: "permission denied for table claim_deltas" } : null) });
  const routed = routedWithBarrier(1);
  await assertRejects(
    () => computeDeltasForCompany(runArgs(db, "2026-09-17T17:40:22.805Z", routed)),
    Error, "claim-delta inline insert failed: permission denied",
  );
});
