import { describe, expect, it } from "vitest";
import {
  formatCreativeApplicationDate,
  parseCreativeApplicationDate,
} from "@/lib/creatives/application-date";

describe("creative application dates", () => {
  it("formats Google Sheets serial dates in Europe/Zurich without exposing the raw value", () => {
    const raw = "46335.45586314815";
    const formatted = formatCreativeApplicationDate(raw);

    expect(formatted).toContain("09.11.2026");
    expect(formatted).toContain("10:56");
    expect(formatted).not.toContain(raw);
  });

  it("supports ISO dates and Unix timestamps", () => {
    expect(formatCreativeApplicationDate("2026-11-09T09:56:00.000Z"))
      .toContain("10:56");
    expect(parseCreativeApplicationDate(1_762_683_360)).toBeInstanceOf(Date);
    expect(parseCreativeApplicationDate(1_762_683_360_000)).toBeInstanceOf(Date);
  });

  it("interprets existing local date strings in Europe/Zurich", () => {
    expect(formatCreativeApplicationDate("2026-11-09 10:56:00"))
      .toContain("10:56");
    expect(formatCreativeApplicationDate("09.11.2026 10:56"))
      .toContain("10:56");
  });

  it("uses neutral labels for absent and invalid dates", () => {
    expect(formatCreativeApplicationDate("")).toBe("Date non renseignée");
    expect(formatCreativeApplicationDate(null)).toBe("Date non renseignée");
    expect(formatCreativeApplicationDate("not-a-date")).toBe("Date invalide");
  });
});
