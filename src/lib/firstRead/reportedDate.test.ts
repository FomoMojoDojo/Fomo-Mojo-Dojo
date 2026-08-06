import { describe, it, expect } from "vitest";
import { formatMonthYear, formatReportedLine } from "./reportedDate";

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
