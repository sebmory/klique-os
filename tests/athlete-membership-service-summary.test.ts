import { describe, expect, it, vi } from "vitest";

import {
  calculateAthleteMembershipServiceSummary,
  getAthleteMembershipServiceSummary,
  type AthleteMembershipServiceSummaryProjection,
  type AthleteMembershipServiceSummaryRepository,
} from "@/lib/athlete-membership-service-summary";
import type { AthleteMembership } from "@/lib/athlete-memberships";

const membership: AthleteMembership = {
  id: "membership-1",
  workspaceId: "workspace-a",
  athleteId: "athlete-1",
  membershipKind: "subscription",
  planCode: "impact",
  status: "active",
  startsAt: "2026-01-01T00:00:00.000Z",
  endsAt: "2027-01-01T00:00:00.000Z",
  autoRenew: false,
  paymentInstallments: 1,
  source: "twint_manual_order",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const emptyProjection = (): AthleteMembershipServiceSummaryProjection => ({
  movements: [],
  serviceRequests: [],
  legacyContent: null,
  purchases: [],
});

describe("Athlete membership service summary", () => {
  it("calculates included quota, reservations, usage, pending requests and purchased balances", () => {
    const projection: AthleteMembershipServiceSummaryProjection = {
      movements: [
        { creditType: "production", quantity: 3, source: "plan_grant", referenceId: "cycle-1", expiresAt: membership.endsAt },
        { creditType: "production", quantity: -1, source: "usage", referenceId: "athlete_service_request:used", expiresAt: null },
        { creditType: "custom_content", quantity: 6, source: "plan_grant", referenceId: "cycle-1", expiresAt: membership.endsAt },
        { creditType: "custom_content", quantity: -2, source: "usage", referenceId: "athlete_service_request:custom-used", expiresAt: null },
      ],
      serviceRequests: [
        { status: "scheduled", fulfillmentMode: "included_right", creditType: "production", creditQuantity: 1 },
        { status: "in_progress", fulfillmentMode: "paid_with_right", creditType: "custom_content", creditQuantity: 1 },
        { status: "received", fulfillmentMode: "included_right", creditType: "production", creditQuantity: 1 },
        { status: "to_confirm", fulfillmentMode: "paid_extra", creditType: null, creditQuantity: null },
      ],
      legacyContent: null,
      purchases: [
        {
          purchaseId: "purchase-1",
          productCode: "custom_content_pack_5",
          productName: "Pack de 5 contenus",
          quantity: 5,
          delivered: 2,
          expiresAt: "2026-12-01T00:00:00.000Z",
        },
      ],
    };

    const summary = calculateAthleteMembershipServiceSummary({
      membership,
      projection,
      now: new Date("2026-10-08T00:00:00.000Z"),
    });

    expect(summary.included).toEqual([
      expect.objectContaining({ creditType: "production", quota: 3, reserved: 1, used: 1, available: 1 }),
      expect.objectContaining({ creditType: "custom_content", quota: 6, reserved: 1, used: 2, available: 3 }),
    ]);
    expect(summary.pendingRequests).toEqual({ total: 2, received: 1, toConfirm: 1 });
    expect(summary.purchases).toEqual([
      expect.objectContaining({ paid: 5, delivered: 2, remaining: 3, expired: false }),
    ]);
    expect(summary.expiresInDays).toBe(85);
  });

  it("uses the historical custom_content snapshot without adding it to an existing plan grant or counting the same usage twice", () => {
    const summary = calculateAthleteMembershipServiceSummary({
      membership,
      now: new Date("2026-10-08T00:00:00.000Z"),
      projection: {
        movements: [
          { creditType: "custom_content", quantity: 6, source: "plan_grant", referenceId: "cycle-1", expiresAt: membership.endsAt },
          {
            creditType: "custom_content",
            quantity: -1,
            source: "usage",
            referenceId: "athlete_subscription_content_request:legacy-completed",
            expiresAt: null,
          },
        ],
        serviceRequests: [],
        legacyContent: {
          quota: 6,
          expiresAt: membership.endsAt,
          requests: [
            { id: "legacy-completed", status: "completed" },
            { id: "legacy-reserved", status: "accepted" },
          ],
        },
        purchases: [],
      },
    });

    expect(summary.included.find(({ creditType }) => creditType === "custom_content")).toMatchObject({
      quota: 6,
      used: 1,
      reserved: 1,
      available: 4,
    });
  });

  it("falls back to the historical custom_content quota when no ledger grant exists", () => {
    const summary = calculateAthleteMembershipServiceSummary({
      membership,
      projection: {
        ...emptyProjection(),
        legacyContent: {
          quota: 2,
          expiresAt: membership.endsAt,
          requests: [
            { id: "legacy-completed", status: "completed" },
            { id: "legacy-requested", status: "requested" },
          ],
        },
      },
    });

    expect(summary.included.find(({ creditType }) => creditType === "custom_content")).toMatchObject({
      quota: 2,
      used: 1,
      reserved: 1,
      available: 0,
    });
  });

  it("projects the two legacy Founder grants and keeps historical custom_content usage deduplicated", () => {
    const founderMembership: AthleteMembership = {
      ...membership,
      membershipKind: "founder",
      planCode: null,
      source: "legacy_founder_migration",
    };
    const summary = calculateAthleteMembershipServiceSummary({
      membership: founderMembership,
      now: new Date("2026-10-08T00:00:00.000Z"),
      projection: {
        movements: [
          { creditType: "production", quantity: 1, source: "plan_grant", referenceId: "legacy_founder_grant:membership-1", expiresAt: membership.endsAt },
          { creditType: "custom_content", quantity: 1, source: "plan_grant", referenceId: "legacy_founder_grant:membership-1", expiresAt: membership.endsAt },
          {
            creditType: "custom_content",
            quantity: -1,
            source: "usage",
            referenceId: "athlete_subscription_content_request:legacy-completed",
            expiresAt: null,
          },
        ],
        serviceRequests: [],
        legacyContent: {
          quota: 0,
          expiresAt: membership.endsAt,
          requests: [{ id: "legacy-completed", status: "completed" }],
        },
        purchases: [],
      },
    });

    expect(summary.included).toEqual([
      expect.objectContaining({ creditType: "production", quota: 1, used: 0, available: 1 }),
      expect.objectContaining({ creditType: "custom_content", quota: 1, used: 1, available: 0 }),
    ]);
  });

  it("applies one production and one custom_content right to a legacy Founder without plan grants", () => {
    const founderMembership: AthleteMembership = {
      ...membership,
      membershipKind: "founder",
      planCode: null,
      source: "legacy_founder_migration",
    };
    const summary = calculateAthleteMembershipServiceSummary({
      membership: founderMembership,
      projection: emptyProjection(),
      now: new Date("2026-10-08T00:00:00.000Z"),
    });

    expect(summary.included).toEqual([
      expect.objectContaining({ creditType: "production", quota: 1, reserved: 0, used: 0, available: 1 }),
      expect.objectContaining({ creditType: "custom_content", quota: 1, reserved: 0, used: 0, available: 1 }),
    ]);
  });

  it("applies one production and one custom_content right to an admin_manual Founder without plan grants", () => {
    const founderMembership: AthleteMembership = {
      ...membership,
      membershipKind: "founder",
      planCode: null,
      source: "admin_manual",
    };
    const summary = calculateAthleteMembershipServiceSummary({
      membership: founderMembership,
      projection: emptyProjection(),
      now: new Date("2026-10-08T00:00:00.000Z"),
    });

    expect(summary.included).toEqual([
      expect.objectContaining({ creditType: "production", quota: 1, reserved: 0, used: 0, available: 1 }),
      expect.objectContaining({ creditType: "custom_content", quota: 1, reserved: 0, used: 0, available: 1 }),
    ]);
  });

  it("does not apply the Founder fallback to another membership kind", () => {
    const summary = calculateAthleteMembershipServiceSummary({
      membership,
      projection: emptyProjection(),
      now: new Date("2026-10-08T00:00:00.000Z"),
    });

    expect(summary.included).toEqual([
      expect.objectContaining({ creditType: "production", quota: 0, available: 0 }),
      expect.objectContaining({ creditType: "custom_content", quota: 0, available: 0 }),
    ]);
  });

  it("passes the authorized workspace and athlete to the repository and rejects cross-workspace memberships", async () => {
    const repository: AthleteMembershipServiceSummaryRepository = {
      load: vi.fn().mockResolvedValue(emptyProjection()),
    };

    await getAthleteMembershipServiceSummary({
      workspaceId: " workspace-a ",
      athleteId: " athlete-1 ",
      membership,
      now: new Date("2026-10-08T00:00:00.000Z"),
      repository,
    });

    expect(repository.load).toHaveBeenCalledWith(expect.objectContaining({
      workspaceId: "workspace-a",
      athleteId: "athlete-1",
      membership,
    }));

    await expect(getAthleteMembershipServiceSummary({
      workspaceId: "workspace-b",
      athleteId: "athlete-1",
      membership,
      repository,
    })).rejects.toThrow("ne correspond pas au workspace");
    expect(repository.load).toHaveBeenCalledTimes(1);
  });
});
