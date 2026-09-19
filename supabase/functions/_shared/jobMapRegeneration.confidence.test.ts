// Gate A census item 1 (operator, 2026-09-19) — jobMapRegeneration.ts insert path, evidence_confidence.
// At 44bee3b8 the mapping was `Number.isFinite(v) ? v : 40`; now `v === null ? null : (Number.isFinite(v) ? v : 40)`.
// The ONLY input whose write changed is null (→ NULL; legal only for a market run's rows via
// applyMarketEvidenceRule). Every input a CUSTOMER run can produce — a finite integer from clampInt
// (handler.ts:118-121), or the non-finite classes NaN / ±Infinity / undefined — writes exactly what it
// wrote before. Proven on the REAL regenerateJobMapJourney: a recording stub client captures the
// job_steps insert payload; the values are compared with the HEAD formula applied to the same input.
import { assertEquals, assertStrictEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { regenerateJobMapJourney } from "./jobMapRegeneration.ts";

const HEAD_FORMULA = (v: unknown) => (Number.isFinite(v as number) ? (v as number) : 40);

/** Every from().…  chain resolves {data, error:null}; job_steps inserts are recorded and echoed back as rows. */
function recordingClient() {
  const inserts: Array<{ table: string; rows: Record<string, unknown>[] }> = [];
  const make = (table: string): unknown => {
    let payload: unknown = null;
    const q: Record<string, unknown> = {};
    const handler: ProxyHandler<Record<string, unknown>> = {
      get: (_t, prop) => {
        if (prop === "then") {
          return (resolve: (v: unknown) => void) => {
            const rows = Array.isArray(payload) ? payload : payload ? [payload] : [];
            const data = rows.length ? rows.map((r, i) => ({ id: `row-${table}-${i}`, ...(r as Record<string, unknown>) })) : [];
            resolve({ data, error: null, count: 0 });
          };
        }
        if (prop === "insert" || prop === "upsert") return (p: unknown) => { payload = p; if (prop === "insert") inserts.push({ table, rows: Array.isArray(p) ? p as Record<string, unknown>[] : [p as Record<string, unknown>] }); return new Proxy(q, handler); };
        return () => new Proxy(q, handler);
      },
    };
    return new Proxy(q, handler);
  };
  return { client: { from: (t: string) => make(t) }, inserts };
}

const step = (n: number, conf: unknown) => ({
  step_number: n, step_label: `Step ${n}`, description: `d${n}`, designed: false, has_gap: true,
  evidence_status: "unclear", evidence_basis: "industry_anchor:Healthcare Services", evidence_confidence: conf as number | null, gap_note: "g",
});

Deno.test("customer path: finite and non-finite inputs write exactly what 44bee3b8 wrote (non-finite → 40)", async () => {
  const inputs: unknown[] = [0, 40, 45, 100, 7, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, undefined];
  const { client, inserts } = recordingClient();
  await regenerateJobMapJourney({
    supabase: client as never, companyId: "co", userId: "u", actorType: "system", actorId: "u",
    journeyKey: "customer", journeyTitle: "The customer job", journeySubtitle: "",
    steps: inputs.map((c, i) => step(i + 1, c)), sourceRunId: "run-test", sourceLabel: "local_jobmap_synthesis", frameworksUsed: ["JTBD"],
  });
  const written = inserts.find((i) => i.table === "job_steps")!;
  assertEquals(written.rows.length, inputs.length);
  const got = written.rows.map((r) => r.evidence_confidence);
  const head = inputs.map(HEAD_FORMULA);
  assertEquals(got, head, "every customer-path input writes the same value as at 44bee3b8");
  assertEquals(got.slice(5), [40, 40, 40, 40], "NaN / ±Infinity / undefined still write 40");
  assertEquals(got.slice(0, 5), [0, 40, 45, 100, 7]);
});

Deno.test("market path: null (from applyMarketEvidenceRule) writes NULL — the one input whose write changed", async () => {
  const { client, inserts } = recordingClient();
  await regenerateJobMapJourney({
    supabase: client as never, companyId: "co", userId: "u", actorType: "system", actorId: "u",
    journeyKey: "pmk-funders", journeyTitle: "Funders", journeySubtitle: "",
    steps: [step(1, null), step(2, 62)], sourceRunId: "run-test", sourceLabel: "local_jobmap_synthesis", frameworksUsed: ["JTBD"],
  });
  const written = inserts.find((i) => i.table === "job_steps")!;
  assertStrictEquals(written.rows[0].evidence_confidence, null);
  assertEquals(written.rows[1].evidence_confidence, 62);
  assertEquals(HEAD_FORMULA(null), 40, "at 44bee3b8 a null would have become 40 — the invented percentage M2 removes");
});
