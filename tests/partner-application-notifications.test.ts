import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getCurrentUserPermissionContextMock,
  getPartnerVisibilityBucketsMock,
  findActiveAdminClerkUserIdsMock,
  createNotificationsForRecipientsMock,
} = vi.hoisted(() => ({
  getCurrentUserPermissionContextMock: vi.fn(),
  getPartnerVisibilityBucketsMock: vi.fn(),
  findActiveAdminClerkUserIdsMock: vi.fn(),
  createNotificationsForRecipientsMock: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({
  clerkClient: vi.fn(),
}));

vi.mock("@/lib/clerk-access/service", () => ({
  evaluateBusinessAccess: vi.fn(),
  getCurrentUserAccessProfile: vi.fn(),
  getCurrentUserPermissionContext: getCurrentUserPermissionContextMock,
}));

vi.mock("@/lib/google-sheets", () => ({
  getEcosystemPartnersFrom06Partenaires: vi.fn(),
  getPartnerVisibilityBuckets: getPartnerVisibilityBucketsMock,
}));

vi.mock("@/lib/notifications/service", () => ({
  findActiveAdminClerkUserIds: findActiveAdminClerkUserIdsMock,
  createNotificationsForRecipients: createNotificationsForRecipientsMock,
}));

import { GET } from "@/app/api/partners/route";
import { NextRequest } from "next/server";

const application = {
  id: "studio-nouveau",
  name: "Studio Nouveau",
  sourceRow: 42,
  moderationStatus: "pending",
};

describe("partner application notifications", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCurrentUserPermissionContextMock.mockResolvedValue({
      isAdmin: true,
      isActive: true,
      isAthlete: false,
      isPartnerExpert: false,
      workspaceId: "workspace-1",
    });
    getPartnerVisibilityBucketsMock.mockResolvedValue({
      approved: [],
      pending: [application],
      rejected: [],
      hidden: [],
    });
    findActiveAdminClerkUserIdsMock.mockResolvedValue(["user-admin-1", "user-admin-2"]);
    createNotificationsForRecipientsMock.mockResolvedValue([]);
  });

  it("notifies every active Admin for each pending application", async () => {
    const response = await GET(new NextRequest("http://localhost/api/partners"));

    expect(response.status).toBe(200);
    expect(findActiveAdminClerkUserIdsMock).toHaveBeenCalledWith("workspace-1");
    expect(createNotificationsForRecipientsMock).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      recipientClerkUserIds: ["user-admin-1", "user-admin-2"],
      type: "partner_application.created",
      title: "Nouvelle candidature Partenaire/Expert",
      body: "Studio Nouveau",
      actionHref: "/crm/demandes?tab=partners",
      sourceType: "partner_application",
      sourceId: "42",
    });
  });

  it("preserves the pending application response when notification delivery fails", async () => {
    createNotificationsForRecipientsMock.mockRejectedValue(new Error("Notifications unavailable"));
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await GET(new NextRequest("http://localhost/api/partners"));
    const payload = await response.json() as { partners: typeof application[] };

    expect(response.status).toBe(200);
    expect(payload.partners).toEqual([application]);
    expect(consoleError).toHaveBeenCalledWith(
      "[partner_application_notifications] Notifications unavailable",
    );
    consoleError.mockRestore();
  });
});