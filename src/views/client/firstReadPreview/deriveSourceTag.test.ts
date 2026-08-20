import { describe, it, expect } from "vitest";
import { deriveSourceTag, formatFullDate, trimmedPage } from "./deriveSourceTag";
import type { DeclaredClaimSource, PublicSignalSource } from "./deriveSourceTag";

const publicRow = (over: Partial<PublicSignalSource>): PublicSignalSource => ({
  kind: "public_signal",
  sourceUrl: null,
  sourceTitle: null,
  runDate: null,
  eventDate: null,
  ...over,
});

const declaredRow = (over: Partial<DeclaredClaimSource>): DeclaredClaimSource => ({
  kind: "declared_claim",
  rawPayload: null,
  refUpload: null,
  canvasUpdatedAt: null,
  intakeSubmittedAt: null,
  claimCreatedAt: null,
  ...over,
});

describe("deriveSourceTag — public signal rows", () => {
  it("url + run date → trimmed page · read <run date>, href kept", () => {
    expect(
      deriveSourceTag(
        publicRow({
          sourceUrl: "https://www.edgewoodcenter.org/programs/",
          runDate: "2026-07-24T21:07:47+00:00",
          eventDate: "2026-01-01",
        }),
      ),
    ).toEqual({
      label: "edgewoodcenter.org/programs · read July 24, 2026",
      href: "https://www.edgewoodcenter.org/programs/",
    });
  });

  it("url without run date falls back to event_date", () => {
    expect(
      deriveSourceTag(publicRow({ sourceUrl: "https://cafebarra.com/story", eventDate: "2026-06-12" })),
    ).toEqual({ label: "cafebarra.com/story · read June 12, 2026", href: "https://cafebarra.com/story" });
  });

  it("url with no dates renders the page alone", () => {
    expect(deriveSourceTag(publicRow({ sourceUrl: "https://cafebarra.com/" }))).toEqual({
      label: "cafebarra.com",
      href: "https://cafebarra.com/",
    });
  });

  it("no url: an informative stored title still renders", () => {
    expect(deriveSourceTag(publicRow({ sourceTitle: "Our Story — Cafe Barra" }))).toEqual({
      label: "Our Story — Cafe Barra",
    });
  });

  it("no url: '<company> public baseline' pattern is uninformative → hidden", () => {
    expect(deriveSourceTag(publicRow({ sourceTitle: "Edgewood Center public baseline" }))).toBeNull();
    expect(deriveSourceTag(publicRow({ sourceTitle: "Cafe Barra 2 public baseline" }))).toBeNull();
    expect(deriveSourceTag(publicRow({ sourceTitle: "Public Research" }))).toBeNull();
  });

  it("nothing derivable → null", () => {
    expect(deriveSourceTag(publicRow({}))).toBeNull();
  });
});

describe("deriveSourceTag — declared claims (birth record)", () => {
  it("uploaded_file signal ref → file name · upload date", () => {
    expect(
      deriveSourceTag(
        declaredRow({
          refUpload: { fileName: "Edgewood Strategy Review.md", date: "2026-06-04T10:00:00Z" },
        }),
      ),
    ).toEqual({ label: "Edgewood Strategy Review.md · June 4, 2026" });
  });

  it("no-ref manual remint citing a PDF in basis → file name · mint date (bypass closed)", () => {
    expect(
      deriveSourceTag(
        declaredRow({
          rawPayload: {
            basis: "verbatim sentences, Cafe_Barra_Strategic_Framework_Final_June 22 2026.pdf p.1",
            source: "manual_remint_20260807",
          },
          claimCreatedAt: "2026-08-07T18:00:00Z",
        }),
      ),
    ).toEqual({ label: "Cafe_Barra_Strategic_Framework_Final_June 22 2026.pdf · August 7, 2026" });
  });

  it("canvas-minted → Declared direction canvas · canvas updated date", () => {
    expect(
      deriveSourceTag(
        declaredRow({
          rawPayload: { minted_by: "pcl1-mint-positioning-claims", source_canvas_id: "b0b6aa8a-x" },
          canvasUpdatedAt: "2026-07-16T09:30:00Z",
          claimCreatedAt: "2026-08-04T17:05:45Z",
        }),
      ),
    ).toEqual({ label: "Declared direction canvas · July 16, 2026" });
  });

  it("canvas-minted with unresolved canvas date omits the date, never substitutes", () => {
    expect(
      deriveSourceTag(declaredRow({ rawPayload: { source_canvas_id: "b0b6aa8a-x" } })),
    ).toEqual({ label: "Declared direction canvas" });
  });

  it("intake-derived → Intake response · submitted date", () => {
    expect(
      deriveSourceTag(declaredRow({ intakeSubmittedAt: "2026-05-02", rawPayload: {} })),
    ).toEqual({ label: "Intake response · May 2, 2026" });
    expect(deriveSourceTag(declaredRow({ rawPayload: { source: "intake_v1" } }))).toEqual({
      label: "Intake response",
    });
  });

  it("FALSIFICATION: an unsourced declared row is hidden — the row that used to show fixed copy", () => {
    // Before this ruling, every surviving declared row rendered the fixed
    // string "Stated to us directly" regardless of its birth record. An
    // empty birth record must now hide the tag entirely.
    const result = deriveSourceTag(declaredRow({ rawPayload: {} }));
    expect(result).toBeNull();
  });

  it("no branch ever returns direct-statement copy", () => {
    const inputs: Array<PublicSignalSource | DeclaredClaimSource> = [
      publicRow({ sourceUrl: "https://x.com/a" }),
      publicRow({ sourceTitle: "Some Page" }),
      declaredRow({ refUpload: { fileName: "a.pdf", date: null } }),
      declaredRow({ rawPayload: { basis: "b.docx" } }),
      declaredRow({ rawPayload: { source_canvas_id: "c" } }),
      declaredRow({ rawPayload: { source: "intake" } }),
    ];
    for (const input of inputs) {
      const tag = deriveSourceTag(input);
      expect(tag?.label ?? "").not.toMatch(/stated to us/i);
    }
  });
});

describe("deriveSourceTag — formatting primitives", () => {
  it("formatFullDate parses ISO date and timestamp; rejects garbage", () => {
    expect(formatFullDate("2026-07-24")).toBe("July 24, 2026");
    expect(formatFullDate("2026-07-24T21:07:47+00:00")).toBe("July 24, 2026");
    expect(formatFullDate("not-a-date")).toBeNull();
    expect(formatFullDate(null)).toBeNull();
  });
  it("trimmedPage strips scheme, www, query, trailing slash", () => {
    expect(trimmedPage("https://www.a.com/b/c/?q=1#f")).toBe("a.com/b/c");
    expect(trimmedPage("a.com")).toBe("a.com");
    expect(trimmedPage("http://a.com/")).toBe("a.com");
    expect(trimmedPage("::::")).toBeNull();
  });
});
