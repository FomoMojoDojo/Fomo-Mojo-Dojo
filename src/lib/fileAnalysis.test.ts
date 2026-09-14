import { describe, expect, it } from "vitest";
import { FILE_ANALYSIS_VERSION, formatAnalysisVersion, formatExtractionShape } from "./fileAnalysis";

describe("extraction shape strings (signed 1c, 2026-09-14)", () => {
  it("image-borne docx: chars + images not read, no pages", () => {
    expect(formatExtractionShape({ chars: 341, images: 5, pages: null })).toBe("341 characters of text read · 5 images not read");
  });
  it("normal PDF: chars + pages, no images clause when images = 0", () => {
    expect(formatExtractionShape({ chars: 13139, images: 0, pages: 24 })).toBe("13,139 characters of text read · 24 pages");
  });
  it("all three when a PDF has images", () => {
    expect(formatExtractionShape({ chars: 609, images: 2, pages: 1 })).toBe("609 characters of text read · 2 images not read · 1 pages");
  });
  it("prior proposals (no shape recorded) render nothing", () => {
    expect(formatExtractionShape({ chars: null, images: null, pages: null })).toBeNull();
  });
  it("analysis version stamp; priors read v1", () => {
    expect(formatAnalysisVersion(2)).toBe("Analysis v2");
    expect(formatAnalysisVersion(null)).toBe("Analysis v1");
    expect(FILE_ANALYSIS_VERSION).toBe(2);
  });
});
