import fs from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  createNotificationsForRecipientsMock,
  findActiveAdminClerkUserIdsMock,
  findActiveAthleteClerkUserIdsMock,
} = vi.hoisted(() => ({
  createNotificationsForRecipientsMock: vi.fn(),
  findActiveAdminClerkUserIdsMock: vi.fn(),
  findActiveAthleteClerkUserIdsMock: vi.fn(),
}));

vi.mock("@/lib/notifications/service", () => ({
  createNotificationsForRecipients: createNotificationsForRecipientsMock,
  findActiveAdminClerkUserIds: findActiveAdminClerkUserIdsMock,
  findActiveAthleteClerkUserIds: findActiveAthleteClerkUserIdsMock,
}));

import { ATHLETE_CONTENT_FORMAT_CODES } from "@/lib/athlete-subscription-catalog";
import {
  AthleteSubscriptionContentRequestConflictError,
  AthleteSubscriptionContentRequestNotFoundError,
  AthleteSubscriptionContentRequestValidationError,
  changeAthleteSubscriptionContentRequestStatus,
  createAthleteSubscriptionContentRequest,
  listAthleteSubscriptionContentRequestsForAdmin,
  listAthleteSubscriptionContentRequestsForAthlete,
  type AthleteSubscriptionContentRequestRepository,
} from "@/lib/athlete-subscription-content-requests/service";

const requestId = "49c345aa-fb6e-46e8-83ef-1e07d7b69192";
const subscriptionId = "91d272d1-1a5b-4486-bbc0-69b1ce747e4d";

const neonRow = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: requestId,
  workspace_id: "workspace-1",
  subscription_id: subscriptionId,
  athlete_id: "athlete-1",
  format_code: "portrait",
  status: "requested",
  athlete_note: null,
  preferred_date: null,
  admin_note: null,
  reserved_at: null,
  completed_at: null,
  created_at: new Date("2026-09-14T08:00:00.000Z"),
  updated_at: "2026-09-14T08:00:00.000Z",
  ...overrides,
});

const repository = (overrides: Partial<AthleteSubscriptionContentRequestRepository> = {}) => {
  const createdRecords: Array<Parameters<AthleteSubscriptionContentRequestRepository["create"]>[0]> = [];
  const statusRecords: Array<Parameters<AthleteSubscriptionContentRequestRepository["changeStatus"]>[0]> = [];
  const value: AthleteSubscriptionContentRequestRepository = {
    listAdmin: vi.fn().mockResolvedValue([]),
    listAthlete: vi.fn().mockResolvedValue([]),
    create: vi.fn(async (record) => {
      createdRecords.push(record);
      return {
        outcome: "created" as const,
        row: neonRow({
          id: record.id,
          workspace_id: record.workspaceId,
          athlete_id: record.athleteId,
          format_code: record.formatCode,
          athlete_note: record.athleteNote,
          preferred_date: record.preferredDate,
        }),
      };
    }),
    changeStatus: vi.fn(async (record) => {
      statusRecords.push(record);
      return {
        outcome: "updated" as const,
        row: neonRow({
          status: record.status,
          admin_note: record.updateAdminNote ? record.adminNote : null,
          reserved_at: record.status === "accepted" ? "2026-09-15T09:00:00.000Z" : null,
          completed_at: record.status === "completed" ? "2026-09-16T10:00:00.000Z" : null,
        }),
      };
    }),
    ...overrides,
  };
  return { value, createdRecords, statusRecords };
};

beforeEach(() => {
  vi.clearAllMocks();
  findActiveAdminClerkUserIdsMock.mockResolvedValue(["admin-1", "admin-2"]);
  findActiveAthleteClerkUserIdsMock.mockResolvedValue(["athlete-user-1"]);
  createNotificationsForRecipientsMock.mockResolvedValue([]);
});

