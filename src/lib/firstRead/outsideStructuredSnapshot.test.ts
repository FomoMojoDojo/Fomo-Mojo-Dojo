// LISTING CLASS crawl path (2026-09-04, shape (a)+(b)): the structured block is captured from RAW html BEFORE
// cleaning and the prose body is byte-identical to the pre-existing extractTextBasic path.
import { describe, expect, it } from "vitest";
import { snapshotFromHtml } from "../../../supabase/functions/_shared/outsidePageStore";
import { extractTextBasic } from "../../../supabase/functions/_shared/fetchAndExtract";

const HTML = `<html><head><meta property="og:type" content="product"><meta property="og:title" content="Cafe Barra Machado de Assis Brazil"><script type="application/ld+json">{"@type":"Product","name":"Cafe Barra Machado de Assis Brazil","brand":{"@type":"Thing","name":"Cafe Barra"},"offers":{"price":"22.0","priceCurrency":"USD"}}</script></head><body><div>Cafe Barra</div><h1>Cafe Barra Machado de Assis Brazil</h1><div>$22.00</div><script>{"vendor":"Cafe Barra"}</script></body></html>`;

describe("snapshotFromHtml", () => {
  it("structured captured; body identical to extractTextBasic (scripts stripped from the body, kept in structured)", () => {
    const s = snapshotFromHtml(HTML);
    expect(s.clean_text).toBe(extractTextBasic(HTML).slice(0, 12_000));
    expect(s.clean_text).not.toContain("ld+json");
    expect(s.structured.ld_json).toHaveLength(1);
    expect(s.structured.og.title).toBe("Cafe Barra Machado de Assis Brazil");
    expect(s.structured.vendor).toBe("Cafe Barra");
  });
});
