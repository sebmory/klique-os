export type MediaSubscriptionPlanCode = "beta_partner" | "essential" | "editorial" | "media";

export type MediaSubscriptionPlan = {
  code: MediaSubscriptionPlanCode;
  label: string;
  priceCentsChf: number;
  creditsPerPeriod: number;
  interval: "month";
  isPublic: boolean;
};

export const MEDIA_SUBSCRIPTION_PLANS: readonly MediaSubscriptionPlan[] = Object.freeze([
  Object.freeze({
    code: "beta_partner",
    label: "Bêta partenaire",
    priceCentsChf: 0,
    creditsPerPeriod: 50,
    interval: "month",
    isPublic: false,
  }),
  Object.freeze({
    code: "essential",
    label: "Essentiel",
    priceCentsChf: 2900,
    creditsPerPeriod: 50,
    interval: "month",
    isPublic: true,
  }),
  Object.freeze({
    code: "editorial",
    label: "Rédaction",
    priceCentsChf: 5900,
    creditsPerPeriod: 150,
    interval: "month",
    isPublic: true,
  }),
  Object.freeze({
    code: "media",
    label: "Média",
    priceCentsChf: 12900,
    creditsPerPeriod: 400,
    interval: "month",
    isPublic: true,
  }),
] as const satisfies readonly MediaSubscriptionPlan[]);

export const getMediaSubscriptionPlan = (code: string): MediaSubscriptionPlan | null => {
  return MEDIA_SUBSCRIPTION_PLANS.find((plan) => plan.code === code) ?? null;
};

export const getPublicMediaSubscriptionPlans = (): readonly MediaSubscriptionPlan[] => {
  return MEDIA_SUBSCRIPTION_PLANS.filter((plan) => plan.isPublic);
};
