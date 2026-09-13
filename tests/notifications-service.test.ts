import { beforeEach, describe, expect, it, vi } from "vitest";

const { sqlMock, createContentStorageClientMock } = vi.hoisted(() => ({
  sqlMock: vi.fn(),
  createContentStorageClientMock: vi.fn(),
}));

vi.mock("@/lib/content-storage/db", () => ({
  createContentStorageClient: createContentStorageClientMock,
}));

import {
  NotificationValidationError,
  createNotificationsForRecipients,
  findAllActiveMediaClerkUserIds,
  findActiveAdminClerkUserIds,
  findActiveAthleteClerkUserIds,
  findActiveClerkUserIdsByRoles,
  findActiveMediaClerkUserIds,
  findActivePartnerClerkUserIds,
  listCurrentUserNotifications,
  markCurrentUserNotificationRead,
} from "@/lib/notifications/service";

const access = {
  workspaceId: "workspace-1",
  clerkUserId: "user-current",
};

const notificationRow = {
  id: "00000000-0000-4000-8000-000000000001",
  workspace_id: "workspace-1",
  recipient_clerk_user_id: "user-current",
  type: "opportunity.updated",
  title: "Votre demande a ete acceptee",
  body: "Le creneau est confirme.",
  action_href: "/athlete/opportunities/opportunity-1",
  read_at: null,
  source_type: "hub_opportunity_slot_request",
  source_id: "request-1",
  created_at: new Date("2026-09-13T10:00:00.000Z"),
};

const getSqlCall = (index: number) => {
  const [strings, ...values] = sqlMock.mock.calls[index] as unknown as [TemplateStringsArray, ...unknown[]];
  return {
    text: strings.join("?").replace(/\s+/g, " ").trim(),
    values,
  };
};

