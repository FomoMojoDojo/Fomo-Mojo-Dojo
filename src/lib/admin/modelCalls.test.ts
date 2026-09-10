// COST LEDGER (Gate 3, 2026-09-10).
//
// Six edge functions computed a USD cost and returned it in an HTTP body no caller parsed; the
// own-words judge never read `data.usage` at all. Every run's spend vanished with the response, and
// no table in the system had a cost or token column. These tests pin the three properties that make
// the new ledger trustworthy: it records, it never breaks the call it measures, and it is honest
// about how much of the system it covers.
import { describe, expect, it, vi } from "vitest";
import {
  openaiRecord, recordModelCall, usdFromUsage,
} from "../../../supabase/functions/_shared/recordModelCall";
import {
  MODEL_CALL_SITES, costCoverage, coverageLabel, type ModelCallSite,
} from "../../../supabase/functions/_shared/modelCallSites";

/** A supabase double that captures inserts. */
function sbSpy(onInsert?: (row: unknown) => { error: { message: string } | null }) {
  const rows: unknown[] = [];
  return {
    rows,
    client: {
      from: (t: string) => ({
        insert: (row: unknown) => {
          if (t !== "model_calls") throw new Error(`unexpected table ${t}`);
          rows.push(row);
          return Promise.resolve(onInsert ? onInsert(row) : { error: null });
        },
      }),
    },
  };
}

const USAGE = { prompt_tokens: 12_000, completion_tokens: 3_000 };

describe("usd is computed one way, from the same price table the six sites use", () => {
  it("gpt-4.1-mini at $0.40 in / $1.60 out per Mtok", () => {
    // 12k in = 0.0048, 3k out = 0.0048
    expect(usdFromUsage(USAGE)).toBeCloseTo(0.0096, 6);
  });
  it("no usage → null, never 0 (a gap is not free)", () => {
    expect(usdFromUsage(null)).toBeNull();
    expect(usdFromUsage(undefined)).toBeNull();
    expect(openaiRecord("gpt-4.1-mini", null).usd).toBeNull();
    expect(openaiRecord("gpt-4.1-mini", null).prompt_tokens).toBeNull();
  });
});

describe("recordModelCall inserts one row per call", () => {
  it("writes the six sites' shapes", async () => {
    const sites = [
      "generate-public-read", "generate-claim-deltas", "backstop-delta-relevance",
      "generate-signal-recurrence", "generate-open-questions", "generate-conflict-explanation",
    ];
    const s = sbSpy();
    for (const site of sites) {
      const ok = await recordModelCall(s.client, {
        companyId: "co1", runId: null, callSite: site, usage: openaiRecord("gpt-4.1-mini", USAGE),
      });
      expect(ok).toBe(true);
    }
    expect(s.rows).toHaveLength(6);
    const first = s.rows[0] as Record<string, unknown>;
    expect(first.company_id).toBe("co1");
    expect(first.call_site).toBe("generate-public-read");
    expect(first.provider).toBe("openai");
    expect(first.model).toBe("gpt-4.1-mini");
    expect(first.prompt_tokens).toBe(12_000);
    expect(first.completion_tokens).toBe(3_000);
    expect(Number(first.usd)).toBeCloseTo(0.0096, 6);
    expect(first.run_id).toBeNull();
  });

  it("carries the run id when the site has one", async () => {
    const s = sbSpy();
    await recordModelCall(s.client, { companyId: "co1", runId: "run-uuid", callSite: "generate-open-questions", usage: openaiRecord("gpt-4.1-mini", USAGE) });
    expect((s.rows[0] as Record<string, unknown>).run_id).toBe("run-uuid");
  });

  it("refuses to write without a company (nothing to attribute the spend to)", async () => {
    const s = sbSpy();
    expect(await recordModelCall(s.client, { companyId: "", callSite: "x", usage: openaiRecord("m", USAGE) })).toBe(false);
    expect(s.rows).toHaveLength(0);
  });
});

describe("an accounting failure NEVER fails the call it measures", () => {
  it("an insert error is reported false, not thrown", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const s = sbSpy(() => ({ error: { message: "relation model_calls does not exist" } }));
    await expect(recordModelCall(s.client, { companyId: "co1", callSite: "generate-public-read", usage: openaiRecord("m", USAGE) }))
      .resolves.toBe(false);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("a THROWING client is caught, not propagated", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const throwing = { from: () => ({ insert: () => { throw new Error("network down"); } }) };
    await expect(recordModelCall(throwing, { companyId: "co1", callSite: "s", usage: openaiRecord("m", USAGE) }))
      .resolves.toBe(false);
    warn.mockRestore();
  });
});

describe("coverage is COMPUTED from the registry, not a maintained label", () => {
  it("the seven sites wired in this gate are captured; the rest are not", () => {
    const cov = costCoverage();
    expect(cov.captured).toBe(7);
    expect(cov.complete).toBe(false);
    expect(cov.uncaptured).toContain("ollama-local-judges");
    expect(coverageLabel(cov)).toBe(`partial (7 of ${cov.total} sites)`);
  });

  it("VACUOUS PROOF — flipping one captured site to false changes coverage", () => {
    const mutated: ModelCallSite[] = MODEL_CALL_SITES.map((s) =>
      s.site === "generate-public-read" ? { ...s, captured: false } : s,
    );
    const before = costCoverage();
    const after = costCoverage(mutated);
    expect(after.captured).toBe(before.captured - 1);
    expect(after.uncaptured).toContain("generate-public-read");
    expect(coverageLabel(after)).not.toBe(coverageLabel(before));
  });

  it("a fully captured registry reports complete, not 'partial'", () => {
    const all: ModelCallSite[] = MODEL_CALL_SITES.map((s) => ({ ...s, captured: true }));
    const cov = costCoverage(all);
    expect(cov.complete).toBe(true);
    expect(coverageLabel(cov)).toBe("complete");
  });

  it("every registered site has a stable id and a provider", () => {
    const ids = MODEL_CALL_SITES.map((s) => s.site);
    expect(new Set(ids).size).toBe(ids.length); // no duplicates — call_site is the join key
    for (const s of MODEL_CALL_SITES) {
      expect(s.site.length).toBeGreaterThan(0);
      expect(["openai", "ollama", "anthropic", "dify"]).toContain(s.provider);
      if (!s.captured) expect(s.note).toBeTruthy(); // an uncaptured site must say why
    }
  });
});
