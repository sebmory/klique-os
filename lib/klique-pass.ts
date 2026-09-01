import { buildMembershipState } from "@/lib/membership";
import type { AthleteMembershipKind, CurrentAthleteMembership } from "@/lib/athlete-memberships";
import type { AthleteCreditBalance, AthleteMembershipPlan } from "@/lib/athlete-credits";
import { formatAthletePassPayment } from "@/lib/athlete-subscription-terms";

export type KliquePassMembership = {
  origin: CurrentAthleteMembership["origin"];
  status: CurrentAthleteMembership["status"];
  isActive: boolean;
  startsAt: string | null;
  endsAt: string | null;
  membership: {
    membershipKind: AthleteMembershipKind;
    autoRenew: boolean;
  } | null;
};

export type KliquePassPlanRights = {
  name: string;
  paymentLabel: string;
  nextRenewalAt: string | null;
  productionAvailable: number;
  productionIncluded: number;
  customContentAvailable: number;
  customContentIncluded: number;
  videoAllowed: boolean;
};

export type KliquePassViewModel = {
  statusLabel: string;
  membershipLabel: string;
  adhesionLabel: string;
  validityLabel: string | null;
  renewalLabel: string | null;
  hasMembership: boolean;
  isActive: boolean;
  memberId: string;
};

export type BuildKliquePassViewModelInput = {
  athlete: {
    key?: string;
    name?: string;
    sport?: string;
    adhesionDate?: string;
  };
  athleteIndex: number | null;
  membership?: KliquePassMembership | CurrentAthleteMembership | null;
  now?: Date;
};

const normalize = (value: unknown): string => String(value ?? "").trim();
const formatValue = (value: unknown): string => normalize(value) || "Non renseigné";
const membershipDateFormatter = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: "Europe/Zurich",
});

const formatMembershipDate = (value: string | null): string | null => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : membershipDateFormatter.format(date);
};

const displayStatus = (status: CurrentAthleteMembership["status"]): string => {
  if (status === "active") return "Actif";
  if (status === "scheduled") return "Futur";
  return "Expiré";
};

export const buildKliquePassPlanRights = ({
  plan,
  balance,
  paymentInstallments,
  nextRenewalAt,
}: {
  plan: AthleteMembershipPlan;
  balance: AthleteCreditBalance;
  paymentInstallments: number | null;
  nextRenewalAt: string | null;
}): KliquePassPlanRights => ({
  name: plan.name,
  paymentLabel: formatAthletePassPayment(plan.annualPriceChf ?? 0, paymentInstallments),
  nextRenewalAt,
  productionAvailable: balance.production,
  productionIncluded: plan.productionCredits ?? 0,
  customContentAvailable: balance.custom_content,
  customContentIncluded: plan.customContentCredits ?? 0,
  videoAllowed: plan.videoAllowed === true,
});

export const buildKliquePassViewModel = ({
  athlete,
  athleteIndex,
  membership,
  now = new Date(),
}: BuildKliquePassViewModelInput): KliquePassViewModel => {
  if (membership?.origin === "historical" && membership.status === "unknown") {
    return {
      statusLabel: "Aucune adhésion active",
      membershipLabel: "Aucune adhésion active",
      adhesionLabel: "Non renseignée",
      validityLabel: null,
      renewalLabel: null,
      hasMembership: false,
      isActive: false,
      memberId: formatValue(athlete?.key),
    };
  }

  if (membership?.origin === "neon" && membership.membership) {
    const neonMembership = membership.membership;
    const isFounder = neonMembership.membershipKind === "founder";

    return {
      statusLabel: displayStatus(membership.status),
      membershipLabel: isFounder ? "Membre fondateur" : "Membre KLIQUE",
      adhesionLabel: formatMembershipDate(membership.startsAt) ?? "Non renseignée",
      validityLabel: formatMembershipDate(membership.endsAt),
      renewalLabel: isFounder && !neonMembership.autoRenew ? "Renouvellement non automatique" : null,
      hasMembership: true,
      isActive: membership.isActive,
      memberId: formatValue(athlete?.key),
    };
  }

  const state = buildMembershipState({
    startDate: athlete?.adhesionDate,
    isInitialFreeYearEligible: athleteIndex !== null && athleteIndex < 16,
    now,
  });

  const actualStartDate = state.startDateLabel ?? "Non renseignée";
  const actualEndDate = state.endDateLabel ?? null;

  return {
    statusLabel: state.statusLabel,
    membershipLabel: "Membre KLIQUE",
    adhesionLabel: actualStartDate,
    validityLabel: actualEndDate,
    renewalLabel: null,
    hasMembership: true,
    isActive: state.isActive,
    memberId: formatValue(athlete?.key),
  };
};
