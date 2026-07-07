// INT-3 — compute-core tests for claimDeltaSynthesis (the declared-vs-observed
// delta engine). The Ollama boundary is stubbed at global fetch; supabase is an
// in-memory fake. Covers: prefilter, identity stability, frozen exclusion,
// require_model loud-fail, pair verdict tri-state, tombstone respect,
// recompute idempotency (dispositions preserved), and the silence taxonomy.
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  computeDeltasForCompany,
  pairIdentity,
  silenceIdentity,
  sharedTokenCount,
} from "../../supabase/functions/_shared/claimDeltaSynthesis.ts";

const CB1 = "58b2b15b-bada-4bcd-9c12-b7e66a37d0bc"; // frozen fixture
const CO = "11111111-1111-1111-1111-111111111111";

type Row = Record<string, unknown>;

// ── In-memory supabase fake (claims + claim_deltas only) ──────────────────────
function fakeDb(seed: { claims: Row[]; claim_deltas?: Row[] }) {
  const tables: Record<string, Row[]> = {
    claims: [...seed.claims],
    claim_deltas: [...(seed.claim_deltas ?? [])],
  };
  let nextId = 1;
  const db = {
    tables,
    from(table: string) {
      const chain = {
        _filters: [] as Array<(r: Row) => boolean>,
        select() { return this; },
        eq(col: string, v: unknown) { this._filters.push((r: Row) => r[col] === v); return this; },
        order() { return this; },
        then(resolve: (v: { data: Row[]; error: null }) => void) {
          resolve({ data: tables[table].filter((r) => chain._filters.every((f) => f(r))), error: null });
        },
        insert(payload: Row) {
          tables[table].push({ id: `row-${nextId++}`, ...payload });
          return Promise.resolve({ error: null });
        },
        delete() {
          return {
            in(col: string, ids: unknown[]) {
              tables[table] = tables[table].filter((r) => !ids.includes(r[col]));
              return Promise.resolve({ error: null });
            },
          };
        },
      };
      return chain;
    },
  };
  return db;
}

// ── Scripted Ollama at the fetch boundary ─────────────────────────────────────
function stubOllama(script: (model: string, user: string) => unknown) {
  const calls: Array<{ model: string; user: string }> = [];
  vi.stubGlobal("fetch", async (_url: unknown, init?: { body?: string }) => {
    const body = JSON.parse(String(init?.body ?? "{}"));
    const user = String(body?.messages?.[1]?.content ?? "");
    calls.push({ model: body.model, user });
    const verdict = script(body.model, user);
    if (verdict === "HTTP_FAIL") return { ok: false, status: 500, json: async () => ({}) } as Response;
    if (verdict === "GARBAGE") return { ok: true, json: async () => ({ message: { content: "not json {" } }) } as unknown as Response;
    return { ok: true, json: async () => ({ message: { content: JSON.stringify(verdict) } }) } as unknown as Response;
  });
  return calls;
}

afterEach(() => vi.unstubAllGlobals());

const baseArgs = (db: ReturnType<typeof fakeDb>, companyId = CO, write = true) => ({
  supabase: db as never,
  companyId,
  ollamaUrl: "http://127.0.0.1:11434/v1",
  nowIso: "2026-07-07T12:00:00Z",
  write,
});

const declared = (id: string, statement: string): Row => ({ id, company_id: CO, statement, topic: null, provenance: "internal_declared" });
const publicClaim = (id: string, statement: string): Row => ({ id, company_id: CO, statement, topic: null, provenance: "public_observed" });

// ── Stage 1 ───────────────────────────────────────────────────────────────────
describe("sharedTokenCount prefilter", () => {
  it("counts meaningful shared tokens, ignoring stop words", () => {
    expect(sharedTokenCount("The evidence-backed score is visible", "Score visible to the market")).toBeGreaterThanOrEqual(2);
    expect(sharedTokenCount("The and of to in", "The and of to in")).toBe(0);
  });
  it("unrelated statements stay below the floor", () => {
    expect(sharedTokenCount("Coffee roasting quality", "Legal billing software")).toBe(0);
  });
});

// ── Identity stability (evidence law) ────────────────────────────────────────
describe("delta identities", () => {
  it("pairIdentity is stable under the normalizeForHash contract (case + whitespace)", async () => {
    // normalizeForHash = lower → collapse whitespace → trim (punctuation is
    // load-bearing and preserved — PCT-1 parity contract).
    const a = await pairIdentity("The  Score is Visible", "market hears score");
    const b = await pairIdentity("the score is visible", "market hears score");
    expect(a).toBe(b);
    const c = await pairIdentity("the score is visible.", "market hears score");
    expect(c).not.toBe(b);
  });
  it("silenceIdentity differs by type", async () => {
    expect(await silenceIdentity("publicly_silent", "same text"))
      .not.toBe(await silenceIdentity("internally_silent", "same text"));
  });
});

