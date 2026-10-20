export const PARTNER_ATHLETE_INTRODUCTIONS_ENABLED_VALUE = "true";

export const isPartnerAthleteIntroductionsEnabled = (
  value: string | undefined = process.env.KLIQUE_PARTNER_ATHLETE_INTRODUCTIONS_ENABLED,
): boolean => value === PARTNER_ATHLETE_INTRODUCTIONS_ENABLED_VALUE;
