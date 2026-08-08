import { describe, expect, it } from "vitest";
import { hasRealAthletesSource } from "@/components/production/ProductionDetailScreen";

describe("ProductionDetail athlete source guard", () => {
  it("accepts athlete payload only when source is google-sheets", () => {
    expect(
      hasRealAthletesSource({
        athletes: [],
        source: "google-sheets",
      })
    ).toBe(true);
  });

  it("rejects demo athlete payload", () => {
    expect(
      hasRealAthletesSource({
        athletes: [],
        source: "demo",
      })
    ).toBe(false);
  });
});
