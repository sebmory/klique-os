import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

const { getCurrentUserAccessProfileMock, getAthletesFromGoogleSheetsMock } = vi.hoisted(() => ({
  getCurrentUserAccessProfileMock: vi.fn(),
  getAthletesFromGoogleSheetsMock: vi.fn(),
}));

vi.mock("@/lib/clerk-access/service", () => ({
  getCurrentUserAccessProfile: getCurrentUserAccessProfileMock,
}));

vi.mock("@/lib/google-sheets", () => ({
  getAthletesFromGoogleSheets: getAthletesFromGoogleSheetsMock,
}));

import {
  AthleteMembershipActiveConflictError,
  AthleteMembershipPlanChangeError,
  assertAthleteMembershipPlanChangeAllowed,
  createAthleteMembershipAsAdmin,
  getCurrentAthleteMembership,
  validateAthleteMembershipAdminInput,
  type AthleteMembership,
  type AthleteMembershipAdminInput,
  type AthleteMembershipAdminRepository,
} from "@/lib/athlete-memberships";
import { grantAnnualPlanCredits, type AthleteMembershipPlan } from "@/lib/athlete-credits";
import { GET } from "@/app/api/admin/athletes/[athleteId]/membership/route";

const founder: AthleteMembership = {
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
};

const manualInput: AthleteMembershipAdminInput = {
  membershipKind: "manual",
  planCode: null,
  status: "active",
  startsAt: "2026-09-01T00:00:00.000Z",
  endsAt: null,
  autoRenew: false,
  paymentMode: null,
};

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

const subscriptionInput = (paymentMode: "annual" | "monthly_12" = "annual"): AthleteMembershipAdminInput => ({
  membershipKind: "subscription",
  planCode: "essential",
  status: "active",
  startsAt: "2026-09-01T00:00:00.000Z",
  endsAt: null,
  autoRenew: true,
  paymentMode,
});

const repository = (overrides: Partial<AthleteMembershipAdminRepository> = {}): AthleteMembershipAdminRepository => ({
  getActivePlan: vi.fn().mockResolvedValue(essentialPlan),
  hasActiveMembership: vi.fn().mockResolvedValue(false),
  create: vi.fn(async (input) => ({
    ...founder,
    ...input,
    createdAt: founder.createdAt,
    updatedAt: founder.updatedAt,
  })),
  update: vi.fn().mockResolvedValue(null),
  ...overrides,
});

