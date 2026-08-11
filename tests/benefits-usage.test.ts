import { describe, expect, it } from "vitest";

import { inferBenefitUsage } from "@/lib/benefits-usage";

describe("inferBenefitUsage", () => {
  it("defaults to unlimited when no usage information exists", () => {
    expect(inferBenefitUsage({})).toEqual({ usageType: "unlimited" });
  });

  it("detects a single-use advantage from explicit wording", () => {
    expect(inferBenefitUsage({ memberOffer: "Offre utilisable une seule fois par membre" })).toEqual({ usageType: "once" });
  });

  it("detects a limited-use advantage with a numeric count", () => {
    expect(inferBenefitUsage({ notes: "Utilisable 4 fois par membre" })).toEqual({ usageType: "limited", usageLimit: 4 });
  });

  it("keeps a provided limit and does not invent one", () => {
    expect(inferBenefitUsage({ description: "Offre valable 3 fois" })).toEqual({ usageType: "limited", usageLimit: 3 });
  });

  it("uses explicit partner usage metadata when present", () => {
    expect(inferBenefitUsage({ usageType: "once" })).toEqual({ usageType: "once" });
    expect(inferBenefitUsage({ usageType: "limited", usageLimit: 4 })).toEqual({ usageType: "limited", usageLimit: 4 });
  });
});
