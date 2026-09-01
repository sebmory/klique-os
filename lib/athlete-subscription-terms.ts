export const ATHLETE_SUBSCRIPTION_SUMMARY =
  "Abonnement de 12 mois, payé annuellement. Activation après réception du paiement. Renouvellement automatique, avec rappel 14 jours avant l’échéance. Résiliation possible à tout moment pour la fin de la période en cours. Crédits annuels non reportables.";

export const ATHLETE_SUBSCRIPTION_CANCELLATION_TERMS =
  "La résiliation peut être demandée à tout moment. Elle prend effet à la fin de la période annuelle en cours. Les montants déjà payés ne sont ni remboursés ni calculés au prorata. L’adhésion et les crédits encore disponibles restent utilisables jusqu’à leur date d’échéance.";

export const ATHLETE_SUBSCRIPTION_TERMS = [
  "Paiement annuel en une fois.",
  "Début de l’abonnement après confirmation du paiement.",
  "Durée de 12 mois.",
  "Renouvellement automatique pour une nouvelle période de 12 mois.",
  "Rappel 14 jours avant le renouvellement.",
  ATHLETE_SUBSCRIPTION_CANCELLATION_TERMS,
  "Crédits inclus expirant à la fin du cycle et non reportés.",
  "Achats complémentaires valables 12 mois.",
  "Contenus initiés par KLIQUE sans consommation de crédit.",
  "Productions sur réservation et selon les disponibilités.",
  "Vidéo exclue du plan Essentiel.",
] as const;

const formatChf = (value: number, fractionDigits: number): string =>
  `CHF ${new Intl.NumberFormat("fr-CH", {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(value)}`;

export const formatAthleteAnnualPrice = (annualPriceChf: number): string =>
  `${formatChf(annualPriceChf, 0)}/an`;

export const formatAthleteMonthlyEquivalent = (annualPriceChf: number): string =>
  `CHF ${(annualPriceChf / 12).toFixed(2)} par mois en équivalent indicatif`;

export const formatAthleteSubscriptionPrice = (annualPriceChf: number): string =>
  `${formatAthleteAnnualPrice(annualPriceChf)} · ${formatAthleteMonthlyEquivalent(annualPriceChf)} · Paiement annuel`;

export const formatAthletePassPayment = (
  annualPriceChf: number,
  paymentInstallments: number | null,
): string => paymentInstallments === 12
  ? "Ancienne modalité : 12 échéances"
  : `${formatAthleteAnnualPrice(annualPriceChf)} · Facturé annuellement`;