import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  sqlMock,
  createContentStorageClientMock,
  findActiveAdminClerkUserIdsMock,
  createNotificationsForRecipientsMock,
} = vi.hoisted(() => ({
  sqlMock: vi.fn(),
  createContentStorageClientMock: vi.fn(),
  findActiveAdminClerkUserIdsMock: vi.fn(),
  createNotificationsForRecipientsMock: vi.fn(),
}));

vi.mock("@/lib/content-storage/db", () => ({
  createContentStorageClient: createContentStorageClientMock,
  getDefaultWorkspaceId: () => "workspace-default",
}));

vi.mock("@/lib/notifications/service", () => ({
  findActiveAdminClerkUserIds: findActiveAdminClerkUserIdsMock,
  createNotificationsForRecipients: createNotificationsForRecipientsMock,
}));

import {
  createContactRequest,
  createPartnerAthleteIntroduction,
} from "@/lib/contact-requests/service";

const contactRequestRow = {
  id: "request-1",
  workspace_id: "workspace-1",
  athlete_id: "athlete-1",
  partner_id: null,
  request_kind: "athlete_contact",
  category: "support",
  subject: "Besoin d’aide pour mon profil",
  message: "Pouvez-vous vérifier mes informations ?",
  status: "open",
  created_at: "2026-09-13T09:00:00.000Z",
  updated_at: "2026-09-13T09:00:00.000Z",
};

describe("contact request notifications", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createContentStorageClientMock.mockReturnValue(sqlMock);
    sqlMock.mockResolvedValue([contactRequestRow]);
    findActiveAdminClerkUserIdsMock.mockResolvedValue(["user-admin-1", "user-admin-2"]);
    createNotificationsForRecipientsMock.mockResolvedValue([]);
  });

  it("notifies every active Admin after the contact request is created", async () => {
    const contactRequest = await createContactRequest({
      id: "request-1",
      workspaceId: "workspace-1",
      athleteId: "athlete-1",
      category: "support",
      subject: "Besoin d’aide pour mon profil",
      message: "Pouvez-vous vérifier mes informations ?",
    });

    expect(findActiveAdminClerkUserIdsMock).toHaveBeenCalledWith("workspace-1");
    expect(createNotificationsForRecipientsMock).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      recipientClerkUserIds: ["user-admin-1", "user-admin-2"],
      type: "contact_request.created",
      title: "Nouvelle demande de contact",
      body: "Besoin d’aide pour mon profil",
      actionHref: "/crm/demandes",
      sourceType: "contact_request",
      sourceId: "request-1",
    });
    expect(contactRequest).toMatchObject({ id: "request-1", status: "open" });
  });

  it("does not cancel contact request creation when notification delivery fails", async () => {
    createNotificationsForRecipientsMock.mockRejectedValue(new Error("Notifications unavailable"));
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(createContactRequest({
      id: "request-1",
      workspaceId: "workspace-1",
      athleteId: "athlete-1",
      category: "support",
      subject: "Besoin d’aide pour mon profil",
      message: "Pouvez-vous vérifier mes informations ?",
    })).resolves.toMatchObject({ id: "request-1" });

    expect(consoleError).toHaveBeenCalledWith(
      "[contact_request_notifications] Notifications unavailable",
    );
    consoleError.mockRestore();
  });

  it("keeps partner introduction creation outside this notification flow", async () => {
    sqlMock.mockResolvedValue([{
      ...contactRequestRow,
      request_kind: "partner_athlete_introduction",
      partner_id: "partner-1",
      subject: "Mise en relation",
      status: "pending",
    }]);

    await createPartnerAthleteIntroduction({
      workspaceId: "workspace-1",
      partnerId: "partner-1",
      athleteId: "athlete-1",
      reason: "Mise en relation",
      message: "Nous souhaitons échanger.",
    });

    expect(findActiveAdminClerkUserIdsMock).not.toHaveBeenCalled();
    expect(createNotificationsForRecipientsMock).not.toHaveBeenCalled();
  });
});