import { describe, expect, it, vi } from "vitest";
import {
  buildAdminCreativeMissionList,
  listAdminCreativeMissions,
  type AdminCreativeMissionQueueStatus,
} from "@/lib/admin-creative-missions";
import type { AthleteServiceCreativeAssignment } from "@/lib/athlete-service-creative-assignments";
import type {
  AthleteServiceMission,
  AthleteServiceMissionRecord,
} from "@/lib/athlete-service-mission-domain";
import type { AdminAthleteServiceRequest } from "@/lib/athlete-service-requests";
import type { AdminCreativeMissionExecutionSummary } from "@/lib/creative-mission-execution";
import { createAdminMissionListHandler } from "@/app/api/admin/missions/route";

const requestId = (suffix: number) =>
  `00000000-0000-4000-8000-${String(suffix).padStart(12, "0")}`;

const request = (id: string): AdminAthleteServiceRequest => ({
  id,
  athleteId: `athlete-${id.slice(-2)}`,
  productCode: "photo_session_standard",
  productName: "Session photo",
  fulfillmentMode: "included_right",
  status: "scheduled",
  message: null,
  preferredDate: null,
  requestedAt: "2026-10-10T10:00:00.000Z",
  scheduledAt: "2026-10-20T10:00:00.000Z",
  startedAt: null,
  completedAt: null,
  refusedAt: null,
  refusalReason: null,
  snapshotCreditType: "production",
  snapshotCreditQuantity: 1,
  snapshotPriceChf: null,
  memberConfirmed: true,
  purchaseStatus: null,
  purchasedQuantity: null,
  deliveredQuantity: 0,
  paymentReference: null,
  paymentUpdatedAt: null,
  noChargeReason: null,
});

const mission = (
  id: string,
  status: AthleteServiceMission["status"],
  date = "2026-10-25",
): AthleteServiceMission => ({
  id: `10000000-0000-4000-8000-${id.slice(-12)}`,
  requestId: id,
  referenceCode: `KLIQUE-${id.slice(-8).toUpperCase()}`,
  title: `Mission ${id.slice(-2)}`,
  brief: "Brief",
  sportDiscipline: "Football",
  missionType: "photo",
  missionContext: "match",
  locationName: "Lausanne",
  locationDetails: null,
  missionDate: date,
  startTime: "14:00",
  endTime: "16:00",
  deliveryDueDate: "2026-10-27",
  deliverables: "Photos",
  compensationType: "internal_klique",
  compensationAmountChfCents: null,
  expenseDetails: null,
  internalAdminNotes: null,
  status,
  createdByClerkUserId: "admin-1",
  updatedByClerkUserId: "admin-1",
  createdAt: "2026-10-11T10:00:00.000Z",
  updatedAt: "2026-10-12T10:00:00.000Z",
});

const record = (
  id: string,
  status: AthleteServiceMission["status"] | null,
  responseState: NonNullable<AthleteServiceMissionRecord["creativeResponse"]>["state"] = "pending",
): AthleteServiceMissionRecord => ({
  requestId: id,
  athleteId: `athlete-${id.slice(-2)}`,
  productName: "Session photo",
  assignedCreativeProfileId: null,
  mission: status ? mission(id, status) : null,
  history: [],
  creativeResponse: {
    state: responseState,
    note: null,
    respondedAt: responseState === "pending" ? null : "2026-10-13T10:00:00.000Z",
    history: [],
  },
});

const creativeId = "22222222-2222-4222-8222-222222222222";
const assignment = (id: string): AthleteServiceCreativeAssignment => ({
  requestId: id,
  athleteId: `athlete-${id.slice(-2)}`,
  productName: "Session photo",
  creative: {
    id: creativeId,
    displayName: "Alice Photo",
    creativeType: "photographer",
    area: "Vaud",
  },
  history: [],
});

const execution = (
  id: string,
  status: AdminCreativeMissionExecutionSummary["status"],
): AdminCreativeMissionExecutionSummary => ({
  requestId: id,
  creativeProfileId: creativeId,
  status,
  updatedAt: "2026-10-14T10:00:00.000Z",
});

