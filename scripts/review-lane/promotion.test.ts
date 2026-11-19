// A5 (2026-11-18): promote-verified's decision — what a verify verdict writes on a lead row.
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { promotionWrite } from "./promotion.ts";

Deno.test("a promoted lead gets the page's quote, paragraph and date, names its verify call, and is released", () => {
  const w = promotionWrite({ promoted: true, quote: "My bill went up again.", quote_source_text: "Nov 2, 2026\n\nMy bill went up again.", page_url: "https://p.test/r",
    event_date: "2026-11-02", event_date_precision: "day", date_basis: "review_header", review_body: "My bill went up again." }, "call-1", "2026-11-18T00:00:00Z");
  assertEquals(w.kind, "promote");
  if (w.kind !== "promote") return;
  assertEquals([w.quote, w.quote_source_text, w.event_date, w.release], ["My bill went up again.", "Nov 2, 2026\n\nMy bill went up again.", "2026-11-02", true]);
  assertEquals(w.payload.quote_basis, "web_fetch_page_text");
  assertEquals(w.payload.verified_by_call_id, "call-1");
  assertEquals(w.payload.lead_verify, { call: "call-1", result: "promoted", page_url: "https://p.test/r", at: "2026-11-18T00:00:00Z" });
});

Deno.test("a lead that fails keeps no quote, is not released, and records why", () => {
  for (const reason of ["not_on_fetched_page", "fetch_error:url_not_allowed", "rule:company_reply"]) {
    const w = promotionWrite({ promoted: false, reason }, "call-2", "t");
    assertEquals(w, { kind: "lead", release: false, payload: { lead_verify: { call: "call-2", result: "lead", reason, at: "t" } } });
  }
});

Deno.test("a promoted lead with no date on the page keeps the row's own date (event_date null)", () => {
  const w = promotionWrite({ promoted: true, quote: "q", quote_source_text: "q", page_url: "u", event_date: null, event_date_precision: "day", date_basis: null, review_body: "q" }, "c", "t");
  assertEquals(w.kind === "promote" ? w.event_date : "x", null);
});
