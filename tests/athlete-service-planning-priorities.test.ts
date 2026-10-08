import { describe, expect, it, vi } from "vitest";

import {
  calculateAthleteServicePlanningPriorities,
  listAthleteServicePlanningPriorities,
  type AthleteServicePlanningPriorityProjection,
  type AthleteServicePlanningPriorityRepository,
} from "@/lib/athlete-service-planning-priorities";
import type { AthleteMembership } from "@/lib/athlete-memberships";
import type { AthleteMembershipServiceSummaryProjection } from "@/lib/athlete-membership-service-summary";
import { createAdminAthleteServicePlanningPriorityHandlers } from "@/app/api/admin/today/service-priorities/route";

const now = new Date("2026-10-08T00:00:00.000Z");

const membership = (
  id: string,
  athleteId: string,
  endsAt: string,
  overrides: Partial<AthleteMembership> = {},
): AthleteMembership => ({
  id,
  workspaceId: "workspace-a",
  athleteId,
  membershipKind: "subscription",
  planCode: "impact",
  status: "active",
  startsAt: "2026-01-01T00:00:00.000Z",
  endsAt,
  autoRenew: false,
  paymentInstallments: 1,
  source: "twint_manual_order",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  ...overrides,
});

const projection = (
  movements: AthleteMembershipServiceSummaryProjection["movements"],
  overrides: Partial<AthleteMembershipServiceSummaryProjection> = {},
): AthleteMembershipServiceSummaryProjection => ({
  movements,
  serviceRequests: [],
  legacyContent: null,
  purchases: [],
  ...overrides,
});