describe("notifications service", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    createContentStorageClientMock.mockReturnValue(sqlMock);
  });

  it("finds only active Admin Clerk user IDs in the requested workspace", async () => {
    sqlMock.mockResolvedValue([
      { clerk_user_id: "user-admin-1" },
      { clerk_user_id: " user-admin-1 " },
      { clerk_user_id: "user-admin-2" },
      { clerk_user_id: " " },
    ]);

    const result = await findActiveAdminClerkUserIds(" workspace-1 ");

    expect(result).toEqual(["user-admin-1", "user-admin-2"]);
    const query = getSqlCall(0);
    expect(query.text).toContain("SELECT DISTINCT clerk_user_id FROM user_access");
    expect(query.text).toContain("WHERE workspace_id = ? AND role = 'admin' AND status = 'active'");
    expect(query.text).toContain("AND btrim(clerk_user_id) <> ''");
    expect(query.values).toEqual(["workspace-1"]);
  });

  it("finds all active Media Clerk user IDs in the requested workspace", async () => {
    sqlMock.mockResolvedValue([
      { clerk_user_id: "user-media-1" },
      { clerk_user_id: " user-media-1 " },
      { clerk_user_id: "user-media-2" },
      { clerk_user_id: " " },
    ]);

    const result = await findAllActiveMediaClerkUserIds(" workspace-1 ");

    expect(result).toEqual(["user-media-1", "user-media-2"]);
    const query = getSqlCall(0);
    expect(query.text).toContain("SELECT DISTINCT clerk_user_id FROM user_access");
    expect(query.text).toContain("WHERE workspace_id = ? AND role = 'media' AND status = 'active'");
    expect(query.text).toContain("AND btrim(clerk_user_id) <> ''");
    expect(query.text).not.toContain("media_id = ANY");
    expect(query.values).toEqual(["workspace-1"]);
  });

  it("finds unique active Clerk user IDs for normalized recipient roles", async () => {
    sqlMock.mockResolvedValue([
      { clerk_user_id: "user-shared" },
      { clerk_user_id: " user-shared " },
      { clerk_user_id: "user-partner" },
    ]);

    const result = await findActiveClerkUserIdsByRoles(
      " workspace-1 ",
      ["athlete", "partner_expert", "athlete"],
    );

    expect(result).toEqual(["user-shared", "user-partner"]);
    const query = getSqlCall(0);
    expect(query.text).toContain("SELECT DISTINCT clerk_user_id FROM user_access");
    expect(query.text).toContain("WHERE workspace_id = ? AND role = ANY(?::text[])");
    expect(query.text).toContain("AND status = 'active'");
    expect(query.values).toEqual(["workspace-1", ["athlete", "partner_expert"]]);
  });

  it("rejects empty or unsupported recipient roles before querying Neon", async () => {
    await expect(findActiveClerkUserIdsByRoles("workspace-1", []))
      .rejects.toBeInstanceOf(NotificationValidationError);
    await expect(findActiveClerkUserIdsByRoles("workspace-1", ["admin"]))
      .rejects.toThrow("roles[0] est invalide");
    expect(sqlMock).not.toHaveBeenCalled();
  });

  it.each([
    {
      label: "Athlete",
      findRecipients: findActiveAthleteClerkUserIds,
      fieldName: "athleteIds",
      column: "athlete_id",
      role: "athlete",
      ids: ["athlete-1", " athlete-2 ", "athlete-1"],
      normalizedIds: ["athlete-1", "athlete-2"],
    },
    {
      label: "Media",
      findRecipients: findActiveMediaClerkUserIds,
      fieldName: "mediaIds",
      column: "media_id",
      role: "media",
      ids: ["media-1", " media-2 ", "media-1"],
      normalizedIds: ["media-1", "media-2"],
    },
    {
      label: "Partner",
      findRecipients: findActivePartnerClerkUserIds,
      fieldName: "partnerIds",
      column: "partner_id",
      role: "partner_expert",
      ids: ["partner-1", " partner-2 ", "partner-1"],
      normalizedIds: ["partner-1", "partner-2"],
    },
  ])(
    "finds active $label Clerk user IDs by normalized business IDs",
    async ({ findRecipients, column, role, ids, normalizedIds }) => {
      sqlMock.mockResolvedValue([
        { clerk_user_id: "user-1" },
        { clerk_user_id: "user-1" },
        { clerk_user_id: " user-2 " },
      ]);

      const result = await findRecipients(" workspace-1 ", ids);

      expect(result).toEqual(["user-1", "user-2"]);
      const query = getSqlCall(0);
      expect(query.text).toContain("SELECT DISTINCT clerk_user_id FROM user_access");
      expect(query.text).toContain(`WHERE workspace_id = ? AND role = '${role}' AND status = 'active'`);
      expect(query.text).toContain(`AND ${column} = ANY(?::text[])`);
      expect(query.text).toContain("AND btrim(clerk_user_id) <> ''");
      expect(query.values).toEqual(["workspace-1", normalizedIds]);
    },
  );

  it.each([
    ["athleteIds", findActiveAthleteClerkUserIds],
    ["mediaIds", findActiveMediaClerkUserIds],
    ["partnerIds", findActivePartnerClerkUserIds],
  ] as const)("returns no %s recipients without querying Neon when the ID list is empty", async (_fieldName, findRecipients) => {
    await expect(findRecipients("workspace-1", [])).resolves.toEqual([]);
    expect(sqlMock).not.toHaveBeenCalled();
  });

  it("validates workspace and business identifier lists before querying Neon", async () => {
    await expect(findActiveAdminClerkUserIds(" ")).rejects.toBeInstanceOf(NotificationValidationError);
    await expect(findAllActiveMediaClerkUserIds(" ")).rejects.toBeInstanceOf(NotificationValidationError);
    await expect(findActiveAthleteClerkUserIds("workspace-1", "athlete-1"))
      .rejects.toThrow("athleteIds doit etre un tableau");
    await expect(findActiveMediaClerkUserIds("workspace-1", [" "]))
      .rejects.toBeInstanceOf(NotificationValidationError);
    await expect(findActivePartnerClerkUserIds("workspace-1", [null]))
      .rejects.toBeInstanceOf(NotificationValidationError);
    expect(sqlMock).not.toHaveBeenCalled();
  });

  it("creates notifications for unique recipients with source idempotence", async () => {
    sqlMock.mockResolvedValue([
      notificationRow,
      {
        ...notificationRow,
        id: "00000000-0000-4000-8000-000000000002",
        recipient_clerk_user_id: "user-second",
      },
    ]);

    const result = await createNotificationsForRecipients({
      workspaceId: " workspace-1 ",
      recipientClerkUserIds: ["user-current", " user-second ", "user-current"],
      type: " opportunity.updated ",
      title: " Votre demande a ete acceptee ",
      body: " Le creneau est confirme. ",
      actionHref: "/athlete/opportunities/opportunity-1",
      sourceType: "hub_opportunity_slot_request",
      sourceId: "request-1",
    });

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      workspaceId: "workspace-1",
      recipientClerkUserId: "user-current",
      createdAt: "2026-09-13T10:00:00.000Z",
    });

    const query = getSqlCall(0);
    expect(query.text).toContain("INSERT INTO notifications");
    expect(query.text).toContain("FROM UNNEST(");
    expect(query.text).toContain("ON CONFLICT ( workspace_id, recipient_clerk_user_id, source_type, source_id )");
    expect(query.text).toContain("WHERE source_type IS NOT NULL AND source_id IS NOT NULL DO NOTHING");
    expect(query.values).toContain("workspace-1");
    expect(query.values).toContainEqual(["user-current", "user-second"]);
  });

  it("rejects invalid text, source pairs and non-internal links", async () => {
    const validInput = {
      workspaceId: "workspace-1",
      recipientClerkUserIds: ["user-current"],
      type: "opportunity.updated",
      title: "Mise a jour",
      actionHref: "/athlete/opportunities/opportunity-1",
      sourceType: "opportunity",
      sourceId: "opportunity-1",
    };

    await expect(createNotificationsForRecipients({ ...validInput, title: " " }))
      .rejects.toBeInstanceOf(NotificationValidationError);
    await expect(createNotificationsForRecipients({ ...validInput, actionHref: "https://example.com" }))
      .rejects.toThrow("actionHref doit etre un lien interne");
    await expect(createNotificationsForRecipients({ ...validInput, actionHref: "//example.com/path" }))
      .rejects.toThrow("actionHref doit etre un lien interne");
    await expect(createNotificationsForRecipients({ ...validInput, sourceId: null }))
      .rejects.toThrow("sourceType et sourceId sont requis pour une creation idempotente");
    await expect(createNotificationsForRecipients({
      ...validInput,
      sourceType: undefined,
      sourceId: undefined,
    })).rejects.toThrow("sourceType et sourceId sont requis pour une creation idempotente");
    expect(sqlMock).not.toHaveBeenCalled();
  });

  it("lists the 30 latest personal notifications and their unread count", async () => {
    sqlMock
      .mockResolvedValueOnce([
        {
          ...notificationRow,
          read_at: "2026-09-13 10:05:00+00",
          created_at: "2026-09-13 10:00:00+00",
        },
      ])
      .mockResolvedValueOnce([{ unread_count: 4 }]);

    const result = await listCurrentUserNotifications(access);

    expect(result).toEqual({
      notifications: [
        {
          id: notificationRow.id,
          workspaceId: "workspace-1",
          recipientClerkUserId: "user-current",
          type: "opportunity.updated",
          title: "Votre demande a ete acceptee",
          body: "Le creneau est confirme.",
          actionHref: "/athlete/opportunities/opportunity-1",
          readAt: "2026-09-13T10:05:00.000Z",
          sourceType: "hub_opportunity_slot_request",
          sourceId: "request-1",
          createdAt: "2026-09-13T10:00:00.000Z",
        },
      ],
      unreadCount: 4,
    });

    const listQuery = getSqlCall(0);
    expect(listQuery.text).toContain("WHERE workspace_id = ? AND recipient_clerk_user_id = ?");
    expect(listQuery.text).toContain("ORDER BY created_at DESC LIMIT 30");
    expect(listQuery.values).toEqual(["workspace-1", "user-current"]);

    const countQuery = getSqlCall(1);
    expect(countQuery.text).toContain("WHERE workspace_id = ? AND recipient_clerk_user_id = ? AND read_at IS NULL");
    expect(countQuery.values).toEqual(["workspace-1", "user-current"]);
  });

  it("marks only the current workspace and recipient notification as read", async () => {
    sqlMock.mockResolvedValue([{
      ...notificationRow,
      read_at: new Date("2026-09-13T10:05:00.000Z"),
    }]);

    const result = await markCurrentUserNotificationRead(access, notificationRow.id);

    expect(result?.readAt).toBe("2026-09-13T10:05:00.000Z");
    const query = getSqlCall(0);
    expect(query.text).toContain("SET read_at = COALESCE(read_at, NOW())");
    expect(query.text).toContain("WHERE id = ? AND workspace_id = ? AND recipient_clerk_user_id = ?");
    expect(query.values).toEqual([notificationRow.id, "workspace-1", "user-current"]);
  });

  it("returns null when the scoped notification does not exist", async () => {
    sqlMock.mockResolvedValue([]);

    await expect(markCurrentUserNotificationRead(access, "notification-other"))
      .resolves.toBeNull();
  });

  it("rejects empty current-user scope values before querying Neon", async () => {
    await expect(listCurrentUserNotifications({ ...access, workspaceId: " " }))
      .rejects.toBeInstanceOf(NotificationValidationError);
    await expect(markCurrentUserNotificationRead({ ...access, clerkUserId: "" }, notificationRow.id))
      .rejects.toBeInstanceOf(NotificationValidationError);
    await expect(markCurrentUserNotificationRead(access, " "))
      .rejects.toBeInstanceOf(NotificationValidationError);
    expect(sqlMock).not.toHaveBeenCalled();
  });
});