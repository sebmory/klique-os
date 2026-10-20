import { describe, expect, it } from "vitest";
import { isPartnerAthleteIntroductionsEnabled } from "@/lib/partner-athlete-introductions/activation";

describe("partner introduction activation", () => {
  it.each([undefined, "", "false", "1", "yes", "TRUE", " true "])(
    "stays disabled for %s",
    (value) => {
      expect(isPartnerAthleteIntroductionsEnabled(value)).toBe(false);
    },
  );

  it("requires an explicit true value", () => {
    expect(isPartnerAthleteIntroductionsEnabled("true")).toBe(true);
  });
});
