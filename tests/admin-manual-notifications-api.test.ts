import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  createNotificationsForRecipientsMock,
  findActiveClerkUserIdsByRolesMock,
  getCurrentUserAccessProfileMock,
} = vi.hoisted(() => ({
  createNotificationsForRecipientsMock: vi.fn(),
  findActiveClerkUserIdsByRolesMock: vi.fn(),
  getCurrentUserAccessProfileMock: vi.fn(),
}));

vi.mock("@/lib/clerk-access/service", () => ({
  getCurrentUserAccessProfile: getCurrentUserAccessProfileMock,
}));

vi.mock("@/lib/notifications/service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/notifications/service")>();
  return {
    ...actual,
    createNotificationsForRecipients: createNotificationsForRecipientsMock,
    findActiveClerkUserIdsByRoles: findActiveClerkUserIdsByRolesMock,
  };
});

import { POST } from "@/app/api/admin/notifications/route";

const asAdmin = (overrides: Record<string, unknown> = {}) => {
  getCurrentUserAccessProfileMock.mockResolvedValue({
    clerkUser: { id: " session-admin ", email: "admin@example.com" },
    userAccess: {
      clerkUserId: "session-admin",
      email: "admin@example.com",
      role: "admin",
      workspaceId: " workspace-1 ",
      athleteId: null,
      partnerId: null,
      mediaId: null,
      status: "active",
      ...overrides,
    },
  });
};

const postRequest = (body: unknown) => new Request("http://localhost/api/admin/notifications", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

const validPayload = {
  title: "Information importante",
  body: "Consultez les détails.",
  actionHref: "/today",
  recipientRoles: ["athlete"],
};

describe("Admin manual notifications API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    asAdmin();
    findActiveClerkUserIdsByRolesMock.mockResolvedValue(["user-1", "user-2"]);
    createNotificationsForRecipientsMock.mockResolvedValue([]);
  });

  it.each([
    ["athlete", ["athlete"]],
    ["media", ["media"]],
    ["partner_expert", ["partner_expert"]],
  ])("targets active %s accesses in the session workspace", async (role, expectedRoles) => {
    const response = await POST(postRequest({ ...validPayload, recipientRoles: [role] }));

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({ ok: true, recipientCount: 2 });
    expect(findActiveClerkUserIdsByRolesMock).toHaveBeenCalledWith("workspace-1", expectedRoles);
  });

  it("expands all roles, deduplicates roles and recipients, and uses only session scope", async () => {
    findActiveClerkUserIdsByRolesMock.mockResolvedValue(["user-1", " user-1 ", "user-2"]);

    const response = await POST(postRequest({
      ...validPayload,
      recipientRoles: ["all", "athlete", "all"],
      workspaceId: "attacker-workspace",
      authorClerkUserId: "attacker-user",
    }));
    const payload = await response.json() as { announcementId: string; recipientCount: number };

    expect(response.status).toBe(201);
    expect(payload.recipientCount).toBe(2);
    expect(payload.announcementId).toMatch(/^session-admin:/);
    expect(findActiveClerkUserIdsByRolesMock).toHaveBeenCalledWith(
      "workspace-1",
      ["athlete", "media", "partner_expert"],
    );
    expect(createNotificationsForRecipientsMock).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      recipientClerkUserIds: ["user-1", "user-2"],
      type: "manual_announcement",
      title: "Information importante",
      body: "Consultez les détails.",
      actionHref: "/today",
      sourceType: "manual_announcement",
      sourceId: payload.announcementId,
    });
  });

  it("accepts an omitted body", async () => {
    const { body: _body, ...payload } = validPayload;

    const response = await POST(postRequest(payload));

    expect(response.status).toBe(201);
    expect(createNotificationsForRecipientsMock).toHaveBeenCalledWith(
      expect.objectContaining({ body: null }),
    );
  });

  it("returns 401 without an authenticated Clerk user", async () => {
    getCurrentUserAccessProfileMock.mockResolvedValue(null);

    const response = await POST(postRequest(validPayload));

    expect(response.status).toBe(401);
    expect(findActiveClerkUserIdsByRolesMock).not.toHaveBeenCalled();
  });

  it.each([
    { role: "athlete" },
    { status: "disabled" },
    { workspaceId: " " },
  ])("returns 403 without an active Admin workspace access: %o", async (overrides) => {
    asAdmin(overrides);

    const response = await POST(postRequest(validPayload));

    expect(response.status).toBe(403);
    expect(findActiveClerkUserIdsByRolesMock).not.toHaveBeenCalled();
  });

  it.each([
    [{ ...validPayload, title: " " }, "Le titre est obligatoire."],
    [{ ...validPayload, body: 42 }, "Le contenu est invalide."],
    [{ ...validPayload, actionHref: "https://example.com" }, "Le lien doit être un chemin interne."],
    [{ ...validPayload, actionHref: "//example.com/path" }, "Le lien doit être un chemin interne."],
    [{ ...validPayload, recipientRoles: [] }, "Les rôles destinataires sont invalides."],
    [{ ...validPayload, recipientRoles: ["admin"] }, "Les rôles destinataires sont invalides."],
  ])("returns 400 for an invalid payload", async (payload, message) => {
    const response = await POST(postRequest(payload));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ ok: false, message });
    expect(findActiveClerkUserIdsByRolesMock).not.toHaveBeenCalled();
  });

  it("returns 400 for malformed JSON", async () => {
    const request = new Request("http://localhost/api/admin/notifications", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{",
    });

    expect((await POST(request)).status).toBe(400);
    expect(findActiveClerkUserIdsByRolesMock).not.toHaveBeenCalled();
  });

  it("succeeds without writing when no active recipient exists", async () => {
    findActiveClerkUserIdsByRolesMock.mockResolvedValue([]);

    const response = await POST(postRequest(validPayload));

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({ ok: true, recipientCount: 0 });
    expect(createNotificationsForRecipientsMock).not.toHaveBeenCalled();
  });

  it("returns a generic 500 when notification creation fails", async () => {
    createNotificationsForRecipientsMock.mockRejectedValue(new Error("database secret detail"));
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await POST(postRequest(validPayload));

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      message: "Impossible d’envoyer la notification.",
    });
    consoleError.mockRestore();
  });
});