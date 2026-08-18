// Own-domain deterministic minting (design gate 2026-08-18) — mint shape,
// supersession (with the vacuous-proof: the stamp assertion fails if the stamp
// logic is removed), receipts-only structural flag, excluded-domain refusal,
// and the sitemap cap. All against an injected mock client — no network, no DB.

import { describe, it, expect, vi } from "vitest";
import {
  mintSiteCrawlSignals,
  isSiteCrawlReceiptRow,
  parseSitemapUrls,
  firstQuoteLine,
  pageHead,
  type SitePage,
} from "./mint.ts";

const COMPANY = "11111111-1111-4111-8111-111111111111";

type Row = Record<string, unknown>;

// Chainable mock supabase capturing inserts/updates; select resolves to the
// provided existing rows.
function mockClient(existing: Row[]) {
  const inserts: Row[] = [];
  const updates: Array<{ patch: Row; id: string }> = [];
  let idSeq = 0;
  const client = {
    from: (table: string) => {
      if (table !== "signals") throw new Error(`unexpected table ${table}`);
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              is: async () => ({ data: existing, error: null }),
            }),
          }),
        }),
        insert: (row: Row) => ({
          select: () => ({
            single: async () => {
              inserts.push(row);
              idSeq += 1;
              return { data: { id: `new-${idSeq}` }, error: null };
            },
          }),
        }),
        update: (patch: Row) => ({
          eq: async (_col: string, id: string) => {
            updates.push({ patch, id });
            return { data: null, error: null };
          },
        }),
      };
    },
  };
  return { client, inserts, updates };
}

const PAGE: SitePage = {
  url: "https://www.cafebarra.com/",
  title: "Cafe Barra",
  meta: "Pour-Over packs let you take great coffee anywhere.",
  extracted:
    "Never let convenience make you compromise on taste\nCafe Barra Pour-Over packs allows you to take great, fresh coffee with you wherever you go. Just add hot water.",
};

describe("mintSiteCrawlSignals — mint shape", () => {
  it("mints a client_voice signal with verbatim claim_text, byte-exact quote, full retained text, and the structural flags", async () => {
    const { client, inserts } = mockClient([]);
    const ledger = await mintSiteCrawlSignals({
      supabase: client,
      companyId: COMPANY,
      runId: 77,
      pages: [PAGE],
    });

    expect(ledger).toMatchObject({ pages_read: 1, kept: 0, added: 1, superseded: 0 });
    expect(inserts).toHaveLength(1);
    const row = inserts[0] as Record<string, any>;
    expect(row.voice_class).toBe("client_voice"); // FORCED
    expect(row.claim_text).toBe("Cafe Barra — Pour-Over packs let you take great coffee anywhere."); // title+meta verbatim
    expect(row.quote_source_text).toBe(PAGE.extracted); // full retained text at mint
    // byte-exact: the DB CHECK's condition holds
    expect(typeof row.quote).toBe("string");
    expect(row.quote_source_text.includes(row.quote)).toBe(true);
    expect(row.raw_payload.source_type).toBe("site_crawl");
    expect(row.raw_payload.receipts_only).toBe(true);
    expect(row.event_date_precision).toBe("day");
    expect(row.source_type).toBe("public_baseline_run");
  });
});

describe("mintSiteCrawlSignals — supersession", () => {
  it("changed page text → inserts new row AND stamps the old one (fails if the stamp logic is removed)", async () => {
    const { client, inserts, updates } = mockClient([
      { id: "old-1", source_url: "https://www.cafebarra.com/", quote_source_text: "WE ROAST COFFEE. Small Batch, Hand-Roasted Coffees old text here.", raw_payload: {} },
    ]);
    const nowIso = vi.fn(() => "2026-08-18T23:00:00.000Z");
    const ledger = await mintSiteCrawlSignals({
      supabase: client,
      companyId: COMPANY,
      runId: 78,
      pages: [PAGE],
      nowIso,
    });

    expect(ledger).toMatchObject({ pages_read: 1, kept: 0, added: 0, superseded: 1 });
    expect(inserts).toHaveLength(1);
    // VACUOUS-PROOF: the old row must actually receive the stamp
    expect(updates).toHaveLength(1);
    expect(updates[0].id).toBe("old-1");
    expect(updates[0].patch).toMatchObject({ superseded_at: "2026-08-18T23:00:00.000Z", superseded_by: "new-1" });
    // the change report pairs old and new heads
    expect(ledger.changes).toHaveLength(1);
    expect(ledger.changes[0].url).toBe("https://www.cafebarra.com/");
    expect(ledger.changes[0].old_head).toContain("WE ROAST COFFEE");
    expect(ledger.changes[0].new_head).toContain("Never let convenience");
  });

  it("identical page text → no insert, no stamp (kept)", async () => {
    const { client, inserts, updates } = mockClient([
      { id: "old-1", source_url: "https://www.cafebarra.com/", quote_source_text: PAGE.extracted, raw_payload: {} },
    ]);
    const ledger = await mintSiteCrawlSignals({ supabase: client, companyId: COMPANY, runId: 79, pages: [PAGE] });
    expect(ledger).toMatchObject({ pages_read: 1, kept: 1, added: 0, superseded: 0 });
    expect(inserts).toHaveLength(0);
    expect(updates).toHaveLength(0);
  });
});

