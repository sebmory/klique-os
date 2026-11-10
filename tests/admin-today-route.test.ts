import { beforeEach, describe, expect, it, vi } from "vitest";

const { accessMock, actionsMock, deadlinesMock } = vi.hoisted(() => ({
  accessMock: vi.fn(),
  actionsMock: vi.fn(),
  deadlinesMock: vi.fn(),
}));

vi.mock("@/lib/creatives/admin-route", () => ({
  getDefaultCreativeAdminAccess: accessMock,
}));

vi.mock("@/lib/admin-today-summary", () => ({
  getTodayActionsSummary: actionsMock,
  getTodayDeadlines: deadlinesMock,
}));

import { GET } from "@/app/api/admin/today-summary/[zone]/route";

describe("route des résumés Aujourd’hui", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("refuse un compte non-Admin sans charger de résumé", async () => {
    accessMock.mockResolvedValue({
      clerkUserId: "user-1",
      role: "athlete",
      status: "active",
      workspaceId: "workspace-a",
    });
    const response = await GET(
      new Request("https://example.test/api/admin/today-summary/actions"),
      { params: Promise.resolve({ zone: "actions" }) },
    );
    expect(response.status).toBe(403);
    expect(actionsMock).not.toHaveBeenCalled();
  });

  it("transmet uniquement le workspace authentifié au résumé", async () => {
    accessMock.mockResolvedValue({
      clerkUserId: "admin-1",
      role: "admin",
      status: "active",
      workspaceId: "workspace-a",
    });
    actionsMock.mockResolvedValue({ items: [], errors: [] });
    const response = await GET(
      new Request("https://example.test/api/admin/today-summary/actions?workspaceId=workspace-b"),
      { params: Promise.resolve({ zone: "actions" }) },
    );
    expect(response.status).toBe(200);
    expect(actionsMock).toHaveBeenCalledWith("workspace-a");
  });
});
