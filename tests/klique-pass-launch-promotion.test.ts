import { describe, expect, it } from "vitest";
import {
  isKliquePassLaunchPromotionActive,
  resolveKliquePassPrice,
} from "@/lib/klique-pass-launch-promotion";

describe("KLIQUE Pass launch promotion", () => {
  it.each([
    [249, 124.5],
    [549, 274.5],
    [999, 499.5],
  ])("discounts CHF %d by 50 percent", (normalPrice, promotionalPrice) => {
    expect(resolveKliquePassPrice(normalPrice, new Date("2026-10-07T12:00:00.000Z"))).toEqual({
      normalAnnualPriceChf: normalPrice,
      annualPriceChf: promotionalPrice,
      launchPromotionActive: true,
    });
  });

  it("includes all of 31 December 2026 in Europe/Zurich and expires at midnight", () => {
    expect(isKliquePassLaunchPromotionActive(new Date("2026-12-31T22:59:59.999Z"))).toBe(true);
    expect(isKliquePassLaunchPromotionActive(new Date("2026-12-31T23:00:00.000Z"))).toBe(false);
    expect(resolveKliquePassPrice(249, new Date("2026-12-31T23:00:00.000Z")).annualPriceChf).toBe(249);
  });
});