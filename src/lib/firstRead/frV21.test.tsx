// FR-V2-1 — the v2 shell: act order/titles single-sourced, export follows, lazy-mint
// single-flight (no double-mint), placeholder carries no fabricated substance.

import { describe, it, expect, vi } from "vitest";
import { FR_ACTS, FR_EXPORT_ACTS } from "./acts";
import { createSessionEnsurer } from "./lazyMint";
import { buildFirstReadExportHtml, type FirstReadExportData } from "./exportHtml";

describe("FR-V2-1/2-2/2-3 — act structure (single source)", () => {
  it("the five v2 acts in order; V2-3 retired the last placeholder (Act 2 filled)", () => {
    expect(FR_ACTS.map((a) => a.key)).toEqual(["say", "why_outside", "outside_shows", "check", "help"]);
    expect(FR_ACTS.map((a) => a.title)).toEqual([
      "What You Say", "Why We Start Outside", "What the Outside Shows", "The Check", "How We Can Help",
    ]);
    // V2-10: the placeholder field is retired — every act carries substance, so the export
    // follows ALL five (FR_EXPORT_ACTS === FR_ACTS, no filter).
    expect(FR_EXPORT_ACTS.length).toBe(FR_ACTS.length);
    expect(FR_EXPORT_ACTS.map((a) => a.title)).toEqual([
      "What You Say", "Why We Start Outside", "What the Outside Shows", "The Check", "How We Can Help",
    ]);
  });
});

describe("FR-V2-1 — export byte-follows the screen act constants", () => {
  const data: FirstReadExportData = {
    company: { name: "Acme" },
    session: { id: "s1", date: "2026-07-23", presenter: null },
    statedProblem: null,
    standard: null,
    mirror: { score: null, bet: null, findings: [] },
    perception: [],
    check: { items: [], tally: { confirmed: 0, corrected: 0, rejected: 0, not_important: 0 } },
    gap: [], proposal: null, exportedAt: "2026-07-23T00:00:00Z",
  };
  it("section titles = FR_EXPORT_ACTS titles, in order; every act reaches the export", () => {
    const html = buildFirstReadExportHtml(data);
    const titles = [...html.matchAll(/<h1 class="sec">([^<]+)<\/h1>/g)].map((m) => m[1]);
    expect(titles).toEqual(FR_EXPORT_ACTS.map((a) => a.title));
    // V2-3: Act 2 now carries substance and reaches the leave-behind (no placeholders left)
    expect(html).toContain("What You Say");
    expect(html).toContain("Why We Start Outside");
  });
});

describe("FR-V2-1 — lazy-mint single-flight (no double-mint)", () => {
  function fakeClient(counters: { inserts: number }) {
    const chain = {
      select: () => chain, eq: () => chain, in: () => chain, order: () => chain, limit: () => chain,
      maybeSingle: async () => ({ data: null, error: null }), // no existing session
      insert: () => {
        counters.inserts++;
        return { select: () => ({ single: async () => ({ data: { id: `sess-${counters.inserts}` }, error: null }) }) };
      },
    };
    return { from: () => chain } as unknown as Parameters<typeof createSessionEnsurer>[0]["supabase"];
  }

  it("two concurrent ensureSession calls mint exactly ONE session", async () => {
    const counters = { inserts: 0 };
    let sid = "";
    const ensure = createSessionEnsurer({
      supabase: fakeClient(counters), companyId: "c1",
      getSessionId: () => sid, setSessionId: (id) => { sid = id; },
    });
    const [a, b] = await Promise.all([ensure(), ensure()]); // rapid double-tap
    expect(counters.inserts).toBe(1); // FALSIFICATION target: a double-mint pushes this to 2
    expect(a).toBe(b);
    expect(sid).toBe("sess-1");
  });

  it("with an existing session, no mint at all", async () => {
    const counters = { inserts: 0 };
    let sid = "existing";
    const ensure = createSessionEnsurer({
      supabase: fakeClient(counters), companyId: "c1",
      getSessionId: () => sid, setSessionId: (id) => { sid = id; },
    });
    expect(await ensure()).toBe("existing");
    expect(counters.inserts).toBe(0);
  });
});
