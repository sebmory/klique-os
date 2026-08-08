import { describe, expect, it } from "vitest";
import { buildDateRange, formatDateRangeLabel, formatDateTimeLabel, isSafeHttpUrl } from "@/services/context-intelligence/utils";

describe("context intelligence date ranges", () => {
  const referenceDate = new Date("2026-08-07T12:00:00.000Z");

  it("builds the last 7 days as an inclusive range", () => {
    expect(buildDateRange("last_7_days", undefined, undefined, referenceDate)).toEqual({
      preset: "last_7_days",
      from: "2026-08-01",
      to: "2026-08-07",
    });
  });

  it("builds the last 30 days as an inclusive range", () => {
    expect(buildDateRange("last_30_days", undefined, undefined, referenceDate)).toEqual({
      preset: "last_30_days",
      from: "2026-07-09",
      to: "2026-08-07",
    });
  });

  it("builds the last 90 days as an inclusive range", () => {
    expect(buildDateRange("last_90_days", undefined, undefined, referenceDate)).toEqual({
      preset: "last_90_days",
      from: "2026-05-10",
      to: "2026-08-07",
    });
  });

  it("builds the last 12 months as an inclusive range", () => {
    expect(buildDateRange("last_12_months", undefined, undefined, referenceDate)).toEqual({
      preset: "last_12_months",
      from: "2025-08-08",
      to: "2026-08-07",
    });
  });

  it("keeps custom ranges intact", () => {
    expect(buildDateRange("custom", "2026-06-01", "2026-06-15", referenceDate)).toEqual({
      preset: "custom",
      from: "2026-06-01",
      to: "2026-06-15",
    });
  });

  it("formats dates for the UI", () => {
    expect(formatDateRangeLabel({ preset: "last_30_days", from: "2026-07-09", to: "2026-08-07" })).toBe(
      "9 juillet 2026 → 7 août 2026"
    );
    const formattedDateTime = formatDateTimeLabel("2026-08-07T18:59:00.000Z");
    expect(formattedDateTime.startsWith("7 août 2026 à ")).toBe(true);
    expect(formattedDateTime.endsWith(":59")).toBe(true);
  });

  it("accepts only safe https urls", () => {
    expect(isSafeHttpUrl("https://example.com/article")).toBe(true);
    expect(isSafeHttpUrl("http://example.com/article")).toBe(false);
    expect(isSafeHttpUrl("not a url")).toBe(false);
  });
});
