import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getCurrentUserAccessProfileMock,
  listCurrentUserNotificationsMock,
  markCurrentUserNotificationReadMock,
} = vi.hoisted(() => ({
  getCurrentUserAccessProfileMock: vi.fn(),
  listCurrentUserNotificationsMock: vi.fn(),
  markCurrentUserNotificationReadMock: vi.fn(),
}));

vi.mock("@/lib/clerk-access/service", () => ({
  getCurrentUserAccessProfile: getCurrentUserAccessProfileMock,
}));

vi.mock("@/lib/notifications/service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/notifications/service")>();
  return {
    ...actual,
    listCurrentUserNotifications: listCurrentUserNotificationsMock,
    markCurrentUserNotificationRead: markCurrentUserNotificationReadMock,
  };
});

import { GET, PATCH } from "@/app/api/notifications/route";
import { NotificationValidationError } from "@/lib/notifications/service";

const notification = {
  id: "00000000-0000-4000-8000-000000000001",
  workspaceId: "workspace-1",
  recipientClerkUserId: "session-user",
  type: "opportunity.updated",
  title: "Votre demande a ete acceptee",
  body: null,
  actionHref: "/athlete/opportunities/opportunity-1",
  readAt: null,
  sourceType: "hub_opportunity_slot_request",
  sourceId: "request-1",
  createdAt: "2026-09-13T10:00:00.000Z",
};

const asRole = (role: string, status = "active", workspaceId = "workspace-1") => {
  getCurrentUserAccessProfileMock.mockResolvedValue({
    clerkUser: { id: " session-user ", email: "user@example.com" },
    userAccess: {
      clerkUserId: "session-user",
      email: "user@example.com",
      role,
      workspaceId,
      athleteId: role === "athlete" ? "athlete-1" : null,
      partnerId: role === "partner_expert" ? "partner-1" : null,
      mediaId: role === "media" ? "media-1" : null,
      status,
    },
  });
};

const getRequest = () => new Request("http://localhost/api/notifications");

const patchRequest = (body: unknown) => new Request("http://localhost/api/notifications", {
  method: "PATCH",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

describe("notifications API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listCurrentUserNotificationsMock.mockResolvedValue({
      notifications: [notification],
      unreadCount: 1,
    });
    markCurrentUserNotificationReadMock.mockResolvedValue({
      ...notification,
      readAt: "2026-09-13T10:05:00.000Z",
    });
  });

  it.each(["admin", "athlete", "media", "partner_expert"])(
    "allows an active %s user to list personal notifications",
    async (role) => {
      asRole(role);

      const response = await GET(getRequest());
      const payload = await response.json() as {
        ok: boolean;
        notifications: typeof notification[];
        unreadCount: number;
      };

      expect(response.status).toBe(200);
      expect(payload).toEqual({ ok: true, notifications: [notification], unreadCount: 1 });
      expect(listCurrentUserNotificationsMock).toHaveBeenCalledWith({
        workspaceId: "workspace-1",
        clerkUserId: "session-user",
      });
    },
  );

  it("marks a notification using only the session-derived scope", async () => {
    asRole("athlete");

    const response = await PATCH(patchRequest({
      notificationId: ` ${notification.id} `,
      workspaceId: "other-workspace",
      clerkUserId: "other-user",
    }));
    const payload = await response.json() as { ok: boolean; notification: typeof notification };

    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(markCurrentUserNotificationReadMock).toHaveBeenCalledWith(
      { workspaceId: "workspace-1", clerkUserId: "session-user" },
      notification.id,
    );
  });

  it("returns 401 without an authenticated Clerk user", async () => {
    getCurrentUserAccessProfileMock.mockResolvedValue(null);

    expect((await GET(getRequest())).status).toBe(401);
    expect((await PATCH(patchRequest({ notificationId: notification.id }))).status).toBe(401);
    expect(listCurrentUserNotificationsMock).not.toHaveBeenCalled();
    expect(markCurrentUserNotificationReadMock).not.toHaveBeenCalled();
  });

  it("returns 403 without an active allowed user_access record", async () => {
    getCurrentUserAccessProfileMock.mockResolvedValue({
      clerkUser: { id: "session-user", email: "user@example.com" },
      userAccess: null,
    });
    expect((await GET(getRequest())).status).toBe(403);

    asRole("admin", "disabled");
    expect((await GET(getRequest())).status).toBe(403);

    asRole("unknown");
    expect((await GET(getRequest())).status).toBe(403);

    asRole("media", "active", " ");
    expect((await GET(getRequest())).status).toBe(403);

    expect(listCurrentUserNotificationsMock).not.toHaveBeenCalled();
  });

  it("returns 400 for invalid JSON or a missing notificationId", async () => {
    asRole("partner_expert");
    const malformedRequest = new Request("http://localhost/api/notifications", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: "{",
    });

    const malformedResponse = await PATCH(malformedRequest);
    expect(malformedResponse.status).toBe(400);
    await expect(malformedResponse.json()).resolves.toEqual({
      ok: false,
      message: "Payload JSON invalide.",
    });

    const missingIdResponse = await PATCH(patchRequest({ notificationId: " " }));
    expect(missingIdResponse.status).toBe(400);
    await expect(missingIdResponse.json()).resolves.toEqual({
      ok: false,
      message: "notificationId requis.",
    });
    expect(markCurrentUserNotificationReadMock).not.toHaveBeenCalled();
  });

  it("maps service validation errors to 400", async () => {
    asRole("admin");
    markCurrentUserNotificationReadMock.mockRejectedValue(
      new NotificationValidationError("notificationId invalide."),
    );

    const response = await PATCH(patchRequest({ notificationId: notification.id }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ ok: false, message: "notificationId invalide." });
  });

  it("returns 404 when the scoped notification does not exist", async () => {
    asRole("media");
    markCurrentUserNotificationReadMock.mockResolvedValue(null);

    const response = await PATCH(patchRequest({ notificationId: notification.id }));

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ ok: false, message: "Notification introuvable." });
  });

  it("returns a generic 500 without exposing the internal error", async () => {
    asRole("admin");
    listCurrentUserNotificationsMock.mockRejectedValue(new Error("database secret detail"));
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await GET(getRequest());

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      message: "Impossible de traiter les notifications.",
    });
    consoleError.mockRestore();
  });
});