describe("Athlete service planning priorities", () => {
  it("reuses Founder fallback and historical request deduplication", () => {
    const founder = membership(
      "founder-1",
      "athlete-founder",
      "2026-10-28T00:00:00.000Z",
      {
        membershipKind: "founder",
        planCode: null,
        source: "legacy_founder_migration",
        paymentInstallments: null,
      },
    );
    const priorities = calculateAthleteServicePlanningPriorities({
      now,
      projections: [{
        membership: founder,
        projection: projection([
          {
            creditType: "custom_content",
            quantity: -1,
            source: "usage",
            referenceId: "athlete_subscription_content_request:legacy-completed",
            expiresAt: null,
          },
        ], {
          legacyContent: {
            quota: 4,
            expiresAt: founder.endsAt,
            requests: [{ id: "legacy-completed", status: "completed" }],
          },
        }),
      }],
    });

    expect(priorities).toEqual([expect.objectContaining({
      athleteId: "athlete-founder",
      level: "urgent",
      daysRemaining: 20,
      availableTotal: 1,
      remainingServices: [{
        creditType: "production",
        label: "Productions",
        available: 1,
      }],
    })]);
  });

  it("sorts by deadline then available rights and keeps deadlines beyond 180 days", () => {
    const endsAt = "2026-12-01T00:00:00.000Z";
    const projections: AthleteServicePlanningPriorityProjection[] = [
      {
        membership: membership("membership-later", "athlete-later", "2027-05-01T00:00:00.000Z"),
        projection: projection([
          { creditType: "production", quantity: 5, source: "plan_grant", referenceId: "later", expiresAt: "2027-05-01T00:00:00.000Z" },
        ]),
      },
      {
        membership: membership("membership-small", "athlete-small", endsAt),
        projection: projection([
          { creditType: "production", quantity: 1, source: "plan_grant", referenceId: "small", expiresAt: endsAt },
        ]),
      },
      {
        membership: membership("membership-large", "athlete-large", endsAt),
        projection: projection([
          { creditType: "production", quantity: 3, source: "plan_grant", referenceId: "large", expiresAt: endsAt },
        ]),
      },
      {
        membership: membership("membership-urgent", "athlete-urgent", "2026-10-20T00:00:00.000Z"),
        projection: projection([
          { creditType: "custom_content", quantity: 1, source: "plan_grant", referenceId: "urgent", expiresAt: "2026-10-20T00:00:00.000Z" },
        ]),
      },
    ];

    const priorities = calculateAthleteServicePlanningPriorities({ projections, now });

    expect(priorities.map(({ membershipId, level }) => [membershipId, level])).toEqual([
      ["membership-urgent", "urgent"],
      ["membership-large", "plan"],
      ["membership-small", "plan"],
      ["membership-later", "future"],
    ]);
  });

  it("loads one workspace-scoped aggregate and limits the home projection to eight", async () => {
    const projections = Array.from({ length: 9 }, (_, index) => {
      const endsAt = new Date(now.getTime() + (index + 1) * 86_400_000).toISOString();
      return {
        membership: membership(`membership-${index}`, `athlete-${index}`, endsAt),
        projection: projection([
          { creditType: "production" as const, quantity: 1, source: "plan_grant" as const, referenceId: `grant-${index}`, expiresAt: endsAt },
        ]),
      };
    });
    const repository: AthleteServicePlanningPriorityRepository = {
      load: vi.fn().mockResolvedValue(projections),
    };

    const priorities = await listAthleteServicePlanningPriorities({
      workspaceId: " workspace-a ",
      now,
      repository,
    });

    expect(repository.load).toHaveBeenCalledTimes(1);
    expect(repository.load).toHaveBeenCalledWith({ workspaceId: "workspace-a", now });
    expect(priorities).toHaveLength(8);
  });

  it("rejects a repository result from another workspace", async () => {
    const repository: AthleteServicePlanningPriorityRepository = {
      load: vi.fn().mockResolvedValue([{
        membership: membership("membership-1", "athlete-1", "2026-11-01T00:00:00.000Z", {
          workspaceId: "workspace-b",
        }),
        projection: projection([]),
      }]),
    };

    await expect(listAthleteServicePlanningPriorities({
      workspaceId: "workspace-a",
      now,
      repository,
    })).rejects.toThrow("workspace");
  });

  it("authorizes Admin access and resolves names only by stable Athlete ID", async () => {
    const listPriorities = vi.fn().mockResolvedValue([{
      athleteId: "athlete-1",
      membershipId: "membership-1",
      endsAt: "2026-10-20T00:00:00.000Z",
      daysRemaining: 12,
      level: "urgent",
      availableTotal: 1,
      remainingServices: [{ creditType: "production", label: "Productions", available: 1 }],
    }]);
    const handlers = createAdminAthleteServicePlanningPriorityHandlers({
      getAccess: vi.fn().mockResolvedValue({
        clerkUserId: "admin-1",
        role: "admin",
        status: "active",
        workspaceId: "workspace-a",
      }),
      listPriorities,
      listAthletes: vi.fn().mockResolvedValue([
        { key: "athlete-1", name: "Alice Martin" },
        { key: "different-id", name: "athlete-1" },
      ]),
    });

    const response = await handlers.GET(new Request("http://localhost"));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(listPriorities).toHaveBeenCalledWith({ workspaceId: "workspace-a", limit: 8 });
    expect(payload.priorities[0]).toMatchObject({
      athleteId: "athlete-1",
      athleteName: "Alice Martin",
    });
  });

  it("refuses non-Admin access before loading any priority", async () => {
    const listPriorities = vi.fn();
    const listAthletes = vi.fn();
    const handlers = createAdminAthleteServicePlanningPriorityHandlers({
      getAccess: vi.fn().mockResolvedValue({
        clerkUserId: "athlete-user",
        role: "athlete",
        status: "active",
        workspaceId: "workspace-a",
      }),
      listPriorities,
      listAthletes,
    });

    const response = await handlers.GET(new Request("http://localhost"));

    expect(response.status).toBe(403);
    expect(listPriorities).not.toHaveBeenCalled();
    expect(listAthletes).not.toHaveBeenCalled();
  });
});
