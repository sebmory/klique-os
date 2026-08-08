import { describe, expect, it } from "vitest";
import { hasRealEcosystemSource } from "@/components/ecosystem/EcosystemResourceScreen";

describe("EcosystemResourceScreen source guard", () => {
  it("returns true when source is google-sheets", () => {
    expect(
      hasRealEcosystemSource({
        resources: [],
        source: "google-sheets",
      })
    ).toBe(true);
  });

  it("returns false when source is demo", () => {
    expect(
      hasRealEcosystemSource({
        resources: [],
        source: "demo",
      })
    ).toBe(false);
  });
});