describe("Admin athlete memberships", () => {
  beforeEach(() => vi.resetAllMocks());

  it("reads an existing founder membership", async () => {
    const result = await getCurrentAthleteMembership({
      workspaceId: "klique-os",
      athleteId: "athlete-1",
      historical: { startDate: "2026-06-01", athleteIndex: 0 },
      now: new Date("2026-09-01T00:00:00.000Z"),
      readMemberships: vi.fn().mockResolvedValue([founder]),
    });

    expect(result.origin).toBe("neon");
    expect(result.membership).toMatchObject({ membershipKind: "founder", source: "legacy_founder_migration" });
  });

  it("creates a manual membership with the Admin source", async () => {
    const adminRepository = repository();
    const result = await createAthleteMembershipAsAdmin({
      workspaceId: "klique-os",
      athleteId: "athlete-1",
      input: manualInput,
      repository: adminRepository,
    });

    expect(result).toMatchObject({ membershipKind: "manual", source: "admin_manual" });
    expect(adminRepository.create).toHaveBeenCalledWith(expect.objectContaining({
      workspaceId: "klique-os",
      athleteId: "athlete-1",
      source: "admin_manual",
    }));
  });

  it("rejects a second active membership", async () => {
    const adminRepository = repository({ hasActiveMembership: vi.fn().mockResolvedValue(true) });

    await expect(createAthleteMembershipAsAdmin({
      workspaceId: "klique-os",
      athleteId: "athlete-1",
      input: manualInput,
      repository: adminRepository,
    })).rejects.toBeInstanceOf(AthleteMembershipActiveConflictError);
    expect(adminRepository.create).not.toHaveBeenCalled();
  });

  it("rejects an end date before the start date", () => {
    expect(() => validateAthleteMembershipAdminInput({
      ...manualInput,
      startsAt: "2026-09-02T00:00:00.000Z",
      endsAt: "2026-09-01T00:00:00.000Z",
    })).toThrow("La date de fin doit être postérieure à la date de début.");
  });

  it("forbids a non-Admin caller", async () => {
    getCurrentUserAccessProfileMock.mockResolvedValue({
      userAccess: { role: "athlete", status: "active", workspaceId: "klique-os", athleteId: "athlete-1" },
    });

    const response = await GET(
      new Request("http://localhost/api/admin/athletes/athlete-1/membership") as NextRequest,
      { params: Promise.resolve({ athleteId: "athlete-1" }) },
    );

    expect(response.status).toBe(403);
    expect(getAthletesFromGoogleSheetsMock).not.toHaveBeenCalled();
  });

  it("creates an active Essential subscription and requests its annual grant", async () => {
    const adminRepository = repository();

    await createAthleteMembershipAsAdmin({
      workspaceId: "klique-os",
      athleteId: "athlete-1",
      input: subscriptionInput(),
      now: new Date("2026-09-01T12:00:00.000Z"),
      repository: adminRepository,
    });

    expect(adminRepository.create).toHaveBeenCalledWith(expect.objectContaining({
      planCode: "essential",
      endsAt: "2027-09-01T00:00:00.000Z",
      paymentInstallments: 1,
      grantAnnualCredits: true,
    }));
  });

  it("creates a future subscription without requesting credits", async () => {
    const adminRepository = repository();

    await createAthleteMembershipAsAdmin({
      workspaceId: "klique-os",
      athleteId: "athlete-1",
      input: { ...subscriptionInput(), status: "scheduled", startsAt: "2026-10-01T00:00:00.000Z" },
      now: new Date("2026-09-01T00:00:00.000Z"),
      repository: adminRepository,
    });

    expect(adminRepository.create).toHaveBeenCalledWith(expect.objectContaining({
      endsAt: "2027-10-01T00:00:00.000Z",
      grantAnnualCredits: false,
    }));
  });

  it("stores the annual payment as one installment", async () => {
    const adminRepository = repository();

    await createAthleteMembershipAsAdmin({
      workspaceId: "klique-os",
      athleteId: "athlete-1",
      input: subscriptionInput("annual"),
      repository: adminRepository,
    });

    expect(adminRepository.create).toHaveBeenCalledWith(expect.objectContaining({ paymentInstallments: 1 }));
  });

  it("rejects monthly_12 for a new subscription", async () => {
    const adminRepository = repository();

    await expect(createAthleteMembershipAsAdmin({
      workspaceId: "klique-os",
      athleteId: "athlete-1",
      input: subscriptionInput("monthly_12"),
      repository: adminRepository,
    })).rejects.toThrow("paiement annuel en une fois");
    expect(adminRepository.create).not.toHaveBeenCalled();
  });

  it("keeps reading a legacy subscription with 12 installments", async () => {
    const legacySubscription = { ...founder, membershipKind: "subscription" as const, planCode: "essential", paymentInstallments: 12 };

    const result = await getCurrentAthleteMembership({
      workspaceId: "klique-os",
      athleteId: "athlete-1",
      historical: { athleteIndex: null },
      readMemberships: vi.fn().mockResolvedValue([legacySubscription]),
    });

    expect(result.membership?.paymentInstallments).toBe(12);
  });

  it("does not duplicate credits when the same cycle is saved twice", async () => {
    const grantedMovements = new Set<string>();
    const execute = vi.fn(async (input) => {
      const alreadyGranted = grantedMovements.has(input.referenceId);
      grantedMovements.add(input.referenceId);
      return {
        eligibility: {
          membershipStatus: "active",
          membershipKind: "subscription",
          membershipStartsAt: input.cycleStart,
          membershipEndsAt: input.expiresAt,
          planCode: "essential",
          planActive: true,
          durationMonths: 12,
          productionCredits: 1,
          customContentCredits: 2,
        },
        movements: alreadyGranted ? [] : [{
          ...founder,
          id: "movement-1",
          membershipId: "membership-1",
          creditType: "production" as const,
          quantity: 1,
          source: "plan_grant" as const,
          referenceId: input.referenceId,
          expiresAt: input.expiresAt,
        }],
      };
    });

    const first = await grantAnnualPlanCredits({ workspaceId: "klique-os", athleteId: "athlete-1", membershipId: "membership-1", cycleStart: subscriptionInput().startsAt, execute });
    const second = await grantAnnualPlanCredits({ workspaceId: "klique-os", athleteId: "athlete-1", membershipId: "membership-1", cycleStart: subscriptionInput().startsAt, execute });

    expect(first.status).toBe("granted");
    expect(second.status).toBe("already_granted");
    expect(grantedMovements).toHaveLength(1);
  });

  it("rejects a plan change after the cycle grant", () => {
    expect(() => assertAthleteMembershipPlanChangeAllowed("essential", "impact", true))
      .toThrow(AthleteMembershipPlanChangeError);
    expect(() => assertAthleteMembershipPlanChangeAllowed("essential", "impact", true))
      .toThrow("Créez le changement de plan au prochain cycle.");
  });
});