describe("Athlete subscription content requests service", () => {
  it("lists admin requests within the normalized workspace", async () => {
    const serviceRepository = repository({
      listAdmin: vi.fn().mockResolvedValue([neonRow()]),
    }).value;

    const requests = await listAthleteSubscriptionContentRequestsForAdmin(
      " workspace-1 ",
      serviceRepository,
    );

    expect(serviceRepository.listAdmin).toHaveBeenCalledWith("workspace-1");
    expect(requests[0]).toMatchObject({
      workspaceId: "workspace-1",
      athleteId: "athlete-1",
      formatCode: "portrait",
      status: "requested",
      createdAt: "2026-09-14T08:00:00.000Z",
    });
  });

  it("limits the athlete list to its normalized workspace and athlete id", async () => {
    const serviceRepository = repository({
      listAthlete: vi.fn().mockResolvedValue([neonRow()]),
    }).value;

    await listAthleteSubscriptionContentRequestsForAthlete(
      " workspace-1 ",
      " athlete-1 ",
      serviceRepository,
    );

    expect(serviceRepository.listAthlete).toHaveBeenCalledWith("workspace-1", "athlete-1");
  });

  it.each(ATHLETE_CONTENT_FORMAT_CODES)("accepts catalog format %s", async (formatCode) => {
    const { value, createdRecords } = repository();

    const result = await createAthleteSubscriptionContentRequest({
      workspaceId: " workspace-1 ",
      athleteId: " athlete-1 ",
      formatCode,
      athleteNote: " Une idée de contenu ",
      preferredDate: "2026-10-02",
    }, value);

    expect(createdRecords[0]).toMatchObject({
      workspaceId: "workspace-1",
      athleteId: "athlete-1",
      formatCode,
      athleteNote: "Une idée de contenu",
      preferredDate: "2026-10-02",
    });
    expect(result.status).toBe("requested");
  });

  it("rejects unknown formats and invalid optional values before persistence", async () => {
    const serviceRepository = repository().value;

    await expect(createAthleteSubscriptionContentRequest({
      workspaceId: "workspace-1",
      athleteId: "athlete-1",
      formatCode: "unknown",
    } as unknown as Parameters<typeof createAthleteSubscriptionContentRequest>[0], serviceRepository))
      .rejects.toBeInstanceOf(AthleteSubscriptionContentRequestValidationError);
    await expect(createAthleteSubscriptionContentRequest({
      workspaceId: "workspace-1",
      athleteId: "athlete-1",
      formatCode: "portrait",
      athleteNote: "   ",
    }, serviceRepository)).rejects.toMatchObject({ code: "validation" });
    await expect(createAthleteSubscriptionContentRequest({
      workspaceId: "workspace-1",
      athleteId: "athlete-1",
      formatCode: "portrait",
      preferredDate: "2026-02-30",
    }, serviceRepository)).rejects.toMatchObject({ code: "validation" });
    expect(serviceRepository.create).not.toHaveBeenCalled();
  });

  it.each([
    ["no_active_subscription", "Un abonnement actif et non expiré est requis."],
    ["quota_exceeded", "Le quota annuel de contenus personnalisés est atteint."],
  ] as const)("maps %s creation outcome to a typed conflict", async (outcome, message) => {
    const serviceRepository = repository({
      create: vi.fn().mockResolvedValue({ outcome, row: null }),
    }).value;

    await expect(createAthleteSubscriptionContentRequest({
      workspaceId: "workspace-1",
      athleteId: "athlete-1",
      formatCode: "portrait",
    }, serviceRepository)).rejects.toMatchObject({ code: "conflict", message });
  });

  it("passes an admin transition and optional note through normalized identifiers", async () => {
    const { value, statusRecords } = repository();

    const result = await changeAthleteSubscriptionContentRequestStatus({
      workspaceId: " workspace-1 ",
      requestId: ` ${requestId} `,
      status: "accepted",
      adminNote: " Réservation confirmée ",
    }, value);

    expect(statusRecords[0]).toEqual({
      workspaceId: "workspace-1",
      requestId,
      status: "accepted",
      adminNote: "Réservation confirmée",
      updateAdminNote: true,
    });
    expect(result).toMatchObject({
      status: "accepted",
      reservedAt: "2026-09-15T09:00:00.000Z",
    });
  });

  it("preserves the admin note when it is omitted", async () => {
    const { value, statusRecords } = repository();

    await changeAthleteSubscriptionContentRequestStatus({
      workspaceId: "workspace-1",
      requestId,
      status: "accepted",
    }, value);

    expect(statusRecords[0]).toMatchObject({ adminNote: null, updateAdminNote: false });
  });

  it("maps missing and forbidden transitions to typed errors", async () => {
    const missingRepository = repository({
      changeStatus: vi.fn().mockResolvedValue({ outcome: "not_found", row: null }),
    }).value;
    const conflictRepository = repository({
      changeStatus: vi.fn().mockResolvedValue({ outcome: "conflict", row: neonRow() }),
    }).value;

    await expect(changeAthleteSubscriptionContentRequestStatus({
      workspaceId: "workspace-1",
      requestId,
      status: "accepted",
    }, missingRepository)).rejects.toBeInstanceOf(AthleteSubscriptionContentRequestNotFoundError);
    await expect(changeAthleteSubscriptionContentRequestStatus({
      workspaceId: "workspace-1",
      requestId,
      status: "completed",
    }, conflictRepository)).rejects.toBeInstanceOf(AthleteSubscriptionContentRequestConflictError);
  });

  it("rejects invalid request ids and statuses before persistence", async () => {
    const serviceRepository = repository().value;

    await expect(changeAthleteSubscriptionContentRequestStatus({
      workspaceId: "workspace-1",
      requestId: "invalid",
      status: "accepted",
    }, serviceRepository)).rejects.toBeInstanceOf(AthleteSubscriptionContentRequestValidationError);
    await expect(changeAthleteSubscriptionContentRequestStatus({
      workspaceId: "workspace-1",
      requestId,
      status: "unknown",
    } as unknown as Parameters<typeof changeAthleteSubscriptionContentRequestStatus>[0], serviceRepository))
      .rejects.toMatchObject({ code: "validation" });
    expect(serviceRepository.changeStatus).not.toHaveBeenCalled();
  });

  it("notifies every active Admin idempotently after creation", async () => {
    const serviceRepository = repository().value;

    const created = await createAthleteSubscriptionContentRequest({
      workspaceId: "workspace-1",
      athleteId: "athlete-1",
      formatCode: "editorial_interview",
    }, serviceRepository);

    expect(findActiveAdminClerkUserIdsMock).toHaveBeenCalledWith("workspace-1");
    expect(createNotificationsForRecipientsMock).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      recipientClerkUserIds: ["admin-1", "admin-2"],
      type: "athlete_subscription_content_request.created",
      title: "Nouvelle demande de contenu personnalisé",
      body: "Format : Interview éditoriale",
      actionHref: "/settings/athlete-subscriptions",
      sourceType: "request",
      sourceId: created.id,
    });
  });

  it.each([
    ["accepted", "Demande de contenu acceptée"],
    ["in_progress", "Contenu personnalisé en cours"],
    ["completed", "Contenu personnalisé terminé"],
    ["declined", "Demande de contenu refusée"],
    ["cancelled", "Demande de contenu annulée"],
  ] as const)("notifies the active Athlete after a real %s transition", async (status, title) => {
    const serviceRepository = repository({
      changeStatus: vi.fn().mockResolvedValue({
        outcome: "updated",
        row: neonRow({ status, format_code: "reel" }),
      }),
    }).value;

    await changeAthleteSubscriptionContentRequestStatus({
      workspaceId: "workspace-1",
      requestId,
      status,
    }, serviceRepository);

    expect(findActiveAthleteClerkUserIdsMock).toHaveBeenCalledWith("workspace-1", ["athlete-1"]);
    expect(createNotificationsForRecipientsMock).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      recipientClerkUserIds: ["athlete-user-1"],
      type: "athlete_subscription_content_request.status_updated",
      title,
      body: "Format : Reel",
      actionHref: "/athlete/pass",
      sourceType: "request_status",
      sourceId: `${requestId}:${status}`,
    });
  });

  it("does not notify the Athlete when the requested status is unchanged", async () => {
    const serviceRepository = repository({
      changeStatus: vi.fn().mockResolvedValue({
        outcome: "unchanged",
        row: neonRow({ status: "accepted" }),
      }),
    }).value;

    await changeAthleteSubscriptionContentRequestStatus({
      workspaceId: "workspace-1",
      requestId,
      status: "accepted",
    }, serviceRepository);

    expect(findActiveAthleteClerkUserIdsMock).not.toHaveBeenCalled();
    expect(createNotificationsForRecipientsMock).not.toHaveBeenCalled();
  });

  it("skips notification creation when no active recipient exists", async () => {
    findActiveAdminClerkUserIdsMock.mockResolvedValue([]);

    await createAthleteSubscriptionContentRequest({
      workspaceId: "workspace-1",
      athleteId: "athlete-1",
      formatCode: "portrait",
    }, repository().value);

    expect(createNotificationsForRecipientsMock).not.toHaveBeenCalled();
  });

  it("never cancels creation when Admin notification delivery fails", async () => {
    createNotificationsForRecipientsMock.mockRejectedValue(new Error("Notifications unavailable"));
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(createAthleteSubscriptionContentRequest({
      workspaceId: "workspace-1",
      athleteId: "athlete-1",
      formatCode: "portrait",
    }, repository().value)).resolves.toMatchObject({ status: "requested" });

    expect(consoleError).toHaveBeenCalledWith(
      "[athlete_subscription_content_request_notifications] Notifications unavailable",
    );
    consoleError.mockRestore();
  });

  it("never cancels a real status change when Athlete notification delivery fails", async () => {
    findActiveAthleteClerkUserIdsMock.mockRejectedValue(new Error("Recipients unavailable"));
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(changeAthleteSubscriptionContentRequestStatus({
      workspaceId: "workspace-1",
      requestId,
      status: "accepted",
    }, repository().value)).resolves.toMatchObject({ status: "accepted" });

    expect(consoleError).toHaveBeenCalledWith(
      "[athlete_subscription_content_request_notifications] Recipients unavailable",
    );
    consoleError.mockRestore();
  });
});

