import { describe, expect, it } from "vitest";
import { calculateAthleteCreditBalance, type AthleteCreditMovement, type AthleteMembershipPlan } from "@/lib/athlete-credits";
import { buildKliquePassPlanRights, buildKliquePassViewModel } from "@/lib/klique-pass";
import type { CurrentAthleteMembership } from "@/lib/athlete-memberships";
import {
  ATHLETE_SUBSCRIPTION_CANCELLATION_TERMS,
  ATHLETE_SUBSCRIPTION_TERMS,
  formatAthleteSubscriptionPrice,
} from "@/lib/athlete-subscription-terms";

const essentialPlan: AthleteMembershipPlan = {
  code: "essential",
  name: "Essentiel",
  active: true,
  durationMonths: 12,
  annualPriceChf: 249,
  monthlyInstallmentChf: 21,
  productionCredits: 1,
  customContentCredits: 2,
  videoAllowed: false,
  metadata: {},
};

const movement = (
  creditType: "production" | "custom_content",
  quantity: number,
  expiresAt: string | null = "2027-09-01T00:00:00.000Z",
): AthleteCreditMovement => ({
  id: `${creditType}-${quantity}-${expiresAt}`,
  workspaceId: "klique-os",
  athleteId: "athlete-1",
  membershipId: "membership-1",
  creditType,
  quantity,
  source: quantity < 0 ? "usage" : "plan_grant",
  referenceId: null,
  expiresAt,
  createdAt: "2026-09-01T00:00:00.000Z",
});

const founderMembership: CurrentAthleteMembership = {
  origin: "neon",
  membership: {
    id: "founder-1",
    workspaceId: "klique-os",
    athleteId: "athlete-1",
    membershipKind: "founder",
    planCode: null,
    status: "active",
    startsAt: "2026-06-01T00:00:00.000Z",
    endsAt: "2027-06-01T00:00:00.000Z",
    autoRenew: false,
    paymentInstallments: null,
    source: "legacy_founder_migration",
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
  },
  status: "active",
  isActive: true,
  startsAt: "2026-06-01T00:00:00.000Z",
  endsAt: "2027-06-01T00:00:00.000Z",
};

const athlete = { key: "athlete-1", name: "Athlète Test", sport: "Athlétisme", adhesionDate: "01/06/2026" };

describe("KLIQUE Pass plan rights", () => {
  it("shows one production and two custom contents for an active Essential subscription", () => {
    const balance = calculateAthleteCreditBalance([
      movement("production", 1),
      movement("custom_content", 2),
    ], new Date("2026-09-02T00:00:00.000Z"));

    const rights = buildKliquePassPlanRights({
      plan: essentialPlan,
      balance,
      paymentInstallments: 1,
      nextRenewalAt: "2027-09-01T00:00:00.000Z",
    });

    expect(rights).toMatchObject({
      name: "Essentiel",
      paymentLabel: "CHF 249/an · Facturé annuellement",
      productionAvailable: 1,
      productionIncluded: 1,
      customContentAvailable: 2,
      customContentIncluded: 2,
      videoAllowed: false,
    });
  });

  it.each([
    [249, "CHF 249/an · CHF 20.75 par mois en équivalent indicatif · Paiement annuel"],
    [549, "CHF 549/an · CHF 45.75 par mois en équivalent indicatif · Paiement annuel"],
    [999, "CHF 999/an · CHF 83.25 par mois en équivalent indicatif · Paiement annuel"],
  ])("presents CHF %i as annual billing with an indicative monthly equivalent", (annualPrice, expected) => {
    expect(formatAthleteSubscriptionPrice(annualPrice)).toBe(expected);
  });

  it("keeps the complete cancellation terms centralized without implying immediate access termination", () => {
    expect(ATHLETE_SUBSCRIPTION_TERMS).toContain(ATHLETE_SUBSCRIPTION_CANCELLATION_TERMS);
    expect(ATHLETE_SUBSCRIPTION_CANCELLATION_TERMS).toContain("Les montants déjà payés ne sont ni remboursés ni calculés au prorata.");
    expect(ATHLETE_SUBSCRIPTION_CANCELLATION_TERMS).toContain("restent utilisables jusqu’à leur date d’échéance");
    expect(ATHLETE_SUBSCRIPTION_CANCELLATION_TERMS).not.toContain("résiliation anticipée");
  });

  it("labels a legacy 12-installment membership without offering monthly payment", () => {
    const rights = buildKliquePassPlanRights({
      plan: essentialPlan,
      balance: { production: 1, custom_content: 2 },
      paymentInstallments: 12,
      nextRenewalAt: "2027-09-01T00:00:00.000Z",
    });

    expect(rights.paymentLabel).toBe("Ancienne modalité : 12 échéances");
  });

  it("reduces the production balance after a usage movement", () => {
    const balance = calculateAthleteCreditBalance([
      movement("production", 1),
      movement("production", -1),
    ], new Date("2026-09-02T00:00:00.000Z"));

    expect(balance.production).toBe(0);
  });

  it("ignores expired movements", () => {
    const balance = calculateAthleteCreditBalance([
      movement("production", 1, "2026-08-31T23:59:59.000Z"),
      movement("custom_content", 2),
    ], new Date("2026-09-01T00:00:00.000Z"));

    expect(balance).toEqual({ production: 0, custom_content: 2 });
  });

  it("keeps a founder without a plan unchanged", () => {
    const viewModel = buildKliquePassViewModel({ athlete, athleteIndex: 0, membership: founderMembership });

    expect(viewModel).toMatchObject({
      membershipLabel: "Membre fondateur",
      statusLabel: "Actif",
      renewalLabel: "Renouvellement non automatique",
      hasMembership: true,
    });
  });

  it("keeps the no-membership state unchanged", () => {
    const viewModel = buildKliquePassViewModel({
      athlete,
      athleteIndex: 20,
      membership: {
        origin: "historical",
        membership: null,
        status: "unknown",
        isActive: false,
        startsAt: null,
        endsAt: null,
      },
    });

    expect(viewModel).toMatchObject({
      membershipLabel: "Aucune adhésion active",
      statusLabel: "Aucune adhésion active",
      validityLabel: null,
      renewalLabel: null,
      hasMembership: false,
      isActive: false,
    });
  });
});