describe("mintSiteCrawlSignals — exclusions", () => {
  it("a page on an excluded host never mints, even when handed in", async () => {
    const { client, inserts } = mockClient([]);
    const ledger = await mintSiteCrawlSignals({
      supabase: client,
      companyId: COMPANY,
      runId: 80,
      pages: [{ ...PAGE, url: "https://blocked.example.com/page" }],
      excludeHosts: ["blocked.example.com"],
    });
    expect(inserts).toHaveLength(0);
    expect(ledger.pages_read).toBe(0);
  });

  it("thin pages (under the minimum) never mint", async () => {
    const { client, inserts } = mockClient([]);
    await mintSiteCrawlSignals({
      supabase: client,
      companyId: COMPANY,
      runId: 81,
      pages: [{ url: "https://www.cafebarra.com/thin", extracted: "too short" }],
    });
    expect(inserts).toHaveLength(0);
  });
});

describe("receipts-only structural flag", () => {
  it("isSiteCrawlReceiptRow reads the raw_payload flag, not naming conventions", () => {
    expect(isSiteCrawlReceiptRow({ raw_payload: { source_type: "site_crawl" } })).toBe(true);
    expect(isSiteCrawlReceiptRow({ raw_payload: { source_type: "analysis" } })).toBe(false);
    expect(isSiteCrawlReceiptRow({ raw_payload: {} })).toBe(false);
    expect(isSiteCrawlReceiptRow({})).toBe(false);
    expect(isSiteCrawlReceiptRow(null)).toBe(false);
  });
});

describe("parseSitemapUrls — cap and domain discipline", () => {
  const xml = (urls: string[]) =>
    `<?xml version="1.0"?><urlset>${urls.map((u) => `<url><loc>${u}</loc></url>`).join("")}</urlset>`;

  it("respects the cap and keeps same-domain pages only", () => {
    const urls = Array.from({ length: 30 }, (_, i) => `https://www.cafebarra.com/page-${i}`);
    urls.push("https://evil.example.com/x"); // off-domain never survives
    const out = parseSitemapUrls(xml(urls), "cafebarra.com", 20);
    expect(out).toHaveLength(20);
    expect(out.every((u) => new URL(u).hostname.endsWith("cafebarra.com"))).toBe(true);
  });

  it("handles malformed and duplicate locs without throwing", () => {
    const out = parseSitemapUrls(
      xml(["https://cafebarra.com/a", "https://cafebarra.com/a", "notaurl", "ftp://cafebarra.com/b"]),
      "cafebarra.com",
      10,
    );
    expect(out).toEqual(["https://cafebarra.com/a"]);
  });
});

describe("helpers", () => {
  it("firstQuoteLine cuts a contiguous byte-exact substring", () => {
    const q = firstQuoteLine(PAGE.extracted);
    expect(q).toBe("Never let convenience make you compromise on taste");
    expect(PAGE.extracted.includes(q as string)).toBe(true);
    const long = "x".repeat(10) + " " + "word ".repeat(120);
    const cut = firstQuoteLine(long);
    expect((cut as string).length).toBeLessThanOrEqual(280);
    expect(long.includes(cut as string)).toBe(true);
  });

  it("pageHead collapses whitespace and bounds length", () => {
    expect(pageHead("  a\n\n b   c  ")).toBe("a b c");
    expect(pageHead("z".repeat(500)).length).toBe(160);
  });
});
