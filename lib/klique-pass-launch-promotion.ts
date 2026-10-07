export const KLIQUE_PASS_LAUNCH_PROMOTION_LABEL =
  "Offre de lancement : -50 % jusqu’au 31.12.2026";

export const KLIQUE_PASS_LAUNCH_PROMOTION_ENDS_AT_EXCLUSIVE =
  "2026-12-31T23:00:00.000Z";

export const KLIQUE_PASS_LAUNCH_PRICE_MULTIPLIER = 0.5;

export type KliquePassPrice = {
  normalAnnualPriceChf: number;
  annualPriceChf: number;
  launchPromotionActive: boolean;
};

export const isKliquePassLaunchPromotionActive = (at: Date = new Date()): boolean =>
  Number.isFinite(at.getTime())
  && at.getTime() < Date.parse(KLIQUE_PASS_LAUNCH_PROMOTION_ENDS_AT_EXCLUSIVE);

export const resolveKliquePassPriceMultiplier = (at: Date = new Date()): number =>
  isKliquePassLaunchPromotionActive(at) ? KLIQUE_PASS_LAUNCH_PRICE_MULTIPLIER : 1;

export const resolveKliquePassPrice = (
  normalAnnualPriceChf: number,
  at: Date = new Date(),
): KliquePassPrice => {
  const launchPromotionActive = isKliquePassLaunchPromotionActive(at);
  return {
    normalAnnualPriceChf,
    annualPriceChf: launchPromotionActive
      ? Math.round(normalAnnualPriceChf * resolveKliquePassPriceMultiplier(at) * 100) / 100
      : normalAnnualPriceChf,
    launchPromotionActive,
  };
};