describe("Athlete subscription content request SQL invariants", () => {
  const source = fs.readFileSync(
    path.resolve(process.cwd(), "lib/athlete-subscription-content-requests/service.ts"),
    "utf8",
  );

  it("bounds every business query to its workspace", () => {
    expect(source).toMatch(
      /FROM athlete_subscription_content_requests\s+WHERE workspace_id = \$1\s+ORDER BY created_at DESC/,
    );
    expect(source).toMatch(
      /FROM athlete_subscription_content_requests\s+WHERE workspace_id = \$1\s+AND athlete_id = \$2\s+ORDER BY created_at DESC/,
    );
    expect(source).toMatch(
      /FROM athlete_subscriptions\s+WHERE workspace_id = \$\{record\.workspaceId\}\s+AND athlete_id = \$\{record\.athleteId\}/,
    );
    expect(source).toMatch(
      /FROM athlete_subscriptions subscription\s+WHERE subscription\.workspace_id = \$\{record\.workspaceId\}\s+AND subscription\.athlete_id = \$\{record\.athleteId\}/,
    );
    expect(source).toMatch(
      /FROM athlete_subscription_content_requests existing\s+WHERE existing\.workspace_id = subscription\.workspace_id\s+AND existing\.subscription_id = subscription\.id/,
    );
    expect(source).toMatch(
      /WITH candidate AS \(\s+SELECT \*\s+FROM athlete_subscription_content_requests\s+WHERE workspace_id = \$1\s+AND id = \$2::uuid/,
    );
    expect(source).toMatch(
      /FROM candidate\s+WHERE request\.workspace_id = \$1\s+AND request\.id = candidate\.id/,
    );
  });

  it("serializes creation on the active non-expired subscription before counting quota", () => {
    expect(source).toContain("sql.transaction([lockSubscription, insertRequest])");
    expect(source).toContain("FOR UPDATE");
    expect(source).toContain("subscription.status = 'active'");
    expect(source).toContain("subscription.starts_on <= CURRENT_DATE");
    expect(source).toContain("subscription.ends_on >= CURRENT_DATE");
    expect(source).toContain("subscription.custom_contents_included");
    expect(source).toContain("existing.status IN ('requested', 'accepted', 'in_progress', 'completed')");
  });

  it("allows only the defined forward transitions and terminal release states", () => {
    expect(source).toContain("candidate.status = 'requested' AND $3 IN ('accepted', 'declined', 'cancelled')");
    expect(source).toContain("candidate.status = 'accepted' AND $3 IN ('in_progress', 'declined', 'cancelled')");
    expect(source).toContain("candidate.status = 'in_progress' AND $3 IN ('completed', 'cancelled')");
    expect(source).not.toContain("candidate.status = 'completed' AND");
    expect(source).not.toContain("candidate.status = 'declined' AND");
    expect(source).not.toContain("candidate.status = 'cancelled' AND");
  });

  it("sets reservation and completion timestamps from status transitions", () => {
    expect(source).toContain("$3 IN ('accepted', 'in_progress', 'completed')");
    expect(source).toContain("COALESCE(request.reserved_at, NOW())");
    expect(source).toContain("CASE WHEN $3 = 'completed' THEN NOW() ELSE NULL END");
  });
});