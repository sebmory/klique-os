import { beforeEach, describe, expect, it, vi } from "vitest";

const { sqlMock, createContentStorageClientMock } = vi.hoisted(() => ({
  sqlMock: vi.fn(),
  createContentStorageClientMock: vi.fn(),
}));

vi.mock("@/lib/content-storage/db", () => ({
  createContentStorageClient: createContentStorageClientMock,
  getDefaultWorkspaceId: () => "workspace-default",
}));

vi.mock("@/lib/notifications/service", () => ({
  findActiveAdminClerkUserIds: vi.fn(),
  createNotificationsForRecipients: vi.fn(),
}));

import { listPartnerAthleteIntroductions } from "@/lib/contact-requests/service";

describe("listPartnerAthleteIntroductions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createContentStorageClientMock.mockReturnValue(sqlMock);
    sqlMock.mockResolvedValue([{
      id: "request-1",
      workspace_id: "workspace-1",
      athlete_id: "athlete-1",
      partner_id: "partner-1",
      request_kind: "partner_athlete_introduction",
      category: "other",
      subject: "Sponsoring",
      message: "Échange autour du projet.",
      status: "pending",
      created_at: "2026-09-15T10:00:00.000Z",
      updated_at: "2026-09-15T10:00:00.000Z",
    }]);
  });

  it("filters by the session workspace, partner and introduction request kind", async () => {
    const requests = await listPartnerAthleteIntroductions(" workspace-1 ", " partner-1 ");

    expect(requests).toHaveLength(1);
    expect(sqlMock).toHaveBeenCalledWith(expect.any(Array), "workspace-1", "partner-1");
    expect((sqlMock.mock.calls[0]?.[0] as TemplateStringsArray).join("?")).toContain(
      "request_kind = 'partner_athlete_introduction'",
    );
  });
});