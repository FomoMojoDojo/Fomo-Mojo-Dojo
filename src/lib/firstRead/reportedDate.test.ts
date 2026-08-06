import { describe, it, expect } from "vitest";
import { formatMonthYear, formatReportedLine, formatSourceAttribution } from "./reportedDate";

describe("reportedDate — the single-home Reported-line formatter", () => {
  it("formatMonthYear: ISO date or timestamp → 'Mon YYYY' (TZ-safe, day never shown)", () => {
    expect(formatMonthYear("2025-07-18")).toBe("Jul 2025");
    expect(formatMonthYear("2026-04-01")).toBe("Apr 2026"); // month-precision stored day is dropped
    expect(formatMonthYear("2026-07-24T00:00:00+00")).toBe("Jul 2026"); // created_at timestamptz
    expect(formatMonthYear("")).toBe("");
    expect(formatMonthYear(null)).toBe("");
    expect(formatMonthYear("nope")).toBe("");
  });

  it("formatReportedLine: byte-exact signed string with the U+00B7 separator", () => {
    const line = formatReportedLine("2025-07-18", "2026-07-24T00:00:00+00");
    expect(line).toBe("Reported Jul 2025 · read by us Jul 2026");
    // the separator is the middle dot U+00B7, not an ASCII bullet or hyphen
    expect(line!.includes("·")).toBe(true);
  });

  it("day-precision and month-precision render identically (both month-year)", () => {
    // same event month, one day-precise one month-precise (stored -01) → identical line
    expect(formatReportedLine("2025-07-01", "2026-07-24")).toBe("Reported Jul 2025 · read by us Jul 2026");
  });

  it("no event_date → null (no line renders)", () => {
    expect(formatReportedLine(null, "2026-07-24")).toBeNull();
    expect(formatReportedLine("", "2026-07-24")).toBeNull();
    expect(formatReportedLine(undefined, "2026-07-24")).toBeNull();
  });
});

describe("formatSourceAttribution — host + date composition (the single home)", () => {
  it("host + date → '{host} · Reported {Mon YYYY} · read by us {Mon YYYY}' (both U+00B7)", () => {
    const line = formatSourceAttribution(
      "https://www.glassdoor.com/Reviews/Edgewood-Center-Reviews-E145192.htm",
      "2025-07-18",
      "2026-07-24T00:00:00+00",
    );
    expect(line).toBe("glassdoor.com · Reported Jul 2025 · read by us Jul 2026");
    // exactly two middle-dot U+00B7 separators (host·reported and reported·read)
    expect((line!.match(/·/g) ?? []).length).toBe(2);
  });

  it("host only (undated) → the bare registrable domain, no date text", () => {
    const line = formatSourceAttribution("https://www.yelp.com/biz/edgewood-san-francisco-2", null, "2026-07-24");
    expect(line).toBe("yelp.com");
    expect(line).not.toContain("Reported");
    expect(line).not.toContain("·");
  });

  it("no source_url but dated → the a986cda string UNCHANGED (date-only branch)", () => {
    const line = formatSourceAttribution(null, "2025-07-18", "2026-07-24T00:00:00+00");
    expect(line).toBe("Reported Jul 2025 · read by us Jul 2026");
    expect(line).toBe(formatReportedLine("2025-07-18", "2026-07-24T00:00:00+00"));
  });

  it("neither source_url nor event_date → null (no line)", () => {
    expect(formatSourceAttribution(null, null, "2026-07-24")).toBeNull();
    expect(formatSourceAttribution("", "", "2026-07-24")).toBeNull();
    expect(formatSourceAttribution(undefined, undefined, undefined)).toBeNull();
  });

  it("host is a bare domain, never markup (anchor-free)", () => {
    const line = formatSourceAttribution("https://www.charitynavigator.org/ein/941186168", null, null);
    expect(line).toBe("charitynavigator.org");
    expect(line).not.toContain("<");
    expect(line).not.toContain("http");
  });
});