describe("Admin creative mission read model", () => {
  it("reuses canonical 6A-6D states for every queue and sorts required actions first", () => {
    const ids = Array.from({ length: 10 }, (_, index) => requestId(index + 1));
    const records = [
      record(ids[0], null),
      record(ids[1], "draft"),
      record(ids[2], "ready"),
      record(ids[3], "ready", "pending"),
      record(ids[4], "ready", "refused"),
      record(ids[5], "ready", "accepted"),
      record(ids[6], "ready", "accepted"),
      record(ids[7], "ready", "accepted"),
      record(ids[8], "ready", "accepted"),
      record(ids[9], "cancelled", "cancelled"),
    ];
    const assignments = ids.slice(3, 9).map(assignment);
    const executions = [
      execution(ids[6], "delivered"),
      execution(ids[7], "changes_requested"),
      execution(ids[8], "completed"),
    ];

    const result = buildAdminCreativeMissionList({
      requests: ids.map(request),
      records,
      assignments,
      executions,
    });
    const queueByRequest = Object.fromEntries(result.map((item) => [item.requestId, item.queueStatus]));

    expect(queueByRequest).toEqual<Record<string, AdminCreativeMissionQueueStatus>>({
      [ids[0]]: "to_prepare",
      [ids[1]]: "to_prepare",
      [ids[2]]: "to_assign",
      [ids[3]]: "awaiting_creative",
      [ids[4]]: "to_assign",
      [ids[5]]: "in_progress",
      [ids[6]]: "delivery_review",
      [ids[7]]: "changes_requested",
      [ids[8]]: "completed",
      [ids[9]]: "cancelled",
    });
    expect(result[0]).toMatchObject({
      requestId: ids[6],
      queueStatus: "delivery_review",
      nextAction: "Vérifier la livraison",
      executionStatus: "delivered",
    });
    expect(queueByRequest[ids[5]]).toBe("in_progress");
    expect(result.find((item) => item.requestId === ids[5])?.executionStatus).toBe("accepted");
  });

  it("ignores a stale execution belonging to a previous creative assignment", () => {
    const id = requestId(20);
    const stale = { ...execution(id, "delivered"), creativeProfileId: "33333333-3333-4333-8333-333333333333" };
    const [result] = buildAdminCreativeMissionList({
      requests: [request(id)],
      records: [record(id, "ready", "accepted")],
      assignments: [assignment(id)],
      executions: [stale],
    });

    expect(result.executionStatus).toBe("accepted");
    expect(result.queueStatus).toBe("in_progress");
  });

  it("sorts the same action queue by mission date", () => {
    const laterId = requestId(30);
    const earlierId = requestId(31);
    const later = record(laterId, "ready", "pending");
    const earlier = record(earlierId, "ready", "pending");
    later.mission = mission(laterId, "ready", "2026-11-20");
    earlier.mission = mission(earlierId, "ready", "2026-10-20");

    const result = buildAdminCreativeMissionList({
      requests: [request(laterId), request(earlierId)],
      records: [later, earlier],
      assignments: [assignment(laterId), assignment(earlierId)],
      executions: [],
    });

    expect(result.map((item) => item.requestId)).toEqual([earlierId, laterId]);
  });

  it("passes the authenticated workspace to every existing repository", async () => {
    const dependencies = {
      listRequests: vi.fn().mockResolvedValue([]),
      listMissions: vi.fn().mockResolvedValue([]),
      listAssignments: vi.fn().mockResolvedValue([]),
      listExecutions: vi.fn().mockResolvedValue([]),
    };

    await expect(listAdminCreativeMissions({
      workspaceId: "workspace-a",
      dependencies,
    })).resolves.toEqual([]);
    for (const dependency of Object.values(dependencies)) {
      expect(dependency).toHaveBeenCalledWith({ workspaceId: "workspace-a" });
    }
  });
});

describe("Admin missions API", () => {
  it("requires an active Admin and uses only its server-side workspace", async () => {
    const listMissions = vi.fn().mockResolvedValue([]);
    const handler = createAdminMissionListHandler({
      getAccess: vi.fn().mockResolvedValue({
        clerkUserId: "admin-1",
        role: "admin",
        status: "active",
        workspaceId: "workspace-a",
      }),
      listMissions,
    });

    const response = await handler(new Request("http://localhost/api/admin/missions"));
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(listMissions).toHaveBeenCalledWith({ workspaceId: "workspace-a" });
  });

  it.each([
    [null, 401],
    [{ clerkUserId: "creative-1", role: "creative", status: "active", workspaceId: "workspace-a" }, 403],
    [{ clerkUserId: "admin-1", role: "admin", status: "inactive", workspaceId: "workspace-a" }, 403],
    [{ clerkUserId: "admin-1", role: "admin", status: "active", workspaceId: null }, 403],
  ])("rejects unauthorized access %j", async (access, expectedStatus) => {
    const listMissions = vi.fn();
    const handler = createAdminMissionListHandler({
      getAccess: vi.fn().mockResolvedValue(access),
      listMissions,
    });
    const response = await handler(new Request("http://localhost/api/admin/missions"));
    expect(response.status).toBe(expectedStatus);
    expect(listMissions).not.toHaveBeenCalled();
  });

  it("rejects browser-provided workspace filters", async () => {
    const listMissions = vi.fn();
    const handler = createAdminMissionListHandler({
      getAccess: vi.fn().mockResolvedValue({
        clerkUserId: "admin-1",
        role: "admin",
        status: "active",
        workspaceId: "workspace-a",
      }),
      listMissions,
    });
    const response = await handler(new Request("http://localhost/api/admin/missions?workspaceId=workspace-b"));
    expect(response.status).toBe(400);
    expect(listMissions).not.toHaveBeenCalled();
  });
});