// ── Core flow ─────────────────────────────────────────────────────────────────
describe("computeDeltasForCompany", () => {
  it("frozen company is excluded before any model call", async () => {
    const calls = stubOllama(() => ({ same_subject: false }));
    const db = fakeDb({ claims: [] });
    const r = await computeDeltasForCompany(baseArgs(db, CB1));
    expect(r).toEqual({ ok: false, skipped: "frozen_company" });
    expect(calls.length).toBe(0);
  });

  it("require_model: HTTP failure aborts loudly", async () => {
    stubOllama(() => "HTTP_FAIL");
    const db = fakeDb({ claims: [declared("d1", "evidence score visible always"), publicClaim("p1", "score visible on the site")] });
    await expect(computeDeltasForCompany(baseArgs(db))).rejects.toThrow(/model call failed/);
  });

  it("require_model: unparseable output aborts loudly (no fallback verdicts)", async () => {
    stubOllama(() => "GARBAGE");
    const db = fakeDb({ claims: [declared("d1", "evidence score visible always"), publicClaim("p1", "score visible on the site")] });
    await expect(computeDeltasForCompany(baseArgs(db))).rejects.toThrow(/unparseable/);
  });

  it("confident judge verdict ⇒ judge_confirmed pair; unmatched public claim ⇒ internally_silent", async () => {
    stubOllama((model) =>
      model === "llama3:70b"
        ? { same_subject: true, relation: "echo", confident: true, reason: "both describe score visibility" }
        : { same_subject: true, relation: "echo", reason: "same subject" },
    );
    const db = fakeDb({
      claims: [
        declared("d1", "evidence score visible always"),
        publicClaim("p1", "score visible on the site"),
        publicClaim("p2", "consultants charge hourly rates for projects"),
      ],
    });
    const r = await computeDeltasForCompany(baseArgs(db));
    if (!r.ok) throw new Error("expected ok");
    const pair = r.deltas.find((d) => d.delta_type === "echoed");
    expect(pair?.pairing_basis).toBe("judge_confirmed");
    expect(r.deltas.some((d) => d.delta_type === "internally_silent" && d.public_claim_id === "p2")).toBe(true);
    // declared claim is paired ⇒ NOT publicly_silent
    expect(r.deltas.some((d) => d.delta_type === "publicly_silent")).toBe(false);
    expect(db.tables.claim_deltas.length).toBe(r.deltas.length);
  });

  it("uncertain judge ⇒ inferred basis (tri-state: shown AND labeled, never silently promoted)", async () => {
    stubOllama((model) =>
      model === "llama3:70b"
        ? { same_subject: true, relation: "divergent", confident: false, reason: "possibly the same subject" }
        : { same_subject: true, relation: "divergent", reason: "same subject" },
    );
    const db = fakeDb({ claims: [declared("d1", "evidence score visible always"), publicClaim("p1", "score visible on the site")] });
    const r = await computeDeltasForCompany(baseArgs(db));
    if (!r.ok) throw new Error("expected ok");
    expect(r.deltas.find((d) => d.delta_type === "divergent")?.pairing_basis).toBe("inferred");
  });

  it("declared claim with NO candidate ⇒ publicly_silent (open question, zero model calls)", async () => {
    const calls = stubOllama(() => ({ same_subject: false }));
    const db = fakeDb({ claims: [declared("d1", "become the strategy system of record")] });
    const r = await computeDeltasForCompany(baseArgs(db));
    if (!r.ok) throw new Error("expected ok");
    expect(r.deltas).toHaveLength(1);
    expect(r.deltas[0].delta_type).toBe("publicly_silent");
    expect(calls.length).toBe(0);
  });

  it("operator 'not a pair' tombstone is never re-proposed; claims fall to silence rails", async () => {
    const d1 = declared("d1", "evidence score visible always");
    const p1 = publicClaim("p1", "score visible on the site");
    const tombId = await pairIdentity(String(d1.statement), String(p1.statement));
    const calls = stubOllama(() => ({ same_subject: true, relation: "echo", confident: true, reason: "x" }));
    const db = fakeDb({
      claims: [d1, p1],
      claim_deltas: [{ id: "old-1", company_id: CO, content_identity: tombId, delta_type: "echoed", operator_disposition: "rejected_pairing" }],
    });
    const r = await computeDeltasForCompany(baseArgs(db));
    if (!r.ok) throw new Error("expected ok");
    expect(calls.length).toBe(0); // tombstone skipped before any model call
    expect(r.totals.tombstones_respected).toBe(1);
    expect(r.deltas.some((d) => d.delta_type === "publicly_silent")).toBe(true);
    expect(r.deltas.some((d) => d.delta_type === "internally_silent")).toBe(true);
    // tombstone row survives the write phase
    expect(db.tables.claim_deltas.some((row) => row.id === "old-1")).toBe(true);
  });

  it("recompute is idempotent: second run inserts nothing and preserves dispositions", async () => {
    stubOllama((model) =>
      model === "llama3:70b"
        ? { same_subject: true, relation: "echo", confident: true, reason: "both describe score visibility" }
        : { same_subject: true, relation: "echo", reason: "same subject" },
    );
    const db = fakeDb({ claims: [declared("d1", "evidence score visible always"), publicClaim("p1", "score visible on the site")] });
    const r1 = await computeDeltasForCompany(baseArgs(db));
    if (!r1.ok) throw new Error("expected ok");
    const countAfterFirst = db.tables.claim_deltas.length;
    // operator acts on a row between runs
    db.tables.claim_deltas[0].operator_disposition = "queued";

    const calls2 = stubOllama(() => { throw new Error("no model call expected on identical recompute"); });
    const r2 = await computeDeltasForCompany(baseArgs(db));
    if (!r2.ok) throw new Error("expected ok");
    expect(calls2.length).toBe(0);
    expect(r2.totals.rows_new).toBe(0);
    expect(r2.totals.rows_deleted).toBe(0);
    expect(db.tables.claim_deltas.length).toBe(countAfterFirst);
    expect(db.tables.claim_deltas[0].operator_disposition).toBe("queued");
  });
});
